# Discord Bot - Complete Command Reference

**Last Updated:** February 8, 2026  
**Total Commands:** 117 (84 Prefix + 33 Slash - All commands available in both formats!)  
**Cross-Platform:** Windows, macOS, Linux ✅

---

## 📖 Table of Contents
1. [🎵 Music Commands](#music-commands)
2. [🎮 Entertainment & Games](#entertainment--games)
3. [💰 Economy & Rewards](#economy--rewards)
4. [🛡️ Moderation](#moderation)
5. [⚙️ Configuration](#configuration)
6. [🔧 Utility](#utility)
7. [📊 Statistics](#statistics)
8. [💡 Usage Tips](#usage-tips)

---

## 🎵 Music Commands

### Playback Control

| Command | Aliases | Usage | Requires DJ |
|---------|---------|-------|------------|
| `/play` `!play` | - | `/play <song/URL>` | ❌ |
| `/pause` `!pause` | - | `/pause` | ✅ |
| `/resume` `!resume` | - | `/resume` | ✅ |
| `/stop` `!stop` | - | `/stop` | ✅ |
| `/skip` `!skip` | - | `/skip` | ✅ |
| `/nowplaying` `!nowplaying` | `np` | `/nowplaying` | ❌ |

### Queue Management

| Command | Aliases | Usage | Requires DJ |
|---------|---------|-------|------------|
| `/queue` `!queue` | - | `/queue` | ❌ |
| `/clear` `!clear` | - | `/clear` | ✅ |
| `/remove` `!remove` | - | `/remove <position>` | ✅ |
| `/move` `!move` | - | `/move <from> <to>` | ✅ |
| `/swap` `!swap` | - | `/swap <pos1> <pos2>` | ✅ |
| `/shuffle` `!shuffle` | - | `/shuffle` | ✅ |
| `/jump` `!jump` | - | `/jump <position>` | ✅ |

### Loop & Navigation

| Command | Aliases | Usage | Requires DJ |
|---------|---------|-------|------------|
| `/loop` `!loop` | - | `/loop <off\|song\|queue>` | ✅ |
| `/previous` `!previous` | - | `/previous` | ✅ |
| `/autoplay` `!autoplay` | - | `/autoplay` | ✅ |

### Advanced Features

| Command | Aliases | Usage | Notes |
|---------|---------|-------|-------|
| `/lyrics` `!lyrics` | - | `/lyrics [song]` | Get song lyrics |
| `/volume` `!volume` | `vol`, `v` | `/volume <0-200>` | DJ role required |

### Supported Platforms
- ✅ YouTube (Videos & Playlists)
- ✅ Spotify (Tracks)
- ✅ SoundCloud
- ✅ Search by title

---

## 🎮 Entertainment & Games

### Mini Games Menu

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/minigames` `!minigames` | `minigame`, `game`, `games` | `/minigames` | Opens game selection menu |

### Available Mini Games

| Game | Command | Entry Point | Win/Loss Tracked |
|------|---------|-------------|------------------|
| Rock Paper Scissors | `rps` | `/minigames` → Select RPS | ✅ |
| Number Guessing | `guess` | `/minigames` → Select Guess | ✅ |
| Trivia | `trivia` | `/minigames` → Select Trivia | ✅ |
| Tic-Tac-Toe | `tictactoe`, `ttt` | `/minigames` → Select TTT | ✅ |
| Blackjack | `blackjack`, `bj` | `/minigames` → Select Blackjack | ✅ |
| Roulette | `roulette`, `roul` | `/minigames` → Select Roulette | ✅ |
| Slots | `slots`, `slot` | `/minigames` → Select Slots | ✅ |

### Betting Games (with Coins)

| Command | Aliases | Usage | Minimum Bet |
|---------|---------|-------|-------------|
| `/blackjack` `!blackjack` | `bj`, `21` | `/blackjack <bet>` | 10 coins |
| `/roulette` `!roulette` | `rl`, `spin` | `/roulette <bet>` | 10 coins |
| `/slots` `!slots` | `slot`, `slotmachine` | `/slots <bet>` | 10 coins |

### Relationship Commands

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/propose` `!propose` | - | `/propose @user` | Propose to another user |
| `/accept` `!accept` | - | `/accept @user` | Accept a proposal |
| `/reject` `!reject` | - | `/reject @user` | Reject a proposal |
| `/divorce` `!divorce` | - | `/divorce @user` | Divorce your spouse |
| `/spouse` `!spouse` | - | `/spouse [@user]` | View your spouse |
| `/couples` `!couples` | - | `/couples` | View all couples on server |

### Horse Racing

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/horserace` `!horserace` | `race`, `hr` | `/horserace [bet]` | Start a horse race |
| `/horserace history` `!horserace history` | `race history`, `hr history` | `/horserace history` | View race history |

### Other Entertainment

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/8ball` `!8ball` | - | `/8ball <question>` | Magic 8-ball responses |
| `/meme` `!meme` | - | `/meme` | Random Reddit meme (SFW) |
| `/poll` `!poll` | - | `/poll <question> <opt1\|opt2\|...>` | Up to 10 options |
| `/gamestats` `!gamestats` | `stats`, `gstats` | `/gamestats [@user]` | View game statistics |
| `/hello` `!hello` | - | `/hello` | Greeting from bot |
| `/rps` `!rps` | - | `/rps <rock\|paper\|scissors>` | Quick rock paper scissors |

---

## 💰 Economy & Rewards

### Balance & Account

| Command | Usage | Cooldown | Reward |
|---------|-------|----------|--------|
| `/balance` | `/balance [user]` | - | Check coins, level, XP |
| `/daily` | `/daily` | 24 hours | 1,000 coins |
| `/weekly` | `/weekly` | 7 days | 5,000 coins |

### Transfers

| Command | Aliases | Usage | Notes |
|---------|---------|-------|-------|
| `/transfer` `!transfer` | `send`, `give` | `/transfer @user <amount>` | Send coins to player |

### Shopping

| Command | Usage | Description |
|---------|-------|-------------|
| `/shop` | `/shop` | Browse and buy items |
| `/inventory` `!inventory` | `/inventory` | View purchased items |

### Leaderboards

| Command | Usage | Display |
|---------|-------|---------|
| `/leaderboard` | `/leaderboard [type]` | Top 10 by balance/level/XP |

### Economy System Details
- **XP Gain:** 5-15 XP per message (1-minute cooldown)
- **Level Formula:** `level = √(xp/100) + 1`
- **Auto-Reward:** `level × 100` coins on level up
- **Shop Items:** Roles, badges, and cosmetics

---

## 🛡️ Moderation

### Member Management

| Command | Aliases | Usage | Requires Permission |
|---------|---------|-------|---------------------|
| `/ban` `!ban` | - | `/ban <user> [reason]` | Ban Members |
| `/unban` `!unban` | - | `/unban <user-id>` | Ban Members |
| `/kick` `!kick` | - | `/kick <user> [reason]` | Kick Members |
| `/mute` `!mute` | - | `/mute <user> <duration>` | Moderate Members |
| `/untimeout` `!untimeout` | - | `/untimeout <user>` | Moderate Members |
| `/softban` `!softban` | - | `/softban <user> [reason]` | Ban Members |

### Warnings System

| Command | Usage | Description |
|---------|-------|-------------|
| `/warnings add` | `/warnings add <user> <reason>` | Add warning to user |
| `/warnings list` | `/warnings list <user>` | View user's warnings |
| `/warnings remove` | `/warnings remove <user> <id>` | Remove specific warning |
| `/warnings clear` | `/warnings clear <user>` | Clear all warnings |

### Channel Management

| Command | Aliases | Usage | Requires Permission |
|---------|---------|-------|---------------------|
| `/slowmode` `!slowmode` | - | `/slowmode <seconds> [channel]` | Manage Channels |
| `/lock` `!lock` | - | `/lock [channel]` | Manage Channels |
| `/unlock` `!unlock` | - | `/unlock [channel]` | Manage Channels |

### Message Management

| Command | Aliases | Usage | Requires Permission |
|---------|---------|-------|---------------------|
| `/purge` `!purge` | - | `/purge <2-100>` | Manage Messages |
| `/warn` `!warn` | - | `/warn <user> <reason>` | Manage Messages |

### Tickets & Support

| Command | Usage | Description |
|---------|-------|-------------|
| `/ticket` `!ticket` | `/ticket` | Create a support ticket |

### Custom Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `/customcmd add` `!customcmd add` | `/customcmd add <name> <response>` | Create custom command |
| `/customcmd delete` `!customcmd delete` | `/customcmd delete <name>` | Delete custom command |
| `/customcmd list` `!customcmd list` | `/customcmd list` | View all custom commands |

### Reaction Roles

| Command | Usage | Description |
|---------|-------|-------------|
| `/reactionrole add` `!reactionrole add` | `/reactionrole add <#channel> <message-id> <emoji> <@role>` | Add reaction role |
| `/reactionrole remove` `!reactionrole remove` | `/reactionrole remove <#channel> <message-id> <emoji>` | Remove reaction role |
| `/reactionrole list` `!reactionrole list` | `/reactionrole list [#channel]` | View reaction roles |

### Starboard

| Command | Usage | Description |
|---------|-------|-------------|
| `/starboard` `!starboard` | `/starboard` | View starboard |
| `/starboard set` `!starboard set` | `/starboard set #channel` | Set starboard channel |

### Logging

| Command | Usage | Description |
|---------|-------|-------------|
| `/logging enable` `!logging enable` | `/logging enable #channel` | Enable action logging |
| `/logging disable` `!logging disable` | `/logging disable` | Disable action logging |
| `/logging events` `!logging events` | `/logging events` | View loggable events |

### Welcome Card

| Command | Usage | Description |
|---------|-------|-------------|
| `/welcomecard enable` `!welcomecard enable` | `/welcomecard enable #channel` | Enable welcome cards |
| `/welcomecard disable` `!welcomecard disable` | `/welcomecard disable` | Disable welcome cards |
| `/welcomecard style` `!welcomecard style` | `/welcomecard style <name>` | Set welcome card style |

### Auto-Moderation

| Command | Usage | Description |
|---------|-------|-------------|
| `/automod enable` | `/automod enable` | Enable auto-moderation |
| `/automod disable` | `/automod disable` | Disable auto-moderation |
| `/automod antiinvite` | `/automod antiinvite <true/false>` | Toggle invite blocking |
| `/automod antispam` | `/automod antispam <true/false>` | Toggle spam detection |
| `/automod badwords` | `/automod badwords add <word>` | Add to bad words list |
| `/automod badwords` | `/automod badwords remove <word>` | Remove from list |
| `/automod settings` | `/automod settings` | View current settings |

### Moderation Logging

| Command | Usage | Description |
|---------|-------|-------------|
| `/modlog` | `/modlog <channel>` | Set moderation log channel |

### Auto-Mod Features
- **Anti-Spam:** 5+ messages in 5 seconds = 1 min timeout
- **Anti-Invite:** Blocks Discord invite links
- **Bad Words Filter:** Custom word blacklist
- **Max Mentions:** Limit mentions per message (default: 5)
- **Max Emojis:** Limit emojis per message (default: 10)

---

## ⚙️ Configuration

### Server Setup

| Command | Usage | Description |
|---------|-------|-------------|
| `/setup` `!setup` | `/setup` | Auto-create DJ and Member roles |

### Bot Settings

| Command | Usage | Description |
|---------|-------|-------------|
| `/config` `!config` | `/config` | View all settings |
| `/config prefix` | `/config prefix <new_prefix>` | Change command prefix (1-5 chars) |
| `/config reset` | `/config reset` | Reset to defaults |

### Welcome Messages

| Command | Usage | Placeholders |
|---------|-------|-------------|
| `/config welcomechannel` | `/config welcomechannel <#channel>` | Set welcome channel |
| `/config welcomemessage` | `/config welcomemessage <message>` | `{user}`, `{username}`, `{server}`, `{memberCount}` |
| `/config welcomeenable` | `/config welcomeenable` | Enable welcome messages |
| `/config welcomedisable` | `/config welcomedisable` | Disable welcome messages |

### Leave Messages

| Command | Usage | Placeholders |
|---------|-------|-------------|
| `/config leavechannel` | `/config leavechannel <#channel>` | Set leave channel |
| `/config leavemessage` | `/config leavemessage <message>` | `{user}`, `{server}`, `{memberCount}` |
| `/config leaveenable` | `/config leaveenable` | Enable leave messages |
| `/config leavedisable` | `/config leavedisable` | Disable leave messages |

### Role Settings

| Command | Usage | Description |
|---------|-------|-------------|
| `/config autorole` | `/config autorole <role_name>` | Auto-role for new members |
| `/config djrole` | `/config djrole <role_name>` | DJ role for music commands |

---

## 🔧 Utility

### Bot Information

| Command | Aliases | Usage | Returns |
|---------|---------|-------|---------|
| `/ping` `!ping` | - | `/ping` | Bot latency |
| `/server` `!server` | - | `/server` | Server info & stats |
| `/dashboard` `!dashboard` | - | `/dashboard` | Dashboard link |
| `/leave` `!leave` | - | `/leave` | Leave voice channel |
| `/help` `!help` | - | `/help` | Command list |

### User Information

| Command | Usage | Shows |
|---------|-------|-------|
| `/avatar` | `/avatar [user]` | User's high-res avatar |
| `/userinfo` | `/userinfo [user]` | User details & stats |
| `/roleinfo` | `/roleinfo <role>` | Role info & permissions |

### Server Statistics

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/stats` `!stats` | `statistics` | `/stats` | Server statistics |
| `/profile` `!profile` | `profile` | `/profile [@user]` | User profile card |

### Invites

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/invites` `!invites` | - | `/invites [@user]` | Show user's invite count |
| `/invitestats` `!invitestats` | - | `/invitestats` | View invite leaderboard |

### Prefix & Configuration

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/prefix` `!prefix` | - | `/prefix [new_prefix]` | View or change prefix |

### Giveaways

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `/giveaway` `!giveaway` | `gw` | `/giveaway <duration> <winners> <prize>` | Start giveaway |
| `/giveaway end` | - | `/giveaway end <message-id>` | End giveaway early |
| `/giveaway reroll` | - | `/giveaway reroll <message-id>` | Reroll giveaway winner |

---

## 📊 Statistics

### Command Breakdown

| Category | Prefix | Slash | Total |
|----------|--------|-------|-------|
| 🎵 Music | 16 | 4 | 20 |
| 🎮 Entertainment | 26 | 3 | 29 |
| 💰 Economy | 3 | 5 | 8 |
| 🛡️ Moderation | 23 | 7 | 30 |
| ⚙️ Configuration | 2 | 6 | 8 |
| 🔧 Utility | 14 | 8 | 22 |
| **TOTAL** | **84** | **33** | **117** |

### Feature Counts

- ✅ 84 Prefix Commands (all with `!`)
- ✅ 33 Slash Commands (all with `/`)
- ✅ 9 Mini Games (RPS, Guess, Trivia, TTT, Blackjack, Roulette, Slots, Coinflip, Dice)
- ✅ 3 Betting Games (Blackjack, Roulette, Slots)
- ✅ 6 Relationship Commands (Propose, Accept, Reject, Divorce, Spouse, Couples)
- ✅ 2 Horse Racing Commands (Race, Race History)
- ✅ 3 Reaction Role Commands
- ✅ 3 Starboard Commands
- ✅ 3 Welcome Card Commands
- ✅ 3 Custom Command Commands
- ✅ 3 Logging Commands
- ✅ 3 Ticket/Support Commands
- ✅ 3 Giveaway Commands
- ✅ 7 Auto-Mod Features
- ✅ 4 Warning Types
- ✅ Multi-Platform Support (YouTube, Spotify, SoundCloud)

---

## 💡 Usage Tips

### Quick Start Commands

```bash
# Check if bot is working
/ping  or  !ping

# See all commands
!help

# Setup your server
/setup  or  !setup

# View your balance
/balance

# Claim daily reward
/daily
```

### DJ Role Commands

These require DJ role (set with `!setup`):
- `/pause`, `/resume`, `/stop`, `/skip`
- `/loop`, `/previous`, `/autoplay`
- `/volume`, `/clear`, `/remove`, `/move`, `/swap`, `/shuffle`, `/jump`

**Exceptions:** Server owner, Administrator, or alone with bot

### Prefix vs Slash

**Both work identically:**
```
!play song          =  /play song
!balance            =  /balance
!config prefix !    =  /config prefix !
```

### Permissions Hierarchy

1. **Server Owner** - All access
2. **Administrator** - Config & moderation
3. **Moderator Role** - Moderation commands
4. **DJ Role** - Music control
5. **Regular Members** - Basic commands

### Betting System

- **Minimum Bet:** 10 coins
- **Blackjack:** 21 wins double bet, natural blackjack wins 2.5x
- **Roulette:** Various payouts (2:1 to 35:1)
- **Slots:** Variable payouts based on combinations

### Economy System

- **XP Sources:** Chat messages (5-15 per message)
- **Leveling:** Automatic progression with level-up rewards
- **Daily/Weekly:** Automatic coin bonuses
- **Shop:** Buy roles and cosmetics
- **Leaderboards:** Compete with server members

### Music Tips

- **Playlists:** Paste playlist URL to add all songs
- **Search:** Just type song name, bot finds it
- **Autoplay:** Auto-plays similar songs when queue ends
- **History:** Previous command shows last 10 songs
- **Queue Limit:** Typically 100+ songs
- **Supported Sites:** YouTube, Spotify, SoundCloud

### Entertainment & Games

**Mini Games:**
- Free to play, no coins required
- Tracks all wins/losses/ties
- `!gamestats` shows your record

**Betting Games:**
- Minimum bet: 10 coins
- Blackjack: Win doubles bet, natural blackjack wins 2.5x
- Roulette: Various odds (2:1 to 35:1)
- Slots: Random multiplier payouts

**Relationships:**
- `!propose @user` to marry someone
- Other users can `!accept` or `!reject`
- `!divorce` to end marriage
- Track server couples with `!couples`

**Horse Racing:**
- `!horserace [bet]` to enter races
- Bet on horse numbers 1-8
- `!horserace history` for past races

### Moderation Features

**Custom Commands:**
- Admins can create custom commands
- Useful for FAQs and automated responses
- `!customcmd add faq "Check <#channel>"`

**Reaction Roles:**
- Add roles by reacting to messages
- Perfect for role selection channels
- Setup with `!reactionrole add`

**Starboard:**
- Messages with reactions pinned to starboard
- Set with `!starboard set #starboard`
- Shows community favorites

**Welcome Cards:**
- Custom images when users join
- Set channel with `!welcomecard enable #channel`
- Multiple style options

**Tickets:**
- Users create support tickets
- Mods can manage and respond
- Automatic channel creation

**Logging:**
- Auto-logs mod actions and events
- Setup: `!logging enable #modlogs`
- Tracks bans, kicks, warns, etc.

### Utility Tips

**Invites:**
- Track who invited each member
- `!invites` shows your invite count
- `!invitestats` for server leaderboard

**Giveaways:**
- Easy prize distribution
- Automatic winner selection
- Can reroll or end early

**Profile:**
- Personal stat cards
- Shows level, coins, achievements
- Shareable with others

### Auto-Moderation

**Enabled Features:**
- ✅ Anti-Spam (5+ msgs/5 sec = timeout)
- ✅ Anti-Invite (blocks discord.gg links)
- ✅ Bad Words (custom list)
- ✅ Max Mentions (default 5)
- ✅ Max Emojis (default 10)

**Setup:**
```
/automod enable
/automod antiinvite true
/automod antispam true
/modlog #moderation
```

### Web Dashboard

- Access with `!dashboard` command
- Or visit dashboard URL directly
- Login with Discord OAuth2
- Manage server settings visually
- For Linux, see [DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)

---

## 🔗 Related Documentation

- **[README.md](README.md)** - Full bot documentation
- **[FEATURES.md](FEATURES.md)** - Feature details
- **[QUICKSTART.md](QUICKSTART.md)** - Setup guide
- **[CONFIG_GUIDE.md](CONFIG_GUIDE.md)** - Configuration guide
- **[DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)** - Dashboard setup
- **[NEW_FEATURES.md](NEW_FEATURES.md)** - Latest additions

---

**Last Updated:** February 8, 2026  
**Version:** 2.0 (Complete with Linux Support)  
Made with  using discord.js v14
