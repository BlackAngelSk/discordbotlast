/**
 * Quick MongoDB Connection Test
 * Tests if MongoDB credentials are correct and connection works
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DBNAME || 'discord-bot';

    if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in .env file');
        process.exit(1);
    }

    console.log('📡 Testing MongoDB connection...');
    console.log(`📝 Database: ${dbName}`);
    
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        
        console.log('\n✅ Connection successful!');
        console.log(`📊 Found ${collections.length} collections in database\n`);
        
        if (collections.length > 0) {
            console.log('Existing collections:');
            for (const col of collections) {
                const count = await db.collection(col.name).countDocuments();
                console.log(`   - ${col.name} (${count} documents)`);
            }
            console.log();
        }
        
        await client.close();
        console.log('✨ Test completed successfully!');
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Connection failed!');
        console.error('Error:', error.message);
        console.error('\nPlease check:');
        console.error('  1. MONGODB_URI is correct in your .env file');
        console.error('  2. Your IP address is whitelisted in MongoDB Atlas');
        console.error('  3. Database user credentials are correct');
        process.exit(1);
    }
}

testConnection();
