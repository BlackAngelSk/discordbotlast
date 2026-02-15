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
    }

    async init() {
        if (this.useDB === 'mongodb') {
            try {
                const { MongoClient } = require('mongodb');
                this.mongoClient = new MongoClient(process.env.MONGODB_URI);
                await this.mongoClient.connect();
                this.db = this.mongoClient.db(process.env.MONGODB_DBNAME || 'discord-bot');
                console.log('✅ MongoDB connected successfully!');
            } catch (error) {
                console.warn('⚠️ MongoDB connection failed, falling back to JSON:', error.message);
                this.useDB = 'json';
            }
        }
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
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
    }
}

module.exports = new DatabaseManager();
