# MongoDB Guide

This document consolidates MongoDB setup, migration, storage monitoring, and sync scheduling into one place.

## Overview

The bot can run in either of these modes:

- **JSON storage**: no database setup required
- **MongoDB storage**: recommended for larger or longer-lived deployments

If MongoDB is unavailable or misconfigured, the bot falls back to JSON storage automatically.

## Required Settings

Add the following values to `.env` when using MongoDB:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=discord-bot
MONGODB_DBNAME=discord-bot
```

Optional sync and connection settings:

```env
MONGODB_AUTOSYNC=true
MONGODB_AUTOSYNC_MODE=interval
MONGODB_AUTOSYNC_INTERVAL_MS=60000
MONGODB_SYNC_ON_STARTUP=true
MONGODB_SYNC_ON_SHUTDOWN=true
MONGODB_FORCE_IPV4=true
MONGODB_TLS_CA_FILE=
MONGODB_TLS_INSECURE=false
MONGODB_STORAGE_LIMIT_MB=512
```

## Setup Steps

1. Create a MongoDB Atlas cluster or use a self-hosted server
2. Copy the application connection string
3. Put the connection string into `MONGODB_URI`
4. Set `MONGODB_DBNAME`
5. Restart the bot

When the connection succeeds, the bot uses MongoDB and keeps JSON as a local fallback layer where applicable.

## Migration from JSON to MongoDB

The project includes migration utilities.

### Interactive migration

```bash
node migrate-to-mongodb.js
```

### Automatic migration

```bash
node migrate-auto.js
```

These scripts move data from the JSON files in `data/` into MongoDB collections.

## Storage Monitoring

Use either of the following to inspect database usage:

### Command line

```bash
node check-mongodb-space.js
```

### Discord command

```text
/mongodb-space
```

This is useful for monitoring storage consumption on free-tier or fixed-limit plans.

## Choosing When MongoDB Updates Happen

The bot now supports manual and timed update scheduling.

### View the current sync schedule

```text
/mongodb-sync status
```

### Switch to manual mode

```text
/mongodb-sync schedule mode:manual
```

In manual mode, MongoDB updates only when you run:

```text
/mongodb-sync run
```

### Switch to timed updates

```text
/mongodb-sync schedule mode:interval minutes:10
```

This makes the bot sync on a repeating interval.

## Startup and Shutdown Sync

You can control whether sync happens at launch and shutdown with:

```env
MONGODB_SYNC_ON_STARTUP=true
MONGODB_SYNC_ON_SHUTDOWN=true
```

## Troubleshooting

### `querySrv ENOTFOUND`

The MongoDB URI is usually incomplete or invalid. Recheck the copied cluster address.

### `bad auth` or authentication failed

Verify the username and password in `MONGODB_URI`. If the password contains special characters, URL-encode it.

### timeout or server selection failure

Check:

- Atlas network access or IP allowlist
- firewall rules
- internet or DNS access
- whether `MONGODB_FORCE_IPV4=true` helps

### Bot still uses JSON

If `MONGODB_URI` is empty, invalid, or the database connection fails, the bot intentionally falls back to JSON storage.

## Recommended Workflow

For production use:

1. configure MongoDB in `.env`
2. run a migration if you have existing JSON data
3. use `/mongodb-sync status` to verify sync mode
4. use `/mongodb-space` to monitor storage use
5. keep regular backups enabled

## Related Files and Commands

- `utils/databaseManager.js`
- `migrate-to-mongodb.js`
- `migrate-auto.js`
- `check-mongodb-space.js`
- `/mongodb-space`
- `/mongodb-sync`
