# Discord Bot

A feature-rich Discord music bot built with discord.js v14 and @discordjs/voice.

## Features

### 🎵 Music Playback
- Play music from YouTube (URLs and search queries)
- **YouTube Playlist Support** - Add entire playlists at once
- High-quality audio streaming
- Queue management system
- Auto-disconnect after inactivity
- **Autoplay Mode** - Automatically play related songs

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

### 🎤 Additional Features
- **Lyrics** - Fetch and display song lyrics
- **DJ Role System** - Permission control for music commands
- **Auto-Role** - Automatically assign roles to new members
- **Custom Prefix** - Set different command prefix per server
- **Welcome/Leave Messages** - Configurable messages for member join/leave
- **Simme Mini Games** - Play quick RPS, number-guess, and trivia games
- **Per-Server Settings** - Each server has independent configuration
- Server information command

## Commands

### Music Commands
- `!play <url/query>` - Play music from YouTube or search (supports playlists!)
- `!pause` - Pause playback (DJ only)
- `!resume` - Resume playback (DJ only)
- `!skip` - Skip current song (DJ only)
- `!stop` - Stop and clear queue (DJ only)
- `!volume <0-200>` - Set volume (DJ only)
- `!nowplaying` - Show current song
- `!queue` - Display song queue
- `!lyrics [song]` - Get lyrics for current or specified song
- `!autoplay` - Toggle autoplay mode

### Queue Management (DJ Only)
- `!clear` - Clear all songs from queue
- `!remove <position>` - Remove song at position
- `!move <from> <to>` - Move song to different position
- `!swap <pos1> <pos2>` - Swap two songs
- `!shuffle` - Randomize queue order

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
- `!simme <rps|guess|trivia>` - Play mini games (aliases: !minigame, !games)

**Note:** Default prefix is `!` but can be changed per server with `!config prefix`

## DJ Role System

Commands marked as "DJ only" require one of:
- **DJ role** (created with `!setup` command)
- **Administrator** permission
- **Being alone** in voice channel with the bot

The DJ system prevents users from disrupting music playback while allowing control when alone with the bot.

## Auto-Role System

New members automatically receive the "Member" role when joining the server. 

Customize this feature in `events/guildMemberAdd.js` by changing:
- `DEFAULT_ROLE_NAME` - The role name to assign
- `WELCOME_CHANNEL_NAME` - Channel for welcome messages

## Reaction Controls

When a song plays, the bot adds emoji reactions for quick controls:
- ⏸️ **Pause** - Pause playback
- ▶️ **Resume** - Resume playback
- ⏭️ **Skip** - Skip to next song
- ⏹️ **Stop** - Stop and clear queue
- 🔉 **Volume Down** - Decrease volume by 10%
- 🔊 **Volume Up** - Increase volume by 10%

## Setup Instructions

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under the bot's username, click "Reset Token" and copy your bot token
5. Enable these Privileged Gateway Intents:
   - **Server Members Intent** (for auto-role)
   - **Message Content Intent** (for reading commands)
6. Under "Bot Permissions", enable:
   - Send Messages
   - Read Messages/View Channels
   - Add Reactions
   - Connect (voice)
   - Speak (voice)
   - Manage Roles (for auto-role feature)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=your_bot_token_here
```

### 4. Invite Bot to Your Server

1. Go to "OAuth2" → "URL Generator" in Developer Portal
2. Select scopes: `bot`
3. Select bot permissions (or use Administrator for simplicity)
4. Copy the URL and invite the bot

### 5. Run the Bot

```bash
npm start
```

### 6. Setup Server Roles

Run `!setup` in your Discord server to automatically create:
- **DJ role** - For music control permissions
- **Member role** - Auto-assigned to new members

## Requirements

- Node.js 16.9.0 or higher
- FFmpeg installed on system
- Discord bot with required intents

## Dependencies

- discord.js v14
- @discordjs/voice
- @discordjs/opus
- youtube-dl-exec
- ytsr
- ffmpeg-static
- dotenv

## Project Structure

```
├── commands/              # Command files
│   ├── autoplay.js
│   ├── clear.js
│   ├── lyrics.js
│   ├── move.js
│   ├── play.js           # With playlist support
│   ├── remove.js
│   ├── shuffle.js
│   ├── swap.js
│   └── ... (other commands)
├── events/               # Event handlers
│   ├── guildMemberAdd.js # Auto-role system
│   ├── reactionAdd.js    # Reaction controls
│   └── ... (other events)
├── utils/               # Utility files
│   ├── MusicQueue.js    # Queue + autoplay
│   ├── permissions.js   # DJ role system
│   └── ... (other utils)
├── index.js            # Main bot file
└── package.json
```

## Troubleshooting

- **Bot doesn't respond**: Enable Message Content Intent
- **Music not playing**: Check voice permissions
- **Auto-role not working**: Enable Server Members Intent and Manage Roles permission
- **DJ commands fail**: Run `!setup` to create DJ role or be alone with bot in voice

## License

ISC

