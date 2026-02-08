# 🚀 Quick Start Checklist

## ✅ Pre-Start Checks

Before running your bot, verify:

- [ ] Node.js 20.16.0+ installed
- [ ] Discord bot token in `.env` file
- [ ] `npm install` completed successfully
- [ ] **Operating System:** Windows, macOS, or Linux ✅

### For Linux Users:
- [ ] Build tools installed (`build-essential` on Ubuntu/Debian, `Development Tools` on Fedora)
- [ ] Python 3 installed (needed for some npm packages)

## 🎯 First Run

1. **Start the bot:**

   **Windows:**
   ```bash
   npm start
   # OR
   start.bat
   ```

   **macOS/Linux:**
   ```bash
   npm start
   # OR
   bash start.sh
   # OR (make executable first)
   chmod +x start.sh && ./start.sh
   ```

2. **Wait for initialization:**
   - ✅ Settings manager initialized
   - ✅ Economy manager initialized
   - ✅ Moderation manager initialized
   - ✅ Commands loaded
   - ✅ Events loaded
   - ✅ Slash commands loaded
   - ✅ Bot is ready!
   - ✅ Slash commands registered

3. **Verify in Discord:**
   - Type `/` to see slash commands appear
   - Type `!help` to see prefix commands

## 🔧 Server Setup (Do Once Per Server)

### Step 1: Create Roles
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

### Step 2: Configure Auto-Moderation
```
/automod enable
/automod antiinvite true
/automod antispam true
/modlog #your-mod-log-channel
```

### Step 3: Test Systems

**Test Music:**
```
/play never gonna give you up
```

**Test Economy:**
```
/balance
/daily
```

**Test Moderation:**
```
/warnings add @user Test warning
/warnings list @user
```

**Test Entertainment:**
```
/poll What's your favorite? Pizza|Burgers|Tacos
/8ball Will this bot work?
/meme
```

## 📊 Verify Everything Works

- [ ] Music plays correctly (YouTube)
- [ ] Slash commands respond
- [ ] Prefix commands respond
- [ ] XP tracking (send messages, check `/balance`)
- [ ] Auto-moderation active
- [ ] Shop accessible (`/shop`)
- [ ] Polls work (`/poll`)

## 🎨 Customization

### Change Command Prefix
```
!config prefix ?
```

### Linux-Specific Tips

**Running in Background (Linux/macOS):**
```bash
# Using nohup
nohup npm start > bot.log 2>&1 &

# Using screen
screen -S discord-bot npm start
# Detach: Ctrl+A then D
# Reattach: screen -r discord-bot

# Using tmux
tmux new-session -d -s discord-bot npm start
```

**Setting Up as Systemd Service (Advanced Linux):**

Create `/etc/systemd/system/discord-bot.service`:
```ini
[Unit]
Description=Discord Bot Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/discordbotlast
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Then run:
```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
sudo systemctl status discord-bot  # Check status
```

### Set Welcome Messages
```
!config welcomechannel #general
!config welcomemessage Welcome {user} to {server}!
!config welcomeenable
```

### Configure Auto-Role
```
!config autorole Member
```

### Add Bad Words
```
/automod badwords add <word>
```

## 🆘 If Something Goes Wrong

### Bot Not Responding
1. Check `.env` file has correct token
2. Verify bot is online in Discord
3. Check console for errors

### Slash Commands Not Showing
1. Wait up to 1 hour (global commands take time)
2. Ensure bot has `applications.commands` scope
3. Try kicking and re-inviting bot

### Music Not Playing
1. Verify FFmpeg is installed: `ffmpeg -version`
2. Check voice channel permissions
3. Look for errors in console

### Auto-Mod Not Working
1. Run `/automod enable`
2. Check bot has Manage Messages permission
3. Verify mod log channel is set

### Economy Not Saving
1. Check `data/economy.json` exists
2. Verify write permissions on `data/` folder
3. Look for errors in console

## 📚 Learn More

- Read [NEW_FEATURES.md](NEW_FEATURES.md) for complete feature guide
- Check [README.md](README.md) for detailed documentation
- See [FEATURES.md](FEATURES.md) for feature details
- Review [CONFIG_GUIDE.md](CONFIG_GUIDE.md) for configuration options

## 🎉 You're All Set!

Your bot now has:
- ✨ 40+ commands
- 🎵 Multi-platform music
- 🛡️ Complete moderation
- 💰 Economy & leveling
- 🎮 Entertainment features
- 🔧 Utility tools

**Enjoy your feature-complete Discord bot!** 🚀
