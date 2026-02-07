const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ChannelType } = require('discord.js');
const settingsManager = require('./settingsManager');

const LOGGING_SETTINGS_FILE = path.join(__dirname, '../data/logging.json');

// Load logging settings
function loadLoggingSettings() {
  if (fs.existsSync(LOGGING_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(LOGGING_SETTINGS_FILE, 'utf8'));
  }
  return {};
}

// Save logging settings
function saveLoggingSettings(data) {
  fs.writeFileSync(LOGGING_SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Set logging channel
function setLoggingChannel(guildId, channelId) {
  const settings = loadLoggingSettings();

  if (!settings[guildId]) {
    settings[guildId] = {};
  }

  settings[guildId].loggingChannel = channelId;
  saveLoggingSettings(settings);
}

// Get logging channel
function getLoggingChannel(guildId) {
  const settings = loadLoggingSettings();
  return settings[guildId]?.loggingChannel || null;
}

// Send log to channel
async function sendLog(guildId, embed, client) {
  try {
    const channelId = getLoggingChannel(guildId);

    if (!channelId) {
      console.log(`[LOGGING] No logging channel set for guild ${guildId}`);
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      console.log(`[LOGGING] Logging channel not found or not text-based for guild ${guildId}`);
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`[LOGGING] Error sending log:`, error);
  }
}

// Message delete log
function logMessageDelete(message, client) {
  const embed = new EmbedBuilder()
    .setColor(0xED4245) // Red
    .setTitle('📤 Message Deleted')
    .setDescription(`A message was deleted in ${message.channel}`)
    .addFields(
      { name: 'Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Channel', value: `${message.channel.name}`, inline: true },
      { name: 'Content', value: message.content.substring(0, 1024) || '*No content (embed/file)*', inline: false }
    )
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Message ID: ${message.id}` })
    .setTimestamp(message.createdTimestamp);

  sendLog(message.guildId, embed, client);
}

// Message edit log
function logMessageEdit(oldMessage, newMessage, client) {
  const embed = new EmbedBuilder()
    .setColor(0xFAA61A) // Yellow/Orange
    .setTitle('✏️ Message Edited')
    .setDescription(`A message was edited in ${newMessage.channel}`)
    .addFields(
      { name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
      { name: 'Channel', value: `${newMessage.channel.name}`, inline: true },
      { name: 'Before', value: oldMessage.content.substring(0, 512) || '*No content*', inline: false },
      { name: 'After', value: newMessage.content.substring(0, 512) || '*No content*', inline: false }
    )
    .setThumbnail(newMessage.author.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Message ID: ${newMessage.id}` })
    .setTimestamp();

  sendLog(newMessage.guildId, embed, client);
}

// Member join log
function logMemberJoin(member, inviter = null, client) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287) // Green
    .setTitle('📥 Member Joined')
    .setDescription(`${member.user.tag} joined the server`)
    .addFields(
      { name: 'Member', value: `${member} (${member.id})`, inline: true },
      { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  if (inviter) {
    embed.addFields({
      name: 'Invited By',
      value: `${inviter.tag} (${inviter.id})`,
      inline: true,
    });
  }

  sendLog(member.guild.id, embed, client);
}

// Member leave log
function logMemberLeave(member, client) {
  const embed = new EmbedBuilder()
    .setColor(0xED4245) // Red
    .setTitle('📤 Member Left')
    .setDescription(`${member.user.tag} left the server`)
    .addFields(
      { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
      {
        name: 'Roles',
        value: member.roles.cache.map(r => r.name).join(', ') || 'None',
        inline: false,
      }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  sendLog(member.guild.id, embed, client);
}

// Role add/remove log
function logRoleUpdate(member, role, added = true, client) {
  const embed = new EmbedBuilder()
    .setColor(added ? 0x5865F2 : 0xED4245) // Blue if added, Red if removed
    .setTitle(added ? '⭐ Role Added' : '✖️ Role Removed')
    .setDescription(`${member.user.tag} role was ${added ? 'added' : 'removed'}`)
    .addFields(
      { name: 'Member', value: `${member} (${member.id})`, inline: true },
      { name: 'Role', value: `${role} (${role.id})`, inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  sendLog(member.guild.id, embed, client);
}

// Channel create log
function logChannelCreate(channel, client) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287) // Green
    .setTitle('➕ Channel Created')
    .setDescription(`A new channel was created`)
    .addFields(
      { name: 'Channel', value: `${channel} (${channel.id})`, inline: true },
      { name: 'Type', value: getChannelType(channel.type), inline: true }
    )
    .setFooter({ text: `Channel ID: ${channel.id}` })
    .setTimestamp();

  sendLog(channel.guildId, embed, client);
}

// Channel delete log
function logChannelDelete(channel, client) {
  const embed = new EmbedBuilder()
    .setColor(0xED4245) // Red
    .setTitle('➖ Channel Deleted')
    .setDescription(`A channel was deleted`)
    .addFields(
      { name: 'Channel Name', value: channel.name, inline: true },
      { name: 'Type', value: getChannelType(channel.type), inline: true }
    )
    .setFooter({ text: `Channel ID: ${channel.id}` })
    .setTimestamp();

  sendLog(channel.guildId, embed, client);
}

// Helper: Get channel type name
function getChannelType(type) {
  const types = {
    [ChannelType.GuildText]: '💬 Text',
    [ChannelType.DM]: 'DM',
    [ChannelType.GuildVoice]: '🔊 Voice',
    [ChannelType.GroupDM]: 'Group DM',
    [ChannelType.GuildCategory]: '📂 Category',
    [ChannelType.GuildAnnouncement]: '📣 Announcement',
    [ChannelType.AnnouncementThread]: '📌 Thread',
    [ChannelType.PublicThread]: '📌 Public Thread',
    [ChannelType.PrivateThread]: '🔒 Private Thread',
    [ChannelType.GuildStageVoice]: '🎙️ Stage',
    [ChannelType.GuildForum]: '💭 Forum',
  };

  return types[type] || 'Unknown';
}

module.exports = {
  setLoggingChannel,
  getLoggingChannel,
  sendLog,
  logMessageDelete,
  logMessageEdit,
  logMemberJoin,
  logMemberLeave,
  logRoleUpdate,
  logChannelCreate,
  logChannelDelete,
  loadLoggingSettings,
  saveLoggingSettings,
};
