# New Features Added

## Summary
This bot now includes advanced queue management, DJ permissions, autoplay, lyrics, and playlist support!

## What's New

### 1. DJ Role Permission System ✅
**File**: `utils/permissions.js`

- Commands like skip, stop, pause, resume, volume now require DJ role
- Exceptions: Server owner, Administrator, or being alone with bot
- Smart permission checking

**How to use**: Run `!setup` to create DJ role, then assign it to trusted users

### 2. Auto-Role for New Members ✅
**File**: `events/guildMemberAdd.js`

- Automatically assigns "Member" role to new users
- Optional welcome message in designated channel
- Auto-creates role if it doesn't exist

**Customize**: Edit `DEFAULT_ROLE_NAME` and `WELCOME_CHANNEL_NAME` in the file

### 3. YouTube Playlist Support ✅
**Updated**: `commands/play.js`

- Paste a YouTube playlist URL to add up to 50 songs
- Works with both single videos and playlists
- Shows playlist confirmation message

**Usage**: `!play https://youtube.com/playlist?list=...`

### 4. Lyrics Command ✅
**File**: `commands/lyrics.js`

- Fetches lyrics for current song or search query
- Uses free lyrics.ovh API
- Handles long lyrics with multiple pages
- Format: `!lyrics Artist - Song Name`

**Usage**: 
- `!lyrics` (gets current song lyrics)
- `!lyrics Rick Astley - Never Gonna Give You Up`

### 5. Autoplay Feature ✅
**Files**: `utils/MusicQueue.js`, `commands/autoplay.js`

- Automatically plays related songs when queue ends
- Toggle on/off with `!autoplay`
- Searches for similar content based on last song

**Usage**: `!autoplay` to enable/disable

### 6. Queue Management Commands ✅

#### Clear (`commands/clear.js`)
- Removes all songs from queue (requires DJ)
- Usage: `!clear`

#### Remove (`commands/remove.js`)
- Remove specific song by position (requires DJ)
- Usage: `!remove 3`

#### Move (`commands/move.js`)
- Move song from one position to another (requires DJ)
- Usage: `!move 5 1` (moves song 5 to position 1)

#### Swap (`commands/swap.js`)
- Swap two songs in queue (requires DJ)
- Usage: `!swap 2 5`

#### Shuffle (`commands/shuffle.js`)
- Randomize queue order (requires DJ)
- Usage: `!shuffle`

### 7. Setup Command ✅
**File**: `commands/setup.js`

- One-command server setup
- Creates DJ and Member roles
- Shows helpful embed with info
- Requires Administrator permission

**Usage**: `!setup`

### 8. Somme Mini Games ✅
**File**: `commands/minigame.js`

- Quick mini games: Rock-Paper-Scissors, Guess the Number, Quick Trivia
- Uses buttons/collectors so only the requester can play the round
- Works alongside existing prefix and permissions

**Usage**:
- `!minigame rps` — play Rock-Paper-Scissors
- `!minigame guess` — guess a number between 1-100 in 6 tries
- `!minigame trivia` — answer a quick multiple-choice question

## Commands Quick Reference

### For Everyone
- `!play <url/query>` - Play music (playlists supported!)
- `!queue` - View queue
- `!nowplaying` - Current song
- `!lyrics [song]` - Get lyrics
- `!autoplay` - Toggle autoplay
- `!help` - Show commands
- `!ping` - Bot latency
- `!leave` - Bot leaves voice
- `!minigame<rps|guess|trivia>` - Mini games

### DJ Only (or Admin/Owner)
- `!pause` - Pause playback
- `!resume` - Resume playback
- `!skip` - Skip song
- `!stop` - Stop and clear
- `!volume <0-200>` - Set volume
- `!clear` - Clear queue
- `!remove <pos>` - Remove song
- `!move <from> <to>` - Move song
- `!swap <p1> <p2>` - Swap songs
- `!shuffle` - Shuffle queue

### Admin Only
- `!setup` - Create roles

## Technical Details

### Permission System
Located in `utils/permissions.js`:
- `hasDJPermission(member)` - Check if user has DJ access
- `requireDJ(execute)` - Wrapper function for commands
- Checks: Owner > Admin > DJ Role > Alone with bot

### Auto-Role System
Located in `events/guildMemberAdd.js`:
- Triggers on `GuildMemberAdd` event
- Creates role if missing
- Configurable role name and welcome channel

### Autoplay Logic
In `utils/MusicQueue.js`:
- `getRelatedSong()` method
- Searches YouTube for related content
- Adds random selection to queue
- Continues playback automatically

### Playlist Handling
In `commands/play.js`:
- Detects `list=` in URL
- Uses youtube-dl-exec flat playlist mode
- Limits to 50 songs for performance
- Batch adds to queue

## Configuration Options

### Auto-Role Settings
Edit `events/guildMemberAdd.js`:
```javascript
const DEFAULT_ROLE_NAME = 'Member'; // Change role name
const WELCOME_CHANNEL_NAME = 'welcome'; // Change channel
```

### DJ Role Names
Edit `utils/permissions.js`:
```javascript
const DJ_ROLE_NAMES = ['dj', 'DJ', 'Dj', 'Music DJ']; // Add alternatives
```

### Autoplay Settings
In `utils/MusicQueue.js`:
- `autoplay` property (default: false)
- Change search limit in `getRelatedSong()`

### Playlist Limit
In `commands/play.js`:
```javascript
for (const entry of entries.slice(0, 50)) { // Change 50 to your limit
```

## Notes

- All DJ-protected commands allow solo users (alone with bot) to execute
- Lyrics API is free but may have rate limits
- Autoplay uses YouTube search and may not always find perfect matches
- Playlist loading can take a few seconds for large playlists
- Volume persists across songs in the same session

## Testing Checklist

- [ ] Run `!setup` to create roles
- [ ] Assign DJ role to test user
- [ ] Test all DJ commands with and without role
- [ ] Test autoplay mode
- [ ] Test playlist URL
- [ ] Test lyrics with current song and search
- [ ] Test queue management commands
- [ ] Invite new member to test auto-role
- [ ] Test reaction controls
- [ ] Test being alone in voice (should allow all commands)

Enjoy your enhanced music bot! 🎵
