# Configuration System Guide

## Overview
The bot features a complete per-server configuration system with custom prefixes, welcome/leave messages, role settings, and **full support on Windows, macOS, and Linux!**

## Quick Start

### 1. Setup Your Server
```
/setup
```
or
```
!setup
```
This creates:
- DJ role (for music permissions)
- Member role (for auto-role)

### 2. View Current Settings
```
!config
```
Shows all current settings for your server

## Configuration Commands

All config commands require **Administrator** permission.

### Prefix Settings
```
!config prefix <new_prefix>
```
Change the command prefix (1-5 characters)
- Example: `!config prefix ?`
- Example: `!config prefix !!`

### Welcome Messages

**Set Welcome Channel:**
```
!config welcomechannel #channel-name
```
Example: `!config welcomechannel #welcome`

**Set Welcome Message:**
```
!config welcomemessage <message>
```
Available placeholders:
- `{user}` - Mentions the user
- `{username}` - Username without mention
- `{server}` - Server name
- `{memberCount}` - Total member count

Example: `!config welcomemessage Welcome to {server}, {user}! You're member #{memberCount}!`

**Enable/Disable Welcome Messages:**
```
!config welcomeenable
!config welcomedisable
```

### Leave Messages

**Set Leave Channel:**
```
!config leavechannel #channel-name
```
Example: `!config leavechannel #goodbye`

**Set Leave Message:**
```
!config leavemessage <message>
```
Available placeholders:
- `{user}` - Username
- `{server}` - Server name
- `{memberCount}` - Remaining member count

Example: `!config leavemessage {user} has left {server}. We now have {memberCount} members.`

**Enable/Disable Leave Messages:**
```
!config leaveenable
!config leavedisable
```

### Role Settings

**Set Auto-Role (given to new members):**
```
!config autorole <role_name>
```
Example: `!config autorole Member`

**Set DJ Role (for music commands):**
```
!config djrole <role_name>
```
Example: `!config djrole DJ`

### Reset Settings
```
!config reset
```

## 🐧 Linux-Specific Configuration

### Running as a Service (Advanced)

If you want the bot to run automatically on Linux startup, you can create a systemd service:

**Create `/etc/systemd/system/discord-bot.service`:**
```ini
[Unit]
Description=Discord Bot
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/discordbotlast
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Then enable it:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
```

**Monitor the service:**
```bash
sudo systemctl status discord-bot
sudo journalctl -u discord-bot -f  # View logs
```

### File Permissions on Linux

Make sure the bot can write to the data folder:
```bash
chmod 755 /home/YOUR_USERNAME/discordbotlast/data
chmod 644 /home/YOUR_USERNAME/discordbotlast/data/*.json
```

### Cross-Platform Compatibility Notes

- **Settings File:** `data/settings.json` - Works on all platforms
- **Line Endings:** Git should auto-convert line endings (CRLF ↔ LF)
- **Paths:** Bot uses `/` which works on all platforms
- **Environment Variables:** `.env` format works on Windows, macOS, and Linux

### Troubleshooting Config Issues

**Settings not saving:**
```bash
# Check file permissions
ls -la data/settings.json

# Check if data directory exists and is writable
ls -ld data

# Try restarting the bot
npm start
```

**Config command not working:**
- Ensure you're using `/config` (slash) or `!config` (prefix with correct prefix)
- Check that you have Administrator permission
- Check bot logs for error messages
Resets all settings to default values

## Default Settings

When a server first uses the bot, these are the defaults:
- **Prefix:** `!`
- **Welcome:** Disabled
- **Leave:** Disabled
- **Auto Role:** `Member`
- **DJ Role:** `DJ`

## Settings Storage

Settings are stored in `data/settings.json` (automatically created)
- Persists across bot restarts
- Per-server configuration
- Automatically saved when changed

## Examples

### Complete Welcome Setup
```
!config welcomechannel #welcome
!config welcomemessage 🎉 Welcome {user} to {server}! We're glad you're here!
!config welcomeenable
```

### Complete Leave Setup
```
!config leavechannel #general
!config leavemessage 👋 Goodbye {user}, thanks for being part of our community!
!config leaveenable
```

### Change Prefix
```
!config prefix ?
```
Now all commands use `?` instead of `!`

### Custom Roles
```
!config autorole Newbie
!config djrole MusicMaster
!setup
```
Creates roles with your custom names

## Troubleshooting

**Commands don't work after changing prefix:**
- Use the new prefix! If you set it to `?`, use `?config`

**Welcome/leave messages not appearing:**
- Check that they're enabled: `!config welcomeenable` / `!config leaveenable`
- Verify the channel is set
- Make sure bot has permissions in that channel

**Roles not being assigned:**
- Ensure role exists (run `!setup` to create them)
- Check bot has "Manage Roles" permission
- Bot's role must be higher than roles it assigns

## Tips

1. **Test your messages** - Use placeholders to personalize messages
2. **Choose appropriate channels** - Use dedicated channels for welcome/leave messages
3. **Keep prefix simple** - 1-2 characters work best
4. **Backup settings** - The `data/settings.json` file can be backed up

## Advanced Usage

You can view all servers' settings by checking `data/settings.json`:
```json
{
  "123456789012345678": {
    "prefix": "!",
    "welcomeEnabled": true,
    "welcomeChannel": "987654321098765432",
    "welcomeMessage": "Welcome {user}!",
    ...
  }
}
```

Each server (guild) has its own configuration stored by server ID.
