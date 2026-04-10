# Setup and Deployment Guide

This document explains how to install, configure, and launch the Discord bot in a clean and repeatable way.

## Requirements

Before you begin, make sure you have:

- Node.js 20.16 or later
- A Discord bot token from the Discord Developer Portal
- A server where the bot can be invited
- Optional: MongoDB if you want database-backed storage

On Linux, you may also need build tools:

```bash
# Ubuntu or Debian
sudo apt-get update
sudo apt-get install -y build-essential python3

# Fedora
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3

# Arch
sudo pacman -S base-devel python
```

## Installation

1. Clone the repository:

```bash
git clone <your-repository-url>
cd discordbotlast
```

2. Install dependencies:

```bash
npm install
```

3. Create or update the `.env` file in the project root.

## Required Environment Variables

At minimum, configure the following values:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
BOT_OWNER_ID=your_discord_user_id
```

## Optional Environment Variables

Dashboard support:

```env
DASHBOARD_ENABLED=false
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000
CLIENT_SECRET=your_application_secret
DASHBOARD_CALLBACK=http://127.0.0.1:3000/callback
SESSION_SECRET=generate_a_random_secret
```

MongoDB support:

```env
MONGODB_URI=
MONGODB_DBNAME=discord-bot
MONGODB_AUTOSYNC=true
MONGODB_AUTOSYNC_MODE=interval
MONGODB_AUTOSYNC_INTERVAL_MS=60000
MONGODB_SYNC_ON_STARTUP=true
MONGODB_SYNC_ON_SHUTDOWN=true
```

For complete database guidance, see [`MONGODB.md`](MONGODB.md).

## Discord Application Setup

In the Discord Developer Portal:

1. Create or open your application
2. Open the **Bot** page
3. Copy the bot token into `DISCORD_TOKEN`
4. Enable these privileged intents:
   - Server Members Intent
   - Message Content Intent
5. Save the changes

Invite the bot using the `bot` and `applications.commands` scopes. Administrator permissions are the simplest option during setup.

## Starting the Bot

Use one of the following commands:

```bash
npm start
```

Linux or macOS helper script:

```bash
bash start.sh
```

For production uptime with auto-restart and auto-start after reboot:

```bash
bash start.sh --pm2-auto
```

If PM2 prints a `sudo` command during startup setup, run it once, then run:

```bash
pm2 save
```

Windows helper script:

```bash
start.bat
```

## First-Time Server Setup

Once the bot is online, a recommended setup sequence is:

1. Run `/setup` or `!setup`
2. Configure server behavior with `!config`
3. Enable moderation rules with `/automod`
4. Set a moderation log channel with `/modlog`
5. Test a few commands such as `/help`, `/play`, and `/balance`

## Dashboard Setup

If you want the dashboard enabled:

1. Set `DASHBOARD_ENABLED=true`
2. Add `CLIENT_ID`, `CLIENT_SECRET`, `DASHBOARD_CALLBACK`, and `SESSION_SECRET`
3. Start the bot and open `http://localhost:3000`

## Verification Checklist

After startup, confirm the following:

- The bot logs in successfully
- Slash commands register without errors
- `/help` responds in Discord
- Configuration changes persist after a restart
- If using MongoDB, `/mongodb-sync status` reports the expected mode

## Common Problems

### Bot does not start

- Check the bot token in `.env`
- Confirm Node.js version is recent enough
- Run `npm install` again if dependencies are missing

### Slash commands are missing

- Make sure the invite URL includes `applications.commands`
- If commands are global, allow time for Discord to propagate them
- Use `TEST_GUILD_ID` for faster updates during development

### Permission errors

- Confirm the bot has required server permissions
- Make sure the bot role is high enough to manage target roles or users

### Music issues

- Verify the bot can join and speak in the voice channel
- Check console output for playback or FFmpeg-related errors

## Related Documentation

- [`README.md`](README.md) - project overview
- [`COMMANDS.md`](COMMANDS.md) - command reference
- [`GUIDE.md`](GUIDE.md) - feature and operations guide
- [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md) - short-form cheat sheet
