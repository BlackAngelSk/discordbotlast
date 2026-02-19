# MongoDB Migration - Quick Start

Your Discord bot is ready to migrate from JSON files to MongoDB! 🚀

## Current Status

✅ MongoDB driver installed  
✅ Database abstraction layer ready  
✅ Migration scripts created  
⚠️ MongoDB connection needs to be configured

## What You Need

Your current `.env` file has an incomplete MongoDB URI:

The connection string is missing the cluster address. It should look like:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net
```

## Steps to Complete Migration

### 1. Get Your Full MongoDB Connection String

Go to [MongoDB Atlas](https://cloud.mongodb.com/):

1. Log in to your account
2. Click on your cluster
3. Click "Connect"
4. Choose "Connect your application"
5. Copy the full connection string
6. Replace `<password>` with your actual password

Example:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net
```

### 2. Update Your .env File

Replace the `MONGODB_URI` line in your `.env` file with the complete connection string.

### 3. Test the Connection

```bash
node test-mongodb.js
```

You should see:
```
✅ Connection successful!
```

### 4. Run the Migration

**Option A: Interactive (Recommended)**
```bash
node migrate-to-mongodb.js
```
Choose option 1 to migrate, and say 'yes' to create a backup first.

**Option B: Automatic**
```bash
node migrate-auto.js
```
Migrates everything automatically.

### 5. Start Your Bot

```bash
npm start
```

Your bot will now use MongoDB instead of JSON files!

## Migration Scripts

Three scripts are available:

1. **`test-mongodb.js`** - Test connection and view existing data
2. **`migrate-to-mongodb.js`** - Interactive migration with backup options
3. **`migrate-auto.js`** - Automatic migration (no prompts)

## Troubleshooting

### Connection Failed

**Error**: `querySrv ENOTFOUND`  
**Solution**: Your MongoDB URI is incomplete or incorrect. Get the full connection string from MongoDB Atlas.

**Error**: `bad auth`  
**Solution**: Check username and password in the connection string.

**Error**: `connection timeout`  
**Solution**: Whitelist your IP in MongoDB Atlas → Network Access → Add IP Address.

### Still Using JSON?

If `MONGODB_URI` is empty or commented out in `.env`, the bot will use JSON files as a fallback.

## Need Help?

See the complete guide: [MONGODB_MIGRATION.md](MONGODB_MIGRATION.md)

## What Gets Migrated?

All 30+ collections including:
- User economy data
- Server settings
- Custom commands
- Moderation logs
- Game statistics
- And much more!

---

**Ready to migrate?** Follow the steps above! 🎉
