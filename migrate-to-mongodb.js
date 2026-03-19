/**
 * MongoDB Migration Script
 * Migrates all JSON data files to MongoDB collections
 * 
 * Usage:
 * 1. Set MONGODB_URI and MONGODB_DBNAME in your .env file
 * 2. Run: node migrate-to-mongodb.js
 * 3. Follow the prompts to migrate or rollback
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function validateMongoUri(uri) {
    if (!uri || typeof uri !== 'string') return 'MONGODB_URI not found in .env file';
    const trimmed = uri.trim();
    if (!trimmed) return 'MONGODB_URI is empty in .env file';
    if (!/^mongodb(\+srv)?:\/\//.test(trimmed)) return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
    if (trimmed.includes('<db_password>') || trimmed.includes('<username>')) {
        return 'MONGODB_URI still contains placeholders like <db_password>';
    }
    return null;
}

class MongoDBMigration {
    constructor() {
        this.mongoClient = null;
        this.db = null;
        this.dataPath = path.join(__dirname, 'data');
        
        // List of all JSON files to migrate
        this.collections = [
            'afk',
            'ai',
            'analytics',
            'birthdays',
            'customcommands',
            'customRoles',
            'economy',
            'gameStats',
            'giveaways',
            'horseRaces',
            'invites',
            'levelRewards',
            'logging',
            'milestones',
            'moderation',
            'playlists',
            'premium',
            'presenceActivity',
            'raidProtection',
            'reactionroles',
            'relationships',
            'scheduledMessages',
            'settings',
            'shop',
            'starboard',
            'stats',
            'suggestions',
            'tickets',
            'voiceActivity',
            'voiceRewards'
        ];
    }

    async connect() {
        const mongoUri = process.env.MONGODB_URI;
        const dbName = process.env.MONGODB_DBNAME || 'discord-bot';

        const uriError = validateMongoUri(mongoUri);
        if (uriError) {
            throw new Error(`❌ ${uriError}. Please update your .env connection string.`);
        }

        console.log('📡 Connecting to MongoDB...');
        this.mongoClient = new MongoClient(mongoUri);
        await this.mongoClient.connect();
        this.db = this.mongoClient.db(dbName);
        console.log(`✅ Connected to MongoDB database: ${dbName}\n`);
    }

    async migrateToMongoDB() {
        console.log('🚀 Starting migration from JSON to MongoDB...\n');
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const collection of this.collections) {
            try {
                const jsonFile = path.join(this.dataPath, `${collection}.json`);
                
                // Check if JSON file exists
                try {
                    await fs.access(jsonFile);
                } catch {
                    console.log(`⏭️  Skipping ${collection} (file not found)`);
                    skippedCount++;
                    continue;
                }

                // Read JSON data
                const jsonData = await fs.readFile(jsonFile, 'utf-8');
                const data = JSON.parse(jsonData);

                // Convert JSON object to array of documents
                const documents = [];
                
                if (Array.isArray(data)) {
                    // Already an array
                    documents.push(...data);
                } else if (typeof data === 'object' && data !== null) {
                    // Convert object to array, preserving keys as _id
                    for (const [key, value] of Object.entries(data)) {
                        if (typeof value === 'object' && value !== null) {
                            documents.push({ _id: key, ...value });
                        }
                    }
                }

                if (documents.length === 0) {
                    console.log(`⏭️  Skipping ${collection} (no data)`);
                    skippedCount++;
                    continue;
                }

                // Clear existing collection and insert new data
                const mongoCollection = this.db.collection(collection);
                await mongoCollection.deleteMany({});
                await mongoCollection.insertMany(documents);

                console.log(`✅ Migrated ${collection}: ${documents.length} documents`);
                migratedCount++;

            } catch (error) {
                console.error(`❌ Error migrating ${collection}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   ✅ Successfully migrated: ${migratedCount} collections`);
        console.log(`   ⏭️  Skipped: ${skippedCount} collections`);
        console.log(`   ❌ Errors: ${errorCount} collections\n`);

        if (errorCount === 0 && migratedCount > 0) {
            console.log('✨ Migration completed successfully!');
            console.log('💡 Your bot will now use MongoDB instead of JSON files.');
            console.log('💡 You can backup or remove the JSON files in the data/ folder.\n');
        }
    }

    async rollbackToJSON() {
        console.log('🔄 Starting rollback from MongoDB to JSON...\n');
        let rolledBackCount = 0;
        let errorCount = 0;

        for (const collection of this.collections) {
            try {
                const mongoCollection = this.db.collection(collection);
                const documents = await mongoCollection.find({}).toArray();

                if (documents.length === 0) {
                    console.log(`⏭️  Skipping ${collection} (no data in MongoDB)`);
                    continue;
                }

                // Convert array to object format (for compatibility)
                const jsonData = {};
                for (const doc of documents) {
                    const id = doc._id;
                    delete doc._id;
                    jsonData[id] = doc;
                }

                // Write to JSON file
                const jsonFile = path.join(this.dataPath, `${collection}.json`);
                await fs.writeFile(jsonFile, JSON.stringify(jsonData, null, 2));

                console.log(`✅ Rolled back ${collection}: ${documents.length} documents`);
                rolledBackCount++;

            } catch (error) {
                console.error(`❌ Error rolling back ${collection}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n📊 Rollback Summary:');
        console.log(`   ✅ Successfully rolled back: ${rolledBackCount} collections`);
        console.log(`   ❌ Errors: ${errorCount} collections\n`);

        if (errorCount === 0 && rolledBackCount > 0) {
            console.log('✨ Rollback completed successfully!');
            console.log('💡 To use JSON files, remove or comment out MONGODB_URI in your .env file.\n');
        }
    }

    async createBackup() {
        console.log('💾 Creating backup of JSON files...\n');
        const backupDir = path.join(__dirname, `backup-${Date.now()}`);
        
        try {
            await fs.mkdir(backupDir);
            
            for (const collection of this.collections) {
                const jsonFile = path.join(this.dataPath, `${collection}.json`);
                try {
                    await fs.access(jsonFile);
                    const backupFile = path.join(backupDir, `${collection}.json`);
                    await fs.copyFile(jsonFile, backupFile);
                } catch {
                    // File doesn't exist, skip
                }
            }
            
            console.log(`✅ Backup created at: ${backupDir}\n`);
            return backupDir;
        } catch (error) {
            console.error('❌ Error creating backup:', error.message);
            return null;
        }
    }

    async close() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('👋 MongoDB connection closed.');
        }
    }

    async showMenu() {
        console.log('╔════════════════════════════════════════╗');
        console.log('║   MongoDB Migration Tool               ║');
        console.log('╚════════════════════════════════════════╝\n');
        console.log('Choose an option:');
        console.log('  1. Migrate JSON → MongoDB (recommended)');
        console.log('  2. Rollback MongoDB → JSON');
        console.log('  3. Create backup of JSON files');
        console.log('  4. Test MongoDB connection');
        console.log('  5. Exit\n');

        const choice = await question('Enter your choice (1-5): ');
        return choice.trim();
    }

    async testConnection() {
        try {
            await this.connect();
            const collections = await this.db.listCollections().toArray();
            console.log(`\n✅ Connection successful!`);
            console.log(`📊 Found ${collections.length} collections in database.\n`);
            if (collections.length > 0) {
                console.log('Existing collections:');
                collections.forEach(col => console.log(`   - ${col.name}`));
                console.log();
            }
        } catch (error) {
            console.error('\n❌ Connection failed:', error.message, '\n');
            if (error?.code === 8000 || /bad auth/i.test(error?.message || '')) {
                console.error('💡 MongoDB auth tips:');
                console.error('   - Use real credentials (no placeholders).');
                console.error('   - URL-encode password special chars (@, :, /, ?, #, %).');
                console.error('   - Ensure Atlas DB user has permissions.\n');
            }
        }
    }
}

async function main() {
    const migration = new MongoDBMigration();

    try {
        const choice = await migration.showMenu();

        switch (choice) {
            case '1':
                await migration.connect();
                const createBackup = await question('\n💾 Create backup before migration? (y/n): ');
                if (createBackup.toLowerCase() === 'y') {
                    await migration.createBackup();
                }
                const confirm = await question('⚠️  This will overwrite existing MongoDB data. Continue? (yes/no): ');
                if (confirm.toLowerCase() === 'yes') {
                    await migration.migrateToMongoDB();
                } else {
                    console.log('❌ Migration cancelled.');
                }
                break;

            case '2':
                await migration.connect();
                const confirmRollback = await question('⚠️  This will overwrite existing JSON files. Continue? (yes/no): ');
                if (confirmRollback.toLowerCase() === 'yes') {
                    await migration.rollbackToJSON();
                } else {
                    console.log('❌ Rollback cancelled.');
                }
                break;

            case '3':
                await migration.createBackup();
                break;

            case '4':
                await migration.testConnection();
                break;

            case '5':
                console.log('👋 Goodbye!');
                break;

            default:
                console.log('❌ Invalid choice.');
        }

    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    } finally {
        await migration.close();
        rl.close();
    }
}

// Run the migration tool
main().catch(console.error);
