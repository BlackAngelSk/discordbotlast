/**
 * Automated MongoDB Migration Script
 * Migrates all JSON data to MongoDB in one command
 * 
 * Usage: node migrate-auto.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');

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

class AutoMigration {
    constructor() {
        this.mongoClient = null;
        this.db = null;
        this.dataPath = path.join(__dirname, 'data');
        
        this.collections = [
            'afk', 'ai', 'analytics', 'birthdays', 'customcommands', 'customRoles',
            'economy', 'gameStats', 'giveaways', 'horseRaces', 'invites',
            'levelRewards', 'logging', 'milestones', 'moderation', 'playlists',
            'premium', 'presenceActivity', 'raidProtection', 'reactionroles',
            'relationships', 'scheduledMessages', 'settings', 'shop', 'starboard',
            'stats', 'suggestions', 'tickets', 'voiceActivity', 'voiceRewards'
        ];
    }

    async connect() {
        const mongoUri = process.env.MONGODB_URI;
        const dbName = process.env.MONGODB_DBNAME || 'discord-bot';

        const uriError = validateMongoUri(mongoUri);
        if (uriError) {
            throw new Error(uriError);
        }

        console.log('📡 Connecting to MongoDB...');
        this.mongoClient = new MongoClient(mongoUri);
        await this.mongoClient.connect();
        this.db = this.mongoClient.db(dbName);
        console.log(`✅ Connected to MongoDB database: ${dbName}\n`);
    }

    async migrate() {
        console.log('🚀 Starting automatic migration...\n');
        let success = 0;
        let skipped = 0;
        let errors = 0;

        for (const collection of this.collections) {
            try {
                const jsonFile = path.join(this.dataPath, `${collection}.json`);
                
                try {
                    await fs.access(jsonFile);
                } catch {
                    skipped++;
                    continue;
                }

                const jsonData = await fs.readFile(jsonFile, 'utf-8');
                const data = JSON.parse(jsonData);

                const documents = [];
                
                if (Array.isArray(data)) {
                    documents.push(...data);
                } else if (typeof data === 'object' && data !== null) {
                    for (const [key, value] of Object.entries(data)) {
                        if (typeof value === 'object' && value !== null) {
                            documents.push({ _id: key, ...value });
                        }
                    }
                }

                if (documents.length === 0) {
                    skipped++;
                    continue;
                }

                const mongoCollection = this.db.collection(collection);
                await mongoCollection.deleteMany({});
                await mongoCollection.insertMany(documents);

                console.log(`✅ ${collection}: ${documents.length} documents`);
                success++;

            } catch (error) {
                console.error(`❌ ${collection}: ${error.message}`);
                errors++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('📊 Migration Complete!');
        console.log('='.repeat(50));
        console.log(`✅ Successful: ${success} collections`);
        console.log(`⏭️  Skipped: ${skipped} collections`);
        console.log(`❌ Errors: ${errors} collections`);
        console.log('='.repeat(50) + '\n');

        if (errors === 0 && success > 0) {
            console.log('✨ All data migrated successfully!');
            console.log('💡 Your bot will now use MongoDB.');
            console.log('💡 Start your bot with: npm start\n');
        }
    }

    async close() {
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
    }
}

async function main() {
    const migration = new AutoMigration();

    try {
        await migration.connect();
        await migration.migrate();
    } catch (error) {
        console.error('\n💥 Migration failed:', error.message);
        console.error('\nPlease check:');
        console.error('  1. MONGODB_URI is correct in .env file');
        console.error('  2. IP address is whitelisted in MongoDB Atlas');
        console.error('  3. Database credentials are correct\n');
        if (error?.code === 8000 || /bad auth/i.test(error?.message || '')) {
            console.error('Auth help: encode password special chars (@, :, /, ?, #, %) and verify Atlas DB user permissions.\n');
        }
        process.exit(1);
    } finally {
        await migration.close();
    }
}

main();
