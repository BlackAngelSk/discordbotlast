/**
 * MongoDB storage utilities for the mongodb-space slash command.
 */

const MONGODB_STORAGE_LIMIT = 512; // MB (MongoDB free tier limit)

function validateMongoUri(uri) {
  if (!uri) return 'MONGODB_URI is not set in environment variables.';
  if (typeof uri !== 'string') return 'MONGODB_URI must be a string.';
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
  }
  return null;
}

async function connectMongoWithRetry(uri, retries = 3, delayMs = 2000) {
  const { MongoClient } = require('mongodb');
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

module.exports = { MONGODB_STORAGE_LIMIT, validateMongoUri, connectMongoWithRetry };
