# 📖 Complete Command Reference

**Total Commands:** 117+ (All available as both prefix and slash commands)

**Quick Links:**
- [Music](#-music-commands) | [Games](#-games--entertainment) | [Economy](#-economy--leveling) | [Moderation](#-moderation) | [Utility](#-utility) | [Premium](#-premium-features) | [AI](#-ai-features)

---

## 🎵 Music Commands

### Basic Playback

| Command | Usage | Description | Requires DJ |
|---------|-------|-------------|------------|
| `/play` `!play` | `/play <song/URL>` | Play from YouTube, Spotify, SoundCloud | ❌ |
| `/pause` `!pause` | `/pause` | Pause current song | ✅ |
| `/resume` `!resume` | `/resume` | Resume playback | ✅ |
| `/stop` `!stop` | `/stop` | Stop and clear queue | ✅ |
| `/skip` `!skip` | `/skip` | Skip to next song | ✅ |
| `/nowplaying` `!nowplaying` | `/nowplaying` | Show current song (alias: `np`) | ❌ |
| `/leave` `!leave` | `/leave` | Leave voice channel | ✅ |

### Queue Management

| Command | Usage | Description | Requires DJ |
|---------|-------|-------------|------------|
| `/queue` `!queue` | `/queue` | Show music queue | ❌ |
| `/clear` `!clear` | `/clear` | Clear entire queue | ✅ |
| `/remove` `!remove` | `/remove <position>` | Remove song at position | ✅ |
| `/move` `!move` | `/move <from> <to>` | Move song to new position | ✅ |
| `/swap` `!swap` | `/swap <pos1> <pos2>` | Swap two songs | ✅ |
| `/shuffle` `!shuffle` | `/shuffle` | Randomize queue order | ✅ |
| `/jump` `!jump` | `/jump <position>` | Jump to specific song | ✅ |

### Advanced Features

| Command | Usage | Description | Requires DJ |
|---------|-------|-------------|------------|
| `/loop` `!loop` | `/loop <off\|song\|queue>` | Set loop mode | ✅ |
| `/previous` `!previous` | `/previous` | Play previous song | ✅ |
| `/autoplay` `!autoplay` | `/autoplay` | Toggle autoplay mode | ✅ |
| `/volume` `!volume` | `/volume <0-200>` | Set volume | ✅ |
| `/lyrics` `!lyrics` | `/lyrics [song name]` | Get song lyrics | ❌ |

### Music Playlists

| Command | Usage | Description |
|---------|-------|-------------|
| `/playlist create` | `/playlist create <name>` | Create new playlist |
| `/playlist list` | `/playlist list` | View your playlists |
| `/playlist add` | `/playlist add <playlist>` | Add current song to playlist |
| `/playlist load` | `/playlist load <playlist>` | Load playlist to queue |
| `/playlist remove` | `/playlist remove <playlist> <position>` | Remove song from playlist |
| `/playlist delete` | `/playlist delete <playlist>` | Delete playlist |
| `/playlist public` | `/playlist public <playlist>` | Make playlist public |
| `/playlist browse` | `/playlist browse` | Browse public playlists |
| `/playlist recommend` | `/playlist recommend` | Get song recommendations |

**Supported Platforms:**
- ✅ YouTube (videos & playlists)
- ✅ Spotify (converts to YouTube)
- ✅ SoundCloud
- ✅ Direct search

---

## 🎮 Games & Entertainment

### Mini Games Menu

| Command | Usage | Description |
|---------|-------|-------------|
| `/minigames` `!minigames` | `/minigames` | Open interactive game menu |

**Available Games:** Rock Paper Scissors, Number Guessing, Trivia, Tic-Tac-Toe, Blackjack, Roulette, Slots

### Betting Games (Win Coins!)

| Command | Usage | Min Bet | Description |
|---------|-------|---------|-------------|
| `/blackjack` `!blackjack` | `/blackjack <bet>` | 10 coins | Play 21 against dealer |
| `/roulette` `!roulette` | `/roulette <bet> <red\|black\|green\|number>` | 10 coins | Spin the wheel |
| `/slots` `!slots` | `/slots <bet>` | 10 coins | Slot machine |
| `/coinflip` `!coinflip` | `/coinflip <bet> <heads\|tails>` | 10 coins | Flip a coin |

### Other Fun Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `/8ball` `!8ball` | `/8ball <question>` | Magic 8-ball answers |
| `/meme` `!meme` | `/meme` | Random meme from Reddit |
| `/poll` `!poll` | `/poll <question> <opt1\|opt2\|...>` | Create poll (up to 10 options) |
| `/avatar` `!avatar` | `/avatar [@user]` | Get user's avatar |
| `/gamestats` `!gamestats` | `/gamestats [@user]` | View game statistics |

### Relationship System

| Command | Usage | Description |
|---------|-------|-------------|
| `/propose` `!propose` | `/propose @user` | Propose to another user |
| `/accept` `!accept` | `/accept @user` | Accept a proposal |
| `/reject` `!reject` | `/reject @user` | Reject a proposal |
| `/divorce` `!divorce` | `/divorce @user` | End marriage |
| `/spouse` `!spouse` | `/spouse [@user]` | View spouse info |
| `/couples` `!couples` | `/couples` | View all server couples |

### Horse Racing

| Command | Usage | Description |
|---------|-------|-------------|
| `/horserace` `!horserace` | `/horserace [bet]` | Start a horse race |
| `/horserace history` | `/horserace history` | View race history |

---

## 💰 Economy & Leveling

### Balance & Info

| Command | Usage | Description |
|---------|-------|-------------|
| `/balance` `!balance` | `/balance [@user]` | Check coins, level, XP |
| `/leaderboard` `!leaderboard` | `/leaderboard [type]` | Top users (balance/level/xp) |
| `/level` `!level` | `/level [@user]` | Check level and XP |

### Daily Rewards

| Command | Usage | Reward | Cooldown |
|---------|-------|--------|----------|
| `/daily` `!daily` | `/daily` | 1,000 coins | 24 hours |
| `/weekly` `!weekly` | `/weekly` | 5,000 coins | 7 days |
| `/monthly` `!monthly` | `/monthly` | 20,000 coins | 30 days |

### Transactions

| Command | Usage | Description |
|---------|-------|-------------|
| `/transfer` `!transfer` | `/transfer @user <amount>` | Send coins to someone |
| `/pay` `!pay` | `/pay @user <amount>` | Same as transfer |

### Shop System

| Command | Usage | Description |
|---------|-------|-------------|
| `/shop` `!shop` | `/shop` | View items for sale |
| `/buy` `!buy` | `/buy <item>` | Purchase an item |
| `/inventory` `!inventory` | `/inventory [@user]` | View inventory |

**Default Shop Items:**
- VIP Role - 10,000 coins
- Premium Badge - 15,000 coins
- Custom Color Role - 5,000 coins

**Admins can add items:**
```
!shop add <name> <price> <description>
!shop remove <item-id>
```

### Level Rewards

| Command | Usage | Description |
|---------|-------|-------------|
| `/levelrewards set` | `/levelrewards set <level> <role/coins> <value>` | Set level reward |
| `/levelrewards list` | `/levelrewards list` | View all rewards |
| `/levelrewards remove` | `/levelrewards remove <level>` | Remove reward |

**How Leveling Works:**
- Earn 5-15 XP per message (1 minute cooldown)
- Formula: `level = √(xp/100) + 1`
- Auto-rewards: Level × 100 coins on level up

---

## 🛡️ Moderation

### Member Actions

| Command | Usage | Required Permission |
|---------|-------|-------------------|
| `/ban` `!ban` | `/ban @user [reason]` | Ban Members |
| `/unban` `!unban` | `/unban <user-id> [reason]` | Ban Members |
| `/kick` `!kick` | `/kick @user [reason]` | Kick Members |
| `/mute` `!mute` | `/mute @user <duration> [reason]` | Moderate Members |
| `/timeout` `!timeout` | `/timeout @user <minutes> [reason]` | Moderate Members |
| `/untimeout` `!untimeout` | `/untimeout @user` | Moderate Members |
| `/softban` `!softban` | `/softban @user [reason]` | Ban Members |

**Duration formats:** `10m`, `2h`, `1d`, `1w`

### Warning System

| Command | Usage | Description |
|---------|-------|-------------|
| `/warnings add` | `/warnings add @user <reason>` | Add warning to user |
| `/warnings list` | `/warnings list @user` | View user's warnings |
| `/warnings remove` | `/warnings remove @user <id>` | Remove specific warning |
| `/warnings clear` | `/warnings clear @user` | Clear all warnings |

### Channel Management

| Command | Usage | Required Permission |
|---------|-------|-------------------|
| `/lock` `!lock` | `/lock [#channel]` | Lock channel | Manage Channels |
| `/unlock` `!unlock` | `/unlock [#channel]` | Unlock channel | Manage Channels |
| `/slowmode` `!slowmode` | `/slowmode <seconds> [#channel]` | Set slowmode (0-21600s) | Manage Channels |
| `/purge` `!purge` | `/purge <amount> [@user]` | Delete messages (1-100) | Manage Messages |

### Auto-Moderation

| Command | Usage | Description |
|---------|-------|-------------|
| `/automod enable` | `/automod enable` | Enable auto-mod |
| `/automod disable` | `/automod disable` | Disable auto-mod |
| `/automod antiinvite` | `/automod antiinvite <true\|false>` | Block invite links |
| `/automod antispam` | `/automod antispam <true\|false>` | Detect spam |
| `/automod badwords add` | `/automod badwords add <word>` | Add banned word |
| `/automod badwords remove` | `/automod badwords remove <word>` | Remove banned word |
| `/automod badwords list` | `/automod badwords list` | Show banned words |
| `/automod settings` | `/automod settings` | View current config |

**Auto-Mod Features:**
- Anti-invite (blocks Discord links)
- Anti-spam (5+ messages in 5s = 1min timeout)
- Bad word filter
- Max mentions limit (default: 5)
- Max emojis limit (default: 10)

### Moderation Logging

| Command | Usage | Description |
|---------|-------|-------------|
| `/modlog` `!modlog` | `/modlog <#channel>` | Set mod log channel |
| `/modlogs` `!modlogs` | `/modlogs [@user]` | View mod actions |

---

## 🔧 Utility

### Server Info

| Command | Usage | Description |
|---------|-------|-------------|
| `/server` `!server` | `/server` | Server information |
| `/userinfo` `!userinfo` | `/userinfo [@user]` | User information |
| `/roleinfo` `!roleinfo` | `/roleinfo <@role>` | Role information |
| `/avatar` `!avatar` | `/avatar [@user]` | Get user avatar |

### Bot Info

| Command | Usage | Description |
|---------|-------|-------------|
| `/ping` `!ping` | `/ping` | Bot latency |
| `/help` `!help` | `/help [command]` | Command help |
| `/dashboard` `!dashboard` | `/dashboard` | Get dashboard link |

### Configuration

| Command | Usage | Description | Admin Only |
|---------|-------|-------------|-----------|
| `/setup` `!setup` | `/setup` | Create DJ & Member roles | ✅ |
| `/config` `!config` | `/config [setting] [value]` | View/change settings | ✅ |

**Config Options:**
- `prefix <prefix>` - Change command prefix
- `language <en\|sk>` - Set language
- `welcomechannel <#channel>` - Set welcome channel
- `welcomemessage <message>` - Set welcome message
- `welcomeenable` / `welcomedisable` - Toggle welcome
- `leavechannel <#channel>` - Set leave channel
- `leavemessage <message>` - Set leave message
- `leaveenable` / `leavedisable` - Toggle leave
- `autorole <role>` - Set auto-role for new members
- `djrole <role>` - Set DJ role
- `reset` - Reset all settings

**Placeholders for messages:**
- `{user}` - Mentions the user
- `{username}` - Username without mention
- `{server}` - Server name
- `{memberCount}` - Member count

### AFK System

| Command | Usage | Description |
|---------|-------|-------------|
| `/afk` `!afk` | `/afk [reason]` | Set AFK status |
| `/afk remove` `!afk remove` | `/afk remove` | Remove AFK |

---

## 💎 Premium Features

### Premium Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `/premium info` | `/premium info` | View all tiers |
| `/premium subscribe` | `/premium subscribe <tier>` | Subscribe to tier |
| `/premium status` | `/premium status` | Check subscription |
| `/premium features` | `/premium features` | View your features |
| `!premium-setup info` | `!premium-setup info` | Admin: View tiers |
| `!premium-setup check` | `!premium-setup check @user` | Admin: Check user tier |

**Premium Tiers:**

| Feature | Basic ($2.99) | Pro ($5.99) | Elite ($9.99) |
|---------|--------------|------------|--------------|
| Custom Commands | 10 | 25 | 100 |
| Shop Slots | 5 | 15 | 50 |
| Monthly Bonus | 500 coins | 1,500 coins | 3,000 coins |
| Exclusive Games | ❌ | 3 games | All games |
| Priority Support | ❌ | ✅ | ✅ |
| Custom Bot | ❌ | ❌ | 1 slot |

---

## 📊 Analytics

| Command | Usage | Description |
|---------|-------|-------------|
| `/analytics server` | `/analytics server` | Server overview |
| `/analytics commands` | `/analytics commands` | Command usage stats |
| `/analytics user` | `/analytics user @member` | User activity stats |

**What's Tracked:**
- Command usage & success rates
- Message counts
- Member activity
- Engagement scores
- Daily trends

**Dashboard Access:**
- `http://localhost:3000/dashboard/:guildId/analytics`

---

## 🔔 Announcements

| Command | Usage | Description |
|---------|-------|-------------|
| `/announce schedule` | `/announce schedule <#channel> <message> <time>` | Schedule announcement |
| `/announce send` | `/announce send <#channel> <message>` | Send immediately |
| `/announce list` | `/announce list` | View scheduled |
| `/announce cancel` | `/announce cancel <id>` | Cancel announcement |

**Time formats:** `18:30`, `2024-12-25 15:00`, `in 2 hours`

---

## 🤖 AI Features

**Requires:** `GOOGLE_API_KEY` in `.env`

| Command | Usage | Description |
|---------|-------|-------------|
| `/ai ask` | `/ai ask <question>` | Chat with AI |
| `/ai analyze` | `/ai analyze <content>` | Analyze content safety |
| `/ai suggest-commands` | `/ai suggest-commands <server-type>` | Get command suggestions |

**AI Capabilities:**
- Natural language chat
- Toxicity detection (0-100%)
- Content safety assessment
- Smart server insights
- Moderation suggestions

---

## 📝 Custom Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `/customcommand add` | `/customcommand add <name> <response>` | Create custom command |
| `/customcommand remove` | `/customcommand remove <name>` | Delete custom command |
| `/customcommand list` | `/customcommand list` | View all custom commands |
| `/customcommand edit` | `/customcommand edit <name> <new-response>` | Edit command |

**Limits:**
- Free: 5 custom commands
- Basic Premium: 10 commands
- Pro Premium: 25 commands
- Elite Premium: 100 commands

---

## 🎟️ Tickets & Suggestions

### Ticket System

| Command | Usage | Description |
|---------|-------|-------------|
| `/ticket create` | `/ticket create <reason>` | Create support ticket |
| `/ticket close` | `/ticket close` | Close current ticket |
| `/ticket add` | `/ticket add @user` | Add user to ticket |
| `/ticket remove` | `/ticket remove @user` | Remove user from ticket |

### Suggestions

| Command | Usage | Description |
|---------|-------|-------------|
| `/suggest` | `/suggest <suggestion>` | Submit suggestion |
| `/suggestion approve` | `/suggestion approve <id>` | Approve suggestion (admin) |
| `/suggestion deny` | `/suggestion deny <id>` | Deny suggestion (admin) |

---

## 🎁 Giveaways

| Command | Usage | Description |
|---------|-------|-------------|
| `/giveaway start` | `/giveaway start <duration> <winners> <prize>` | Start giveaway |
| `/giveaway end` | `/giveaway end <message-id>` | End giveaway early |
| `/giveaway reroll` | `/giveaway reroll <message-id>` | Reroll winner |
| `/giveaway list` | `/giveaway list` | View active giveaways |

---

## 🗳️ Reaction Roles

| Command | Usage | Description |
|---------|-------|-------------|
| `/reactionrole create` | `/reactionrole create <message-id> <emoji> <@role>` | Add reaction role |
| `/reactionrole remove` | `/reactionrole remove <message-id> <emoji>` | Remove reaction role |
| `/reactionrole list` | `/reactionrole list` | View all reaction roles |

---

## ⏰ Scheduled Messages

| Command | Usage | Description |
|---------|-------|-------------|
| `/schedule add` | `/schedule add <#channel> <message> <time>` | Schedule message |
| `/schedule list` | `/schedule list` | View scheduled |
| `/schedule remove` | `/schedule remove <id>` | Remove scheduled message |

---

## 📌 Command Tips

### Quick Reference

**Help:**
- `/help` - Full command list
- `/help <command>` - Specific command info

**Permissions:**
- Most moderation commands require `Administrator`
- Music DJ commands require DJ role (or be alone with bot)
- Economy commands work for everyone

**Aliases:**
- Many commands have shortcuts (e.g., `!np` = `!nowplaying`)
- Both `/` and `!` work for all commands

**Best Practices:**
- Use `/setup` first when adding bot to new server
- Configure auto-mod with `/automod enable`
- Set up welcome messages for better engagement
- Check `/premium info` for advanced features

---

**Total Commands:** 117+  
**Categories:** 12  
**Slash Commands:** All  
**Prefix Commands:** All  

For setup instructions, see **SETUP.md**  
For features and guides, see **GUIDE.md**
