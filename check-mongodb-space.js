/**
 * MongoDB storage utilities for the mongodb-space slash command.
 */

const MONGODB_STORAGE_LIMIT = 512; // MB (MongoDB free tier limit)
const MONGO_DRIVER_PACKAGE = 'mongodb';

function validateMongoUri(uri) {
  if (!uri) return 'MONGODB_URI is not set in environment variables.';
  if (typeof uri !== 'string') return 'MONGODB_URI must be a string.';
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    return 'MONGODB_URI must start with mongodb:// or mongodb+srv://';
  }
  return null;
}

/**
 * The MongoDB driver is an optional dependency (the bot stores data in SQLite by
 * default). Load it lazily so a missing package is a clear message instead of a
 * MODULE_NOT_FOUND stack trace.
 */
function loadMongoClient() {
  try {
    return require(MONGO_DRIVER_PACKAGE).MongoClient;
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      const driverError = new Error(
        'MongoDB driver is not installed. Run `npm install mongodb` to enable this command.'
      );
      driverError.code = 'MONGO_DRIVER_MISSING';
      throw driverError;
    }
    throw error;
  }
}

function isMongoDriverAvailable() {
  try {
    loadMongoClient();
    return true;
  } catch {
    return false;
  }
}

async function connectMongoWithRetry(uri, retries = 3, delayMs = 2000) {
  const MongoClient = loadMongoClient();
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

module.exports = {
  MONGODB_STORAGE_LIMIT,
  isMongoDriverAvailable,
  loadMongoClient,
  validateMongoUri,
  connectMongoWithRetry,
};
