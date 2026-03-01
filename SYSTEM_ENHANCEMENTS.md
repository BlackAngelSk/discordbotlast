# 🤖 Discord Bot - Enhanced Edition

**Complete Setup & Features Guide**

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [New Systems Overview](#new-systems-overview)
3. [Configuration](#configuration)
4. [Commands Reference](#commands-reference)
5. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install

# Create .env file with your bot token
echo "BOT_TOKEN=your_token_here" > .env

# Start the bot
npm start
```

### New Features Included

✅ **Error Handling & Logging**
✅ **Command Cooldowns & Rate Limiting**
✅ **Graceful Shutdown Management**
✅ **Input Validation**
✅ **Automatic Backups**
✅ **Audit Logging**
✅ **Welcome Messages**
✅ **Reminders & Todos**
✅ **Role Templates**
✅ **System Monitoring**

---

## 🔧 New Systems Overview

### 1. **Error Handler** (`errorHandler.js`)
- Catches unhandled errors and rejections
- Stores logs in `/logs/error-YYYY-MM-DD.json`
- Provides error details with context
- Notifies admins of critical errors

**Access**: `client.errorHandler`

### 2. **Cooldown Manager** (`cooldownManager.js`)
- Prevents command spam
- Per-user cooldowns
- Global cooldowns
- Automatic cleanup

**Example**:
```javascript
const remaining = client.cooldownManager.getRemainingCooldown(userId, 'command');
if (remaining > 0) {
    // User on cooldown
}
client.cooldownManager.setCooldown(userId, 'command', 5000);
```

### 3. **Rate Limiter** (`rateLimiter.js`)
- Limits requests per time window
- Configurable thresholds
- Returns detailed rate limit info

**Example**:
```javascript
const result = client.rateLimiter.checkLimit(`${userId}_api`);
if (!result.allowed) {
    // Rate limit exceeded
    console.log(`Retry after: ${result.retryAfter}ms`);
}
```

### 4. **Shutdown Manager** (`shutdownManager.js`)
- Graceful process termination
- Data persistence on shutdown
- Creates backup before closing
- Configurable timeout

**Features**:
- Listens to SIGTERM/SIGINT
- Runs registered cleanup handlers
- Creates final backup
- 30-second shutdown timeout

### 5. **Input Validator** (`inputValidator.js`)
- String validation with length checks
- Number validation with ranges
- Email & URL validation
- Duration parsing (1h, 30m, 1d, etc.)
- Custom object validation

**Usage**:
```javascript
const result = InputValidator.validateString(input, {
    minLength: 1,
    maxLength: 100,
    trim: true
});

if (!result.valid) {
    console.error(result.error);
}
```

### 6. **Logger** (`logger.js`)
- Structured logging with levels
- Color-coded console output
- JSON file storage
- Separate logs for each day
- Command execution tracking

**Levels**: `info`, `warn`, `error`, `debug`, `success`

**Usage**:
```javascript
client.logger.info('Bot started');
client.logger.logCommand(interaction, 'commandName');
client.logger.error('Something went wrong', { userId: '123' });
```

### 7. **Uptime Monitor** (`uptimeMonitor.js`)
- Tracks bot uptime
- Memory monitoring
- Command performance metrics
- Response time tracking
- Health checks

**Access**: `client.uptimeMonitor.getStatus()`

### 8. **Auto Backup** (`autoBackup.js`)
- Scheduled daily/weekly backups
- Manual backup support
- Backup restoration
- Automatic cleanup of old backups
- Keeps last 30 backups

**Features**:
- Backup at startup
- Backup at shutdown
- Scheduled backups (configurable times)
- Full backup restoration
- Pre-restore safety backup

### 9. **Audit Log** (`auditLog.js`)
- Tracks all admin actions
- Categories: moderation, configuration, permissions, roles, channels, economy
- Filters by action, category, executor, target
- Retention: 90 days (configurable)

**Usage**:
```javascript
client.auditLog.logModerationAction({
    action: 'ban',
    executor: interaction.user,
    target: member,
    guildId: interaction.guildId,
    reason: 'Spam'
});
```

### 10. **Welcome Message Manager** (`welcomeMessageManager.js`)
- Customizable welcome messages
- Variable support ({USER}, {SERVER_NAME}, etc.)
- DM notifications
- Member count display

**Configuration**:
```javascript
client.welcomeMessageManager.setWelcomeConfig(guildId, {
    enabled: true,
    channelId: 'channel-id',
    title: 'Welcome to {SERVER_NAME}!',
    description: 'Welcome {USER}!',
    includeAvatar: true,
    includeCount: true
});
```

### 11. **Reminder Manager** (`reminderManager.js`)
- User reminders with DM notifications
- Automatic scheduling
- Persistent storage
- List, create, delete reminders

**Usage**:
```javascript
const reminderId = client.reminderManager.createReminder(
    userId,
    'Meeting at 3 PM',
    3600000 // 1 hour
);
```

### 12. **Role Template Manager** (`roleTemplateManager.js`)
- Pre-configured role templates
- Quick role creation
- Custom templates per guild
- Default templates: Admin, Moderator, Supporter, Verified, Member, Muted

**Templates Included**:
- **Admin**: Full permissions
- **Moderator**: Moderation permissions
- **Supporter**: Limited management
- **Verified**: Member verification role
- **Member**: Standard member role
- **Muted**: Restricted role

---

## 📊 New Slash Commands

### Utility Commands

#### `/reminder`
Manage personal reminders

**Subcommands**:
- `create` - Create a reminder
- `list` - View active reminders
- `delete` - Delete a reminder

```
/reminder create message:"Meeting reminder" time:"2h"
/reminder list
/reminder delete id:"reminder-id"
```

#### `/poll`
Create interactive polls

```
/poll question:"Which is best?" option1:"Option A" option2:"Option B" duration:"1h"
```

#### `/botstatus`
View bot health and statistics

**Subcommands**:
- `health` - Bot health check
- `stats` - Bot statistics
- `uptime` - Uptime information
- `backups` - Backup status

#### `/welcomemessage`
Setup welcome messages for new members

**Subcommands**:
- `setup` - Configure welcome message
- `preview` - Preview message
- `disable` - Disable welcome messages
- `variables` - View available variables

#### `/auditlogs`
View audit logs (Admin only)

**Subcommands**:
- `recent` - View recent logs
- `user` - View actions by user
- `stats` - View statistics

#### `/roletemplate`
Create roles from templates (Admin only)

**Subcommands**:
- `create` - Create role from template
- `list` - List templates
- `info` - Get template info

---

## ⚙️ Configuration

### Environment Variables

```env
BOT_TOKEN=your_discord_bot_token
DASHBOARD_ENABLED=true
NODE_ENV=production
```

### System Configuration Files

- `data/reminders.json` - Reminder storage
- `data/welcomeMessages.json` - Welcome message configs
- `data/roleTemplates.json` - Custom role templates
- `logs/` - All log files
- `data/backups/` - Backup storage

### Backup Configuration

**Daily Backups**: 02:00 UTC
**Weekly Backups**: Sunday 03:00 UTC
**Retention**: 30 backups

Modify in `index.js`:
```javascript
const autoBackup = new AutoBackup({
    maxBackups: 30,
    schedules: {
        daily: { time: '02:00', enabled: true },
        weekly: { day: 0, time: '03:00', enabled: true }
    }
});
```

---

## 📈 Monitoring & Logs

### Log Files

- `/logs/bot-YYYY-MM-DD.json` - Daily bot logs
- `/logs/error-YYYY-MM-DD.json` - Error logs
- `/logs/metrics.json` - Performance metrics
- `/logs/audit/audit-YYYY-MM-DD.json` - Audit logs

### Health Checks

Automatic health checks include:
- Bot online status
- Latency (< 500ms)
- Memory usage
- Response times

Access via: `/botstatus health`

### Performance Metrics

Track:
- Command execution times
- API response times
- Memory trends
- Uptime

Access via: `/botstatus stats`

---

## 🛡️ Error Handling

### Global Error Handling

All errors are automatically:
1. Logged with full context
2. Stored in error logs
3. Reported to console
4. Sent to user (in command errors)

### Command Error Handling

```javascript
try {
    // Command logic
} catch (error) {
    client.errorHandler.handleCommandError(interaction, error, 'commandName');
}
```

---

## 📝 Audit Logging

### What Gets Logged

- Moderation actions (ban, kick, mute, warn)
- Permission changes
- Role/Channel creation/deletion
- Configuration changes
- Economy transactions
- Admin actions

### Query Audit Logs

```javascript
const logs = client.auditLog.getAuditLogs({
    category: 'moderation',
    guildId: guildId,
    limit: 50,
    days: 7
});
```

---

## 🔒 Security Features

### Rate Limiting
- 5 requests per minute per user
- Configurable per feature
- Returns retry-after times

### Input Validation
- String length validation
- Number range validation
- URL/Email format validation
- SQL injection prevention

### Cooldowns
- Per-command cooldowns
- Global cooldowns
- Automatic cleanup

---

## 📊 Data Persistence

### Automatic Backups

**When**:
- On bot startup
- On bot shutdown
- Scheduled (daily 02:00, weekly Sunday 03:00)

**What**:
- All JSON data files
- Directory structure
- Complete state snapshot

**Restore**:
```javascript
client.autoBackup.restoreFromBackup('backup-daily-2024-01-15T020000');
```

---

## 🐛 Troubleshooting

### Bot Not Starting

1. Check `.env` file has `BOT_TOKEN`
2. Verify Node.js version: `node --version`
3. Install dependencies: `npm install`
4. Check error logs: `logs/error-*.json`

### Commands Not Responding

1. Verify slash commands are registered: `/botstatus stats`
2. Check cooldowns: `client.cooldownManager.getStats()`
3. Review logs: `logs/bot-*.json`
4. Check permissions

### Memory Issues

1. Check memory usage: `/botstatus health`
2. View trends: `/botstatus stats`
3. Create manual backup: Use AutoBackup API
4. Restart bot for cleanup

### Backups Not Created

1. Verify `/data` directory exists
2. Check file permissions
3. Review error logs
4. Check disk space

---

## 🔄 Updating

When updating the bot:

1. Backup current data: `client.autoBackup.createBackup('pre-update')`
2. Update dependencies: `npm update`
3. Test new features
4. Restart bot: `/botstatus uptime` to verify
5. Check logs for errors

---

## 📚 API Reference

### Available Managers

```javascript
// Access via client
client.errorHandler
client.cooldownManager
client.rateLimiter
client.logger
client.uptimeMonitor
client.autoBackup
client.auditLog
client.welcomeMessageManager
client.reminderManager
client.roleTemplateManager
client.InputValidator
```

### Common Methods

```javascript
// Error Handler
client.errorHandler.logError(type, error, metadata)
client.errorHandler.handleCommandError(interaction, error, command)

// Cooldown Manager
client.cooldownManager.getRemainingCooldown(userId, command)
client.cooldownManager.setCooldown(userId, command, ms)
client.cooldownManager.getStats()

// Logger
client.logger.info(message, metadata)
client.logger.error(message, metadata)
client.logger.logCommand(interaction, command, success)
client.logger.logModerationAction(options)

// Uptime Monitor
client.uptimeMonitor.getStatus()
client.uptimeMonitor.getHealthCheck()
client.uptimeMonitor.getCommandStats()

// Auto Backup
client.autoBackup.createBackup(type)
client.autoBackup.getBackups()
client.autoBackup.restoreFromBackup(name)

// Audit Log
client.auditLog.logModerationAction(options)
client.auditLog.getAuditLogs(options)
client.auditLog.getStats(options)

// Reminder Manager
client.reminderManager.createReminder(userId, message, delayMs)
client.reminderManager.getReminders(userId)
client.reminderManager.deleteReminder(userId, reminderId)
```

---

## 📞 Support

For issues or questions:
1. Check error logs in `/logs/`
2. Review audit logs in `/logs/audit/`
3. Use `/botstatus health` for diagnostics
4. Check Discord.js documentation

---

## 📄 License

This bot and all components are provided as-is.

---

**Version**: 2.0.0 (Enhanced Edition)
**Last Updated**: 2024
**Status**: ✅ Production Ready
