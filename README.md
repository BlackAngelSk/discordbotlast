# Discord Bot - Ultimate Edition

A **comprehensive** Discord bot built with discord.js v14, featuring slash commands, advanced music playback, moderation tools, economy system, mini games with statistics, and much more!

**✅ Cross-Platform Support:** Works on Windows, macOS, and Linux!

## 🌟 Highlights

### ⚡ Modern Interface
- **Slash Commands (/)** - Modern Discord command interface
- **Prefix Commands (!)** - Classic command support with custom prefixes
- **Interactive Menus** - Button-based games and controls

### 🎵 Advanced Music System
- Multi-platform support (YouTube)
- High-quality FFmpeg audio streaming
- Loop modes (song/queue), previous track, jump to position
- Queue management, autoplay, lyrics, and more
- Reaction-based controls for easy playback management

### 🎮 Mini Games & Statistics
- **6 Interactive Games**: Rock Paper Scissors, Number Guessing, Trivia, Tic-Tac-Toe, Blackjack, Roulette
- **Statistics Tracking**: Win/loss records with win rates
- **Casino-Style Blackjack**: Accurate dealer rules with natural blackjack
- **Full Roulette**: Red/Black/Green/Odd/Even/High/Low/Number betting with 35:1 payouts

### 🛡️ Complete Moderation Suite
- Warnings system, mod logs, auto-moderation
- Anti-spam, anti-invite, bad words filter
- Slowmode, mute, softban, and standard mod tools

### 💰 Economy & Leveling
- XP and level system with auto-rewards
- Daily/weekly rewards, leaderboards
- Virtual shop with purchasable items

### 🎯 Entertainment & Utility
- Polls, 8-ball, memes from Reddit
- User/role info, avatars, server statistics
- Web-based dashboard for server management

---

## ✨ Features

### 🎮 Mini Games System

**Available Games:**
1. **Rock Paper Scissors** - Classic RPS with button controls
2. **Number Guessing** - Guess a number between 1-100 in 6 tries
3. **Trivia** - 16 questions across Bot/General/Gaming/Music categories
4. **Tic-Tac-Toe** - Strategic 3x3 grid game with AI opponent
5. **Blackjack** - Casino-accurate 21 with dealer AI
   - Dealer hits on 16 or less, stands on 17+
   - Natural blackjack detection
   - Player avatar display
6. **Roulette** - Full casino roulette with 37 numbers (0-36)
   - Bet types: Red, Black, Green (0), Odd, Even, High, Low, Specific Number
   - Payouts: 2:1 (colors/odd/even/high/low), 35:1 (number/green)

**Statistics Tracking:**
- Track wins, losses, and ties for Blackjack and Roulette
- View your win rate percentage
- Check other players' stats with `@mentions`

**Commands:**
- `!minigames` or `!minigame` - Open game selection menu
- `!gamestats [@user]` - View game statistics

### 🎵 Music Playback
- Play music from **YouTube** (URLs and search queries)
- **YouTube Playlist Support** - Add entire playlists at once
- High-quality audio streaming via FFmpeg with Opus encoding
- Direct yt-dlp to FFmpeg pipeline (no URL expiration issues)
- Queue management system
- Auto-disconnect after 15 seconds of inactivity
- **Autoplay Mode** - Automatically play related songs
- **Loop/Repeat** - Loop current song or entire queue
- **Previous Track** - Go back through last 10 played songs
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
- `/play <query>` - Play from YouTube or search
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

### 🎮 Entertainment Commands (Slash & Prefix)
- `/poll <question> <options>` - Create poll (separate options with |)
- `/8ball <question>` - Ask magic 8-ball
- `/meme` - Get random meme from Reddit
- `!minigames` or `!minigame` - Play interactive mini games
- `!gamestats [@user]` - View game win/loss statistics

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
- `!dashboard` - Get dashboard link

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20.16.0 or higher (v22.12.0+ recommended)
- **Discord Bot Token**
- **FFmpeg** (via ffmpeg-static package)
- **Linux, macOS, or Windows**

#### Linux-Specific Requirements
If on **Linux**, you may need to install additional packages:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential python3

# Fedora/RHEL
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3

# Arch
sudo pacman -S base-devel python
```

### Installation

1. **Clone the repository:**
```bash
git clone <your-repo-url>
cd discordbotlast
```Linux-only: Make startup scripts executable (optional)**
```bash
# For bash users
chmod +x start.sh

# For fish users
chmod +x start.sh

# For Windows, use start.bat instead
```

5. **Start the bot:**

**Windows:**
```bash
npm start
# OR
start.bat
```

**macOS/Linux:**
```bash
npm start
# OR
./start.sh  # if you made it executable
# OR (for fish shell)
bash start.shall dependencies:**
```bash
npm install
```

3. **Create `.env` file:**
```env
DISCORD_TOKEN=your_bot_token_here
DASHBOARD_ENABLED=false
CLIENT_ID=your_bot_client_id
CLIENT_SECRET=your_bot_client_secret
```

4. **Start the bot:**
```bash
npm start
```

### First-Time Setup

1. **Invite bot to your server** with proper permissions (Administrator recommended)
2. **Run** `/setup` or `!setup` to create DJ and Member roles
3. **Configure auto-moderation:** `/automod enable`
4. **Set mod log channel:** `/modlog #channel`
5. **Customize settings** with `!config` commands
6. **Try the mini games:** `!minigames`

---

## 🎯 Key Systems

### Mini Games System

**How It Works:**
- Use `!minigames` to open the game selection menu
- Click buttons to choose a game
- Play against the bot or AI opponents
- Wins, losses, and ties are automatically tracked
- View your statistics with `!gamestats`

**Game Details:**

**Blackjack (21):**
- Casino-accurate dealer rules
- Dealer hits on 16 or less, stands on 17+
- Natural blackjack (Ace + 10/face) pays 3:2
- Your avatar displayed in game embed
- Hit or Stand buttons for gameplay

**Roulette:**
- Full 37-number wheel (0-36)
- Multiple bet types available
- Payouts:
  - Red/Black/Odd/Even/High/Low: 2:1
  - Specific Number: 35:1
  - Green (0): 35:1

**Trivia:**
- 16 questions across 4 categories
- Bot/Discord, General Knowledge, Gaming, Music
- Multiple choice format

**Tic-Tac-Toe:**
- Strategic 3x3 grid gameplay
- AI opponent that tries to win
- Button-based moves

### Music System

**How It Works:**
1. Join a voice channel
2. Use `!play <song name>` or `/play <song name>`
3. Bot joins and starts streaming via yt-dlp → FFmpeg → Discord
4. Control playback with commands or reaction emojis
5. Bot auto-disconnects after 15 seconds when queue is empty

**Technical Details:**
- Uses `@distube/yt-dlp` for YouTube downloading
- FFmpeg processes audio stream with Opus encoding
- Direct pipeline prevents URL expiration issues
- Supports YouTube video URLs, playlist URLs, and search queries

**DJ Permissions:**
Commands require DJ role, Administrator permission, or being alone with bot in voice channel

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
3. `/automod antispam true`
4. `/automod badwords add <word>`
5. `/modlog #mod-logs`

All violations are auto-deleted with temporary warning messages and logged to mod log channel.

---

## 📁 Project Structure

```
discordbotlast/
├── commands/fun/          # Entertainment commands
│   ├── minigame.js       # 6 interactive mini games
│   ├── gamestats.js      # Game statistics display
│   └── hello.js          # Greeting command
├── commands/music/        # Music playback commands
│   ├── play.js           # Play music
│   ├── pause.js          # Pause playback
│   ├── resume.js         # Resume playback
│   ├── skip.js           # Skip song
│   ├── stop.js           # Stop playback
│   ├── volume.js         # Volume control
│   ├── queue.js          # View queue
│   ├── nowplaying.js     # Current song info
│   ├── lyrics.js         # Song lyrics
│   ├── autoplay.js       # Autoplay toggle
│   ├── loop.js           # Loop modes
│   ├── previous.js       # Previous track
│   ├── jump.js           # Jump in queue
│   ├── clear.js          # Clear queue
│   ├── remove.js         # Remove from queue
│   ├── move.js           # Move in queue
│   ├── swap.js           # Swap songs
│   └── shuffle.js        # Shuffle queue
├── commands/moderation/   # Moderation commands
│   ├── ban.js            # Ban members
│   ├── unban.js          # Unban members
│   ├── kick.js           # Kick members
│   ├── timeout.js        # Timeout members
│   ├── untimeout.js      # Remove timeout
│   ├── warn.js           # Warn members
│   ├── purge.js          # Delete messages
│   ├── lock.js           # Lock channels
│   ├── unlock.js         # Unlock channels
│   └── clear.js          # Clear messages
├── commands/utility/      # Utility commands
│   ├── config.js         # Server configuration
│   ├── setup.js          # Initial bot setup
│   ├── help.js           # Command list
│   ├── ping.js           # Latency check
│   ├── server.js         # Server info
│   ├── leave.js          # Leave voice
│   └── dashboard.js      # Dashboard link
├── slashCommands/         # Slash command files
│   ├── music/            # Music slash commands
│   ├── moderation/       # Moderation slash commands
│   ├── economy/          # Economy slash commands
│   ├── fun/              # Entertainment slash commands
│   └── utility/          # Utility slash commands
├── utils/
│   ├── commandHandler.js        # Prefix command handler
│   ├── slashCommandHandler.js   # Slash command handler
│   ├── eventHandler.js          # Event loader
│   ├── MusicQueue.js           # Music queue with FFmpeg streaming
│   ├── economyManager.js       # Economy & XP system
│   ├── moderationManager.js    # Warnings & auto-mod
│   ├── settingsManager.js      # Server settings
│   ├── gameStatsManager.js     # Mini game statistics
│   ├── permissions.js          # DJ permissions checker
│   ├── queues.js               # Queue storage Map
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
│   ├── moderation.json       # Warnings & auto-mod
│   └── gameStats.json        # Mini game statistics
├── dashboard/               # Web dashboard (optional)
│   ├── server.js           # Express server
│   ├── public/
│   │   └── style.css
│   └── views/
│       ├── index.ejs
│       ├── dashboard.ejs
│       └── server.ejs
├── index.js                # Main bot file
├── package.json            # Dependencies
├── .env                    # Environment variables
├── README.md              # This file
├── FEATURES.md            # Feature documentation
├── CONFIG_GUIDE.md        # Configuration guide
└── DASHBOARD_GUIDE.md     # Dashboard guide
```

---

## 📚 Documentation

- **[SETUP.md](SETUP.md)** - Installation, configuration, and deployment guide
- **[COMMANDS.md](COMMANDS.md)** - Complete command reference (117+ commands)
- **[GUIDE.md](GUIDE.md)** - Features, configuration, and advanced usage

---

## 🔧 Configuration

### Server Settings
Use `!config` to view and modify server-specific settings:
- Command prefix (default: `!`)
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
- Ensure `@distube/yt-dlp` is installed: `npm install @distube/yt-dlp`
- Check voice channel permissions (Connect, Speak)
- Verify FFmpeg is available (installed via ffmpeg-static)
- Bot logs show "yt-dlp binary path" - should not be undefined

**Mini games not responding:**
- Check bot has Send Messages and Add Reactions permissions
- Ensure Message Content Intent is enabled
- Try different game modes if one fails

**Statistics not saving:**
- Check write permissions for `data/` folder
- Verify `gameStats.json` exists and is writable
- Check console for JSON save errors

**Auto-role not working:**
- Enable Server Members Intent
- Grant bot Manage Roles permission
- Ensure bot's role is higher than target role

**Economy/XP not saving:**
- Check write permissions for `data/` folder
- Verify `economy.json` and `moderation.json` exist

---

## 📋 Requirements

- **Node.js** 20.16.0 or higher (v22.12.0+ recommended)
- **Discord Bot** with required intents:
  - Server Members Intent
  - Message Content Intent
  - Guild Voice States
  - Guild Messages
  - Guild Message Reactions

---

## 📦 Dependencies

**Core:**
- `discord.js` ^14.14.1 - Discord API wrapper
- `@discordjs/voice` ^0.19.0 - Voice connection handling
- `@discordjs/opus` ^0.10.0 - Opus audio codec
- `dotenv` ^16.3.1 - Environment variable loading

**Music System:**
- `@distube/yt-dlp` ^5.2.3 - YouTube downloader binary
- `youtube-dl-exec` ^3.0.29 - yt-dlp wrapper for Node.js
- `ffmpeg-static` ^5.3.0 - FFmpeg binary for audio processing

**Web & Utilities:**
- `express` ^5.2.1 - Web dashboard server
- `ejs` ^4.0.1 - Template engine
- `express-session` ^1.18.2 - Session management
- `passport` ^0.7.0 - Authentication
- `passport-discord` ^0.1.4 - Discord OAuth2
- `undici` ^7.18.2 - HTTP client

---

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

## 📄 License

ISC License

---

## ⭐ Features at a Glance

✅ **45+ Commands** (prefix + slash)  
✅ **YouTube Music Streaming** (FFmpeg + yt-dlp pipeline)  
✅ **6 Interactive Mini Games** (RPS, Guess, Trivia, Tic-Tac-Toe, Blackjack, Roulette)  
✅ **Game Statistics Tracking** (wins/losses/ties with win rates)  
✅ **Loop & Repeat** (song/queue modes)  
✅ **Previous Track** with 10-song history  
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

## 🎉 Recent Updates

**Music System Overhaul:**
- Implemented direct yt-dlp → FFmpeg → Discord pipeline
- Added @distube/yt-dlp for reliable binary handling
- FFmpeg Opus encoding for optimal Discord audio quality
- Fixed URL expiration issues with streaming approach
- Enhanced error logging and debugging

**Mini Games Addition:**
- 6 fully interactive button-based games
- Persistent statistics tracking system
- Casino-accurate Blackjack with proper dealer AI
- Full Roulette with 37 numbers and multiple bet types
- Player avatar display in Blackjack
- Win rate calculations and leaderboard-ready stats

**System Improvements:**
- Fixed all module path errors across 45+ files
- Added DM protection to command handler
- Enhanced interaction timeout handling
- Improved error recovery and logging
- Better voice connection management

---

**Made with ❤️ using discord.js v14**

## 📄 License

ISC License

---

**Need Help?** Join our support server or check the documentation files!

