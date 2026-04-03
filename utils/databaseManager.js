/**
 * Database Manager - MongoDB/JSON Database Abstraction Layer
 * Supports both MongoDB (production) and JSON (fallback)
 */

const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');
const { isDevModeEnabled } = require('./devMode');

class DatabaseManager {
    constructor() {
        this.devMode = isDevModeEnabled();
        this.useDB = this.devMode ? 'json' : (process.env.MONGODB_URI ? 'mongodb' : 'json');
        this.dbPath = path.join(__dirname, '..', 'data');
        this.mongoClient = null;
        this.db = null;
        this.syncConfigPath = path.join(this.dbPath, 'mongodbSyncConfig.json');
        this.syncSettings = this.getDefaultSyncSettings();
        this.autoSyncEnabled = !this.devMode && this.syncSettings.mode === 'interval';
        this.autoSyncIntervalMs = this.syncSettings.intervalMs;
        this.autoSyncTimer = null;
        this.lastSyncedMtime = new Map();
        this.lastSyncStatus = null;
        this.nextAutoSyncAt = null;
    }

    getEnvString(name, fallback = '') {
        const raw = process.env[name];
        if (typeof raw !== 'string') return fallback;
        const noInlineComment = raw.split('#')[0].trim();
        return noInlineComment || fallback;
    }

    getEnvBoolean(name, fallback = false) {
        const normalized = this.getEnvString(name, String(fallback)).toLowerCase();
        return ['1', 'true', 'yes', 'on'].includes(normalized);
    }

    getDefaultSyncSettings() {
        const envAutoSyncEnabled = !this.devMode && this.getEnvBoolean('MONGODB_AUTOSYNC', true);
        const requestedMode = this.getEnvString('MONGODB_AUTOSYNC_MODE', envAutoSyncEnabled ? 'interval' : 'manual').toLowerCase();

        return {
            mode: envAutoSyncEnabled && requestedMode !== 'manual' ? 'interval' : 'manual',
            intervalMs: Math.max(30_000, Number(process.env.MONGODB_AUTOSYNC_INTERVAL_MS) || 60_000),
            startupSync: this.getEnvBoolean('MONGODB_SYNC_ON_STARTUP', true),
            shutdownSync: this.getEnvBoolean('MONGODB_SYNC_ON_SHUTDOWN', true)
        };
    }

    normalizeSyncSettings(settings = {}) {
        const defaults = this.getDefaultSyncSettings();
        const normalizedMode = String(settings.mode ?? defaults.mode).toLowerCase();
        const intervalMsRaw = settings.intervalMs ?? settings.autoSyncIntervalMs ?? defaults.intervalMs;

        return {
            mode: normalizedMode === 'manual' ? 'manual' : 'interval',
            intervalMs: Math.max(30_000, Number(intervalMsRaw) || defaults.intervalMs),
            startupSync: typeof settings.startupSync === 'boolean' ? settings.startupSync : defaults.startupSync,
            shutdownSync: typeof settings.shutdownSync === 'boolean' ? settings.shutdownSync : defaults.shutdownSync
        };
    }

    async loadSyncSettings() {
        try {
            const raw = await fs.readFile(this.syncConfigPath, 'utf8');
            const parsed = JSON.parse(raw);
            this.syncSettings = this.normalizeSyncSettings(parsed);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`⚠️ Failed to load MongoDB sync config: ${error.message}`);
            }
            this.syncSettings = this.getDefaultSyncSettings();
        }

        this.applySyncSettings({ restartTimer: false });
        return this.getSyncStatus();
    }

    async saveSyncSettings() {
        await fs.mkdir(path.dirname(this.syncConfigPath), { recursive: true });
        await fs.writeFile(this.syncConfigPath, JSON.stringify(this.syncSettings, null, 2));
    }

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
        this.nextAutoSyncAt = null;
    }

    applySyncSettings({ restartTimer = true } = {}) {
        this.autoSyncEnabled = !this.devMode && this.syncSettings.mode === 'interval';
        this.autoSyncIntervalMs = this.syncSettings.intervalMs;

        if (!restartTimer) {
            return;
        }

        this.stopAutoSync();
        if (this.autoSyncEnabled && this.useDB === 'mongodb' && this.db) {
            this.startAutoSync();
        }
    }

    getSyncStatus() {
        return {
            mode: this.syncSettings.mode,
            intervalMs: this.syncSettings.intervalMs,
            intervalMinutes: Number((this.syncSettings.intervalMs / 60_000).toFixed(2)),
            startupSync: this.syncSettings.startupSync,
            shutdownSync: this.syncSettings.shutdownSync,
            autoSyncEnabled: this.autoSyncEnabled,
            isConnected: this.useDB === 'mongodb' && !!this.db,
            usingStorage: this.useDB,
            nextAutoSyncAt: this.nextAutoSyncAt ? new Date(this.nextAutoSyncAt).toISOString() : null,
            lastSyncAt: this.lastSyncStatus?.finishedAt || null,
            lastSyncDurationMs: this.lastSyncStatus?.durationMs || null,
            lastReason: this.lastSyncStatus?.reason || null,
            lastResult: this.lastSyncStatus
        };
    }

    async updateSyncSettings(updates = {}) {
        const nextSettings = { ...this.syncSettings };

        if (updates.mode) {
            nextSettings.mode = updates.mode;
        }
        if (typeof updates.intervalMs === 'number') {
            nextSettings.intervalMs = updates.intervalMs;
        }
        if (typeof updates.startupSync === 'boolean') {
            nextSettings.startupSync = updates.startupSync;
        }
        if (typeof updates.shutdownSync === 'boolean') {
            nextSettings.shutdownSync = updates.shutdownSync;
        }

        this.syncSettings = this.normalizeSyncSettings(nextSettings);
        await this.saveSyncSettings();
        this.applySyncSettings();

        return this.getSyncStatus();
    }

    isTlsHandshakeError(errorMessage = '') {
        const message = String(errorMessage || '').toLowerCase();
        return message.includes('tlsv1 alert internal error') || message.includes('ssl routines');
    }

    buildMongoClientOptions() {
        const options = {
            serverSelectionTimeoutMS: Math.max(3_000, Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 10_000),
            connectTimeoutMS: Math.max(3_000, Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 10_000)
        };

        if (this.getEnvBoolean('MONGODB_FORCE_IPV4', false)) {
            options.family = 4;
        }

        const caFile = this.getEnvString('MONGODB_TLS_CA_FILE', '');
        if (caFile) {
            if (fsSync.existsSync(caFile)) {
                options.tls = true;
                options.tlsCAFile = caFile;
            } else {
                console.warn(`⚠️ MONGODB_TLS_CA_FILE not found at "${caFile}". Ignoring custom CA file and using system trust store.`);
            }
        }

        if (this.getEnvBoolean('MONGODB_TLS_INSECURE', false)) {
            options.tls = true;
            options.tlsAllowInvalidCertificates = true;
            options.tlsAllowInvalidHostnames = true;
        }

        return options;
    }

    getMongoConnectionHint(errorMessage = '') {
        const message = String(errorMessage || '').toLowerCase();

        if (this.isTlsHandshakeError(message)) {
            return 'TLS handshake failed. Check Atlas IP access list, system CA certificates, and try MONGODB_FORCE_IPV4=true. If needed, set MONGODB_TLS_CA_FILE to your CA bundle path.';
        }

        if (message.includes('authentication failed')) {
            return 'Authentication failed. Verify username/password in MONGODB_URI and URL-encode special password characters.';
        }

        if (message.includes('querysrv') || message.includes('enotfound')) {
            return 'DNS/SRV lookup failed. Check internet/DNS and try MONGODB_FORCE_IPV4=true.';
        }

        if (message.includes('timed out') || message.includes('server selection')) {
            return 'Connection timed out. Check Atlas network access and firewall rules for outbound 27017/27015.';
        }

        return 'Verify MONGODB_URI, Atlas Network Access (IP allowlist), and cluster status.';
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
        await this.loadSyncSettings();

        if (this.devMode) {
            console.log('🧪 DEV_MODE is enabled: MongoDB sync is disabled, using JSON storage only.');
            this.useDB = 'json';
            return;
        }

        if (this.useDB === 'mongodb') {
            try {
                const uri = process.env.MONGODB_URI;
                if (!this.isValidMongoUri(uri)) {
                    console.warn('⚠️ MongoDB URI is missing or still contains placeholders. Falling back to JSON storage.');
                    this.useDB = 'json';
                    return;
                }

                const { MongoClient } = require('mongodb');
                this.mongoClient = new MongoClient(uri, this.buildMongoClientOptions());
                await this.mongoClient.connect();
                this.db = this.mongoClient.db(process.env.MONGODB_DBNAME || 'discord-bot');
                console.log('✅ MongoDB connected successfully!');

                if (this.syncSettings.startupSync) {
                    await this.syncAllJsonToMongo({ force: true, reason: 'startup' });
                }

                if (this.autoSyncEnabled) {
                    this.startAutoSync();
                } else {
                    console.log('ℹ️ Mongo auto-sync is set to manual mode. Use /mongodb-sync run whenever you want to push updates.');
                }
            } catch (error) {
                // One automatic retry path for common TLS handshake failures
                if (this.isTlsHandshakeError(error?.message) && !this.getEnvBoolean('MONGODB_FORCE_IPV4', false)) {
                    try {
                        const { MongoClient } = require('mongodb');
                        const retryOptions = { ...this.buildMongoClientOptions(), family: 4 };
                        console.warn('⚠️ MongoDB TLS handshake failed. Retrying once with IPv4...');

                        this.mongoClient = new MongoClient(process.env.MONGODB_URI, retryOptions);
                        await this.mongoClient.connect();
                        this.db = this.mongoClient.db(process.env.MONGODB_DBNAME || 'discord-bot');
                        this.useDB = 'mongodb';
                        console.log('✅ MongoDB connected successfully on IPv4 retry!');

                        if (this.syncSettings.startupSync) {
                            await this.syncAllJsonToMongo({ force: true, reason: 'startup' });
                        }

                        if (this.autoSyncEnabled) {
                            this.startAutoSync();
                        } else {
                            console.log('ℹ️ Mongo auto-sync is set to manual mode. Use /mongodb-sync run whenever you want to push updates.');
                        }
                        return;
                    } catch (retryError) {
                        error = retryError;
                    }
                }

                console.warn('⚠️ MongoDB connection failed, falling back to JSON:', error.message);
                console.warn('💡 MongoDB hint:', this.getMongoConnectionHint(error.message));
                this.useDB = 'json';
            }
        }
    }

    async getTopLevelJsonFiles() {
        const entries = await fs.readdir(this.dbPath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== path.basename(this.syncConfigPath))
            .map((entry) => ({
                fileName: entry.name,
                filePath: path.join(this.dbPath, entry.name)
            }));
    }

    normalizeDocumentsFromJson(collection, jsonData) {
        // Keep seasons collection compatible with SeasonManager Mongo schema
        if (collection === 'seasons' && jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            return [{ _id: 'config', ...jsonData }];
        }

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
        const docs = this.normalizeDocumentsFromJson(collection, jsonData);

        const mongoCollection = this.db.collection(collection);
        await mongoCollection.deleteMany({});
        if (docs.length > 0) {
            await mongoCollection.insertMany(docs);
        }

        this.lastSyncedMtime.set(collection, mtimeMs);
        return { collection, skipped: false, synced: true, count: docs.length };
    }

    async syncAllJsonToMongo({ force = false, reason = 'manual' } = {}) {
        const startedAt = Date.now();

        if (this.useDB !== 'mongodb' || !this.db) {
            const result = {
                totalFiles: 0,
                syncedCount: 0,
                skippedCount: 0,
                failedCount: 1,
                failures: [{ file: 'global', reason: 'MongoDB is not connected.' }]
            };

            this.lastSyncStatus = {
                ...result,
                reason,
                startedAt: new Date(startedAt).toISOString(),
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt
            };

            return result;
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

            const summary = {
                totalFiles: files.length,
                syncedCount,
                skippedCount,
                failedCount: failures.length,
                failures
            };

            this.lastSyncStatus = {
                ...summary,
                reason,
                startedAt: new Date(startedAt).toISOString(),
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt
            };

            if (this.autoSyncEnabled) {
                this.nextAutoSyncAt = Date.now() + this.autoSyncIntervalMs;
            }

            return summary;
        } catch (error) {
            console.warn('⚠️ Mongo auto-sync failed:', error.message);
            const result = {
                totalFiles: 0,
                syncedCount: 0,
                skippedCount: 0,
                failedCount: 1,
                failures: [{ file: 'global', reason: error.message }]
            };

            this.lastSyncStatus = {
                ...result,
                reason,
                startedAt: new Date(startedAt).toISOString(),
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - startedAt
            };

            return result;
        }
    }

    startAutoSync() {
        if (this.autoSyncTimer || !this.autoSyncEnabled || this.useDB !== 'mongodb' || !this.db) return;

        this.nextAutoSyncAt = Date.now() + this.autoSyncIntervalMs;
        this.autoSyncTimer = setInterval(() => {
            this.syncAllJsonToMongo({ reason: 'interval' }).catch((error) => {
                console.warn('⚠️ Mongo auto-sync interval error:', error.message);
            });
        }, this.autoSyncIntervalMs);

        console.log(`✅ Mongo auto-sync enabled (every ${Number((this.autoSyncIntervalMs / 60_000).toFixed(2))} minute(s))`);
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

    async upsertOne(collection, query, update) {
        if (this.useDB === 'mongodb') {
            return await this.db.collection(collection).updateOne(query, { $set: update }, { upsert: true });
        }

        const data = await this.getCollection(collection);
        const key = Object.keys(query)[0];
        const value = query[key];
        const existingEntry = Object.entries(data).find(([, item]) => item && item[key] === value);
        const documentId = existingEntry?.[0] || update._id || value || Date.now().toString();
        const previous = existingEntry?.[1] || data[documentId] || {};

        data[documentId] = {
            ...previous,
            ...update,
            [key]: value,
            _id: documentId
        };

        await this.saveCollection(collection, data);

        return {
            matchedCount: existingEntry ? 1 : 0,
            modifiedCount: 1,
            upsertedCount: existingEntry ? 0 : 1,
            upsertedId: existingEntry ? null : documentId
        };
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
        this.stopAutoSync();

        if (this.syncSettings.shutdownSync && this.useDB === 'mongodb' && this.db) {
            try {
                await this.syncAllJsonToMongo({ force: true, reason: 'shutdown' });
            } catch (error) {
                console.warn('⚠️ Mongo shutdown sync failed:', error.message);
            }
        }

        if (this.mongoClient) {
            await this.mongoClient.close();
            this.mongoClient = null;
            this.db = null;
        }
    }
}

module.exports = new DatabaseManager();
