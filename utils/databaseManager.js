/**
 * Database Manager - MongoDB/JSON Database Abstraction Layer
 * Supports both MongoDB (production) and JSON (fallback)
 */

const fs = require('fs').promises;
const path = require('path');

class DatabaseManager {
    constructor() {
        this.useDB = process.env.MONGODB_URI ? 'mongodb' : 'json';
        this.dbPath = path.join(__dirname, '..', 'data');
        this.mongoClient = null;
        this.db = null;
        this.autoSyncEnabled = (process.env.MONGODB_AUTOSYNC || 'true').toLowerCase() !== 'false';
        this.autoSyncIntervalMs = Math.max(30_000, Number(process.env.MONGODB_AUTOSYNC_INTERVAL_MS) || 60_000);
        this.autoSyncTimer = null;
        this.lastSyncedMtime = new Map();
    }

    isValidMongoUri(uri) {
        if (!uri || typeof uri !== 'string') return false;
        const trimmed = uri.trim();
        if (!trimmed) return false;
        if (trimmed.includes('<db_password>') || trimmed.includes('<username>')) return false;
        if (trimmed.includes('YOUR_') || trimmed.includes('your_')) return false;
        return /^mongodb(\+srv)?:\/\//.test(trimmed);
    }

    async init() {
        if (this.useDB === 'mongodb') {
            try {
                const uri = process.env.MONGODB_URI;
                if (!this.isValidMongoUri(uri)) {
                    console.warn('⚠️ MongoDB URI is missing or still contains placeholders. Falling back to JSON storage.');
                    this.useDB = 'json';
                    return;
                }

                const { MongoClient } = require('mongodb');
                this.mongoClient = new MongoClient(uri);
                await this.mongoClient.connect();
                this.db = this.mongoClient.db(process.env.MONGODB_DBNAME || 'discord-bot');
                console.log('✅ MongoDB connected successfully!');

                if (this.autoSyncEnabled) {
                    await this.syncAllJsonToMongo({ force: true });
                    this.startAutoSync();
                }
            } catch (error) {
                console.warn('⚠️ MongoDB connection failed, falling back to JSON:', error.message);
                this.useDB = 'json';
            }
        }
    }

    async getTopLevelJsonFiles() {
        const entries = await fs.readdir(this.dbPath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => ({
                fileName: entry.name,
                filePath: path.join(this.dbPath, entry.name)
            }));
    }

    normalizeDocumentsFromJson(jsonData) {
        if (Array.isArray(jsonData)) {
            return jsonData.map((doc, index) => {
                if (doc && typeof doc === 'object') {
                    return doc._id ? doc : { _id: `row_${index + 1}`, ...doc };
                }
                return { _id: `row_${index + 1}`, value: doc };
            });
        }

        if (jsonData && typeof jsonData === 'object') {
            return Object.entries(jsonData).map(([key, value]) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return { _id: key, ...value };
                }
                return { _id: key, value };
            });
        }

        return [];
    }

    async syncJsonFileToMongo(fileName, filePath, { force = false } = {}) {
        const stats = await fs.stat(filePath);
        const mtimeMs = stats.mtimeMs;
        const collection = fileName.replace(/\.json$/i, '');
        const last = this.lastSyncedMtime.get(collection) || 0;

        if (!force && mtimeMs <= last) {
            return { collection, skipped: true, synced: false };
        }

        const raw = await fs.readFile(filePath, 'utf8');
        const sanitized = raw.replace(/^\uFEFF/, '').trim();
        const jsonData = sanitized ? JSON.parse(sanitized) : {};
        const docs = this.normalizeDocumentsFromJson(jsonData);

        const mongoCollection = this.db.collection(collection);
        await mongoCollection.deleteMany({});
        if (docs.length > 0) {
            await mongoCollection.insertMany(docs);
        }

        this.lastSyncedMtime.set(collection, mtimeMs);
        return { collection, skipped: false, synced: true, count: docs.length };
    }

    async syncAllJsonToMongo({ force = false } = {}) {
        if (this.useDB !== 'mongodb' || !this.db) {
            return {
                totalFiles: 0,
                syncedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                failures: []
            };
        }

        try {
            const files = await this.getTopLevelJsonFiles();
            let syncedCount = 0;
            let skippedCount = 0;
            const failures = [];

            for (const file of files) {
                try {
                    const result = await this.syncJsonFileToMongo(file.fileName, file.filePath, { force });
                    if (result.synced) syncedCount++;
                    if (result.skipped) skippedCount++;
                } catch (error) {
                    console.warn(`⚠️ Auto-sync skipped ${file.fileName}: ${error.message}`);
                    failures.push({ file: file.fileName, reason: error.message });
                }
            }

            if (syncedCount > 0) {
                console.log(`🔄 Mongo auto-sync updated ${syncedCount} collection(s)`);
            }

            return {
                totalFiles: files.length,
                syncedCount,
                skippedCount,
                failedCount: failures.length,
                failures
            };
        } catch (error) {
            console.warn('⚠️ Mongo auto-sync failed:', error.message);
            return {
                totalFiles: 0,
                syncedCount: 0,
                skippedCount: 0,
                failedCount: 1,
                failures: [{ file: 'global', reason: error.message }]
            };
        }
    }

    startAutoSync() {
        if (this.autoSyncTimer || !this.autoSyncEnabled || this.useDB !== 'mongodb') return;
        this.autoSyncTimer = setInterval(() => {
            this.syncAllJsonToMongo().catch((error) => {
                console.warn('⚠️ Mongo auto-sync interval error:', error.message);
            });
        }, this.autoSyncIntervalMs);
        console.log(`✅ Mongo auto-sync enabled (every ${Math.floor(this.autoSyncIntervalMs / 1000)}s)`);
    }

    async getCollection(collection) {
        if (this.useDB === 'mongodb') {
            return this.db.collection(collection);
        }
        // JSON fallback
        const filePath = path.join(this.dbPath, `${collection}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    async findOne(collection, query) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).findOne(query);
        }
        const data = await this.getCollection(collection);
        const key = Object.keys(query)[0];
        return Object.values(data).find(item => item[key] === query[key]);
    }

    async find(collection, query = {}) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).find(query).toArray();
        }
        const data = await this.getCollection(collection);
        if (Object.keys(query).length === 0) return Object.values(data);
        
        const key = Object.keys(query)[0];
        return Object.values(data).filter(item => item[key] === query[key]);
    }

    async insertOne(collection, document) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).insertOne(document);
        }
        const data = await this.getCollection(collection);
        const id = document._id || document.id || Date.now().toString();
        data[id] = { ...document, _id: id };
        await this.saveCollection(collection, data);
        return { insertedId: id };
    }

    async updateOne(collection, query, update) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).updateOne(query, { $set: update });
        }
        const data = await this.getCollection(collection);
        const key = Object.keys(query)[0];
        for (const id in data) {
            if (data[id][key] === query[key]) {
                data[id] = { ...data[id], ...update };
                await this.saveCollection(collection, data);
                return { modifiedCount: 1 };
            }
        }
        return { modifiedCount: 0 };
    }

    async deleteOne(collection, query) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).deleteOne(query);
        }
        const data = await this.getCollection(collection);
        const key = Object.keys(query)[0];
        for (const id in data) {
            if (data[id][key] === query[key]) {
                delete data[id];
                await this.saveCollection(collection, data);
                return { deletedCount: 1 };
            }
        }
        return { deletedCount: 0 };
    }

    async saveCollection(collection, data) {
        const filePath = path.join(this.dbPath, `${collection}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async close() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
    }
}

module.exports = new DatabaseManager();
