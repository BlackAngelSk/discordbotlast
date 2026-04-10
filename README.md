# Discord Bot

A feature-rich Discord bot built with `discord.js` v14 for community management, music playback, moderation, engagement systems, and server automation. The project supports both slash commands and prefix commands, includes an optional web dashboard, and can run on either JSON storage or MongoDB.

## Overview

This repository is designed for servers that want a single bot to handle day-to-day administration, member engagement, voice features, and data tracking. It includes a broad command set for moderation, economy, games, analytics, reminders, seasonal systems, and more.

## Core Features

| Area | Capabilities |
| --- | --- |
| Moderation | warnings, timeouts, softbans, purge tools, audit logs, anti-spam, anti-invite, bad-word filtering |
| Music | YouTube playback, queue controls, autoplay, loop modes, lyrics, previous track, jump, and user custom playlists |
| Economy and Levels | XP, levels, daily and weekly rewards, balance tracking, leaderboards, shop system |
| Community Tools | polls, profiles, invite tracking, birthdays, suggestions, reminders, activity tracking |
| Automation | welcome and leave messages, auto-role, scheduled messages, seasonal leaderboard updates |
| Operations | web dashboard, analytics, backups, health monitoring, MongoDB sync controls |

## Technology Stack

- `Node.js` 20.16 or newer
- `discord.js` v14
- `@discordjs/voice` for voice features
- `Express` and `EJS` for the dashboard
- `MongoDB` for optional database-backed storage
- JSON file storage as a built-in fallback

## Getting Started

### Prerequisites

Before running the bot, make sure you have:

- Node.js 20.16 or higher
- A Discord application and bot token
- Required Discord intents enabled in the Developer Portal:
  - Server Members Intent
  - Message Content Intent
  - Guild Messages
  - Guild Voice States
  - Guild Message Reactions

### Installation

1. Clone the repository:

```bash
git clone <your-repository-url>
cd discordbotlast
```

2. Install dependencies:

```bash
npm install
```

3. Create or update your `.env` file:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
CLIENT_SECRET=your_application_secret
BOT_OWNER_ID=your_discord_user_id

DASHBOARD_ENABLED=false
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000
DASHBOARD_CALLBACK=http://127.0.0.1:3000/callback

MONGODB_URI=
MONGODB_DBNAME=discord-bot
```

4. Start the bot:

```bash
npm start
```

Optional startup scripts are also included:

```bash
./start.sh
```

For automatic restart after crashes and automatic startup after server reboot:

```bash
./start.sh --pm2-auto
```

On Windows, you can use:

```bash
start.bat
```

## First-Time Setup

After inviting the bot to your server, a typical initial setup looks like this:

1. Run `/setup` or `!setup`
2. Configure moderation with `/automod` and `/modlog`
3. Adjust prefixes and server settings with `!config`
4. Enable the dashboard if needed
5. Configure MongoDB if you want database-backed persistence

## Configuration Notes

### Storage Mode

The bot supports two storage modes:

- **JSON mode**: used automatically when `MONGODB_URI` is empty or MongoDB is unavailable
- **MongoDB mode**: enabled when `MONGODB_URI` is set correctly

Owner-only sync controls are available through:

- `/mongodb-sync status` - show the current sync configuration
- `/mongodb-sync schedule` - choose manual or timed updates
- `/mongodb-sync run` - trigger a sync immediately

### Dashboard

Set `DASHBOARD_ENABLED=true` and provide the Discord OAuth values in `.env` if you want the web dashboard enabled.

### Development Mode

Set `DEV_MODE=true` to disable MongoDB sync and certain scheduled automation during development.

## Command Overview

This project includes both prefix and slash commands. A few major categories are listed below.

### Music

Examples:

- `/play <query>`
- `/queue`
- `/skip`
- `/loop <mode>`
- `/autoplay`
- `/playlist create <name> [description]`
- `/playlist add <playlist> <song>`
- `/playlist list`
- `/playlist load <playlist>`
- `/playlist remove <playlist> <song_number>`
- `/playlist delete <playlist>`
- `!play <query>`

### Moderation

Examples:

- `/mute <user> <duration>`
- `/warnings add <user> <reason>`
- `/automod settings`
- `!ban <user>`
- `!purge <amount>`

### Economy and Progression

Examples:

- `/balance [user]`
- `/daily`
- `/weekly`
- `/leaderboard [type]`
- `/shop`

### Utility and Community

Examples:

- `/help`
- `/userinfo [user]`
- `/serverinfo`
- `/analytics`
- `/birthday`
- `/activity`

### Owner Tools

Examples:

- `/mongodb-space`
- `/mongodb-sync`
- `/testcommands`

For the full reference, see [`COMMANDS.md`](COMMANDS.md).

## Project Structure

```text
discordbotlast/
|-- commands/          # Prefix commands
|-- slashCommands/     # Slash command definitions
|-- events/            # Discord event handlers
|-- utils/             # Managers, services, and shared helpers
|-- dashboard/         # Optional web dashboard
|-- data/              # JSON-based runtime data and backups
|-- assets/            # Static bot assets
|-- index.js           # Application entry point
`-- package.json       # Project metadata and scripts
```

## Available Scripts

| Script | Description |
| --- | --- |
| `npm start` | Start the bot |
| `npm run dev` | Start the bot in development mode |
| `npm run pm2:start` | Start bot with PM2 process manager |
| `npm run pm2:restart` | Restart PM2 bot process |
| `npm run pm2:logs` | View PM2 bot logs |
| `npm run pm2:save` | Persist PM2 process list for reboot |
| `npm run slots:sim` | Run the slot simulation utility |
| `npm run test:slots` | Run slot logic tests |

## Documentation

The documentation set has been consolidated into a smaller group of reference files:

- [`SETUP.md`](SETUP.md) - installation and deployment guide
- [`COMMANDS.md`](COMMANDS.md) - structured command reference
- [`GUIDE.md`](GUIDE.md) - feature and operations guide
- [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md) - short operational cheat sheet
- [`MONGODB.md`](MONGODB.md) - MongoDB setup, migration, storage, and sync scheduling

## Troubleshooting

### Bot does not respond

- Verify the bot token in `.env`
- Confirm the required intents are enabled in the Discord Developer Portal
- Make sure the bot has the necessary permissions in your server

### Slash commands do not appear

- Recheck the bot invite scopes, especially `applications.commands`
- Allow time for global commands to propagate if you are not using a test guild

### Music playback issues

- Confirm the bot can connect and speak in the target voice channel
- Make sure the required audio dependencies installed successfully
- Review terminal output for playback or voice connection errors

### MongoDB issues

- Verify `MONGODB_URI` and `MONGODB_DBNAME`
- Use `/mongodb-sync status` to inspect the current sync mode
- If MongoDB is unavailable, the bot will fall back to JSON storage

## Contributing

Issues, bug reports, and improvement suggestions are welcome. If you plan to make significant changes, documenting the change and testing it locally first is recommended.

## License

This project is licensed under the ISC License.

