# Features & What's New

## Summary
This bot is a comprehensive Discord bot with slash commands, advanced music playback, complete moderation suite, economy system, mini games with statistics, and now **full cross-platform support including Linux!**

## 🆕 Latest Additions

### 1. **Full Linux Support** ✅
- **Works on:** Windows, macOS, and Linux
- **Linux Dependencies:** Automatically handled via npm packages
- **Optional Systemd Integration:** Run bot as system service on Linux
- **Startup Scripts:** Included `start.sh` for bash/Linux users
- **Development:** Built and tested on Ubuntu 20.04+

### 2. **Slash Commands (/) System** ✅
**File**: `utils/slashCommandHandler.js`

- All commands now support modern `/` Discord interface
- Global registration (works in all servers)
- Auto-registers on bot startup
- Coexists with legacy prefix commands (`!`)
- 40+ slash commands available

**Usage:** Type `/` in Discord to see all commands

### 3. **Enhanced Music Features** ✅

#### Loop/Repeat System
- **Slash:** `/loop <mode>` - Modes: `off`, `song`, `queue`
- **Prefix:** `!loop <mode>`
- Loop the current song or entire queue

#### Previous Track
- **Slash:** `/previous`
- **Prefix:** `!previous`
- Go back through last 10 played songs

#### Jump to Position
- **Slash:** `/jump <position>`
- **Prefix:** `!jump <position>`
- Jump to a specific song in queue without playing intermediate songs

#### Multi-Platform Support
- ✅ **YouTube** - Videos & Playlists
- ✅ **Spotify** - Track URLs (converts to YouTube search)
- ✅ **SoundCloud** - Full support

**Usage Examples:**
```
/play https://open.spotify.com/track/...
/play https://soundcloud.com/...
/play Despacito
```

### 4. **DJ Role Permission System** ✅
**File**: `utils/permissions.js`

- Commands like skip, stop, pause, resume, volume require DJ role
- Exceptions: Server owner, Administrator, or being alone with bot
- Smart permission checking with auto-role creation

**How to use**: Run `/setup` to create DJ role, then assign to trusted users

### 5. **Auto-Role for New Members** ✅
**File**: `events/guildMemberAdd.js`

- Automatically assigns "Member" role to new users
- Optional welcome message in designated channel
- Auto-creates role if it doesn't exist
- Customizable role names

**Customize**: Use `!config autorole <name>`

### 6. **YouTube Playlist Support** ✅
**Updated**: `commands/music/play.js`

- Paste a YouTube playlist URL to add up to 50 songs
- Works with both single videos and playlists
- Shows playlist confirmation message with song count

**Usage**: `/play https://youtube.com/playlist?list=...`

### 7. **Lyrics Command** ✅
**File**: `commands/music/lyrics.js`

- Fetches lyrics for current song or search query
- Uses free lyrics.ovh API
- Handles long lyrics with multiple pages
- Format: `!lyrics Artist - Song Name`

**Usage**: 
- `/lyrics` (gets current song lyrics)
- `/lyrics Rick Astley - Never Gonna Give You Up`

### 8. **Autoplay Feature** ✅
**Files**: `utils/MusicQueue.js`, `commands/music/autoplay.js`

- Automatically plays related songs when queue ends
- Toggle on/off with `/autoplay`
- Searches for similar content based on last song
- Intelligent queue management

**Usage**: `/autoplay` to enable/disable

### 9. **Complete Queue Management** ✅

#### Clear
- **Slash:** `/clear`
- **Prefix:** `!clear`
- Removes all songs from queue (requires DJ)

#### Remove
- **Slash:** `/remove <position>`
- **Prefix:** `!remove 3`
- Remove specific song by position

#### Move
- **Slash:** `/move <from> <to>`
- **Prefix:** `!move 5 1`
- Move song from one position to another

#### Swap
- **Slash:** `/swap <pos1> <pos2>`
- **Prefix:** `!swap 2 5`
- Swap two songs in queue

#### Shuffle
- **Slash:** `/shuffle`
- **Prefix:** `!shuffle`
- Randomize queue order

### 10. **Advanced Moderation Suite** ✅

#### Slowmode
- **Command:** `/slowmode <seconds> [channel]`
- Set slowmode delay (0-21600 seconds)
- Requires: `Manage Channels` permission

#### Mute/Timeout
- **Command:** `/mute <user> <duration> [reason]`
- Timeout members for up to 28 days
- Duration in minutes
- Requires: `Moderate Members` permission

#### Softban
- **Command:** `/softban <user> [reason]`
- Ban and immediately unban to clear messages
- Requires: `Ban Members` permission

#### Warnings System
- `/warnings add <user> <reason>` - Add warning
- `/warnings list <user>` - View warnings with timestamps
- `/warnings remove <user> <id>` - Remove specific warning
- `/warnings clear <user>` - Clear all warnings
- Tracks all warnings with timestamps and moderators

#### Mod Log
- **Command:** `/modlog <channel>`
- Set channel for moderation logs
- Auto-logs all mod actions and auto-mod events
- Includes timestamps and moderator info

### 11. **Auto-Moderation System** ✅
**File**: `utils/moderationManager.js`

Features:
- ✅ **Anti-Invite** - Block Discord invite links
- ✅ **Anti-Spam** - Detect spam (5+ messages in 5 seconds = 1 min timeout)
- ✅ **Bad Words Filter** - Custom word blacklist
- ✅ **Max Mentions** - Limit user mentions per message (default: 5)
- ✅ **Max Emojis** - Limit emojis per message (default: 10)

Commands:
- `/automod enable` - Enable auto-mod
- `/automod disable` - Disable auto-mod
- `/automod antiinvite <true/false>` - Toggle invite filter
- `/automod antispam <true/false>` - Toggle spam detection
- `/automod badwords add <word>` - Add bad word
- `/automod badwords remove <word>` - Remove bad word
- `/automod settings` - View auto-mod config

### 12. **6 Mini Games with Statistics** ✅
**File**: `commands/fun/minigame.js`

Games:
1. **Rock Paper Scissors** - Classic RPS with button controls
2. **Number Guessing** - Guess a number between 1-100 in 6 tries
3. **Trivia** - 16 questions across Bot/General/Gaming/Music categories
4. **Tic-Tac-Toe** - Strategic 3x3 grid game with AI opponent
5. **Blackjack** - Casino-accurate 21 with dealer AI
6. **Roulette** - Full casino roulette with 37 numbers (0-36)

**Statistics Tracking:**
- Track wins, losses, and ties
- View your win rate percentage
- Check other players' stats with `@mentions`

**Commands:**
- `!minigames` or `!minigame` - Open game selection menu
- `!gamestats [@user]` - View game statistics

### 13. **Economy & XP System** ✅
**File**: `utils/economyManager.js`

Features:
- **XP System** - 5-15 XP per message
- **Level System** - Auto-progression with formula
- **Auto-Rewards** - Coins on level up
- **Daily Rewards** - 1,000 coins every 24 hours
- **Weekly Rewards** - 5,000 coins every 7 days
- **Leaderboards** - Top users by balance/level/XP
- **Shop System** - Buy roles and items with coins
- **Inventory** - Track purchased items

### 14. **Server Configuration System** ✅
**File**: `commands/utility/config.js`

Per-server settings:
- Custom command prefix (default: `!`)
- Welcome/leave messages and channels
- Auto-role for new members
- DJ role assignment
- Auto-moderation settings
- Mod log channel

### 15. **Setup Command** ✅
**File**: `commands/utility/setup.js`

- One-command server setup
- Creates DJ and Member roles
- Shows helpful embed with info
- Requires Administrator permission

**Usage**: `!setup`

### 16. **Entertainment Commands** ✅
- **Polls** - Create interactive polls (up to 10 options)
- **8-Ball** - Ask yes/no questions
- **Memes** - Random memes from Reddit (SFW only)

### 17. **Web Dashboard (Optional)** ✅
**Files**: `dashboard/server.js`, `dashboard/public/`, `dashboard/views/`

Features:
- 🔐 Discord OAuth2 authentication
- 🎨 Beautiful, responsive UI
- ⚙️ Manage all bot settings per server
- 👋 Configure welcome/leave messages
- 🎵 Set DJ and auto roles
- 📊 View bot statistics

## Commands Quick Reference

**Total:** 45+ commands (slash + prefix)

See [COMMANDS_LIST.md](COMMANDS_LIST.md) for complete listing.
