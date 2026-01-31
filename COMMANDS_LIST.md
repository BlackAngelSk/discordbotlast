# Discord Bot - Complete Command List

**Total Commands:** 55 (42 Prefix Commands + 13 Slash Commands)

---

## 🎵 Music Commands (17 Prefix + 1 Slash)

### Playback Control
- **!play** - Play music from YouTube
- **!pause** - Pause the current song (requires DJ role)
- **!resume** - Resume playback (requires DJ role)
- **!stop** - Stop playing music and clear the queue (requires DJ role)
- **!skip** - Skip the current song (requires DJ role)
- **!previous** - Play the previous song
- **!nowplaying** (aliases: `np`) - Show the currently playing song

### Queue Management
- **!queue** - Show the music queue
- **!jump** - Jump to a specific position in the queue
- **!/play** (Slash) - Play music
- **!remove** - Remove a song from the queue by position (requires DJ role)
- **!move** - Move a song to a different position in the queue (requires DJ role)
- **!swap** - Swap two songs in the queue (requires DJ role)
- **!clear** - Clear all songs from the queue (requires DJ role)

### Audio Settings
- **!volume** (aliases: `vol`, `v`) - Set or check the volume 0-200 (requires DJ role)
- **!loop** - Set loop mode (off, song, queue)
- **!autoplay** - Toggle autoplay mode (plays related songs when queue ends)
- **!lyrics** - Get lyrics for the current song or search query

---

## 🎮 Entertainment/Fun Commands (8 Prefix + 1 Slash)

### Games & Mini-Games
- **!minigames** (aliases: `minigame`, `game`, `games`) - Play minigames (RPS, guess, trivia, tictactoe, blackjack, roulette, slots)
  - `!minigame rps` - Rock Paper Scissors
  - `!minigame guess` - Guess The Number
  - `!minigame trivia` - Quick Trivia
  - `!minigame tictactoe` (or `ttt`) - Tic-Tac-Toe
  - `!minigame blackjack` (or `bj`) - Blackjack (Demo - no payouts)
  - `!minigame roulette` (or `roul`) - Roulette (Demo - no payouts)
  - `!minigame slots` (or `slot`) - Slots (Demo - no payouts)

### Betting Games
- **!blackjack** (aliases: `bj`, `21`) - Play blackjack and bet your coins!
- **!roulette** (aliases: `rl`, `spin`) - Play roulette and bet your coins!
- **!slots** (aliases: `slot`, `slotmachine`) - Play slots and bet your coins!
- **!ttt** (aliases: `tictactoe`, `tic`) - Play tic-tac-toe and bet your coins!

### Other Fun
- **!hello** - Get a greeting from the bot
- **!gamestats** (aliases: `stats`, `gstats`) - View your minigame statistics
- **!/8ball** (Slash) - 8 Ball game

---

## 💰 Economy Commands (3 Prefix + 3 Slash)

### Balance & Rewards
- **!/balance** (Slash) - Check your balance
- **!/daily** (Slash) - Claim daily reward
- **!/weekly** (Slash) - Claim weekly reward

### Coin Transfers
- **!transfer** (aliases: `send`, `give`) - Send coins to another user

### Shop & Leaderboard
- **!/shop** (Slash) - View the shop
- **!/leaderboard** (Slash) - View economy leaderboard

---

## 🛡️ Moderation Commands (10 Prefix + 3 Slash)

### Member Management
- **!ban** - Ban a member from the server
- **!unban** - Unban a user from the server
- **!kick** - Kick a member from the server
- **!timeout** - Timeout (mute) a member
- **!untimeout** - Remove timeout from a member
- **!warn** - Warn a member

### Channel Management
- **!lock** - Lock a channel to prevent members from sending messages
- **!unlock** - Unlock a channel to allow members to send messages

### Message Management
- **!purge** - Delete multiple messages at once

### Slash Commands
- **!/mute** (Slash) - Mute a member
- **!/softban** (Slash) - Soft ban (kick with message delete)
- **!/automod** (Slash) - Configure auto-moderation

### Moderation Tools
- **!/modlog** (Slash) - View moderation log
- **!/warnings** (Slash) - Check user warnings

---

## 🔧 Utility Commands (7 Prefix + 3 Slash)

### Bot Information
- **!ping** - Check bot latency
- **!server** - Get server information
- **!leave** - Leave the voice channel

### Configuration & Setup
- **!config** - Configure bot settings for this server
- **!setup** - Setup DJ role and Member role for the server
- **!dashboard** - Get the dashboard link

### Help & Information
- **!help** - Show available commands

### User Information (Slash)
- **!/avatar** (Slash) - Get user avatar
- **!/userinfo** (Slash) - Get user information
- **!/roleinfo** (Slash) - Get role information

---

## 📊 Command Statistics

| Category | Prefix Commands | Slash Commands | Total |
|----------|-----------------|----------------|-------|
| Music | 17 | 1 | 18 |
| Fun/Entertainment | 8 | 1 | 9 |
| Economy | 3 | 3 | 6 |
| Moderation | 10 | 3 | 13 |
| Utility | 7 | 3 | 10 |
| **TOTAL** | **42** | **13** | **55** |

---

## 💡 Command Usage Notes

- **DJ Role Required**: Music playback commands marked with *(requires DJ role)* need the DJ role set up via `!setup`
- **Prefix**: Default prefix is `!` (can be changed per server with `!config prefix`)
- **Slash Commands**: Can be used with `/` (e.g., `/balance`, `/daily`)
- **Betting Games**: Minimum bet is 10 coins
  - Blackjack & Roulette: Standalone betting commands
  - Slots Demo: Free play in `!minigame slots` (no payouts)
  - Slots Betting: Real coins with `!slots <bet>`

---

## 🎯 Quick Command Guide

### Just joined? Try these:
```
!help              - See all commands
!ping              - Check if bot is working
!server            - Get server info
!hello             - Get a greeting
```

### Music lovers:
```
!play <song>       - Play a song
!queue             - See what's queued
!skip              - Skip current song
!volume 50         - Set volume to 50%
```

### Economy players:
```
!/balance          - Check your coins
!/daily            - Claim daily reward
!transfer @user 100 - Send 100 coins to a user
!slots 100         - Play slots with 100 coins
!minigame slots    - Try slots for free
```

### Server admins:
```
!setup             - Configure DJ and Member roles
!config            - Change server settings
!dashboard         - Access the dashboard
```
