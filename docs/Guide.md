# Feature and Operations Guide

This guide describes the major systems in the bot and how they fit together in day-to-day server administration.

## Core Areas

### Moderation

The moderation system includes:

- warnings and moderation history
- timeouts, kicks, bans, and softbans
- anti-spam and anti-invite protection
- bad-word filtering
- moderation logging and audit visibility

For most servers, the recommended starting point is:

```text
/automod enable
/automod antiinvite true
/automod antispam true
/modlog #mod-logs
```

### Economy and Progression

The bot tracks user progression with XP, levels, rewards, and shop items. Members can claim recurring rewards and compete on leaderboards.

Typical commands include:

- `/balance`
- `/daily`
- `/weekly`
- `/leaderboard`
- `/shop`

### Music Playback

The music system supports queue-based playback with search and URL input. Common capabilities include:

- play, pause, resume, skip, stop
- queue inspection and reordering
- autoplay and loop modes
- previous track support
- lyrics lookup

### Dashboard and Administration

If enabled, the dashboard provides browser-based access to analytics and management views. It is intended for administrators who prefer a visual workflow over command-line or Discord-only management.

Typical dashboard uses include:

- reviewing server activity
- checking member and economy data
- inspecting moderation state
- managing configuration in a central place

## Seasonal Systems

The bot includes a seasonal leaderboard system for recurring competition cycles.

### What it supports

- automatic quarterly season creation
- seasonal leaderboards per server
- configurable update intervals
- reward payouts and role rewards
- manual season administration through commands

### Relevant commands

- `!season create <name>`
- `!season list`
- `!season info <name>`
- `!season leaderboard [name]`
- `!season end <name>`
- `/leaderboard-config`
- `/leaderboard-update`

## Poker and Interactive Games

The bot includes both quick mini-games and a multiplayer poker system.

### Multiplayer poker

The poker feature supports hosted tables, joining players, turn-based actions, and pot resolution.

Example flow:

```text
!poker host 100
!poker join 100
!poker status
!poker action call
```

### Other interactive games

The bot also includes casual and economy-based games such as blackjack, roulette, slots, mines, trivia, tic-tac-toe, and more.

## Monitoring, Logging, and Backups

Operational support features include:

- status and health commands
- CPU and memory monitoring through `/system-stats`
- structured logs in the `logs/` directory
- automated backup handling
- graceful shutdown handling
- audit trails for administrative actions

These features are designed to make long-running bot deployments easier to observe and maintain.

## Recommended Operational Practices

For a more reliable deployment:

1. Keep `BOT_OWNER_ID` configured
2. Review logs periodically
3. Enable backups for important data
4. Use MongoDB for larger or long-lived communities
5. Test owner-only monitoring commands after deployment

## Related Documentation

- [`README.md`](README.md) - overview and entry point
- [`SETUP.md`](SETUP.md) - installation steps
- [`COMMANDS.md`](COMMANDS.md) - command categories and examples
- [`MONGODB.md`](MONGODB.md) - database setup, migration, and sync management
