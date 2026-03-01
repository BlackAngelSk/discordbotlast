# ⚡ Quick Reference Guide

## 🚀 Getting Started (30 seconds)

```bash
# 1. Install
npm install

# 2. Start
npm start

# 3. Check health
/botstatus health
```

---

## 📋 All New Commands

### User Commands

| Command | Use Case | Example |
|---------|----------|---------|
| `/reminder` | Create reminders | `/reminder create message:"Meeting" time:"1h"` |
| `/poll` | Create polls | `/poll question:"Best game?" option1:"Game1" option2:"Game2"` |

### Admin Commands

| Command | Use Case | Example |
|---------|----------|---------|
| `/botstatus` | Check bot health | `/botstatus health` |
| `/auditlogs` | View admin logs | `/auditlogs recent` |
| `/welcomemessage` | Setup welcome | `/welcomemessage setup channel:#general` |
| `/roletemplate` | Create roles | `/roletemplate create template:admin` |

---

## 🔧 System Files Location

```
📂 Core Systems
├─ utils/errorHandler.js
├─ utils/cooldownManager.js
├─ utils/rateLimiter.js
├─ utils/shutdownManager.js
├─ utils/inputValidator.js
├─ utils/logger.js
├─ utils/uptimeMonitor.js
├─ utils/autoBackup.js
├─ utils/auditLog.js
├─ utils/welcomeMessageManager.js
├─ utils/reminderManager.js
└─ utils/roleTemplateManager.js

📂 Data Storage
├─ data/reminders.json
├─ data/welcomeMessages.json
├─ data/roleTemplates.json
├─ logs/bot-YYYY-MM-DD.json
├─ logs/error-YYYY-MM-DD.json
├─ logs/audit/audit-YYYY-MM-DD.json
└─ data/backups/

📂 New Commands
├─ slashCommands/utility/reminder.js
├─ slashCommands/utility/poll.js
├─ slashCommands/admin/botstatus.js
├─ slashCommands/admin/auditlogs.js
├─ slashCommands/admin/welcomemessage.js
└─ slashCommands/admin/roletemplate.js
```

---

## ⚙️ Quick Config

### Backup Schedule
**Default**: Daily 02:00 UTC, Weekly Sunday 03:00 UTC
**File**: Edit in `index.js` line for `AutoBackup`

### Cooldown Settings
**Default**: Global: None, Per-command: Configurable
**File**: Set when creating command

### Welcome Messages
**Default**: Disabled
**Setup**: `/welcomemessage setup channel:#general`

### Audit Log Retention
**Default**: 90 days
**File**: `utils/auditLog.js` line `this.daysToKeep`

---

## 🛠️ Troubleshooting Checklist

| Issue | Solution | Command |
|-------|----------|---------|
| Bot offline? | Restart and check logs | `npm start` & check `/logs/error-*.json` |
| High memory? | Check status | `/botstatus health` |
| Commands not working? | Register slash commands | Check console output |
| Lost data? | Restore from backup | `client.autoBackup.restoreFromBackup(name)` |
| No logs? | Check directory | Verify `/logs/` exists |
| Backups not creating? | Check permissions | Review error logs |

---

## 📊 Monitoring Commands

```
/botstatus health      # Health check
/botstatus stats       # Statistics
/botstatus uptime      # Uptime info
/botstatus backups     # Backup status
/auditlogs recent      # Recent actions
/auditlogs stats       # Action statistics
```

---

## 🔐 Security Features Active

✅ Error catching & recovery
✅ Input validation
✅ Cooldown protection
✅ Rate limiting
✅ Automatic backups
✅ Graceful shutdown
✅ Audit logging
✅ Permission checking

---

## 📁 Important Files

| File | Purpose | Edit? |
|------|---------|-------|
| `index.js` | Main bot file | ⚠️ Caution |
| `.env` | Configuration | ✅ Required |
| `logs/*` | System logs | 📖 Read-only |
| `data/backups/*` | Data backups | 📖 Read-only |
| `utils/errorHandler.js` | Error handling | ⚠️ Caution |

---

## 🎯 Common Tasks

### Check Bot Health
```
/botstatus health
```

### Create a Reminder
```
/reminder create message:"Task" time:"2h"
```

### Setup Welcome Messages
```
/welcomemessage setup channel:#welcome
```

### View Recent Audit Logs
```
/auditlogs recent
```

### Create Admin Role
```
/roletemplate create template:admin
```

### Create a Poll
```
/poll question:"Question?" option1:"A" option2:"B"
```

---

## 📞 Quick Help

**Bot won't start?**
1. Check `.env` file
2. Check node version
3. Review `/logs/error-*.json`

**Commands not showing?**
1. Run `/botstatus stats`
2. Restart bot
3. Wait 30 seconds for Discord cache

**Need backups?**
1. Check `/data/backups/`
2. Use `/botstatus backups` to view
3. Manual: `client.autoBackup.createBackup('manual')`

**Check bot status?**
- `/botstatus health` - Overall health
- `/botstatus uptime` - How long running
- `/botstatus stats` - Performance metrics

---

## 🚀 First Time Setup

1. **Start the bot**
   ```bash
   npm start
   ```

2. **Check it's working**
   ```
   /botstatus health
   ```

3. **Setup welcome messages** (optional)
   ```
   /welcomemessage setup channel:#welcome
   ```

4. **Check backup status**
   ```
   /botstatus backups
   ```

5. **View logs** (if any issues)
   ```
   Check /logs/ folder
   ```

---

## 🎉 You're All Set!

All features are:
- ✅ Installed
- ✅ Configured
- ✅ Active
- ✅ Ready to use

**Enjoy your enhanced Discord bot!**

---

## 📚 Full Documentation

- **SYSTEM_ENHANCEMENTS.md** - Complete feature guide
- **IMPLEMENTATION_COMPLETE.md** - Implementation details
- **ENHANCEMENT_SUMMARY.md** - Visual summary

---

*Quick Reference v2.0*
*Last Updated: 2024*

