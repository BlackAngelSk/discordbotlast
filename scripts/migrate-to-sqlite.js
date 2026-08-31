#!/usr/bin/env node
/**
 * Migration Script: JSON → SQLite
 * Reads all JSON files in data/ and imports them into SQLite database
 */

const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SQLITE_PATH = path.join(DATA_DIR, 'bot.sqlite');

async function migrateJsonToSqlite() {
  console.log('🔄 Starting migration from JSON to SQLite...');
  console.log(`   Source: ${DATA_DIR}`);
  console.log(`   Target: ${SQLITE_PATH}`);

  try {
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Create SQLite database
    const db = new Database(SQLITE_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create meta table
    db.exec(`
      CREATE TABLE IF NOT EXISTS _meta (
        collection TEXT PRIMARY KEY,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Read all JSON files from data directory
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'mongodbSyncConfig.json'
    );

    let totalCollections = 0;
    let totalRows = 0;

    for (const file of jsonFiles) {
      const collection = file.name.replace(/\.json$/i, '');
      const filePath = path.join(DATA_DIR, file.name);

      try {
        const rawData = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);

        // Create table for this collection
        const tableName = `"${collection.replace(/"/g, '""')}"`;
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL
          )
        `);

        // Convert JSON to rows
        let rows = [];
        if (Array.isArray(jsonData)) {
          rows = jsonData.map((doc, index) => ({
            key: doc._id || doc.id || `row_${index + 1}`,
            data: JSON.stringify(doc),
          }));
        } else if (typeof jsonData === 'object' && jsonData !== null) {
          rows = Object.entries(jsonData).map(([key, value]) => ({
            key: key,
            data: JSON.stringify(value),
          }));
        }

        // Insert data
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${tableName} (key, data) VALUES (?, ?)`);
        const insertMany = db.transaction((items) => {
          for (const item of items) {
            stmt.run(item.key, item.data);
          }
        });

        if (rows.length > 0) {
          insertMany(rows);
        }

        // Update meta
        db.prepare(
          `INSERT OR REPLACE INTO _meta (collection, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))`
        ).run(collection);

        console.log(`   ✅ ${collection}: ${rows.length} rows`);
        totalCollections++;
        totalRows += rows.length;
      } catch (error) {
        console.warn(`   ⚠️ Skipping ${collection}: ${error.message}`);
      }
    }

    db.close();
    console.log(`\n🎉 Migration completed!`);
    console.log(`   📊 ${totalCollections} collections migrated`);
    console.log(`   📊 ${totalRows} total rows imported`);
    console.log(`   📁 SQLite database: ${SQLITE_PATH}`);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateJsonToSqlite();
