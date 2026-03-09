# Season Management System

The season management system allows administrators to create distinct seasons for their economy/leaderboard system. Each season maintains its own leaderboard and player statistics.

## Features

✅ **Create Seasons** - Admin-only command to create new seasonal economy periods  
✅ **Season Leaderboards** - Track player progress within each season  
✅ **Season Stats** - View detailed statistics for each season  
✅ **Archive Seasons** - End seasons and archive them with results  
✅ **Multiple Seasons** - Support for multiple seasons per guild  

## Commands

Season management commands are admin-only and use the prefix `!season`. Leaderboard panel controls are available via slash commands (for example `/leaderboard-channel`, `/leaderboard-config`, `/leaderboard-update`).

### Create a New Season

```
!season create <season-name>
```

Creates a new season. Season names should use lowercase letters, numbers, and hyphens.

**Example:**
```
!season create season-development
!season create season-spring-2024
!season create competitive-mode
```

**Response:**
- Confirmation embed showing season created
- Season name in backticks
- Creation timestamp

---

### List All Seasons

```
!season list
```

Shows all seasons in the guild with their status.

**Response:**
- All active and archived seasons
- Player count per season
- Status indicator (🟢 Active / 🔴 Ended)
- ⭐ marks the current active season

---

### Get Season Information

```
!season info <season-name>
```

Get detailed statistics about a specific season.

**Response includes:**
- Season name
- Status (Active/Ended)
- Total players
- Total balance across all players
- Total XP earned
- Total coins earned in season
- Creation date
- Creator

**Example:**
```
!season info season-development
```

---

### View Season Leaderboard

```
!season leaderboard [season-name]
```

View the top 10 players in a season by balance.

If no season is specified, shows the current active season.

**Response:**
- Top 10 players with medals (🥇🥈🥉)
- Balance and level
- Total player count

**Examples:**
```
!season leaderboard                    # Current season
!season leaderboard season-development # Specific season
```

---

### End/Archive a Season

```
!season end <season-name>
```

Ends a season and archives it. Shows the top 3 winners.

⚠️ **Warning:** This action cannot be undone!

**Response:**
- Confirmation that season ended
- Top 3 winners with medal emojis
- Total players in season

**Example:**
```
!season end season-development
```

---

### Help

```
!season
```

Shows all available season commands.

---

## How It Works

### Season Creation

When you create a season:
1. Season data is stored with a unique name
2. The season is marked as "Active"
3. New leaderboard for that season is created
4. Automatically set as current season for the guild

### Season Data Structure

Each season tracks:
- **name**: Season identifier (e.g., "spring-2026", "summer-2026")
- **isActive**: Whether season is currently active
- **startDate**: When season was created
- **endDate**: When season ended (if archived)
- **totalPlayers**: Number of players who participated
- **leaderboard**: Individual player stats:
  - `balance`: Total coins balance
  - `xp`: Experience points
  - `level`: Player level
  - `coins`: Coins earned this season
  - `lastUpdated`: Last update timestamp

### Naming Convention

**Automatic Quarterly Seasons:**
The bot automatically creates and manages quarterly seasons. Seasons are named in this format:
- `spring-{year}` (March-May)
- `summer-{year}` (June-August)
- `fall-{year}` (September-November)
- `winter-{year}` (December-February)

Example: `spring-2026`, `summer-2026`, `fall-2026`, `winter-2026`

**Custom Named Seasons:**
For manually created seasons, names should follow this format:
- Lowercase letters only
- Numbers allowed
- Hyphens for word separation
- Example: `season-development`, `competitive-s1`

### Automatic Quarterly Season Management

The bot automatically:
1. **Detects quarter changes** - Checks every 6 hours if the quarter has changed
2. **Creates new seasons** - When a new quarter arrives (Jan 1, Apr 1, Jul 1, Oct 1)
3. **Archives previous seasons** - Automatically ends the old season
4. **Auto-enrolls members** - New members are automatically added to the current quarterly season
5. **Distributes rewards** - Season winners receive payouts and reward roles (if configured)

No admin action needed for seasonal rollover—it happens automatically!

---

## Usage Examples

### Scenario 1: Automatic Seasonal Rollover

```
📅 March 21, 2026 - New Season Detected
✅ Auto-archived season "winter-2026"
✅ Created quarterly season "spring-2026"
📝 All members automatically enrolled in spring-2026
```

### Scenario 2: Check Current Season Progress

```
!season leaderboard

🏆 Season Leaderboard: spring-2026
🥇 @Player1 - 50,000 coins (Lvl 25)
🥈 @Player2 - 45,000 coins (Lvl 24)
🥉 @Player3 - 40,000 coins (Lvl 23)
4. @Player4 - 35,000 coins (Lvl 21)
...
```

### Scenario 3: End Season Early (Manual)

```
!season end spring-2026

🏁 Season Ended: spring-2026
This season has been archived.

🏆 Top Winners
🥇 @Player1 - 50,000 coins
🥈 @Player2 - 45,000 coins
🥉 @Player3 - 40,000 coins

Total Players: 150
```

---

## Automatic Quarterly Scheduling

### How It Works

The bot includes a built-in quarterly season scheduler:

- **Check Frequency**: Every 6 hours (after bot startup)
- **Action Frequency**: Once per 24-hour period
- **Quarters**: Spring, Summer, Fall, Winter (based on calendar months)
- **Zero Configuration**: Automatically handles all guild servers

### Quarterly Dates

| Quarter | Months | Start Date | Season Name |
|---------|--------|-----------|------------|
| Spring | Mar-May | March 1 | spring-{year} |
| Summer | Jun-Aug | June 1 | summer-{year} |
| Fall | Sep-Nov | September 1 | fall-{year} |
| Winter | Dec-Feb | December 1 | winter-{year} |

### What Happens Automatically

When a new quarter begins:

1. ✅ Old season is **automatically ended and archived**
2. ✅ New quarterly season is **created** (e.g., "spring-2026")
3. ✅ All guild members are **auto-enrolled** with current stats
4. ✅ Payouts and reward roles are **distributed to winners** from the previous season
5. ✅ Fresh leaderboard tracking **starts** for the new quarter

### Disabling Auto-Scheduling (Optional)

To use only manual season creation, you would need to:
1. Remove/disable the quarterly scheduler from bot startup
2. Manually create seasons with `!season create <name>`

Contact your server admin if you need custom season timing.

---

## Configuration

### Storing Season Data

Season data is stored in two ways:

1. **JSON Files** (Fallback)
   - Location: `data/seasons.json`
   - Used when MongoDB is not available

2. **MongoDB** (Recommended)
   - Collection: `seasons`
   - Document structure matches JSON format

### Season File Location

If using JSON storage:
```
data/seasons.json
```

Structure:
```json
{
  "seasons": {
    "guild-id": {
      "season-name": {
        "name": "season-development",
        "guildId": "123456789",
        "isActive": true,
        "startDate": "2024-02-19T...",
        "leaderboard": {
          "user-id": {
            "userId": "user-id",
            "balance": 10000,
            "xp": 5000,
            "level": 10,
            "coins": 5000
          }
        }
      }
    }
  },
  "currentSeason": {
    "guild-id": "season-development"
  }
}
```

---

## Integration with Economy System

The season system is designed to work alongside the economy system:

- Player earnings are tracked in the main economy manager
- Seasons capture snapshots of player progress
- Multiple seasons can run concurrently on different guilds
- Season leaderboards display coins earned during that season

---

## Admin Permissions Required

All season commands require the **Administrator** permission.

To use season commands, the user must have:
- ✅ Administrator role or permission
- ✅ Message send permissions in the channel

---

## Troubleshooting

### "Season already exists"
You tried to create a season with a name that already exists.
- **Solution**: Use a different name or end the existing season first.

### "Season not found"
The season name doesn't exist in this guild.
- **Solution**: Check spelling or use `!season list` to see available seasons.

### "No active season"
There's no current active season.
- **Solution**: Create one with `!season create <name>`

### Data not updating
Player stats might not be updating in real-time.
- **Solution**: Seasons are updated when players claim daily rewards or complete games. Data is saved to MongoDB.

---

## Best Practices

1. **Use Descriptive Names**
   ```
   ✅ season-spring-2024
   ❌ s1
   ```

2. **End Old Seasons**
   - Archive seasons when they expire
   - Keeps data organized

3. **Check Leaderboards Regularly**
   - Monitor player progress
   - Engage with top players

4. **Backup Data**
   - Export season data before deletion
   - Keep MongoDB backups enabled

---

## API Reference

For developers integrating with the season system:

```javascript
const seasonManager = require('./utils/seasonManager');

// Create season
await seasonManager.createSeason(guildId, name, adminId);

// Get current season
seasonManager.getCurrentSeason(guildId);

// Get season
seasonManager.getSeason(guildId, seasonName);

// Record player stats
await seasonManager.recordPlayerStats(guildId, seasonName, userId, stats);

// Get leaderboard
seasonManager.getSeasonLeaderboard(guildId, seasonName, sortBy, limit);

// Get summary
seasonManager.getSeasonSummary(guildId, seasonName);

// End season
await seasonManager.endSeason(guildId, seasonName);
```

---

## Related Commands

- `!leaderboard` - View main guild leaderboard
- `!economy` - View economy stats
- `!daily` - Claim daily coins (recorded in current season)
- `!weekly` - Claim weekly coins (recorded in current season)

---

For more help, contact an administrator or check bot documentation.
