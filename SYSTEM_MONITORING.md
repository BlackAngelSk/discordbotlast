# System Monitoring Dashboard - Usage Guide

## 🎯 Overview

The system monitoring feature displays real-time CPU and RAM usage in a Discord embed that automatically updates every 30 seconds. Perfect for monitoring bot health and server resources.

## 📋 Command

```
/system-stats
```

**Requirements:**
- Bot Owner only
- Updates automatically every 30 seconds
- Can be stopped with button click
- Runs for up to 1 hour

## 📊 What It Displays

### CPU Usage
```
📊 CPU Usage
████░░░░░░░░░░░░░░░░ 45.2%
```
- Shows overall system CPU usage
- Visual bar graph (20 character scale)
- Updated every 30 seconds

### System RAM Usage
```
🧠 System RAM Usage
██████░░░░░░░░░░░░░░ 32.5%
Used: 40.75 GB / 125.69 GB
Free: 84.94 GB
```
- Shows system-wide RAM usage
- Total and free memory displayed
- Color-coded based on usage level

### Bot Memory Usage
```
🤖 Bot Memory Usage
Heap: 4.14 MB / 4.88 MB
RSS: 46.75 MB
External: 1.49 MB
```
- Heap: Memory allocated for JavaScript objects
- RSS: Resident Set Size (actual memory used)
- External: Memory used by native modules

### Additional Info
```
⏱️ Bot Uptime: 2h 45m 30s
🖥️ System Info
CPU Cores: 16
Platform: linux
```

## 🎨 Color Coding

Embed color changes based on usage:

| Usage % | Color | Status |
|---------|-------|--------|
| 0-25% | 🟢 Green | Good |
| 25-50% | 🔵 Blue | OK |
| 50-75% | 🟡 Yellow | Warning |
| 75%+ | 🔴 Red | Critical |

## 🕐 Auto-Update Behavior

- **Initial Display:** Immediate embed with current stats
- **Updates:** Every 30 seconds automatically
- **Duration:** Up to 1 hour or until stopped
- **Edit Type:** Message edited in-place (no spam)

## 🔘 Stop Button

Click "Stop Monitoring" to:
- ⏹️ Stop the 30-second updates
- Clear the message
- End the monitoring session

## 📈 Understanding the Stats

### CPU Usage
- Measures how hard the CPU is working
- High CPU = Heavy processing
- Normal range: 5-20% for idle bot

### RAM Usage
- Measures total system memory consumption
- Includes all processes on the system
- Bot usually uses 40-100 MB

### Bot Memory
- **Heap Used**: Memory the bot is actively using
- **Heap Total**: Total available heap memory
- **RSS**: All memory allocated to bot process
- Normal: 4-10 MB heap, 40-60 MB RSS

## 💡 Example Usage

### Monitor Server Health
```
1. Run: /system-stats
2. See real-time CPU/RAM stats
3. Watch for spikes or sustained high usage
4. Click Stop when done
```

### Find Performance Issues
- CPU > 75% sustained = Check what's running
- RAM > 80% system-wide = Check other processes
- Bot heap > 100 MB = Potential memory leak

### Track Bot Uptime
- See how long bot has been running
- Watch memory trends over time
- Identify if memory grows over time

## 🔧 Technical Details

### How It Works
```
Command triggers
    ↓
Initial embed sent with stats
    ↓
30-second update interval starts
    ↓
Every 30s: Edit message with new stats
    ↓
User clicks Stop OR 1 hour passes
    ↓
Interval cleared, monitoring ends
```

### Performance Impact
- Minimal: Uses native `os` module
- No database queries
- Lightweight calculation
- Safe for continuous monitoring

## 📱 Discord Features

- ✅ Ephemeral messages for setup
- ✅ Button interactions
- ✅ Embed auto-updates
- ✅ Timestamp showing last update
- ✅ Color-coded health status

## 🎓 Example Output

```
💻 System Monitoring Dashboard
Last updated: 2 seconds ago

📊 CPU Usage
████░░░░░░░░░░░░░░░░ 22.3%

🧠 System RAM Usage
██░░░░░░░░░░░░░░░░░░ 14.6%
Used: 18.37 GB / 125.69 GB
Free: 107.32 GB

🤖 Bot Memory Usage
Heap: 4.14 MB / 4.88 MB
RSS: 46.75 MB
External: 1.49 MB

⏱️ Bot Uptime
2h 45m 30s

🖥️ System Info
CPU Cores: 16
Platform: linux

🔄 Updates every 30 seconds
```

## ⚡ Quick Tips

1. **Check before updates** - Monitor CPU/RAM before deploying
2. **Long sessions** - Monitor runs for 1 hour max
3. **Owner only** - Only bot owner can use
4. **Real-time data** - All stats are current
5. **No history** - Stops when session ends

## 🚀 When to Use

- ✅ Performance monitoring
- ✅ Resource tracking
- ✅ Uptime verification
- ✅ Troubleshooting issues
- ✅ Before heavy operations

## 📞 Troubleshooting

**Command not showing?**
- Ensure you're the bot owner
- Check BOT_OWNER_ID in .env

**Stats not updating?**
- Stats update every 30 seconds
- Check Discord permissions
- Message might be deleted

**High CPU/RAM?**
- Check system processes
- Look for bot memory leaks
- Restart bot if needed

## 🎉 You're All Set!

Just run `/system-stats` in Discord to start monitoring!
