/**
 * Dashboard Test Actions
 * Handles test actions (welcome, leave, logging, suggestions) triggered from the dashboard.
 */

const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../utils/settingsManager');
const loggingManager = require('../utils/loggingManager');
const suggestionManager = require('../utils/suggestionManager');
const { resolveStoredTextChannel, replaceMemberTemplateTokens } = require('./helpers');

/**
 * Runs a dashboard test action (welcome, leave, logging, suggestions).
 */
const runDashboardTestAction = async ({ guildId, guild, member, type, client }) => {
  if (type === 'welcome') {
    const welcomeMessageManager = client?.welcomeMessageManager;
    const welcomeEmbedConfig = welcomeMessageManager?.getWelcomeConfig(guildId);

    // Try the embed-based welcome system first (check channelId, not just enabled)
    if (welcomeEmbedConfig?.channelId) {
      const embedChannel =
        guild.channels.cache.get(welcomeEmbedConfig.channelId) ||
        (await guild.channels.fetch(welcomeEmbedConfig.channelId).catch(() => null));

      if (embedChannel && embedChannel.isTextBased()) {
        const embed = welcomeMessageManager.createWelcomeEmbed(member, welcomeEmbedConfig);
        await embedChannel.send({
          content: '🧪 Test welcome embed',
          embeds: [embed],
        });
        return welcomeEmbedConfig.enabled
          ? 'Sent welcome embed test successfully.'
          : 'Sent welcome embed test successfully. Note: welcome embed is currently disabled.';
      }
      // Embed channel was configured but is no longer available — fall through to legacy check
    }

    // Fallback to legacy settings-based welcome system
    const settings = settingsManager.get(guildId);
    const channel = resolveStoredTextChannel(guild, settings.welcomeChannel);
    if (!channel) {
      return '⚠️ Welcome channel is not configured. Please set a welcome channel in server settings before testing.';
    }

    const message = replaceMemberTemplateTokens(settings.welcomeMessage, member, guild);
    const accountCreatedUnix = member?.user?.createdTimestamp
      ? Math.floor(member.user.createdTimestamp / 1000)
      : null;
    const joinedUnix = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const fallbackEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🧪 Welcome Test for ${guild.name}`)
      .setDescription(message)
      .addFields(
        { name: 'User', value: `<@${member.id}>`, inline: true },
        { name: 'User ID', value: member.id, inline: true },
        { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
        {
          name: 'Account Created',
          value: accountCreatedUnix
            ? `<t:${accountCreatedUnix}:F>\n(<t:${accountCreatedUnix}:R>)`
            : 'Unknown',
          inline: false,
        },
        {
          name: 'Joined Server',
          value: joinedUnix ? `<t:${joinedUnix}:F>\n(<t:${joinedUnix}:R>)` : 'Unknown',
          inline: false,
        }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await channel.send({ embeds: [fallbackEmbed] });
    return settings.welcomeEnabled
      ? 'Sent welcome embed test successfully.'
      : 'Sent welcome embed test successfully. Note: welcome messages are currently disabled.';
  }

  if (type === 'leave') {
    const settings = settingsManager.get(guildId);
    const channel = resolveStoredTextChannel(guild, settings.leaveChannel);
    if (!settings.leaveEnabled || !channel) {
      return '⚠️ Leave messages are not fully configured. Please set a leave channel and enable leave messages in server settings before testing.';
    }

    const message = replaceMemberTemplateTokens(settings.leaveMessage, member, guild);
    await channel.send(`🧪 Test leave message\n${message}`);
    return 'Sent leave test successfully.';
  }

  if (type === 'logging') {
    const loggingChannelId = await loggingManager.getLoggingChannel(guildId);
    if (!loggingChannelId) {
      return '⚠️ No logging channel is configured. Please set a logging channel in server settings before testing.';
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🧪 Logging Channel Test')
      .setDescription('This is a test log entry from the dashboard.')
      .addFields(
        { name: 'Triggered By', value: `${member.user.tag}`, inline: true },
        { name: 'Server', value: guild.name, inline: true }
      )
      .setTimestamp();

    await loggingManager.sendLog(guildId, embed, client);
    return 'Sent logging test successfully.';
  }

  if (type === 'suggestions') {
    const suggestionSettings = suggestionManager.getSettings(guildId);
    const channel = suggestionSettings.channelId
      ? guild.channels.cache.get(suggestionSettings.channelId)
      : null;
    if (!suggestionSettings.enabled || !channel || !channel.isTextBased()) {
      return '⚠️ Suggestions are not fully configured. Please enable suggestions and set a suggestion channel in server settings before testing.';
    }

    const staffMention = suggestionSettings.staffRoleId
      ? `<@&${suggestionSettings.staffRoleId}>`
      : 'No staff role configured';
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('🧪 Suggestion System Test')
          .setDescription('This is a dashboard test message for the suggestion channel.')
          .addFields(
            {
              name: 'Voting Enabled',
              value: suggestionSettings.votingEnabled ? 'Yes' : 'No',
              inline: true,
            },
            {
              name: 'Auto Thread',
              value: suggestionSettings.autoThread ? 'Yes' : 'No',
              inline: true,
            },
            { name: 'Staff Role', value: staffMention, inline: false }
          )
          .setTimestamp(),
      ],
    });

    return 'Sent suggestions test successfully.';
  }

  throw new Error('Unknown test action.');
};

module.exports = { runDashboardTestAction };
