# 🚀 Bot Setup Guide

Complete installation and configuration guide for your Discord bot.

**Supports:** Windows, macOS, and Linux ✅

---

## 📋 Prerequisites

### Required
- **Node.js** 20.16.0 or higher ([Download](https://nodejs.org/))
- **Discord Bot Token** ([Get one here](https://discord.com/developers/applications))

### Linux-Specific Requirements
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install build-essential python3 ffmpeg

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"
sudo dnf install python3 ffmpeg

# Arch Linux
sudo pacman -S base-devel python ffmpeg
```

---

## ⚡ Quick Start

### 1. Clone/Download the Bot
```bash
cd /home/your-username/
git clone https://github.com/your-repo/discordbotlast
cd discordbotlast
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Required - Bot Token
DISCORD_TOKEN=your_discord_bot_token_here

# Optional - Database (uses JSON files if not provided)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
MONGODB_DBNAME=discord-bot

# Optional - AI Features
GOOGLE_API_KEY=your_google_gemini_api_key

# Optional - Dashboard
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000
CLIENT_ID=your_discord_client_id
CLIENT_SECRET=your_discord_client_secret
DASHBOARD_CALLBACK=http://localhost:3000/callback
SESSION_SECRET=your_random_session_secret

# Optional - Other Settings
PREFIX=!
```

### 4. Get Your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it
3. Go to "Bot" section → Click "Reset Token" → Copy the token
4. Paste it into your `.env` file as `DISCORD_TOKEN`

### 5. Invite Bot to Your Server

Generate an invite link with these permissions:
- Administrator (or these specific permissions):
  - Send Messages
  - Embed Links
  - Attach Files
  - Read Message History
  - Add Reactions
  - Use Slash Commands
  - Manage Messages
  - Manage Roles
  - Manage Channels
  - Ban Members
  - Kick Members
  - Moderate Members
  - Connect (Voice)
  - Speak (Voice)

**Invite URL:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your bot's client ID from the Developer Portal.

### 6. Start the Bot

**Windows:**
```bash
npm start
# OR
start.bat
```

**Linux/macOS:**
```bash
npm start
# OR
bash start.sh
# OR
chmod +x start.sh && ./start.sh
```

### 7. Verify It's Running

You should see:
```
✅ Settings manager initialized!
✅ Economy manager initialized!
✅ Game stats manager initialized!
✅ Bot is ready! Logged in as YourBot#0000
✅ Registered slash commands globally
```

---

## 🔧 First-Time Server Setup

### Step 1: Create Essential Roles
```
/setup
```
This creates:
- **DJ Role** - Required for music command permissions
- **Member Role** - Automatically assigned to new members

### Step 2: Configure Server Settings

**Change Prefix:**
```
!config prefix ?
```

**Set Welcome Messages:**
```
!config welcomechannel #welcome
!config welcomemessage Welcome {user} to {server}! You're member #{memberCount}!
!config welcomeenable
```

**Set Leave Messages:**
```
!config leavechannel #goodbye
!config leavemessage {user} has left the server. We now have {memberCount} members.
!config leaveenable
```

**Configure Auto-Role:**
```
!config autorole Member
```

**Set DJ Role:**
```
!config djrole DJ
```

**Set Language:**
```
!config language en    # English
!config language sk    # Slovak
```

### Step 3: Enable Auto-Moderation
```
/automod enable
/automod antiinvite true
/automod antispam true
/automod badwords add badword1
/modlog #mod-logs
```

### Step 4: Test Basic Commands

**Music:**
```
/play never gonna give you up
/queue
/skip
```

**Economy:**
```
/balance
/daily
```

**Moderation:**
```
/warnings add @user Test warning
/warnings list @user
```

**Fun:**
```
/poll What's your favorite? Pizza|Burgers|Tacos
/8ball Is this bot awesome?
```

---

## 🌐 Dashboard Setup (Optional)

### 1. Get OAuth2 Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **OAuth2** → **General**
4. Copy **Client ID** and **Client Secret**
5. Add redirect URL: `http://localhost:3000/callback`

### 2. Generate Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output to `SESSION_SECRET` in `.env`

### 3. Update .env File

```env
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
DASHBOARD_CALLBACK=http://localhost:3000/callback
SESSION_SECRET=generated_secret_from_step_2
```

### 4. Access Dashboard

1. Start the bot (`npm start`)
2. Visit `http://localhost:3000`
3. Click "Login with Discord"
4. Select a server to manage

**Dashboard Pages:**
- `/dashboard/:guildId` - Main overview
- `/dashboard/:guildId/economy` - Leaderboard
- `/dashboard/:guildId/analytics` - Server stats
- `/premium` - Premium tiers

---

## 🐧 Linux Production Deployment

### Option 1: Using systemd (Recommended)

Create `/etc/systemd/system/discord-bot.service`:

```ini
[Unit]
Description=Discord Bot
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/discordbotlast
ExecStart=/usr/bin/npm start
Environment="NODE_ENV=production"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
sudo systemctl status discord-bot
```

View logs:
```bash
sudo journalctl -u discord-bot -f
```

### Option 2: Using PM2

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start index.js --name "discord-bot"

# Auto-start on reboot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs discord-bot
pm2 restart discord-bot
```

### Option 3: Using Screen/Tmux

**Screen:**
```bash
screen -S discord-bot
npm start
# Detach: Ctrl+A then D
# Reattach: screen -r discord-bot
```

**Tmux:**
```bash
tmux new -s discord-bot
npm start
# Detach: Ctrl+B then D
# Reattach: tmux attach -t discord-bot
```

### Nginx Reverse Proxy (For Dashboard)

Create `/etc/nginx/sites-available/discord-bot`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/discord-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL Certificate (HTTPS)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🔍 Troubleshooting

### Bot Not Starting

**Check Node.js version:**
```bash
node --version  # Should be 20.16.0+
```

**Check for errors:**
```bash
npm start
# Read the console output for specific errors
```

**Common issues:**
- Missing `.env` file → Create it
- Invalid token → Check Discord Developer Portal
- Missing dependencies → Run `npm install`

### Slash Commands Not Appearing

- Wait up to 1 hour (Discord caches global commands)
- Ensure bot has `applications.commands` scope
- Try kicking and re-inviting the bot

### Music Not Playing

**Check FFmpeg:**
```bash
ffmpeg -version
```

If not installed:
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org)
- **Linux:** `sudo apt-get install ffmpeg`
- **macOS:** `brew install ffmpeg`

### Database Connection Failed

If using MongoDB:
- Check `MONGODB_URI` is correct
- Verify network access to MongoDB cluster
- Whitelist your IP address in MongoDB Atlas

The bot automatically falls back to JSON files if MongoDB fails.

### Dashboard Not Loading

1. Check `DASHBOARD_ENABLED=true` in `.env`
2. Verify port 3000 is not in use: `lsof -i :3000`
3. Check `CLIENT_ID` and `CLIENT_SECRET` are correct
4. Verify callback URL matches in Discord Developer Portal

### Permission Errors (Linux)

```bash
# Fix data folder permissions
chmod 755 data/
chmod 644 data/*.json

# Fix script permissions
chmod +x start.sh
```

---

## 📊 Verify Installation

Run these commands to ensure everything works:

- [ ] `/help` - Shows help message
- [ ] `/play test` - Plays music
- [ ] `/balance` - Shows economy status
- [ ] `/poll Question? A|B|C` - Creates poll
- [ ] `!config` - Shows server settings
- [ ] `/warnings add @user test` - Test moderation
- [ ] Send messages - XP should be tracked

---

## 🆘 Getting Help

If you encounter issues:

1. Check console logs for error messages
2. Verify all environment variables are set
3. Ensure bot has proper permissions
4. Check file permissions (Linux)
5. Review the error message carefully

**Common Error Messages:**

- `TOKEN_INVALID` → Check your Discord token
- `ECONNREFUSED` → Database connection issue
- `EACCES` → Permission error (run with sudo or fix file permissions)
- `MODULE_NOT_FOUND` → Run `npm install`

---

## ✅ Post-Setup Checklist

- [ ] Bot is online in Discord
- [ ] Slash commands appear when typing `/`
- [ ] Prefix commands work (default: `!`)
- [ ] Music plays correctly
- [ ] Economy system tracks XP
- [ ] Moderation commands work
- [ ] Dashboard accessible (if enabled)
- [ ] Auto-moderation active
- [ ] Welcome messages enabled

---

**You're all set! Check COMMANDS.md for the complete command list.**
