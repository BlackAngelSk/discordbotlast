# Dashboard Setup Guide

## Overview
A beautiful web dashboard has been added to your Discord bot! Manage server settings through an intuitive web interface.

## Features
- 🔐 Discord OAuth2 authentication
- 🎨 Beautiful, responsive UI
- ⚙️ Manage all bot settings per server
- 👋 Configure welcome/leave messages
- 🎵 Set DJ and auto roles
- 📊 View bot statistics

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

## Troubleshooting

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
