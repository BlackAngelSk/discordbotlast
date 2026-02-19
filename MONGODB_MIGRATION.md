# MongoDB Migration Guide

This guide will help you migrate your Discord bot's data from JSON files to MongoDB.

## 📋 Prerequisites

1. **MongoDB Atlas Account** (or self-hosted MongoDB)
   - Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free cluster
   - Get your connection string

2. **Node.js Dependencies**
   - MongoDB driver is already installed in package.json
   - No additional packages needed

## 🚀 Migration Steps

### Step 1: Set Up MongoDB

1. **Create a MongoDB Cluster** (if you haven't already):
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free M0 cluster
   - Create a database user with read/write permissions
   - Whitelist your IP address (or allow access from anywhere: `0.0.0.0/0`)

2. **Get Your Connection String**:
   - In MongoDB Atlas, click "Connect"
   - Choose "Connect your application"
   - Copy the connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net`)

### Step 2: Update .env File

Your `.env` file already has MongoDB configuration. Verify these settings:

```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net
MONGODB_DBNAME=discord-bot
```

**Note**: Make sure to replace with your actual MongoDB credentials if needed.

### Step 3: Run Migration Script

Run the interactive migration tool:

```bash
node migrate-to-mongodb.js
```

You'll see a menu with options:

```
╔════════════════════════════════════════╗
║   MongoDB Migration Tool               ║
╚════════════════════════════════════════╝

Choose an option:
  1. Migrate JSON → MongoDB (recommended)
  2. Rollback MongoDB → JSON
  3. Create backup of JSON files
  4. Test MongoDB connection
  5. Exit
```

### Step 4: Backup and Migrate

1. **Test Connection First** (Option 4):
   ```
   Enter your choice (1-5): 4
   ```
   This verifies your MongoDB connection works.

2. **Create Backup** (Option 3):
   ```
   Enter your choice (1-5): 3
   ```
   This creates a timestamped backup folder with all your JSON files.

3. **Migrate Data** (Option 1):
   ```
   Enter your choice (1-5): 1
   💾 Create backup before migration? (y/n): y
   ⚠️  This will overwrite existing MongoDB data. Continue? (yes/no): yes
   ```

The migration script will:
- Read all JSON files from the `data/` folder
- Convert them to MongoDB documents
- Upload to your MongoDB database
- Show progress for each collection

### Step 5: Start Your Bot

After successful migration, start your bot normally:

```bash
npm start
```

The bot will automatically detect the `MONGODB_URI` in your `.env` file and use MongoDB instead of JSON files.

## 📊 What Gets Migrated

The following collections will be migrated:

- ✅ afk
- ✅ ai
- ✅ analytics
- ✅ birthdays
- ✅ customcommands
- ✅ customRoles
- ✅ economy
- ✅ gameStats
- ✅ giveaways
- ✅ horseRaces
- ✅ invites
- ✅ levelRewards
- ✅ logging
- ✅ milestones
- ✅ moderation
- ✅ playlists
- ✅ premium
- ✅ presenceActivity
- ✅ raidProtection
- ✅ reactionroles
- ✅ relationships
- ✅ scheduledMessages
- ✅ settings
- ✅ shop
- ✅ starboard
- ✅ stats
- ✅ suggestions
- ✅ tickets
- ✅ voiceActivity
- ✅ voiceRewards

## 🔄 Rollback to JSON (If Needed)

If you need to switch back to JSON files:

1. Run the migration script:
   ```bash
   node migrate-to-mongodb.js
   ```

2. Choose option 2 (Rollback MongoDB → JSON)

3. Remove or comment out `MONGODB_URI` in your `.env` file:
   ```env
   # MONGODB_URI=mongodb+srv://...
   ```

4. Restart your bot

## 🛡️ Data Safety

### Backup Strategy

The migration script offers automatic backup:
- Creates a timestamped folder (e.g., `backup-1708380000000/`)
- Copies all JSON files before migration
- Keep these backups until you verify everything works

### Manual Backup

You can also manually backup your data:

```bash
# Create backup folder
mkdir -p backups/$(date +%Y%m%d-%H%M%S)

# Copy all JSON files
cp -r data/*.json backups/$(date +%Y%m%d-%H%M%S)/
```

## ⚙️ How It Works

The bot uses a **Database Manager** abstraction layer that automatically switches between:

- **MongoDB**: When `MONGODB_URI` is set in `.env`
- **JSON Files**: When `MONGODB_URI` is empty or not set

This means:
- ✅ No code changes needed
- ✅ Easy switching between databases
- ✅ Fallback to JSON if MongoDB connection fails
- ✅ Same API for all database operations

## 🐛 Troubleshooting

### Connection Errors

**Error**: `MongoServerError: bad auth`
- **Fix**: Check your username and password in MONGODB_URI

**Error**: `MongoNetworkError: connection timeout`
- **Fix**: Check your IP whitelist in MongoDB Atlas

**Error**: `MONGODB_URI not found`
- **Fix**: Make sure `.env` file exists and has MONGODB_URI

### Migration Errors

**Some collections show errors**:
- Check the error message
- Verify the JSON file is valid JSON format
- Try migrating that specific collection manually

**No data migrated**:
- Ensure JSON files exist in the `data/` folder
- Check file permissions
- Verify JSON files are not empty

### Performance Issues

**Bot is slow after migration**:
- MongoDB indexes may be needed for large datasets
- Check your MongoDB cluster performance
- Consider upgrading from free tier if you have lots of data

## 📈 Benefits of MongoDB

After migration, you'll enjoy:

1. **Better Performance**: Faster queries, especially with large datasets
2. **Scalability**: Handle millions of records easily
3. **Concurrent Access**: No file locking issues
4. **Advanced Queries**: Complex filtering and aggregation
5. **Reliability**: Automatic backups and replication
6. **Cloud Hosted**: Access from anywhere, no local files
7. **Monitoring**: Built-in analytics and performance metrics

## 🔧 Advanced Configuration

### Custom Database Name

Change the database name in `.env`:

```env
MONGODB_DBNAME=my-custom-bot-db
```

### Connection Options

Add connection options to your MONGODB_URI:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
```

### Multiple Environments

Use different databases for development and production:

**.env.development**:
```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DBNAME=discord-bot-dev
```

**.env.production**:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DBNAME=discord-bot-prod
```

## 📞 Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Verify your MongoDB connection with option 4 in the migration tool
3. Check MongoDB Atlas status page
4. Review bot logs for error messages

## ✅ Post-Migration Checklist

- [ ] MongoDB connection successful
- [ ] All collections migrated
- [ ] Bot starts without errors
- [ ] Commands work correctly
- [ ] Economy system intact
- [ ] User data preserved
- [ ] Backup created and stored safely
- [ ] `.env` file configured correctly

## 🎉 You're Done!

Your bot is now running on MongoDB! The JSON files in the `data/` folder are no longer used, but you can keep them as backup or delete them after confirming everything works.

**Enjoy the improved performance and scalability!** 🚀
