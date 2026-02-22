/**
 * Check MongoDB Storage Usage
 * Displays database size and collection sizes
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

// MongoDB storage limits (in MB) - Update based on your plan
// Common limits: 512 MB (free), 2.5 GB, 10 GB, etc.
const MONGODB_STORAGE_LIMIT = process.env.MONGODB_STORAGE_LIMIT_MB || 512;

async function checkMongoDBSpace() {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DBNAME || 'discord-bot';

    if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in .env file');
        process.exit(1);
    }

    const mongoClient = new MongoClient(mongoUri);

    try {
        console.log('📊 Connecting to MongoDB...\n');
        await mongoClient.connect();
        const db = mongoClient.db(dbName);

        // Get database stats
        const dbStats = await db.stats();
        const dbSizeInBytes = dbStats.dataSize;
        const dbSizeInMB = (dbSizeInBytes / (1024 * 1024)).toFixed(2);
        const dbSizeInGB = (dbSizeInBytes / (1024 * 1024 * 1024)).toFixed(4);
        const storageSize = dbStats.storageSize;
        const storageSizeInMB = (storageSize / (1024 * 1024)).toFixed(2);
        const storageSizeInGB = (storageSize / (1024 * 1024 * 1024)).toFixed(4);
        
        // Calculate space left
        const spaceLeftMB = (MONGODB_STORAGE_LIMIT - storageSizeInMB).toFixed(2);
        const spaceUsedPercent = ((storageSizeInMB / MONGODB_STORAGE_LIMIT) * 100).toFixed(1);

        console.log(`📁 Database: ${dbName}`);
        console.log('═══════════════════════════════════════════════');
        console.log(`📦 Data Size: ${dbSizeInMB} MB (${dbSizeInGB} GB)`);
        console.log(`💾 Storage Size: ${storageSizeInMB} MB (${storageSizeInGB} GB)`);
        console.log(`📄 Collections: ${dbStats.collections}`);
        console.log(`📊 Indexes: ${dbStats.indexes}`);
        console.log('═══════════════════════════════════════════════');
        console.log(`📊 Storage Limit: ${MONGODB_STORAGE_LIMIT} MB`);
        console.log(`✅ Space Left: ${spaceLeftMB} MB`);
        console.log(`📈 Usage: ${spaceUsedPercent}%`);
        console.log('═══════════════════════════════════════════════\n');

        // Get collection sizes using collStats command
        const collections = await db.listCollections().toArray();
        const collectionStats = [];

        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            
            try {
                const stats = await db.command({ collStats: collectionName });
                
                const size = stats.size || 0;
                const sizeInMB = (size / (1024 * 1024)).toFixed(2);
                const sizeInKB = (size / 1024).toFixed(2);
                const count = stats.count || 0;
                const avgSize = count > 0 ? (size / count).toFixed(2) : 0;

                collectionStats.push({
                    name: collectionName,
                    size: size,
                    sizeInMB: sizeInMB,
                    sizeInKB: sizeInKB,
                    count: count,
                    avgSize: avgSize
                });
            } catch (error) {
                console.warn(`⚠️ Could not get stats for collection ${collectionName}`);
            }
        }

        // Sort by size (largest first)
        collectionStats.sort((a, b) => b.size - a.size);

        console.log('📋 Collection Breakdown (sorted by size):\n');
        console.log('Collection'.padEnd(30) + 'Size'.padEnd(15) + 'Documents'.padEnd(12) + 'Avg Doc Size');
        console.log('─'.repeat(80));

        let totalSize = 0;
        for (const stats of collectionStats) {
            const sizeDisplay = stats.sizeInMB >= 1 
                ? `${stats.sizeInMB} MB` 
                : `${stats.sizeInKB} KB`;
            
            console.log(
                stats.name.padEnd(30) + 
                sizeDisplay.padEnd(15) + 
                stats.count.toString().padEnd(12) + 
                `${stats.avgSize} bytes`
            );
            totalSize += stats.size;
        }

        console.log('─'.repeat(80));
        const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
        console.log('TOTAL'.padEnd(30) + `${totalSizeInMB} MB`);

        console.log('\n✅ MongoDB space check complete!');

    } catch (error) {
        console.error('❌ Error checking MongoDB:', error.message);
        process.exit(1);
    } finally {
        await mongoClient.close();
    }
}

// Export for use as a function
module.exports = { checkMongoDBSpace, MONGODB_STORAGE_LIMIT };

// Run if executed directly
if (require.main === module) {
    checkMongoDBSpace();
}
