# Discord Bot - Feature-Complete Edition

A **feature-rich** Discord bot built with discord.js v14, featuring slash commands, advanced music playback, moderation tools, economy system, and much more!

## 🌟 Highlights

### ⚡ Modern Interface
- **Slash Commands (/)** - Modern Discord command interface
- **Prefix Commands (!)** - Classic command support
- **Interactive Menus** - Button and select menu interactions

### 🎵 Advanced Music System
- Multi-platform support (YouTube, Spotify, SoundCloud)
- Loop modes (song/queue), previous track, jump to position
- Queue management, autoplay, lyrics, and more

### 🛡️ Complete Moderation Suite
- Warnings system, mod logs, auto-moderation
- Anti-spam, anti-invite, bad words filter
- Slowmode, mute, softban, and standard mod tools

### 💰 Economy & Leveling
- XP and level system with auto-rewards
- Daily/weekly rewards, leaderboards
- Virtual shop with purchasable items

### 🎮 Entertainment & Utility
- Polls, 8-ball, memes from Reddit
- User/role info, avatars, and more

---

## Features

### 🎵 Music Playback
- Play music from **YouTube** (URLs and search queries)
- **Spotify Support** - Play tracks from Spotify
- **SoundCloud Support** - Full SoundCloud integration
- **YouTube Playlist Support** - Add entire playlists at once
- High-quality audio streaming
- Queue management system
- Auto-disconnect after inactivity
- **Autoplay Mode** - Automatically play related songs
- **Loop/Repeat** - Loop current song or entire queue
- **Previous Track** - Go back to previous songs
- **Jump Command** - Skip to specific position in queue

### 🎮 Playback Controls
- Play, pause, resume, skip, stop
- Volume control (0-200%)
- Now playing display with reactions
- **Reaction-based controls** - Control music with emoji reactions
- Queue viewing and manipulation

### 📋 Queue Management Commands
- View current queue with song details
- **Remove** specific songs from queue
- **Move** songs to different positions
- **Swap** song positions
- **Shuffle** queue randomly
- **Clear** entire queue
- **Loop** song or queue
- **Jump** to position

### 🛡️ Moderation Tools
- **Warnings System** - Track user infractions
- **Mod Logs** - Automatic action logging
- **Auto-Moderation** - Smart content filtering
- **Anti-Spam** - Automatic spam detection (5+ msgs/5s)
- **Anti-Invite** - Block Discord invite links
- **Bad Words Filter** - Custom word blacklist
- **Slowmode** - Channel rate limiting
- **Mute/Timeout** - Temporary member restrictions
- **Softban** - Ban + unban to clear messages
- Standard: Ban, kick, timeout, purge commands

### 💰 Economy & Leveling System
- **XP System** - Earn XP by chatting (5-15 XP/msg)
- **Level System** - Automatic level progression
- **Auto-Rewards** - Coins on level up
- **Balance** - Check coins, level, and XP
- **Daily Rewards** - 1,000 coins every 24 hours
- **Weekly Rewards** - 5,000 coins every 7 days
- **Leaderboards** - Top users by balance/level/XP
- **Shop System** - Buy roles and items with coins
- **Inventory** - Track purchased items

### 🎮 Entertainment
- **Polls** - Create interactive polls (up to 10 options)
- **Magic 8-Ball** - Ask yes/no questions
- **Memes** - Random memes from Reddit (SFW only)
- **Mini Games** - RPS, number guessing, trivia

### 🔧 Utility Commands
- **Avatar** - High-quality user avatars
- **User Info** - Detailed user profiles
- **Role Info** - Role details and permissions
- **Server Info** - Server statistics

### 🎤 Additional Features
- **Lyrics** - Fetch and display song lyrics
- **DJ Role System** - Permission control for music commands
- **Auto-Role** - Automatically assign roles to new members
- **Custom Prefix** - Set different command prefix per server
- **Welcome/Leave Messages** - Configurable messages for member join/leave
- **Per-Server Settings** - Each server has independent configuration
- **Dashboard** - Web-based control panel

---

## Commands

### 🎵 Music Commands (Slash & Prefix)

**Slash Commands:**
- `/play <query>` - Play from YouTube/Spotify/SoundCloud or search
- `/pause` - Pause playback (DJ only)
- `/resume` - Resume playback (DJ only)
- `/skip` - Skip current song (DJ only)
- `/stop` - Stop and clear queue (DJ only)
- `/volume <0-200>` - Set volume (DJ only)
- `/loop <mode>` - Set loop mode: off/song/queue (DJ only)
- `/previous` - Play previous song (DJ only)
- `/jump <position>` - Jump to queue position (DJ only)
- `/nowplaying` - Show current song
- `/queue` - Display song queue
- `/lyrics [song]` - Get lyrics
- `/autoplay` - Toggle autoplay mode

**Prefix Commands:** (All slash commands also work with `!` prefix)
**Prefix Commands:** (All slash commands also work with `!` prefix)

### 🛡️ Moderation Commands (Slash)
- `/slowmode <seconds> [channel]` - Set channel slowmode
- `/mute <user> <duration> [reason]` - Timeout member
- `/softban <user> [reason]` - Softban user
- `/warnings add <user> <reason>` - Add warning
- `/warnings list <user>` - View warnings
- `/warnings remove <user> <id>` - Remove warning
- `/warnings clear <user>` - Clear all warnings
- `/modlog <channel>` - Set mod log channel
- `/automod enable/disable` - Toggle auto-mod
- `/automod antiinvite <bool>` - Toggle invite filter
- `/automod antispam <bool>` - Toggle spam detection
- `/automod badwords <action> [word]` - Manage bad words
- `/automod settings` - View auto-mod config

**Prefix Moderation:**
- `!ban <user> [reason]` - Ban member
- `!unban <user-id>` - Unban user
- `!kick <user> [reason]` - Kick member
- `!timeout <user> <duration> [reason]` - Timeout member
- `!untimeout <user>` - Remove timeout
- `!purge <amount>` - Delete messages (2-100)
- `!lock [channel]` - Lock channel
- `!unlock [channel]` - Unlock channel
- `!warn <user> <reason>` - Warn member

### 💰 Economy Commands (Slash)
- `/balance [user]` - Check balance, level, XP
- `/daily` - Claim daily reward (1,000 coins)
- `/weekly` - Claim weekly reward (5,000 coins)
- `/leaderboard [type]` - View rankings (balance/level/xp)
- `/shop` - Open shop and buy items

### 🎮 Entertainment Commands (Slash)
- `/poll <question> <options>` - Create poll (separate options with |)
- `/8ball <question>` - Ask magic 8-ball
- `/meme` - Get random meme from Reddit

### 🔧 Utility Commands (Slash)
- `/avatar [user]` - Show user avatar
- `/userinfo [user]` - Display user information
- `/roleinfo <role>` - Display role information

### Queue Management (DJ Only)
- `!clear` - Clear all songs from queue
### Queue Management (DJ Only)
- `!clear` - Clear all songs from queue
- `!remove <position>` - Remove song at position
- `!move <from> <to>` - Move song to different position
- `!swap <pos1> <pos2>` - Swap two songs
- `!shuffle` - Randomize queue order
- `!loop <off|song|queue>` - Set loop mode
- `!previous` - Play previous song
- `!jump <position>` - Jump to queue position

### Configuration (Admin Only)
- `!config` - View all server settings
- `!config prefix <prefix>` - Change command prefix
- `!config welcomechannel #channel` - Set welcome channel
- `!config welcomemessage <msg>` - Set welcome message
- `!config welcomeenable/disable` - Toggle welcome messages
- `!config leavechannel #channel` - Set leave channel
- `!config leavemessage <msg>` - Set leave message
- `!config leaveenable/disable` - Toggle leave messages
- `!config autorole <name>` - Set auto-role for new members
- `!config djrole <name>` - Set DJ role name
- `!config reset` - Reset all settings

### General Commands
- `!ping` - Check bot latency
- `!hello` - Get a greeting
- `!help` - Show all commands
- `!server` - Show server info
- `!setup` - Setup DJ and Member roles (Admin only)
- `!leave` - Make bot leave voice channel
- `!minigame <rps|guess|trivia>` - Play mini games
- `!dashboard` - Get dashboard link

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16.9.0 or higher
- Discord Bot Token
- FFmpeg installed

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd discordbotlast
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```env
DISCORD_TOKEN=your_bot_token_here
DASHBOARD_ENABLED=false
```

4. Start the bot:
```bash
npm start
```

### First-Time Setup

1. Invite bot to your server with proper permissions
2. Run `/setup` or `!setup` to create DJ and Member roles
3. Configure auto-moderation: `/automod enable`
4. Set mod log channel: `/modlog #channel`
5. Customize settings with `!config`

---

## 🎯 Key Systems

### DJ Role System

Commands marked as "DJ only" require one of:
- **DJ role** (created with `/setup` or `!setup`)
- **Administrator** permission
- **Being alone** in voice channel with the bot

The DJ system prevents users from disrupting music playback while allowing control when alone with the bot.

### Economy & Leveling

**XP System:**
- Earn 5-15 XP per message
- 1-minute cooldown between XP gains
- Level up formula: `level = √(xp/100) + 1`
- Auto-reward: `level × 100` coins on level up

**Earning Coins:**
- Level up rewards
- Daily reward: 1,000 coins (24h cooldown)
- Weekly reward: 5,000 coins (7d cooldown)

**Spending Coins:**
- Use `/shop` to browse items
- Default shop items:
  - VIP Role - 10,000 coins
  - Custom Role Color - 5,000 coins
  - Premium Badge - 15,000 coins

### Auto-Moderation

**Features:**
- **Anti-Spam:** 5+ messages in 5 seconds = 1 min timeout
- **Anti-Invite:** Blocks discord.gg and discord.com/invite links
- **Bad Words Filter:** Custom blacklist
- **Max Mentions:** Default limit of 5 mentions/message
- **Max Emojis:** Default limit of 10 emojis/message

**Setup:**
1. `/automod enable`
2. `/automod antiinvite true`
3. `/automod badwords add <word>`
4. `/modlog #mod-logs`

All violations are auto-deleted with temporary warning messages and logged to mod log channel.

### Music Features

**Loop Modes:**
- `off` - Normal playback
- `song` - Repeat current song
- `queue` - Loop entire queue

**Previous Track:**
- Keeps history of last 10 songs
- Use `/previous` or `!previous` to go back

**Multi-Platform Support:**
- YouTube videos and playlists
- Spotify tracks (converts to YouTube search)
- SoundCloud tracks and playlists

---

## 📁 Project Structure

```
discordbotlast/
├── slashCommands/        # Slash command files
│   ├── play.js          # Music playback
│   ├── loop.js          # Loop control
│   ├── previous.js      # Previous track
│   ├── jump.js          # Jump to position
│   ├── slowmode.js      # Channel slowmode
│   ├── mute.js          # Member timeout
│   ├── softban.js       # Softban command
│   ├── warnings.js      # Warnings system
│   ├── modlog.js        # Mod log config
│   ├── automod.js       # Auto-mod config
│   ├── balance.js       # Economy balance
│   ├── daily.js         # Daily rewards
│   ├── weekly.js        # Weekly rewards
│   ├── leaderboard.js   # Server rankings
│   ├── shop.js          # Virtual shop
│   ├── poll.js          # Poll creation
│   ├── 8ball.js         # Magic 8-ball
│   ├── meme.js          # Meme generator
│   ├── avatar.js        # User avatars
│   ├── userinfo.js      # User information
│   └── roleinfo.js      # Role information
├── commands/            # Prefix command files
│   ├── play.js         # Music playback
│   ├── pause.js        # Pause music
│   ├── resume.js       # Resume music
│   ├── skip.js         # Skip song
│   ├── stop.js         # Stop music
│   ├── volume.js       # Volume control
│   ├── queue.js        # View queue
│   ├── loop.js         # Loop control
│   ├── previous.js     # Previous track
│   ├── jump.js         # Jump to position
│   ├── clear.js        # Clear queue
│   ├── remove.js       # Remove from queue
│   ├── move.js         # Move in queue
│   ├── swap.js         # Swap in queue
│   ├── shuffle.js      # Shuffle queue
│   ├── lyrics.js       # Song lyrics
│   ├── autoplay.js     # Autoplay toggle
│   ├── nowplaying.js   # Now playing info
│   ├── ban.js          # Ban members
│   ├── unban.js        # Unban members
│   ├── kick.js         # Kick members
│   ├── timeout.js      # Timeout members
│   ├── untimeout.js    # Remove timeout
│   ├── warn.js         # Warn members
│   ├── purge.js        # Delete messages
│   ├── lock.js         # Lock channels
│   ├── unlock.js       # Unlock channels
│   ├── config.js       # Server config
│   ├── setup.js        # Initial setup
│   ├── help.js         # Help command
│   ├── ping.js         # Latency check
│   ├── server.js       # Server info
│   ├── minigame.js     # Mini games
│   └── dashboard.js    # Dashboard link
├── utils/
│   ├── commandHandler.js        # Prefix command handler
│   ├── slashCommandHandler.js   # Slash command handler
│   ├── eventHandler.js          # Event loader
│   ├── MusicQueue.js           # Enhanced music queue
│   ├── economyManager.js       # Economy & XP system
│   ├── moderationManager.js    # Warnings & auto-mod
│   ├── settingsManager.js      # Server settings
│   ├── permissions.js          # DJ permissions
│   ├── queues.js               # Queue storage
│   └── helpers.js              # Utility functions
├── events/
│   ├── ready.js              # Bot ready event
│   ├── messageCreate.js      # Message handler (XP & auto-mod)
│   ├── guildMemberAdd.js     # New member handler
│   ├── guildMemberRemove.js  # Member leave handler
│   ├── error.js              # Error handler
│   └── reactionAdd.js        # Music control reactions
├── data/
│   ├── settings.json         # Server settings
│   ├── economy.json          # Economy & XP data
│   └── moderation.json       # Warnings & auto-mod
├── dashboard/               # Web dashboard (optional)
│   ├── server.js
│   ├── public/
│   └── views/
├── index.js                # Main bot file
├── package.json            # Dependencies
├── .env                    # Environment variables
├── README.md              # This file
├── FEATURES.md            # Feature documentation
├── NEW_FEATURES.md        # New features guide
├── CONFIG_GUIDE.md        # Configuration guide
└── DASHBOARD_GUIDE.md     # Dashboard guide
```

---

## 📚 Documentation

- **[NEW_FEATURES.md](NEW_FEATURES.md)** - Complete guide to all new features
- **[FEATURES.md](FEATURES.md)** - Detailed feature documentation
- **[CONFIG_GUIDE.md](CONFIG_GUIDE.md)** - Configuration guide
- **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)** - Dashboard setup

---

## 🔧 Configuration

### Server Settings
Use `!config` to view and modify server-specific settings:
- Command prefix
- Welcome/leave messages and channels
- Auto-role for new members
- DJ role name

### Auto-Moderation
Configure with `/automod` commands:
- Enable/disable auto-mod
- Toggle anti-invite and anti-spam
- Manage bad words list
- View current settings

### Economy Shop
Customize shop items in `utils/economyManager.js`:
```javascript
this.data.shops[guildId] = [
    { id: 'vip', name: 'VIP Role', price: 10000, type: 'role' },
    { id: 'custom_role', name: 'Custom Role Color', price: 5000, type: 'role' },
    { id: 'premium', name: 'Premium Badge', price: 15000, type: 'badge' }
];
```

---

## 🎨 Customization

### Auto-Role System

New members automatically receive a role when joining. Customize in `events/guildMemberAdd.js`:
- `DEFAULT_ROLE_NAME` - The role name to assign
- `WELCOME_CHANNEL_NAME` - Channel for welcome messages

### XP & Economy Rates

Modify XP gains and rewards in `events/messageCreate.js`:
```javascript
const xpGain = Math.floor(Math.random() * 11) + 5; // 5-15 XP
const reward = result.level * 100; // Level up reward
```

Modify daily/weekly rewards in `utils/economyManager.js`:
```javascript
const amount = 1000; // Daily reward
const amount = 5000; // Weekly reward
```

---

## 🎮 Reaction Controls

When a song plays, the bot adds emoji reactions for quick controls:
- ⏸️ **Pause** - Pause playback
- ▶️ **Resume** - Resume playback
- ⏭️ **Skip** - Skip to next song
- ⏹️ **Stop** - Stop and clear queue
- 🔉 **Volume Down** - Decrease volume by 10%
- 🔊 **Volume Up** - Increase volume by 10%

---

## 🛠️ Troubleshooting

### Common Issues:

**Bot doesn't respond to commands:**
- Enable Message Content Intent in Discord Developer Portal
- Check bot has proper permissions in server
- Verify `.env` file has correct token

**Slash commands not showing:**
- Wait up to 1 hour for global commands to propagate
- Check bot has Applications.Commands scope

**Music not playing:**
- Verify FFmpeg is installed
- Check voice channel permissions (Connect, Speak)
- Ensure yt-dlp/youtube-dl-exec is working

**Auto-role not working:**
- Enable Server Members Intent
- Grant bot Manage Roles permission
- Ensure bot's role is higher than target role

**Economy/XP not saving:**
- Check write permissions for `data/` folder
- Verify `economy.json` and `moderation.json` exist

---

## 📋 Requirements

- **Node.js** 16.9.0 or higher
- **FFmpeg** installed on system
- **Discord Bot** with required intents:
  - Server Members Intent
  - Message Content Intent
  - Guild Voice States
  - Guild Messages
  - Guild Message Reactions

---

## 📦 Dependencies

- discord.js v14
- @discordjs/voice
- @discordjs/opus
- youtube-dl-exec
- ytsr
- ytdl-core (optional)
- ffmpeg-static
- dotenv
- express (dashboard)
- ejs (dashboard)
- passport-discord (dashboard)
- undici (for web requests)

---

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

## 📄 License

ISC License

---

## ⭐ Features at a Glance

✅ **40+ Commands** (prefix + slash)  
✅ **Multi-Platform Music** (YouTube, Spotify, SoundCloud)  
✅ **Loop & Repeat** (song/queue modes)  
✅ **Previous Track** with history  
✅ **Jump Command** for queue navigation  
✅ **Complete Moderation Suite**  
✅ **Auto-Moderation** (spam, invites, bad words)  
✅ **Warnings System**  
✅ **Mod Logs**  
✅ **XP & Leveling**  
✅ **Virtual Economy**  
✅ **Daily/Weekly Rewards**  
✅ **Leaderboards**  
✅ **Virtual Shop**  
✅ **Polls, 8-Ball, Memes**  
✅ **User/Role Info**  
✅ **Slash Commands**  
✅ **DJ Role System**  
✅ **Auto-Role**  
✅ **Reaction Controls**  
✅ **Per-Server Settings**  
✅ **Web Dashboard** (optional)

---

## 🎉 What's New

See **[NEW_FEATURES.md](NEW_FEATURES.md)** for a complete guide to all new features added in this massive update!

**Major additions:**
- ✨ Slash commands for all features
- 🎵 Enhanced music (loop, previous, jump, multi-platform)
- 🛡️ Complete moderation suite with auto-mod
- 💰 Full economy & leveling system
- 🎮 Entertainment commands
- 🔧 Utility commands

---

**Made with ❤️ using discord.js v14**
- **DJ commands fail**: Run `!setup` to create DJ role or be alone with bot in voice

## License

ISC

