/**
 * Database Manager - SQLite Database Abstraction Layer
 * Uses better-sqlite3 for fast, synchronous SQLite operations
 * Provides the same API as the previous MongoDB/JSON version
 */

const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');
const Database = require('better-sqlite3');

class DatabaseManager {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data');
    this.sqliteDb = null;
    this.sqlitePath = path.join(this.dbPath, 'bot.sqlite');
  }

  async init() {
    await fs.mkdir(this.dbPath, { recursive: true });

    try {
      this.sqliteDb = new Database(this.sqlitePath);
      // Enable WAL mode for better concurrent read performance
      this.sqliteDb.pragma('journal_mode = WAL');
      // Enable foreign keys
      this.sqliteDb.pragma('foreign_keys = ON');

      // Create a meta table for tracking collections
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS _meta (
          collection TEXT PRIMARY KEY,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      console.log('✅ SQLite database connected successfully!');
      console.log(`   📁 Database: ${this.sqlitePath}`);
    } catch (error) {
      console.error('❌ SQLite database failed to initialize:', error.message);
      throw error;
    }
  }

  getCollectionTable(collection) {
    return `"${collection.replace(/"/g, '""')}"`;
  }

  ensureCollectionTable(collection) {
    const tableName = this.getCollectionTable(collection);
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `);
  }

  async getCollection(collection) {
    if (!this.sqliteDb) {
      return {};
    }

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const rows = this.sqliteDb.prepare(`SELECT key, data FROM ${tableName}`).all();

    const result = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.data);
      } catch (error) {
        result[row.key] = row.data;
      }
    }

    return result;
  }

  async findOne(collection, query) {
    if (!this.sqliteDb) return null;

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const data = await this.getCollection(collection);

    const key = Object.keys(query)[0];
    return Object.values(data).find((item) => item[key] === query[key]) || null;
  }

  async find(collection, query = {}) {
    if (!this.sqliteDb) return [];

    this.ensureCollectionTable(collection);
    const data = await this.getCollection(collection);

    if (Object.keys(query).length === 0) return Object.values(data);

    const key = Object.keys(query)[0];
    return Object.values(data).filter((item) => item[key] === query[key]);
  }

  async insertOne(collection, document) {
    if (!this.sqliteDb) return { insertedId: null };

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const id = document._id || document.id || Date.now().toString();

    const data = { ...document, _id: id };
    const stmt = this.sqliteDb.prepare(`INSERT OR REPLACE INTO ${tableName} (key, data) VALUES (?, ?)`);
    stmt.run(id, JSON.stringify(data));

    return { insertedId: id };
  }

  async updateOne(collection, query, update) {
    if (!this.sqliteDb) return { modifiedCount: 0 };

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const data = await this.getCollection(collection);

    const key = Object.keys(query)[0];
    for (const id in data) {
      if (data[id][key] === query[key]) {
        const updatedData = { ...data[id], ...update };
        const stmt = this.sqliteDb.prepare(`INSERT OR REPLACE INTO ${tableName} (key, data) VALUES (?, ?)`);
        stmt.run(id, JSON.stringify(updatedData));
        return { modifiedCount: 1 };
      }
    }

    return { modifiedCount: 0 };
  }

  async upsertOne(collection, query, update) {
    if (!this.sqliteDb) return { matchedCount: 0, modifiedCount: 1, upsertedCount: 1 };

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const data = await this.getCollection(collection);

    const key = Object.keys(query)[0];
    const value = query[key];
    const existingEntry = Object.entries(data).find(([, item]) => item && item[key] === value);
    const documentId = existingEntry?.[0] || update._id || value || Date.now().toString();
    const previous = existingEntry?.[1] || data[documentId] || {};

    const finalData = {
      ...previous,
      ...update,
      [key]: value,
      _id: documentId,
    };

    const stmt = this.sqliteDb.prepare(`INSERT OR REPLACE INTO ${tableName} (key, data) VALUES (?, ?)`);
    stmt.run(documentId, JSON.stringify(finalData));

    return {
      matchedCount: existingEntry ? 1 : 0,
      modifiedCount: 1,
      upsertedCount: existingEntry ? 0 : 1,
      upsertedId: existingEntry ? null : documentId,
    };
  }

  async deleteOne(collection, query) {
    if (!this.sqliteDb) return { deletedCount: 0 };

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);
    const data = await this.getCollection(collection);

    const key = Object.keys(query)[0];
    for (const id in data) {
      if (data[id][key] === query[key]) {
        const stmt = this.sqliteDb.prepare(`DELETE FROM ${tableName} WHERE key = ?`);
        stmt.run(id);
        return { deletedCount: 1 };
      }
    }

    return { deletedCount: 0 };
  }

  async saveCollection(collection, data) {
    if (!this.sqliteDb) return;

    this.ensureCollectionTable(collection);
    const tableName = this.getCollectionTable(collection);

    // Clear old data and insert new data
    this.sqliteDb.exec(`DELETE FROM ${tableName}`);

    const stmt = this.sqliteDb.prepare(`INSERT INTO ${tableName} (key, data) VALUES (?, ?)`);
    const insertMany = this.sqliteDb.transaction((items) => {
      for (const [key, value] of items) {
        stmt.run(key, JSON.stringify(value));
      }
    });

    const entries = Object.entries(data);
    if (entries.length > 0) {
      insertMany(entries);
    }
  }

  async close() {
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
      console.log('🔌 SQLite database disconnected.');
    }
  }

  async exportToJSON(filePath) {
    if (!this.sqliteDb) throw new Error('SQLite not initialized');

    const tables = this.sqliteDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_meta%'"
    ).all();

    const exportData = {};
    for (const table of tables) {
      const rows = this.sqliteDb.prepare(`SELECT key, data FROM "${table.name}"`).all();
      for (const row of rows) {
        try {
          exportData[row.key] = JSON.parse(row.data);
        } catch (error) {
          exportData[row.key] = row.data;
        }
      }
    }

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    return exportData;
  }

  getSyncStatus() {
    return {
      usingStorage: 'sqlite',
      databasePath: this.sqlitePath,
      isConnected: !!this.sqliteDb,
    };
  }
}

module.exports = new DatabaseManager();