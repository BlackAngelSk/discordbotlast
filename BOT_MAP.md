# 🗺️ Discord Bot Complete Architecture Map

## 📁 Project Overview
- **Name:** discord-bot v1.6.2
- **Author:** BlackAngelSK
- **Framework:** discord.js v14
- **Database:** MongoDB
- **Web Dashboard:** Express + EJS + Socket.IO
- **Languages:** English (en.json), Slovak (sk.json)

---

## 🎯 Entry Points & Configuration

### Core Files
| File | Purpose |
|------|---------|
| `index.js` | Main entry point (460 lines) - initializes all managers, handlers, starts bot |
| `.env` / `.env.example` | Environment configuration (DISCORD_TOKEN required) |
| `package.json` | Dependencies & npm scripts |
| `ecosystem.config.js` | PM2 cluster configuration |

### Startup Scripts
- `start.bat` / `start.sh` - Quick start
- `start_bot.bat` - Alternative start script
- `install.bat` / `install.sh` - Installation scripts

---

## 💬 Prefix Commands (`commands/`)

### Admin (28 files) - `commands/admin/`
```
addcoins.js          add economy currency to users
aipersona.js         AI personality configuration
announcement.js      Server announcements
backup.js            Database backup utility
betaaccess.js        Beta access management
botprefix.js         Set custom bot prefix
bumprule.js          Bump rule reminders
cleareconomy.js      Reset economy data
cleargamedata.js     Clear game statistics
epicgames.js         Epic Games alerts config
features.js          Feature toggles
giveexp.js           Grant XP to members
livealerts.js        Live event alerts
refreshicon.js       Refresh bot icon
reload.js            Reload commands
removecoins.js       Remove economy currency
reseteconomy.js      Reset server economy
resetwarnings.js     Clear member warnings
season.js            Season management
serverlanguage.js    Set server language
serverstats.js       Server statistics
setbalance.js        Set user balance
setreportchannel.js  Report channel config
statchannel.js       Stats display channel
steamfreegames.js    Steam free games alerts
steampromos.js       Steam promo alerts
steamupdates.js      Steam update alerts
xpevent.js           XP event configuration
```

### Economy (4 files) - `commands/economy/`
```
daily.js             Daily currency reward
leaderboard.js       Economy leaderboard
transfer.js          Transfer currency between users
weekly.js            Weekly currency reward
```

### Fun (32 files) - `commands/fun/`
```
2048.js              2048 puzzle game
accept.js            Couple acceptance
blackjack.js         Blackjack card game
coinflip.js          Coin flip mini-game
count.js             Counting game
couples.js           Couple system
dice.js              Dice rolling
divorce.js           Couple divorce
fish.js              Fishing mini-game
gamestats.js         Game statistics
hangman.js           Hangman word game
heist.js             Heist mini-game
hello.js             Greeting responses
horserace.js         Horse racing
horseracehistory.js  Race history
hunt.js              Hunting mini-game
mines.js             Minesweeper game
minigame.js          Generic minigame
pacman.js            Pac-Man clone
pet.js               Pet system
poker.js             Poker (single player)
poker.multiplayer.js Poker (multiplayer v1)
poker.multiplayer.v2.js Poker (multiplayer v2)
propose.js           Couple proposal
reject.js            Couple rejection
roulette.js          Roulette game
rps.js               Rock Paper Scissors
russianroulette.js   Russian roulette
showcards.js         Show hand cards
slots.js             Slot machine
spouse.js            Spouse system
tetris.js            Tetris game
ttt.js               Tic Tac Toe
wordle.js            Wordle word game
```

### Moderation (21 files) - `commands/moderation/`
```
ban.js               Ban member
clear.js             Clear messages
customcmd.js         Custom commands
kick.js              Kick member
lock.js              Lock channel
logging.js           Log channel config
purge.js             Bulk message delete
reactionrole.js      Reaction role setup
rolemenu.js          Role menu setup
starboard.js         Starboard system
sticky.js            Sticky messages
tempban.js           Temporary ban
tempvc.js            Temporary voice channel
ticket.js            Ticket system
timeout.js           Timeout member
unban.js             Unban member
unlock.js            Unlock channel
untimeout.js         Remove timeout
verification.js      Verification setup
warn.js              Warn member
welcomecard.js       Welcome card image
```

### Music (20 files) - `commands/music/`
```
247.js               24/7 voice mode
autoplay.js          Autoplay similar songs
filter.js            Audio filters
jump.js              Jump to song in queue
loop.js              Loop current/queue
lyrics.js            Show song lyrics
move.js              Move song in queue
nowplaying.js        Current track info
pause.js             Pause playback
play.js              Play music from URL/source
previous.js          Previous track
queue.js             View queue
remove.js            Remove songs
resume.js            Resume playback
shuffle.js           Shuffle queue
skip.js              Skip current track
stop.js              Stop player
swap.js              Swap songs in queue
volume.js            Adjust volume
```

### Utility (16 files) - `commands/utility/`
```
achievements.js      Achievement display
confess.js           Confession system
config.js            Server configuration
dashboard.js         Open web dashboard
giveaway.js          Giveaway system
help.js              Help command
invites.js           Invite tracking
invitestats.js       Detailed invite stats
leave.js             Leave server
ping.js              Latency check
prefix.js            Show current prefix
profile.js           User profile
rank.js              XP rank card
report.js            Report system
server.js            Server info
setup.js             Quick setup wizard
stats.js             Bot statistics
```

---

## ⚡ Slash Commands (`slashCommands/`)

### Admin (15 files) - `slashCommands/admin/`
```
auditlog.js          View audit logs
auditlogs.js         Audit log viewer
botstatus.js         Set bot status
command-permissions.js Command permission config
force-update-check.js Check for updates
force-update.js      Apply updates
leaderboard-channel.js Configure leaderboard channel
leaderboard-config.js Leaderboard settings
leaderboard-update.js Manual update
mongodb-space.js     MongoDB storage info
mongodb-sync.js      Force DB sync
roletemplate.js      Role templates
system-stats.js      System resources
testcommands.js      Test command list
testerror.js         Error test
welcomemessage.js    Welcome message config
```

### Economy (6 files) - `slashCommands/economy/`
```
balance.js           Check balance
daily.js             Daily reward
leaderboard.js       Global leaderboard
shop.js              Shop menu
transfer.js          Transfer currency
weekly.js            Weekly reward
```

### Fun (23 files) - `slashCommands/fun/`
```
8ball.js             Magic 8-ball
accept.js            Couple acceptance
blackjack.js         Blackjack
coinflip.js          Coin flip
count.js             Counting game
couples.js           Couple system
crash.js             Crash game
dice.js              Dice roll
divorce.js           Couple divorce
flappybird.js        Flappy Bird clone
horserace-sim.js     Horse race simulator
horserace.js         Horse racing
horseracehistory.js  Race history
meme.js              Meme generator
mines.js             Minesweeper
poker.js             Poker
propose.js           Proposal
reject.js            Rejection
roulette.js          Roulette
rps.js               Rock Paper Scissors
snake.js             Snake game
spouse.js            Spouse system
tetris.js            Tetris
ttt.js               Tic Tac Toe
```

---

## 🔧 Utils (~80 Manager Files)

### Core Infrastructure
| File | Purpose |
|------|---------|
| `commandHandler.js` | Prefix command dispatcher |
| `eventHandler.js` | Event loader & manager |
| `slashCommandHandler.js` | Slash command dispatcher |
| `databaseManager.js` | MongoDB connection & queries |
| `settingsManager.js` | Server settings storage |
| `languageManager.js` | i18n / localization |

### Economy & Progression
| File | Purpose |
|------|---------|
| `economyManager.js` | Currency, balance, transactions |
| `levelRewardsManager.js` | Level-up rewards |
| `shopManager.js` | Shop items & purchases |
| `gameStatsManager.js` | Game statistics tracking |
| `statsManager.js` | General stats collection |
| `seasonManager.js` | Seasonal competitions |
| `seasonLeaderboardManager.js` | Season leaderboards |

### Moderation & Logging
| File | Purpose |
|------|---------|
| `moderationManager.js` | Ban/kick/warn tracking |
| `ticketManager.js` | Ticket system |
| `raidProtectionManager.js` | Raid prevention |
| `loggingManager.js` | Activity logging |
| `auditLog.js` | Audit trail |

### Music System
| File | Purpose |
|------|---------|
| `MusicQueue.js` | Queue data structure |
| `musicPlaylistManager.js` | Playlist storage |
| `youtubeSearch.js` | YouTube search utility |
| `queues.js` | Shared queue Map |

### Games & Mini-games
| File | Purpose |
|------|---------|
| `pokerTableManager.js` | Multiplayer poker tables |
| `playingCards.js` | Card deck utilities |
| `horseRaceManager.js` | Horse race logic |
| `tetrisSession.js` | Tetris game session |
| `petManager.js` | Pet system |
| `heistManager.js` | Heist mini-game |

### Alerts & External APIs
| File | Purpose |
|------|---------|
| `steamFreeGamesAlertsManager.js` | Steam free games notifier |
| `steamGameUpdatesManager.js` | Steam game update alerts |
| `epicGamesAlertsManager.js` | Epic Games deals |
| `minecraftStatusManager.js` | Minecraft server status |
| `liveAlertsManager.js` | Live event alerts |

### System Utilities
| File | Purpose |
|------|---------|
| `errorHandler.js` | Error tracking & reporting |
| `logger.js` | Custom logging system |
| `cooldownManager.js` | Command cooldowns |
| `rateLimiter.js` | Rate limiting |
| `shutdownManager.js` | Graceful shutdown |
| `autoBackup.js` | Database backups |
| `updateNotifier.js` | Update notifications |
| `devMode.js` | Developer mode toggle |

### Additional Managers
- `achievementManager.js` - Achievement system
- `activityTracker.js` - User activity tracking
- `afkManager.js` - AFK detection
- `aiManager.js`, `enhancedAIManager.js` - AI features
- `analyticsManager.js` - Analytics tracking
- `betaAccess.js` - Beta access control
- `birthdayManager.js` - Birthday tracking
- `cardImageGenerator.js`, `cardBoardRenderer.js` - Card rendering
- `customCommandManager.js` - Custom commands
- `customRoleShop.js` - Role purchase shop
- `dashboardPermissionsManager.js` - Dashboard auth
- `discordFetch.js` - Discord API helpers
- `helpCatalog.js` - Help command catalog
- `helpers.js` - Utility functions
- `inputValidator.js` - Input validation
- `inviteManager.js` - Invite tracking
- `notificationManager.js` - Notifications
- `permissions.js` - Permission checks
- `reactionRoleManager.js` - Reaction roles
- `relationshipManager.js` - Couple/spouse system
- `reminderManager.js` - Reminders
- `roleMenuManager.js`, `roleTemplateManager.js` - Role management
- `scheduledMessagesManager.js` - Scheduled messages
- `serverMilestones.js` - Server milestones
- `slashCommandHandler.js` - Slash commands
- `starboardManager.js` - Starboard system
- `statChannelsManager.js` - Stat display channels
- `stickyMessages.js` - Sticky messages
- `suggestionManager.js` - Suggestions
- `systemStatsManager.js` - System monitoring
- `telegramSyncManager.js` - Telegram integration
- `tempVoiceManager.js` - Temp voice channels
- `verificationManager.js` - Verification system
- `voiceRewardsManager.js` - Voice activity rewards
- `welcomeMessageManager.js` - Welcome messages

---

## 📡 Events (`events/`)

| File | Trigger | Purpose |
|------|---------|---------|
| `ready.js` | Bot ready | Initialization tasks |
| `messageCreate.js` | New message | Command handling |
| `interactionCreate.js` | Slash commands | Interaction handling |
| `guildMemberAdd.js` | Member joins | Welcome messages |
| `guildMemberRemove.js` | Member leaves | Logging |
| `guildMemberUpdate.js` | Member update | Role changes |
| `voiceStateUpdate.js` | Voice change | Voice rewards/AFK |
| `reactionAdd.js` | Reaction added | Reaction roles/starboard |
| `reactionRemove.js` | Reaction removed | Cleanup |
| `messageDelete.js` | Message deleted | Logging |
| `messageUpdate.js` | Message edited | Logging |
| `birthdayChecker.js` | Scheduled | Birthday detection |
| `milestoneMemberAdd.js` | Member joins | Milestone tracking |
| `error.js` | Error thrown | Error handling |

---

## 🎨 Dashboard (`dashboard/`)

### Server & Routes
- `server.js` - Express server + Socket.IO (real-time updates)
- `routes.js` - API endpoints & middleware

### Views (26 EJS Templates in `views/`)
| Template | Purpose |
|----------|---------|
| `dashboard.ejs` | Main dashboard overview |
| `server-profile.ejs` | Server details page |
| `server-profile-public.ejs` | Public server profile |
| `economy.ejs` | Economy settings |
| `moderation.ejs` | Moderation config |
| `community.ejs` | Community features |
| `steam-updates.ejs` | Steam update alerts |
| `steam-promos.ejs` | Steam promo alerts |
| `steam-free-games.ejs` | Free games alerts |
| `live-alerts.ejs` | Live event config |
| `voice-tools.ejs` | Voice channel tools |
| `shop.ejs` | Custom role shop |
| `permissions.ejs` | Permission settings |
| `automod.ejs` | Auto-moderation |
| `safety.ejs` | Safety features |
| `commands.ejs` | Command config |
| `activity.ejs` | Activity tracking |
| `analytics.ejs` | Analytics dashboard |
| `global-leaderboard.ejs` | Global rankings |
| `health.ejs` | Health monitoring |
| `owner-settings.ejs` | Owner controls |
| `telegram-sync.ejs` | Telegram integration |
| `index.ejs` | Login page |

### Partials (`views/partials/`)
- `dashboard-common-scripts.ejs` - Shared JavaScript

---

## 🧪 Tests & Scripts

### Tests (`tests/`)
```
cooldowManager.test.js    Cooldown tests
economyManager.test.js    Economy tests
helpers.test.js           Helper function tests
inputValidator.test.js    Input validation tests
moderationManager.test.js Moderation tests
rateLimiter.test.js       Rate limiter tests
run-all.js                Run all tests
test_updater.py           Python updater test
```

### Scripts (`scripts/`)
```
bot-watcher.sh            Process watcher
lvl.js                    Level testing
test-steam-update-dates.js Steam date validation
tmp_validate_patched_commands.js Command validation
```

### Self Updater (`self updater/`)
```
updater.py                Python update script
start_updater.bat         Windows launcher
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `SETUP.md` | Installation guide |
| `GUIDE.md` | Feature guide |
| `QUICK_REFERENCE.md` | Quick commands reference |
| `COMMANDS.md` | Full command list |
| `MONGODB.md` | MongoDB setup |
| `SECURITY_AUDIT.md` | Security review |

---

## 🎴 Assets (`assets/`)

### Cards (`assets/cards/`)
Standard playing card images (C2-C14, D2-D14, H2-H14, S2-S14)

### Icons
- `bot-icon.svg` - Bot profile icon

---

## 🔑 Key Dependencies (`package.json`)

```json
{
  "discord.js": "^14.14.1",      // Discord API
  "mongodb": "^6.21.0",           // Database
  "express": "^5.2.1",            // Web server
  "ejs": "^4.0.1",                // Templates
  "socket.io": "^4.8.3",          // Real-time
  "@distube/ytdl-core": "^4.16.12", // Music
  "@google/generative-ai": "^0.24.1", // AI
  "passport-discord": "^0.1.4"    // OAuth
}
```

---

## 🔄 Startup Flow (index.js)

1. **Lock Check** - Prevent multiple instances
2. **Env Validation** - Check required variables
3. **Initialize Managers** - Database, settings, economy, etc.
4. **Load Handlers** - Commands, events, slash commands
5. **Register Slash Commands** - Discord API sync
6. **Start Dashboard** - Web interface (if enabled)
7. **Login to Discord** - Connect to bot gateway
8. **Ready Tasks** - Season updates, notifications

---

## 📊 Bot Features Summary

| Category | Count |
|----------|-------|
| Prefix Commands | 121 files |
| Slash Commands | 44 files |
| Utils/Managers | ~80 files |
| Events | 17 files |
| Dashboard Views | 26 templates |
| Games & Mini-games | 50+ |

**Total:** 300+ files across a full-featured Discord bot ecosystem.
