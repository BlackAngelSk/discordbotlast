# 📚 Complete Features & Configuration Guide

Comprehensive guide to all features, configuration options, and advanced usage.

---

## 📖 Table of Contents

1. [Features Overview](#-features-overview)
2. [Configuration System](#-configuration-system)
3. [Dashboard Usage](#-dashboard-usage)
4. [Premium System](#-premium-system)
5. [Music System](#-music-system)
6. [Economy & Leveling](#-economy--leveling)
7. [Moderation Suite](#-moderation-suite)
8. [Analytics & Tracking](#-analytics--tracking)
9. [Multi-Language Support](#-multi-language-support)
10. [Advanced Features](#-advanced-features)

---

## ✨ Features Overview

### Core Systems

Your bot includes these major systems:

- **🎵 Music System** - Multi-platform playback with queue management
- **💰 Economy & Leveling** - XP, coins, shop, leaderboards
- **🛡️ Moderation Suite** - Auto-mod, warnings, logging
- **🎮 Entertainment** - Mini-games, betting, relationships
- **💎 Premium Tiers** - Subscription system with exclusive features
- **📊 Analytics** - Real-time tracking and insights
- **🌐 Web Dashboard** - Manage server through web interface
- **🤖 AI Integration** - Smart responses and content analysis
- **🎵 Playlist System** - Save and share music playlists
- **🔔 Notifications** - Scheduled announcements and alerts

### Platform Support

✅ **Windows** - Full support  
✅ **macOS** - Full support  
✅ **Linux** - Full support (Ubuntu, Debian, Fedora, Arch)

### Database Options

- **JSON Files** - Built-in, no setup required
- **MongoDB** - Optional, for production scaling

---

## ⚙️ Configuration System

### Basic Configuration

View current settings:
```
!config
```

### Command Prefix

Change the bot prefix (1-5 characters):
```
!config prefix <new_prefix>
```

Examples:
```
!config prefix ?
!config prefix !!
!config prefix //
```

### Welcome System

**Set Welcome Channel:**
```
!config welcomechannel #welcome
```

**Set Welcome Message:**
```
!config welcomemessage Welcome {user} to {server}! You're member #{memberCount}!
```

**Available Placeholders:**
- `{user}` - Mentions the user
- `{username}` - Username without mention
- `{server}` - Server name
- `{memberCount}` - Total member count

**Enable/Disable:**
```
!config welcomeenable
!config welcomedisable
```

### Leave System

**Set Leave Channel:**
```
!config leavechannel #goodbye
```

**Set Leave Message:**
```
!config leavemessage {user} has left {server}. We now have {memberCount} members.
```

**Enable/Disable:**
```
!config leaveenable
!config leavedisable
```

### Role Settings

**Auto-Role (given to new members):**
```
!config autorole Member
```

**DJ Role (for music commands):**
```
!config djrole DJ
```

### Language Settings

**Set Server Language:**
```
!config language en    # English
!config language sk    # Slovak
```

**View Available Languages:**
```
!config language
```

### Reset Settings

Reset all settings to default:
```
!config reset
```

### Default Settings

When first using the bot:
- **Prefix:** `!`
- **Language:** `en` (English)
- **Welcome:** Disabled
- **Leave:** Disabled
- **Auto Role:** `Member`
- **DJ Role:** `DJ`

---

## 🌐 Dashboard Usage

### Accessing the Dashboard

1. Get the link:
   ```
   !dashboard
   ```

2. Visit the URL (default: `http://localhost:3000`)

3. Login with Discord

4. Select your server

### Dashboard Pages

#### 1. Main Dashboard (`/dashboard/:guildId`)

**Shows:**
- Server overview statistics
- Messages sent today
- Commands used today
- Member count
- Engagement score
- Top 5 most-used commands
- Quick navigation links

**Features:**
- Real-time data
- Premium status indicator
- Quick settings access

#### 2. Economy Page (`/dashboard/:guildId/economy`)

**Shows:**
- Top 50 richest members
- Balance rankings
- Member levels
- Total XP
- Economy statistics

**Features:**
- Sortable leaderboard
- User search
- Balance distribution graph

#### 3. Analytics Page (`/dashboard/:guildId/analytics`)

**Shows:**
- Command usage breakdown
- Success/failure rates
- Daily activity trends
- Engagement metrics
- Top commands
- User activity heatmap

**Features:**
- Date range selector
- Export data
- Detailed charts

#### 4. Premium Page (`/premium`)

**Shows:**
- All 3 premium tiers
- Feature comparison
- Current subscription status
- Monthly bonus info
- Subscribe buttons

**Features:**
- Tier comparison table
- Feature highlights
- Subscription management

#### 5. Settings Page (`/dashboard/:guildId/settings`)

**Features:**
- Command prefix configuration
- Role management
- Welcome/leave message editor
- Auto-mod settings
- Module toggles

### Dashboard API Endpoints

**Analytics Data:**
```
GET /api/:guildId/analytics
```

Returns:
```json
{
  "messages": 1234,
  "commands": 567,
  "members": 100,
  "engagement": 78.5,
  "topCommands": [...]
}
```

**Leaderboard:**
```
GET /api/:guildId/leaderboard?limit=50
```

Returns:
```json
{
  "leaderboard": [
    {
      "userId": "123...",
      "username": "User#0000",
      "balance": 50000,
      "level": 25,
      "xp": 62500
    }
  ]
}
```

---

## 💎 Premium System

### Premium Tiers

#### Basic - $2.99/month

**Features:**
- 10 custom commands
- 5 shop item slots
- Advanced economy features
- 500 coin monthly bonus
- Email support

**Limits:**
- Custom commands: 10
- Shop slots: 5

#### Pro - $5.99/month

**Everything in Basic, plus:**
- 25 custom commands
- 15 shop item slots
- 3 exclusive mini-games
- Priority support
- 1,500 coin monthly bonus
- Advanced analytics

**Limits:**
- Custom commands: 25
- Shop slots: 15

#### Elite - $9.99/month

**Everything in Pro, plus:**
- 100 custom commands
- 50 shop item slots
- All mini-games
- Custom bot slot
- Premium badge
- 3,000 coin monthly bonus
- VIP support channel

**Limits:**
- Custom commands: 100
- Shop slots: 50

### Managing Premium

**View Tiers:**
```
/premium info
```

**Subscribe:**
```
/premium subscribe basic
/premium subscribe pro
/premium subscribe elite
```

**Check Status:**
```
/premium status
```

**View Your Features:**
```
/premium features
```

**Admin Commands:**
```
!premium-setup info
!premium-setup check @user
```

### Premium Features

**Custom Commands:**
```
/customcommand add hello Hello {user}!
/customcommand list
/customcommand remove hello
```

**Extended Shop:**
- More item slots
- Custom pricing
- Role rewards
- Badge system

**Exclusive Games:**
- Pro: 3 special mini-games
- Elite: All games unlocked

**Monthly Bonus:**
- Automatically credited
- Basic: 500 coins
- Pro: 1,500 coins
- Elite: 3,000 coins

---

## 🎵 Music System

### Supported Platforms

- **YouTube** - Videos and playlists (up to 50 songs)
- **Spotify** - Track URLs (converts to YouTube search)
- **SoundCloud** - Full support
- **Direct Search** - Search by title/artist

### Queue Management

**View Queue:**
```
/queue
```

Shows:
- Current song
- Next 10 songs
- Total duration
- Loop mode

**Queue Operations:**
```
/remove 3          # Remove song at position 3
/move 5 2          # Move song 5 to position 2
/swap 2 5          # Swap songs at positions 2 and 5
/shuffle           # Randomize queue
/clear             # Clear all songs
/jump 7            # Jump to song 7
```

### Loop Modes

```
/loop off          # Disable loop
/loop song         # Repeat current song
/loop queue        # Repeat entire queue
```

**Indicators:**
- 🔂 Queue loop active
- 🔁 Song loop active

### Autoplay

```
/autoplay          # Toggle autoplay
```

When enabled:
- Plays related songs when queue ends
- Searches similar content
- Keeps music going

### Volume Control

```
/volume 150        # Set volume to 150%
```

- Range: 0-200
- Default: 100
- Requires DJ role

### Previous Track History

```
/previous          # Go back to previous song
```

- Keeps history of last 10 songs
- Preserves order

### Lyrics

```
/lyrics                              # Get lyrics for current song
/lyrics Rick Astley - Never Gonna Give You Up  # Search specific song
```

### DJ Permission System

**Who can control music:**
- Server owner ✅
- Administrator permission ✅
- DJ role ✅
- Alone with bot in voice channel ✅

**DJ Commands:**
- Pause, resume, skip, stop
- Volume, clear, remove
- Move, swap, jump
- Loop, autoplay

**Creating DJ Role:**
```
/setup             # Auto-creates DJ role
```

Or manually:
```
!config djrole DJ
```

### Playlist System

**Create Playlist:**
```
/playlist create name:Chill Vibes
```

**Add Current Song:**
```
/playlist add playlist:Chill Vibes
```

**Load Playlist:**
```
/playlist load playlist:Chill Vibes
```

**Manage Playlists:**
```
/playlist list                           # View your playlists
/playlist delete playlist:Chill Vibes    # Delete playlist
/playlist remove playlist:Chill Vibes position:3  # Remove song
```

**Public Playlists:**
```
/playlist public playlist:Chill Vibes    # Make public
/playlist browse                         # Browse public playlists
```

**Recommendations:**
```
/playlist recommend    # Get song suggestions based on your taste
```

---

## 💰 Economy & Leveling

### XP System

**How XP Works:**
- Earn 5-15 XP per message
- 1 minute cooldown between XP gains
- Level formula: `level = √(xp/100) + 1`

**Leveling Rewards:**
- Auto-reward: Level × 100 coins
- Custom rewards via `/levelrewards`

**Check Progress:**
```
/balance           # View coins, level, XP
/level            # Detailed level info
```

### Economy Features

**Daily Rewards:**
```
/daily            # 1,000 coins (24h cooldown)
/weekly           # 5,000 coins (7d cooldown)
/monthly          # 20,000 coins (30d cooldown)
```

**Coin Transfers:**
```
/transfer @user 500       # Send 500 coins
/pay @user 1000          # Same as transfer
```

**Leaderboards:**
```
/leaderboard              # Top balances
/leaderboard level        # Top levels
/leaderboard xp           # Top XP
```

### Shop System

**View Shop:**
```
/shop             # Interactive menu
```

**Buy Items:**
```
/buy VIP Role
```

**Inventory:**
```
/inventory        # View your items
```

**Admin: Manage Shop:**
```
!shop add <name> <price> <description>
!shop remove <item-id>
!shop list
```

**Default Items:**
- VIP Role - 10,000 coins
- Premium Badge - 15,000 coins
- Custom Color Role - 5,000 coins

### Level Rewards

**Set Rewards:**
```
/levelrewards set level:10 type:coins value:1000
/levelrewards set level:25 type:role value:@VIP
```

**View Rewards:**
```
/levelrewards list
```

**Remove Rewards:**
```
/levelrewards remove level:10
```

### Betting Games

**Blackjack:**
```
/blackjack 100    # Bet 100 coins
```

Win: 2x bet  
Blackjack: 2.5x bet

**Roulette:**
```
/roulette 50 red          # 2x payout
/roulette 50 black        # 2x payout
/roulette 50 green        # 14x payout
/roulette 50 17           # 36x payout
```

**Slots:**
```
/slots 25         # Various multipliers
```

Payouts:
- 3 same symbols: 5x-20x
- 2 same: 2x

**Coin Flip:**
```
/coinflip 100 heads
```

Win: 2x bet

---

## 🛡️ Moderation Suite

### Auto-Moderation

**Enable Auto-Mod:**
```
/automod enable
```

**Features:**

1. **Anti-Invite**
   ```
   /automod antiinvite true
   ```
   - Blocks Discord invite links
   - Deletes messages
   - Logs to mod channel

2. **Anti-Spam**
   ```
   /automod antispam true
   ```
   - Detects 5+ messages in 5 seconds
   - Auto-timeout for 1 minute
   - Prevents raid spam

3. **Bad Words Filter**
   ```
   /automod badwords add badword
   /automod badwords remove badword
   /automod badwords list
   ```
   - Custom word blacklist
   - Case-insensitive
   - Instant deletion

4. **Mention Limits**
   - Default: 5 mentions max
   - Prevents mention spam
   - Configurable

5. **Emoji Limits**
   - Default: 10 emojis max
   - Prevents emoji spam
   - Configurable

**View Settings:**
```
/automod settings
```

**Disable:**
```
/automod disable
```

### Warning System

**Add Warning:**
```
/warnings add @user Spam in #general
```

**View Warnings:**
```
/warnings list @user
```

Shows:
- Warning ID
- Reason
- Moderator
- Timestamp

**Remove Warning:**
```
/warnings remove @user <warning-id>
```

**Clear All:**
```
/warnings clear @user
```

### Moderation Actions

**Timeout/Mute:**
```
/mute @user 30 Spam          # 30 minutes
/timeout @user 2h Trolling   # 2 hours
```

Duration formats:
- `30m` or `30` - Minutes
- `2h` - Hours
- `1d` - Days
- `1w` - Weeks

**Ban/Kick:**
```
/ban @user Repeated rule violations
/kick @user Off-topic spam
/softban @user Clear spam messages
```

**Unban:**
```
/unban 123456789012345678 Appeal accepted
```

**Remove Timeout:**
```
/untimeout @user
```

### Channel Management

**Lock/Unlock:**
```
/lock #general           # Prevent messages
/unlock #general         # Allow messages
```

**Slowmode:**
```
/slowmode 10 #chat       # 10 second delay
/slowmode 0 #chat        # Disable slowmode
```

Range: 0-21600 seconds (6 hours)

**Purge Messages:**
```
/purge 10               # Delete last 10 messages
/purge 50 @user         # Delete user's last 50 messages
```

Range: 1-100 messages

### Moderation Logging

**Set Log Channel:**
```
/modlog #mod-logs
```

**Logged Actions:**
- Bans/Unbans
- Kicks
- Timeouts/Mutes
- Warnings added/removed
- Auto-mod violations
- Message deletions
- Channel locks/unlocks

**View Logs:**
```
/modlogs @user          # User's mod history
```

---

## 📊 Analytics & Tracking

### What's Tracked

**Command Analytics:**
- Command name and category
- Success/failure rate
- Usage frequency
- Response time
- User who executed

**Message Analytics:**
- Total messages per day
- Messages per user
- Channel activity
- Peak activity times

**Member Analytics:**
- Join/leave dates
- Activity levels
- Engagement scores
- Command usage

**Server Analytics:**
- Total commands executed
- Active users
- Growth trends
- Engagement percentage

### Viewing Analytics

**Server Overview:**
```
/analytics server
```

Shows:
- Total messages today
- Commands executed
- Member count
- Engagement score (%)
- Top 5 commands

**Command Stats:**
```
/analytics commands
```

Shows:
- Top 10 most-used commands
- Success rates
- Failure counts
- Usage trends

**User Activity:**
```
/analytics user @member
```

Shows:
- Messages sent
- Commands used
- Level and XP
- Activity score
- Favorite commands

### Dashboard Analytics

Visit: `http://localhost:3000/dashboard/:guildId/analytics`

**Features:**
- Interactive charts
- Date range selection
- Export to CSV
- Detailed breakdowns
- Activity heatmaps

**Available Charts:**
- Command usage over time
- Daily message counts
- User activity distribution
- Success/failure rates
- Peak activity hours

### API Access

**Get Analytics Data:**
```
GET /api/:guildId/analytics
```

Response includes:
- Current statistics
- Top commands
- Engagement metrics
- Daily trends

---

## 🌍 Multi-Language Support

### Available Languages

- 🇬🇧 **English** (`en`) - Default
- 🇸🇰 **Slovak** (`sk`) - Slovenčina

### Changing Language

**Set Server Language:**
```
!config language sk    # Switch to Slovak
!config language en    # Switch to English
```

**View Available Languages:**
```
!config language
```

### How It Works

- Each server can have its own language
- Bot messages appear in selected language
- Commands remain the same
- Fallback to English if translation missing

### Adding New Languages

1. **Create Language File:**
   - Navigate to `languages/` folder
   - Create `XX.json` (e.g., `de.json` for German)

2. **Copy Structure from `en.json`:**
   ```json
   {
     "common": {
       "error": "Translation here",
       "success": "Translation here"
     },
     "config": {
       "title": "Translation here"
     }
   }
   ```

3. **Translate All Keys:**
   - Keep the same key structure
   - Translate only the values
   - Use placeholders: `{user}`, `{server}`, etc.

4. **Restart Bot:**
   ```bash
   npm start
   ```

5. **Test:**
   ```
   !config language de
   ```

### Translation Variables

**Available Placeholders:**
- `{user}` - Username with mention
- `{username}` - Username without mention
- `{server}` - Server name
- `{memberCount}` - Total members
- `{level}` - User level
- `{xp}` - User XP
- `{balance}` - User balance

**Example:**
```json
{
  "welcome": "Welcome {user} to {server}! You're member #{memberCount}!"
}
```

---

## 🚀 Advanced Features

### Custom Commands

**Create Custom Command:**
```
/customcommand add info Our server rules are at discord.gg/rules
```

**Usage:**
```
!info              # Triggers your custom response
```

**Edit Command:**
```
/customcommand edit info New response here
```

**Remove Command:**
```
/customcommand remove info
```

**List Commands:**
```
/customcommand list
```

**Limits:**
- Free: 5 commands
- Basic Premium: 10 commands
- Pro Premium: 25 commands
- Elite Premium: 100 commands

### AI Integration

**Requirements:**
- Google Gemini API key in `.env`
- `GOOGLE_API_KEY=your_key_here`

**Chat with AI:**
```
/ai ask What is the capital of France?
```

**Analyze Content:**
```
/ai analyze This is some text to analyze
```

Returns:
- Toxicity score (0-100%)
- Safety assessment
- Category classification

**Get Command Suggestions:**
```
/ai suggest-commands gaming
```

Suggests 5 useful commands for your server type.

**Server Types:**
- gaming
- community
- educational
- support
- creative

### Notification System

**Schedule Announcement:**
```
/announce schedule #announcements Server update tonight! 18:30
```

Time formats:
- `18:30` - Today at 6:30 PM
- `2024-12-25 15:00` - Specific date/time
- `in 2 hours` - Relative time

**Send Immediately:**
```
/announce send #announcements Important announcement!
```

**View Scheduled:**
```
/announce list
```

**Cancel Announcement:**
```
/announce cancel 1234567890
```

### Ticket System

**Create Ticket:**
```
/ticket create I need help with my account
```

Creates private channel with:
- Ticket creator
- Staff/admin roles
- Automatic logging

**Manage Tickets:**
```
/ticket close              # Close ticket
/ticket add @user          # Add user to ticket
/ticket remove @user       # Remove user
```

### Suggestion System

**Submit Suggestion:**
```
/suggest Add a new music feature
```

**Admin Actions:**
```
/suggestion approve 123456789    # Approve suggestion
/suggestion deny 123456789       # Deny suggestion
```

### Giveaway System

**Start Giveaway:**
```
/giveaway start 24h 1 Discord Nitro
```

Format: `duration winners prize`

**End Early:**
```
/giveaway end 987654321
```

**Reroll Winner:**
```
/giveaway reroll 987654321
```

**View Active:**
```
/giveaway list
```

### Reaction Roles

**Create Reaction Role:**
```
/reactionrole create 123456789 🎮 @Gamer
```

Format: `message-id emoji @role`

**Remove:**
```
/reactionrole remove 123456789 🎮
```

**List All:**
```
/reactionrole list
```

### Scheduled Messages

**Schedule Message:**
```
/schedule add #general Happy Friday! every friday 09:00
```

**Patterns:**
- `every day 10:00` - Daily
- `every monday 09:00` - Weekly
- `every 1st 12:00` - Monthly

**View Scheduled:**
```
/schedule list
```

**Remove:**
```
/schedule remove 123456789
```

### AFK System

**Set AFK:**
```
/afk Working on a project
```

**How it works:**
- Status shown when mentioned
- Auto-removes on next message
- Tracks time away

**Remove AFK:**
```
/afk remove
```

### Relationship System

**Propose to Someone:**
```
/propose @user
```

**Accept Proposal:**
```
/accept @user
```

**Reject Proposal:**
```
/reject @user
```

**Divorce:**
```
/divorce @user
```

**View Spouse:**
```
/spouse              # Your spouse
/spouse @user        # Someone else's spouse
```

**View All Couples:**
```
/couples
```

### Horse Racing

**Start Race:**
```
/horserace 100       # Bet 100 coins
```

Features:
- 5 horses race
- Random winner
- Multiplier payouts
- Visual ASCII art race

**View History:**
```
/horserace history
```

---

## 🎯 Best Practices

### For Server Owners

1. **Initial Setup:**
   - Run `/setup` first
   - Configure welcome messages
   - Enable auto-moderation
   - Set up mod log channel

2. **Role Configuration:**
   - Create DJ role for music control
   - Set auto-role for new members
   - Configure reaction roles for self-service

3. **Moderation:**
   - Enable all auto-mod features
   - Train moderators on warning system
   - Review mod logs regularly

4. **Engagement:**
   - Use giveaways for events
   - Enable economy system
   - Create custom commands for FAQs

5. **Analytics:**
   - Check dashboard weekly
   - Review command usage
   - Track engagement trends

### For Members

1. **Economy:**
   - Claim daily/weekly rewards
   - Participate in mini-games
   - Complete level rewards

2. **Music:**
   - Create playlists for favorite songs
   - Use queue management wisely
   - Respect DJ permissions

3. **Community:**
   - Use suggestion system
   - Participate in giveaways
   - Set AFK when away

### Security Tips

1. **Token Security:**
   - Never share `.env` file
   - Regenerate token if leaked
   - Use environment variables only

2. **Permissions:**
   - Give bot only needed permissions
   - Limit admin access
   - Review role hierarchy

3. **Dashboard:**
   - Use strong session secret
   - Enable HTTPS in production
   - Whitelist IP addresses if possible

---

## 📝 Configuration File Reference

### .env File

```env
# Required
DISCORD_TOKEN=your_bot_token

# Optional - Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DBNAME=discord-bot

# Optional - AI
GOOGLE_API_KEY=your_gemini_key

# Optional - Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
DASHBOARD_CALLBACK=http://localhost:3000/callback
SESSION_SECRET=random_secret

# Optional - Other
PREFIX=!
NODE_ENV=production
```

### Data Files

Located in `data/` folder:

- `settings.json` - Server configurations
- `economy.json` - User balances and levels
- `premium.json` - Premium subscriptions
- `analytics.json` - Usage statistics
- `playlists.json` - Music playlists
- `ai.json` - AI preferences
- `gameStats.json` - Game statistics
- `tickets.json` - Support tickets
- `suggestions.json` - User suggestions
- `giveaways.json` - Active giveaways
- `reactionroles.json` - Reaction roles
- `scheduledMessages.json` - Scheduled messages

All data files are automatically created and managed by the bot.

---

## 🆘 Troubleshooting

### Common Issues

**Commands not responding:**
- Check bot is online
- Verify correct prefix
- Ensure bot has permissions
- Check console for errors

**Music not playing:**
- Install FFmpeg
- Check voice permissions
- Verify bot is in voice channel
- Check queue with `/queue`

**Economy not saving:**
- Check `data/` folder exists
- Verify write permissions
- Check console for errors

**Dashboard not loading:**
- Verify `.env` settings
- Check port 3000 not in use
- Ensure `DASHBOARD_ENABLED=true`
- Check callback URL in Discord

**Auto-mod not working:**
- Run `/automod enable`
- Check bot has Manage Messages permission
- Verify mod log channel set
- Check bot role hierarchy

### Error Messages

**`TOKEN_INVALID`**
- Get new token from Discord Developer Portal
- Update `.env` file

**`ECONNREFUSED`**
- Check MongoDB connection
- Bot falls back to JSON automatically

**`EACCES`** (Linux)
- Fix file permissions: `chmod 755 data/`
- Run with proper user permissions

**`MODULE_NOT_FOUND`**
- Run `npm install`
- Delete `node_modules` and reinstall

---

## 📞 Support & Resources

### Documentation Files

- `SETUP.md` - Installation and setup guide
- `COMMANDS.md` - Complete command reference
- `GUIDE.md` - This file (features and configuration)

### Quick Links

- Discord Developer Portal: https://discord.com/developers
- Node.js Download: https://nodejs.org
- MongoDB Atlas: https://mongodb.com/atlas

### Getting Help

1. Check this documentation first
2. Review console error messages
3. Verify environment variables
4. Check file permissions (Linux)
5. Ensure dependencies installed

---

**Version:** 2.0  
**Last Updated:** February 2026  
**Platform Support:** Windows, macOS, Linux

For setup instructions, see **SETUP.md**  
For command reference, see **COMMANDS.md**
