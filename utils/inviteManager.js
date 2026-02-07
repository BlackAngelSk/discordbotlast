const fs = require('fs');
const path = require('path');

const INVITES_FILE = path.join(__dirname, '../data/invites.json');

// Load invites data
function loadInvites() {
  if (fs.existsSync(INVITES_FILE)) {
    return JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
  }
  return {};
}

// Save invites data
function saveInvites(data) {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(data, null, 2));
}

// Track an invite
function trackInvite(guildId, inviterId, invitedUserId, invitedUsername) {
  const invites = loadInvites();

  if (!invites[guildId]) {
    invites[guildId] = {};
  }

  if (!invites[guildId][inviterId]) {
    invites[guildId][inviterId] = {
      count: 0,
      invited: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  // Add invited user
  invites[guildId][inviterId].count += 1;
  invites[guildId][inviterId].invited.push({
    userId: invitedUserId,
    username: invitedUsername,
    invitedAt: new Date().toISOString(),
  });
  invites[guildId][inviterId].lastUpdated = new Date().toISOString();

  saveInvites(invites);
}

// Get user's invites
function getUserInvites(guildId, userId) {
  const invites = loadInvites();

  if (!invites[guildId] || !invites[guildId][userId]) {
    return {
      count: 0,
      invited: [],
    };
  }

  return invites[guildId][userId];
}

// Get top inviters for a guild
function getTopInviters(guildId, limit = 10) {
  const invites = loadInvites();

  if (!invites[guildId]) {
    return [];
  }

  return Object.entries(invites[guildId])
    .map(([userId, data]) => ({
      userId,
      count: data.count,
      invitedUsers: data.invited.length,
      lastUpdated: data.lastUpdated,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Get leaderboard for guild
function getLeaderboard(guildId, limit = 10) {
  return getTopInviters(guildId, limit);
}

module.exports = {
  trackInvite,
  getUserInvites,
  getTopInviters,
  getLeaderboard,
  loadInvites,
  saveInvites,
};
