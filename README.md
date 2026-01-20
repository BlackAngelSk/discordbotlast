# Discord Bot

A Discord bot with music playback built with discord.js v14.

## Features

### General Commands
- 🏓 Ping command to check latency
- 👋 Hello command for greetings
- 📋 Help command to list all commands
- 📊 Server info command

### Music Features
- 🎵 Play music from YouTube (URL or search)
- ⏸️ Pause/Resume playback
- ⏭️ Skip songs
- ⏹️ Stop music and clear queue
- 📋 View music queue
- 🎧 Now playing information
- 🎮 **Reaction-based controls** - Control music with emoji reactions!
- ⏱️ Auto-disconnect after 15 seconds of inactivity

## Setup Instructions

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under the bot's username, click "Reset Token" and copy your bot token
5. Enable these Privileged Gateway Intents:
   - **Server Members Intent**
   - **Message Content Intent**
   - **Message Content Intent** (for reading messages)
6. Under "Bot Permissions", enable:
   - Send Messages
   - Read Messages/View Channels
   - Read Message History
   - Connect (for voice)
   - Speak (for voice)
   - Add Reactions

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and replace `your_bot_token_here` with your actual bot token

### 4. Invite Bot to Your Server

1. Go to the "OAuth2" → "URL Generator" section in the Developer Portal
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - Send Messages
   - Read Messages/View Channels
   - Read Message History
4. Copy the generated URL and open it in your browser to invite the bot

### 5. Run the Bot

```bash
npm start
```

## Commands

### General Commands
- `!ping` - Check bot latency
- `!hello` - Get a greeting
- `!help` - Show available commands
- `!server` - Get server information

### Music Commands
- `!play <url or search>` - Play music from YouTube
- `!stop` - Stop music and clear queue
- `!skip` - Skip current song
- `!pause` - Pause playback
- `!resume` - Resume playback
- `!queue` - Show current queue
- `!nowplaying` (or `!np`) - Show current song
- `!leave` - Leave voice channel

### Reaction Controls
When a song is playing, you can use these reactions on the now playing message:
- ⏸️ **Pause** - Pause the current song
- ▶️ **Resume** - Resume playback
- ⏭️ **Skip** - Skip to the next song
- ⏹️ **Stop** - Stop music and clear queue

## Troubleshooting

- **Bot doesn't respond**: Make sure Message Content Intent is enabled
- **Missing permissions**: Check bot role permissions in your server
- **Login error**: Verify your bot token in the `.env` file
- **Music not playing**: Ensure the bot has Connect and Speak permissions in voice channels
- **Reactions don't work**: Make sure you enabled the Message Content Intent and Add Reactions permission
- **Bot disconnects immediately**: The bot auto-disconnects after 15 seconds when the queue is empty

## License

ISC
