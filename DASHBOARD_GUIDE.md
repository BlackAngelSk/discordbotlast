# Dashboard Setup Guide

## Overview
A beautiful web dashboard has been added to your Discord bot! Manage server settings through an intuitive web interface. **Works on Windows, macOS, and Linux!**

## Features
- 🔐 Discord OAuth2 authentication
- 🎨 Beautiful, responsive UI
- ⚙️ Manage all bot settings per server
- 👋 Configure welcome/leave messages
- 🎵 Set DJ and auto roles
- 📊 View bot statistics
- ✅ Cross-platform compatible (Windows, macOS, Linux)

## Setup Instructions

### 1. Get Discord OAuth2 Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to **OAuth2** → **General**
4. Copy your **Client ID** and **Client Secret**
5. Add redirect URL: `http://localhost:3000/callback` (or your domain)

### 2. Update .env File

Edit your `.env` file with the credentials:

```env
# Dashboard Settings
DASHBOARD_ENABLED=true
DASHBOARD_PORT=3000
DASHBOARD_URL=http://localhost:3000

# Discord OAuth2
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
DASHBOARD_CALLBACK=http://localhost:3000/callback

# Session Secret (generate a random string)
SESSION_SECRET=your_random_secret_key_here
```

### 3. Generate Session Secret

Run this in your terminal to generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start the Bot

```bash
npm start
```

The dashboard will start automatically on `http://localhost:3000`

## Usage

### Access the Dashboard

1. In Discord, type `!dashboard` to get the link
2. Or visit `http://localhost:3000` directly
3. Click "Login with Discord"
4. Select a server to manage

### Available Settings

- **Command Prefix** - Change the bot prefix
- **DJ Role** - Set role for music control commands
- **Auto Role** - Automatically assign role to new members
- **Welcome Messages** - Configure welcome messages and channel
- **Leave Messages** - Configure leave messages and channel

### Permissions

- Only users with **Administrator** permissions can access server settings
- Bot must be in the server to manage it

## Production Deployment

### Deploy to Hosting Service

1. Update `.env` with production URLs:
```env
DASHBOARD_URL=https://yourdomain.com
DASHBOARD_CALLBACK=https://yourdomain.com/callback
```

2. Add the production callback URL to Discord Developer Portal

3. Deploy your bot and dashboard together

### Security Notes

- Keep `CLIENT_SECRET` and `SESSION_SECRET` private
- Use HTTPS in production
- Never commit `.env` file to git

## 🐧 Linux-Specific Deployment

### Running on Linux Server

**Option 1: Using npm start directly**
```bash
cd /home/user/discordbotlast
npm start
```

**Option 2: Using systemd service** (recommended for production)

Create `/etc/systemd/system/discord-bot-dashboard.service`:
```ini
[Unit]
Description=Discord Bot with Dashboard
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
sudo systemctl enable discord-bot-dashboard
sudo systemctl start discord-bot-dashboard
sudo systemctl status discord-bot-dashboard
```

View logs:
```bash
sudo journalctl -u discord-bot-dashboard -f
```

**Option 3: Using PM2** (process manager for Node.js)

Install PM2:
```bash
npm install -g pm2
```

Start with PM2:
```bash
pm2 start index.js --name "discord-bot"
pm2 startup
pm2 save
```

Monitor:
```bash
pm2 logs discord-bot
pm2 status
```

### Using Nginx as Reverse Proxy

For production, use Nginx to proxy the dashboard:

**Create `/etc/nginx/sites-available/discord-bot.conf`:**
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
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/discord-bot.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL Certificate (HTTPS) on Linux

Use Let's Encrypt with Certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Port Forwarding on Linux

If running on a VPS, make sure the port is open:
```bash
# Check if port 3000 is listening
sudo netstat -tulpn | grep 3000
# Or use lsof
sudo lsof -i :3000
```

### Firewall Configuration (UFW)

Allow HTTP and HTTPS through the firewall:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Troubleshooting

### Dashboard not loading
- Check `.env` has `DASHBOARD_ENABLED=true`
- Verify `CLIENT_ID`, `CLIENT_SECRET`, and `SESSION_SECRET` are set
- Check bot logs for errors

### OAuth2 callback error
- Ensure redirect URL in `.env` matches Discord Developer Portal
- Check that the bot has correct OAuth2 scopes

### Port 3000 already in use
Change the port in `.env`:
```env
DASHBOARD_PORT=3001
DASHBOARD_URL=http://localhost:3001
DASHBOARD_CALLBACK=http://localhost:3001/callback
```

### Linux permission errors
```bash
# Fix file permissions
chmod -R 755 /home/user/discordbotlast
chmod -R 644 /home/user/discordbotlast/*.json
chmod 755 /home/user/discordbotlast/data
```

### Dashboard won't start
- Check if port 3000 is available
- Verify `DASHBOARD_ENABLED=true` in `.env`

### Can't login
- Verify `CLIENT_ID` and `CLIENT_SECRET` are correct
- Check callback URL matches Discord Developer Portal
- Make sure redirect URI is added in Discord settings

### Can't see servers
- Ensure bot is in the server
- Check user has Administrator permission
- Verify OAuth2 scope includes 'guilds'

## File Structure

```
dashboard/
├── server.js           # Express server & routes
├── views/              # EJS templates
│   ├── index.ejs      # Home page
│   ├── dashboard.ejs  # Server list
│   └── server.ejs     # Server settings
└── public/            # Static files
    └── style.css      # Styles
```

## Customization

### Change Port
Edit `DASHBOARD_PORT` in `.env`

### Modify Styles
Edit `dashboard/public/style.css`

### Add Features
- Edit `dashboard/server.js` for new routes
- Create new EJS templates in `dashboard/views/`
- Add API endpoints for additional functionality

## Commands

- `!dashboard` - Get dashboard link

Enjoy your new web dashboard! 🎉
