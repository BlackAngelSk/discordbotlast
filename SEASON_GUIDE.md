# Season Management System

The season management system allows administrators to create distinct seasons for their economy/leaderboard system. Each season maintains its own leaderboard and player statistics.

## Features

✅ **Create Seasons** - Admin-only command to create new seasonal economy periods  
✅ **Season Leaderboards** - Track player progress within each season  
✅ **Season Stats** - View detailed statistics for each season  
✅ **Archive Seasons** - End seasons and archive them with results  
✅ **Multiple Seasons** - Support for multiple seasons per guild  

## Commands

All commands are admin-only and use the prefix `!season`

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

View the top 10 players in a season by coins earned.

If no season is specified, shows the current active season.

**Response:**
- Top 10 players with medals (🥇🥈🥉)
- Coins earned and level
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
- **name**: Season identifier (e.g., "season-development")
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

Season names should follow this format:
- Lowercase letters only
- Numbers allowed
- Hyphens for word separation
- Example: `season-development`, `spring-2024`, `competitive-s1`

---

## Usage Examples

### Scenario 1: Start a New Competition Season

```
!season create season-march-2024
📊 Season Management Commands: 
✅ Season Created
Season Name: `season-march-2024`
Started: March 15, 2024
Status: 🟢 Active
```

### Scenario 2: Check Leaderboard Progress

```
!season leaderboard season-march-2024

🏆 Season Leaderboard: season-march-2024
🥇 @Player1 - 50,000 coins (Lvl 25)
🥈 @Player2 - 45,000 coins (Lvl 24)
🥉 @Player3 - 40,000 coins (Lvl 23)
4. @Player4 - 35,000 coins (Lvl 21)
...
```

### Scenario 3: End Season and Award Winners

```
!season end season-march-2024

🏁 Season Ended: season-march-2024
This season has been archived.

🏆 Top Winners
🥇 @Player1 - 50,000 coins
🥈 @Player2 - 45,000 coins
🥉 @Player3 - 40,000 coins

Total Players: 150
```

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
