# MongoDB Storage Checker Setup

## 📋 What Was Implemented

### 1. Enhanced Command-Line Script: `check-mongodb-space.js`
A Node.js script that displays:
- **Database Statistics**: Total data size, storage size, collection count, index count
- **Storage Usage**: Current usage in MB and GB
- **Space Remaining**: How much storage is left based on your plan limit
- **Usage Percentage**: Visual percentage of storage used
- **Collection Breakdown**: Detailed breakdown of all collections sorted by size
- **Top Collections**: Shows which collections are using the most space

**Run from command line:**
```bash
node check-mongodb-space.js
```

### 2. Discord Slash Command: `/mongodb-space`
A Discord slash command for checking MongoDB space **in your Discord server**.

**Features:**
- ✅ **Bot Owner Only**: Only your bot owner (configured in `BOT_OWNER_ID`) can use this command
- 📊 **Rich Embed Display**: Shows all storage information in an organized Discord embed
- ⚠️ **Smart Color Coding**:
  - 🟢 **Green** (0-50%): Plenty of space available
  - 🟡 **Yellow** (50-80%): Getting close to limit
  - 🔴 **Red** (80%+): Warning! Storage running low
- 📋 **Top Collections**: Shows the 5 largest collections
- 🚀 **Ephemeral Message**: Only the command user can see the response

**How to use:**
```
/mongodb-space
```

## 🔧 Configuration

### In `.env` file:
```dotenv
# Bot Owner ID (Your Discord User ID - required for command access)
BOT_OWNER_ID=349649557896036354

# MongoDB Storage Limit in MB (default: 512 MB for free tier)
# Update this based on your plan:
# - 512 MB (Free tier)
# - 2.5 GB (Shared tier)
# - 10 GB+ (Dedicated tier)
MONGODB_STORAGE_LIMIT_MB=512
```

## 📊 Current Usage

```
Database: discord-bot
═══════════════════════════════════════════════
📊 Storage Limit: 512 MB
✅ Space Left: 510.76 MB
📈 Usage: 0.2%
═══════════════════════════════════════════════
```

You have plenty of storage space available!

## 🚀 Usage Examples

### Option 1: Command Line
```bash
cd /home/black/Documents/GitHub/discordbotlast
node check-mongodb-space.js
```

Output shows:
- Database stats
- Storage usage percentage
- Collection-by-collection breakdown
- Largest collections identified

### Option 2: Discord Command
```
/mongodb-space
```

In Discord, you'll see:
- 💾 Storage Used
- ✅ Space Left
- 📈 Usage Percentage
- 📊 Storage Limit
- 📄 Total Collections
- 🏆 Top 5 Collections

## ⚠️ When to Worry

The script/command will warn you when:
- Usage exceeds **80%** of your storage limit (Red color)
- Usage exceeds **50%** of your storage limit (Yellow color)

At that point, consider:
- Deleting old user data
- Archiving historical data to JSON backups
- Upgrading your MongoDB plan

## 📝 Notes

- The script exports `checkMongoDBSpace` function for use in other modules
- The MongoDB storage limit can be configured per your plan
- Free tier: 512 MB
- Paid tiers: Higher limits (2.5GB, 10GB, etc.)
- All collection statistics are calculated in real-time from MongoDB
