# Command Reference

This document provides a structured overview of the bot's main command groups. The live command list in Discord remains the source of truth, so use `/help` if you need the latest details.

## Command Types

The bot supports two command styles:

- **Slash commands** such as `/play`
- **Prefix commands** such as `!play`

Not every feature is available in both styles, but most major systems support one or both.

## Music Commands

| Command | Purpose |
| --- | --- |
| `/play <query>` or `!play <query>` | Play a song or playlist |
| `/queue` or `!queue` | Show the current queue |
| `/pause`, `/resume`, `/skip`, `/stop` | Manage playback |
| `/loop <mode>` or `!loop <mode>` | Set loop mode |
| `/volume <value>` | Adjust playback volume |
| `/autoplay` | Toggle related-song playback |
| `/lyrics [song]` | Show lyrics for the current or requested track |

## Economy Commands

| Command | Purpose |
| --- | --- |
| `/balance [user]` | Check coins, level, and XP |
| `/daily` | Claim the daily reward |
| `/weekly` | Claim the weekly reward |
| `/leaderboard [type]` | View balance, level, or XP rankings |
| `/shop` | Browse the server shop |
| `/inventory [user]` | View owned items |
| `/transfer @user <amount>` | Send coins to another user |

## Game and Fun Commands

| Command | Purpose |
| --- | --- |
| `/poll` | Create a poll |
| `/8ball <question>` | Get a random answer |
| `/meme` | Fetch a meme |
| `!minigames` | Open the mini-game menu |
| `/blackjack`, `/roulette`, `/slots`, `/mines`, `/coinflip` | Play economy-based games |
| `!poker ...` | Use the multiplayer poker system |
| `/gamestats [user]` | Review game statistics |

## Moderation Commands

| Command | Purpose |
| --- | --- |
| `/ban`, `/kick`, `/mute`, `/timeout` | Moderate members |
| `/warnings add`, `/warnings list`, `/warnings clear` | Manage warnings |
| `/purge <amount>` | Remove messages |
| `/lock`, `/unlock`, `/slowmode` | Manage channels |
| `/automod ...` | Configure auto-moderation |
| `/modlog <channel>` | Set the moderation log channel |

## Utility and Server Commands

| Command | Purpose |
| --- | --- |
| `/help` or `!help` | Open help menus |
| `/ping` | Check bot latency |
| `/userinfo`, `/roleinfo`, `/serverinfo` | View information about users, roles, or the server |
| `/birthday` | Manage birthday settings |
| `/analytics` | View analytics information |
| `/activity` | Review user activity summaries |
| `!config ...` | Change server-specific settings |

## Owner and Operations Commands

| Command | Purpose |
| --- | --- |
| `/mongodb-space` | Check MongoDB storage usage |
| `/mongodb-sync status` | View sync configuration |
| `/mongodb-sync schedule` | Switch between manual and timed updates |
| `/mongodb-sync run` | Trigger a sync immediately |
| `/testcommands` | Validate slash command availability |
| `/system-stats` | Show CPU and memory information |
| `/botstatus` | Review bot health and status |

## Command Discovery

If you are unsure which command to use:

1. Run `/help`
2. Open the relevant category
3. Use the slash command autocomplete in Discord

## Notes on Permissions

- Music administration usually requires a DJ role, administrator permission, or being alone with the bot in the voice channel
- Moderation commands require the corresponding Discord permissions
- Owner commands require `BOT_OWNER_ID` to be configured and matched

## Related Documentation

- [`SETUP.md`](SETUP.md) - installation and environment configuration
- [`GUIDE.md`](GUIDE.md) - operational guidance and feature overview
- [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md) - quick lookup sheet
