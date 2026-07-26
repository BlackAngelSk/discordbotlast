const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const INVITES_FILE = path.join(__dirname, '../data/invites.json');

// Load invites data
async function loadInvites() {
  try {
    if (fsSync.existsSync(INVITES_FILE)) {
      const data = await fs.readFile(INVITES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading invites:', error);
  }
  return {};
}

// Save invites data
async function saveInvites(data) {
  try {
    const dir = path.dirname(INVITES_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(INVITES_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving invites:', error);
  }
}

// Track an invite
async function trackInvite(guildId, inviterId, invitedUserId, invitedUsername) {
  const invites = await loadInvites();

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

  await saveInvites(invites);
}

// Get user's invites
async function getUserInvites(guildId, userId) {
  const invites = await loadInvites();

  if (!invites[guildId] || !invites[guildId][userId]) {
    return {
      count: 0,
      invited: [],
    };
  }

  return invites[guildId][userId];
}

// Get top inviters for a guild
async function getTopInviters(guildId, limit = 10) {
  const invites = await loadInvites();

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
async function getLeaderboard(guildId, limit = 10) {
  return await getTopInviters(guildId, limit);
}

module.exports = {
  trackInvite,
  getUserInvites,
  getTopInviters,
  getLeaderboard,
  loadInvites,
  saveInvites,
};
