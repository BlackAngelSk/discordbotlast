# Season Management System - Quick Start

## What's New?

A complete **Season Management System** has been added to your Discord bot! 🎉

### What It Does

- **Create Seasons**: Admins can create distinct seasonal economy periods (e.g., "season-development", "spring-2024")
- **Track Progress**: Each season has its own leaderboard tracking player coins earned
- **View Stats**: Get detailed info about any season including total players and earnings
- **Archive Seasons**: End seasons and view final rankings with medals for top winners

### Admin Commands

```
!season create <name>         - Create new season (e.g., !season create season-development)
!season list                  - Show all seasons for this guild
!season info <name>           - Get detailed season statistics
!season leaderboard [name]    - Show top 10 players in a season
!season end <name>            - End and archive a season
!season                       - Show help menu
```

## Quick Example

```bash
# Create a new season
!season create season-march-2024

# Check leaderboard
!season leaderboard season-march-2024

# Get info
!season info season-march-2024

# End season when finished
!season end season-march-2024
```

## Features

✅ **Admin Only** - Only administrators can create/manage seasons  
✅ **Multiple Seasons** - Different seasons per guild  
✅ **Auto Tracking** - Automatically tracks player progress  
✅ **Beautiful Embeds** - Colorful Discord embed responses  
✅ **MongoDB Compatible** - Data stored in MongoDB or JSON  
✅ **Medal Rankings** - 🥇🥈🥉 for top 3 winners  

## Files Created

1. **`utils/seasonManager.js`** - Core season management logic
2. **`commands/admin/season.js`** - Admin command for managing seasons
3. **`SEASON_GUIDE.md`** - Full documentation with examples

## Data Storage

Season data is automatically saved to:
- **JSON**: `data/seasons.json` (fallback)
- **MongoDB**: `seasons` collection (primary)

Data includes:
- Season name and status
- Player leaderboard with coins/xp/level
- Creation date and creator
- Active/archived status

## Season Naming Convention

Season names should use:
- Lowercase letters
- Numbers
- Hyphens for spaces

Examples:
- `season-development` ✅
- `spring-2024` ✅
- `competitive-mode` ✅
- `S1` ❌ (too short)

## Integration

The season system works with:
- **Economy System** - Tracks seasonal coins earned
- **Leaderboard** - Per-season rankings
- **Daily/Weekly Rewards** - Coins are counted in current season

## Permissions

All season commands require:
- ✅ Administrator permission
- ✅ Message send access

## Need Help?

See full documentation: [SEASON_GUIDE.md](SEASON_GUIDE.md)

---

**Ready to use?** Try: `!season create season-development`
