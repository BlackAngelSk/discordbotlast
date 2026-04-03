# Quick Reference

This file is intended as a short operational cheat sheet for common tasks.

## Start the Bot

```bash
npm install
npm start
```

## Initial Checks

Run these after the bot comes online:

```text
/help
/botstatus
/system-stats
```

## Common Commands

| Task | Command |
| --- | --- |
| Play music | `/play <query>` |
| Check queue | `/queue` |
| Check balance | `/balance` |
| Claim daily reward | `/daily` |
| Create a poll | `/poll` |
| Configure automod | `/automod settings` |
| Configure welcome messages | `/welcomemessage` |
| Check MongoDB sync mode | `/mongodb-sync status` |

## MongoDB Quick Tasks

| Task | Command |
| --- | --- |
| View sync status | `/mongodb-sync status` |
| Switch to manual mode | `/mongodb-sync schedule mode:manual` |
| Set timed sync | `/mongodb-sync schedule mode:interval minutes:10` |
| Force sync now | `/mongodb-sync run` |
| Check storage usage | `/mongodb-space` |

## Important Files

| File | Purpose |
| --- | --- |
| `.env` | Environment configuration |
| `README.md` | Project overview |
| `SETUP.md` | Installation and deployment guide |
| `COMMANDS.md` | Command reference |
| `GUIDE.md` | Operations and feature guide |
| `MONGODB.md` | MongoDB setup and migration guide |

## Common Troubleshooting Checks

### Bot does not respond

- verify `DISCORD_TOKEN`
- confirm required Discord intents are enabled
- check server permissions

### Slash commands are missing

- confirm the bot invite includes `applications.commands`
- restart the bot and wait for Discord to refresh commands

### MongoDB problems

- verify `MONGODB_URI`
- run `/mongodb-sync status`
- review the console output for connection errors

## Recommended Admin Workflow

1. Use `/help` for discovery
2. Use `!config` to customize the server
3. Enable `/automod` and `/modlog`
4. Review `/botstatus` and `/system-stats` periodically
