// @ts-check
/**
 * /setup — in-Discord server configuration for guild admins.
 *
 * This mirrors the guild-configuration surface of the web dashboard so the
 * whole server can be set up from inside Discord. Every write funnels through
 * the same manager singletons the dashboard uses (settingsManager,
 * loggingManager, moderationManager, welcomeMessageManager, voiceRewardsManager,
 * tempVoiceManager, ticketManager, suggestionManager, raidProtectionManager,
 * the steam/epic/telegram/live-alert managers, etc.) so config edited here
 * stays in sync with what the rest of the bot reads at runtime.
 *
 * Subcommands:
 *   /setup view                            — dump current config (paginated embed)
 *   /setup reset                           — restore defaults (confirm via button)
 *   /setup config [category]               — interactive category flow
 *
 * The `config` flow is component-driven. The customId scheme is
 * `setup:{kind}:{category}:{key}:{token}` (token optional) so a category can
 * hold many settings of the same kind and the handler knows exactly which key
 * an interaction refers to.
 *
 *   setup:select:{category}:{token}   — category navigation (values[0]=cat id)
 *   setup:{channel|category|role}:{category}:{key}:{token}  — picker + {choice}
 *   setup:modal:{category}:{key}:{token}        — free-text/number modal submit
 *   setup:toggle:{category}:{key}:{token}       — on/off button toggle
 *   setup:choice:{category}:{key}:{token}       — select/choice menu submit
 *   setup:done|back|reset ...                  — nav
 *   setup:reset-confirm|reset-cancel:{token}   — confirm reset
 *   setup:pagination:{token}:{dir}             — /setup view pagination
 *   setup:view-done:{token}                    — dismiss view embed
 *   setup:cmd-add|cmd-create|cmd-remove|cmd-delete...  — custom command CRUD
 *
 * Permission gating: Admin + ManageGuild. Components verify the actor is the
 * invoking user via a per-invocation token.
 */

const { SlashCommandBuilder, EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, RoleSelectMenuBuilder } = require('discord.js');

// ---------------------------------------------------------------------------
// Manager imports (the dashboard's own config surface — keep in sync).
// ---------------------------------------------------------------------------
const settingsManager = require('../../utils/core/settingsManager');
const loggingManager = require('../../utils/loggingManager');
const moderationManager = require('../../utils/moderationManager');
const raidProtectionManager = require('../../utils/raidProtectionManager');
const voiceRewardsManager = require('../../utils/voiceRewardsManager');
const tempVoiceManager = require('../../utils/tempVoiceManager');
const ticketManager = require('../../utils/automation/ticketManager');
const suggestionManager = require('../../utils/automation/suggestionManager');
const epicGamesAlertsManager = require('../../utils/steam/epicGamesAlertsManager');
const steamFreeGamesAlertsManager = require('../../utils/steam/steamFreeGamesAlertsManager');
const steamGameUpdatesManager = require('../../utils/steam/steamGameUpdatesManager');
const telegramSyncManager = require('../../utils/telegramSyncManager');
const customCommandManager = require('../../utils/customCommandManager');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COMPONENT_TIMEOUT = 600_000; // 10 minutes of interactivity
const VIEW_PAGE_SIZE = 8;           // settings rows per page in /setup view

/**
 * @typedef {{
 *   key: string;
 *   kind: 'string' | 'text' | 'channel' | 'category' | 'role' | 'toggle' | 'number' | 'select' | 'json' | 'commandlist';
 *   label: string;
 *   hint?: string;
 *   maxLength?: number;
 *   minLength?: number;
 *   min?: number;
 *   max?: number;
 *   emoji?: string;
 *   read?: (guildId: string) => unknown;
 *   write?: (guildId: string, value: unknown, guild: any) => Promise<unknown> | unknown;
 * }} SettingDescriptor
 */

/**
 * @type {string[]}
 */
const CATEGORY_IDS = [
  'general', 'welcome', 'leave', 'logging', 'moderation', 'automod',
  'safety', 'voice', 'tickets', 'suggestions', 'alerts', 'telegram',
  'commands', 'serverprofile',
];

/**
 * @type {Record<string, string>}
 */
const CATEGORY_LABELS = {
  general: 'General & Prefixes',
  welcome: 'Welcome',
  leave: 'Goodbye / Leave',
  logging: 'Logging',
  moderation: 'Moderation',
  automod: 'Auto-Moderation',
  safety: 'Safety & Raid',
  voice: 'Voice & TempVC',
  tickets: 'Tickets',
  suggestions: 'Suggestions',
  alerts: 'Alerts (Epic / Steam / Telegram)',
  telegram: 'Telegram Sync',
  commands: 'Custom Commands',
  serverprofile: 'Server Profile',
};

/**
 * @param {string} v
 * @returns {string}
 */
function encC(v) { return String(v).replace(/[^a-z0-9_-]/gi, '').toLowerCase(); }

/**
 * Fetch the guild's custom commands as an array of {name,...}.
 *
 * @param {string} guildId
 * @returns {Array<{ name: string }>}
 */
function getCustomCommands(guildId) {
  try {
    const cmds = customCommandManager.getCommands ? customCommandManager.getCommands(guildId) || [] : [];
    return /** @type {Array<{ name: string }>} */ (cmds);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Setting descriptors per category. Carry optional read()/write() — defaulting
// to settingsManager get/set. Dashboard sections persisted via their own
// manager define read/write calling that manager.
// ---------------------------------------------------------------------------

/** @type {Record<string, SettingDescriptor[]>} */
const SETTINGS = {
  general: [
    { key: 'prefix', kind: 'string', label: 'Command prefix', hint: 'Max 5 chars, no spaces. E.g. !', maxLength: 5, minLength: 1, emoji: '⌨️',
      read: (g) => settingsManager.getPrefix(g),
      write: async (g, v) => { await settingsManager.setPrefixes(g, [String(v)]); } },
    { key: 'prefixes', kind: 'text', label: 'All prefixes (one per line)', hint: 'One prefix per line; max 5.', emoji: '🔤',
      read: (g) => settingsManager.getPrefixes(g).join('\n'),
      write: async (g, v) => { const arr = String(v).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5); if (!arr.length) arr.push('!'); await settingsManager.setPrefixes(g, arr); } },
    { key: 'autoRole', kind: 'role', label: 'Auto-assign role', hint: 'Role assigned to new members.', emoji: '🎖️', write: async (g, v) => settingsManager.set(g, 'autoRole', v || null) },
    { key: 'djRole', kind: 'role', label: 'DJ role', hint: 'Role that can control music.', emoji: '🎧', write: async (g, v) => settingsManager.set(g, 'djRole', v || null) },
  ],
  welcome: [
    { key: 'welcomeEnabled', kind: 'toggle', label: 'Welcome messages', hint: 'Message when a member joins.', emoji: '👋' },
    { key: 'welcomeChannel', kind: 'channel', label: 'Welcome channel', hint: 'Where welcome messages are posted.', emoji: '📣' },
    { key: 'welcomeMessage', kind: 'text', label: 'Welcome message', hint: 'Placeholders: {user}, {server}.', maxLength: 1000, emoji: '✍️' },
  ],
  leave: [
    { key: 'leaveEnabled', kind: 'toggle', label: 'Goodbye messages', hint: 'Message when a member leaves.', emoji: '👋' },
    { key: 'leaveChannel', kind: 'channel', label: 'Goodbye channel', hint: 'Where goodbye messages are posted.', emoji: '📣' },
    { key: 'leaveMessage', kind: 'text', label: 'Goodbye message', hint: 'Placeholders: {user}, {server}.', maxLength: 1000, emoji: '✍️' },
  ],
  logging: [
    { key: 'loggingEnabled', kind: 'toggle', label: 'Logging', hint: 'Toggle the audit-log system.', emoji: '📜' },
    { key: 'loggingChannel', kind: 'channel', label: 'Logging channel', hint: 'Channel receiving audit-log events.', emoji: '📜',
      read: (g) => loggingManager.getLoggingChannel(g),
      write: async (g, v) => { await loggingManager.setLoggingChannel(g, v || null); } },
  ],
  moderation: [
    { key: 'modEnabled', kind: 'toggle', label: 'Moderation', hint: 'Toggle the moderation system.', emoji: '🛡️' },
    { key: 'modLogChannel', kind: 'channel', label: 'Moderation log channel', hint: 'Where moderation actions are logged.', emoji: '🛡️',
      read: (g) => moderationManager.getModLogChannel(g),
      write: async (g, v) => { await moderationManager.setModLogChannel(g, v || null); } },
  ],
  automod: [
    { key: 'autoModEnabled', kind: 'toggle', label: 'Auto-moderation', hint: 'Master toggle.', emoji: '🤖', write: async (g, v) => moderationManager.updateAutomodSettings(g, { enabled: !!v }) },
    { key: 'antiSpam', kind: 'toggle', label: 'Anti-spam', hint: 'Block spam.', emoji: '🚫', write: async (g, v) => moderationManager.updateAutomodSettings(g, { antiSpam: !!v }) },
    { key: 'antiInvite', kind: 'toggle', label: 'Anti-invite', hint: 'Block Discord invite links.', emoji: '🔗', write: async (g, v) => moderationManager.updateAutomodSettings(g, { antiInvite: !!v }) },
    { key: 'emojiOnly', kind: 'toggle', label: 'Emoji-only', hint: 'Force emoji-only in selected channels.', emoji: '😀', write: async (g, v) => moderationManager.updateAutomodSettings(g, { emojiOnly: !!v }) },
    { key: 'maxMentions', kind: 'number', label: 'Max mentions', hint: 'Ignore messages exceeding this many mentions.', min: 1, max: 50, emoji: '📣', write: async (g, v) => moderationManager.updateAutomodSettings(g, { maxMentions: Number(v) }) },
    { key: 'maxEmojis', kind: 'number', label: 'Max emojis', hint: 'Ignore messages exceeding this many emojis.', min: 1, max: 100, emoji: '😀', write: async (g, v) => moderationManager.updateAutomodSettings(g, { maxEmojis: Number(v) }) },
    { key: 'badWords', kind: 'text', label: 'Bad words (one per line)', hint: 'Words auto-moderation blocks.', emoji: '🚷', write: async (g, v) => moderationManager.updateAutomodSettings(g, { badWords: String(v).split('\n').map((s) => s.trim()).filter(Boolean) }) },
  ],
  safety: [
    { key: 'raidEnabled', kind: 'toggle', label: 'Raid protection', hint: 'Detect and block raids.', emoji: '🛑',
      read: (g) => { const s = raidProtectionManager.getSettings(g); return s?.enabled === true; },
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, enabled: !!v }); } },
    { key: 'joinRateLimit', kind: 'number', label: 'Join rate limit', hint: 'Max joins per time window.', min: 2, max: 50, emoji: '⏱️',
      read: (g) => raidProtectionManager.getSettings(g)?.joinRateLimit,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, joinRateLimit: Math.max(2, Number(v)) }); } },
    { key: 'timeWindow', kind: 'number', label: 'Raid window (s)', hint: 'Raid detection window in seconds.', min: 5, max: 600, emoji: '🕐',
      read: (g) => raidProtectionManager.getSettings(g)?.timeWindow,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, timeWindow: Math.max(5, Number(v)) }); } },
    { key: 'accountAgeRequired', kind: 'number', label: 'Min account age (days)', hint: 'Young accounts flagged.', min: 0, max: 3650, emoji: '📅',
      read: (g) => raidProtectionManager.getSettings(g)?.accountAgeRequired,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, accountAgeRequired: Math.max(0, Number(v)) }); } },
    { key: 'verificationEnabled', kind: 'toggle', label: 'Verification', hint: 'Require new members to verify.', emoji: '✅',
      read: (g) => raidProtectionManager.getSettings(g)?.verificationEnabled === true,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, verificationEnabled: !!v }); } },
    { key: 'verificationRole', kind: 'role', label: 'Verified role', hint: 'Role assigned after verification.', emoji: '🎫',
      read: (g) => raidProtectionManager.getSettings(g)?.verificationRole,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, verificationRole: v || null }); } },
    { key: 'autoKickNewAccounts', kind: 'toggle', label: 'Auto-kick new accounts', hint: 'Kick flagged new accounts.', emoji: '👢',
      read: (g) => raidProtectionManager.getSettings(g)?.autoKickNewAccounts === true,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, autoKickNewAccounts: !!v }); } },
    { key: 'autoKickRaiders', kind: 'toggle', label: 'Auto-kick raiders', hint: 'Kick detected raiders.', emoji: '⚔️',
      read: (g) => raidProtectionManager.getSettings(g)?.autoKickRaiders === true,
      write: async (g, v) => { const s = raidProtectionManager.getSettings(g) || {}; await raidProtectionManager.updateSettings(g, { ...s, autoKickRaiders: !!v }); } },
    { key: 'starboardChannel', kind: 'channel', label: 'Starboard channel', hint: 'Channel for starred messages.', emoji: '⭐', write: async (g, v) => settingsManager.set(g, 'starboardChannel', v || null) },
    { key: 'starboardThreshold', kind: 'number', label: 'Starboard threshold', hint: 'Stars needed to post.', min: 1, max: 100, emoji: '⭐', write: async (g, v) => settingsManager.set(g, 'starboardThreshold', Math.max(1, Number(v))) },
  ],
  voice: [
    { key: 'tvHubChannel', kind: 'channel', label: 'Temp-VC hub channel', hint: 'Channel users join to create a voice channel.', emoji: '🎙️',
      read: (g) => tempVoiceManager.getHub(g),
      write: async (g, v) => { if (v) await tempVoiceManager.setHub(g, v); else await tempVoiceManager.removeHub(g); } },
    { key: 'rewardsEnabled', kind: 'toggle', label: 'Voice rewards', hint: 'Earn XP/coins in voice.', emoji: '🎁',
      read: (g) => voiceRewardsManager.getSettings(g)?.enabled === true,
      write: async (g, v) => { const s = voiceRewardsManager.getSettings(g) || {}; await voiceRewardsManager.updateSettings(g, { ...s, enabled: !!v }); } },
    { key: 'xpPerMinute', kind: 'number', label: 'XP per minute', hint: 'Voice XP rate.', min: 0, max: 10000, emoji: '⚡',
      read: (g) => voiceRewardsManager.getSettings(g)?.xpPerMinute,
      write: async (g, v) => { const s = voiceRewardsManager.getSettings(g) || {}; await voiceRewardsManager.updateSettings(g, { ...s, xpPerMinute: Math.max(0, Number(v)) }); } },
    { key: 'coinsPerHour', kind: 'number', label: 'Coins per hour', hint: 'Voice coin rate.', min: 0, max: 1_000_000, emoji: '🪙',
      read: (g) => voiceRewardsManager.getSettings(g)?.coinsPerHour,
      write: async (g, v) => { const s = voiceRewardsManager.getSettings(g) || {}; await voiceRewardsManager.updateSettings(g, { ...s, coinsPerHour: Math.max(0, Number(v)) }); } },
    { key: 'minUsersRequired', kind: 'number', label: 'Min users in VC', hint: 'Users required to earn rewards.', min: 1, max: 50, emoji: '👥',
      read: (g) => voiceRewardsManager.getSettings(g)?.minUsersRequired,
      write: async (g, v) => { const s = voiceRewardsManager.getSettings(g) || {}; await voiceRewardsManager.updateSettings(g, { ...s, minUsersRequired: Math.max(1, Number(v)) }); } },
    { key: 'afkChannelExcluded', kind: 'toggle', label: 'Exclude AFK channel', hint: 'Ignore users in the AFK channel.', emoji: '💤',
      read: (g) => voiceRewardsManager.getSettings(g)?.afkChannelExcluded === true,
      write: async (g, v) => { const s = voiceRewardsManager.getSettings(g) || {}; await voiceRewardsManager.updateSettings(g, { ...s, afkChannelExcluded: !!v }); } },
  ],
  tickets: [
    { key: 'ticketEnabled', kind: 'toggle', label: 'Tickets', hint: 'Enable the ticket system.', emoji: '🎫',
      read: (g) => ticketManager.getSettings(g)?.enabled === true,
      write: async (g, v) => { const s = ticketManager.getSettings(g) || {}; await ticketManager.setSettings(g, { ...s, enabled: !!v }); } },
    { key: 'ticketCategory', kind: 'category', label: 'Ticket category', hint: 'Category where ticket channels are created.', emoji: '🗂️',
      read: (g) => ticketManager.getSettings(g)?.categoryId,
      write: async (g, v) => { const s = ticketManager.getSettings(g) || {}; await ticketManager.setSettings(g, { ...s, categoryId: v || null }); } },
    { key: 'ticketLogsChannel', kind: 'channel', label: 'Ticket logs channel', hint: 'Channel for ticket transcripts.', emoji: '📂',
      read: (g) => ticketManager.getSettings(g)?.logsChannelId,
      write: async (g, v) => { const s = ticketManager.getSettings(g) || {}; await ticketManager.setSettings(g, { ...s, logsChannelId: v || null }); } },
  ],
  suggestions: [
    { key: 'sugEnabled', kind: 'toggle', label: 'Suggestions', hint: 'Enable the suggestion system.', emoji: '💡',
      read: (g) => suggestionManager.getSettings(g)?.enabled === true,
      write: async (g, v) => { const s = suggestionManager.getSettings(g) || {}; await suggestionManager.updateSettings(g, { ...s, enabled: !!v }); } },
    { key: 'sugChannel', kind: 'channel', label: 'Suggestions channel', hint: 'Where suggestions are posted.', emoji: '📨',
      read: (g) => suggestionManager.getSettings(g)?.channelId,
      write: async (g, v) => { const s = suggestionManager.getSettings(g) || {}; await suggestionManager.updateSettings(g, { ...s, channelId: v || null }); } },
    { key: 'sugAutoThread', kind: 'toggle', label: 'Auto-thread', hint: 'Thread per suggestion.', emoji: '🧵',
      read: (g) => suggestionManager.getSettings(g)?.autoThread === true,
      write: async (g, v) => { const s = suggestionManager.getSettings(g) || {}; await suggestionManager.updateSettings(g, { ...s, autoThread: !!v }); } },
    { key: 'sugVoting', kind: 'toggle', label: 'Voting', hint: 'Allow up/down votes.', emoji: '🗳️',
      read: (g) => suggestionManager.getSettings(g)?.votingEnabled === true,
      write: async (g, v) => { const s = suggestionManager.getSettings(g) || {}; await suggestionManager.updateSettings(g, { ...s, votingEnabled: !!v }); } },
    { key: 'sugStaffRole', kind: 'role', label: 'Staff role', hint: 'Role that approves/denies suggestions.', emoji: '🛠️',
      read: (g) => suggestionManager.getSettings(g)?.staffRoleId,
      write: async (g, v) => { const s = suggestionManager.getSettings(g) || {}; await suggestionManager.updateSettings(g, { ...s, staffRoleId: v || null }); } },
  ],
  alerts: [
    { key: 'epicChannel', kind: 'channel', label: 'Epic Games alerts channel', hint: 'Free game alerts. Empty = disabled.', emoji: '🆓',
      read: (g) => epicGamesAlertsManager.getGuildConfig(g)?.channelId,
      write: async (g, v) => { if (v) await epicGamesAlertsManager.enableAlerts(g, String(v)); else await epicGamesAlertsManager.disableAlerts(g); } },
    { key: 'steamFreeChannel', kind: 'channel', label: 'Steam free-games channel', hint: 'Empty = disabled.', emoji: '🎮',
      read: (g) => steamFreeGamesAlertsManager.getGuildConfig(g)?.channelId,
      write: async (g, v) => { if (v) await steamFreeGamesAlertsManager.enableAlerts(g, String(v)); else await steamFreeGamesAlertsManager.disableAlerts(g); } },
    { key: 'steamPromoChannel', kind: 'channel', label: 'Steam promos channel', hint: 'Empty = disabled.', emoji: '🏷️',
      read: (g) => steamFreeGamesAlertsManager.getPromoGuildConfig(g)?.channelId,
      write: async (g, v) => { if (v) await steamFreeGamesAlertsManager.enablePromoAlerts(g, String(v)); else await steamFreeGamesAlertsManager.disableAlerts(g); } },
    { key: 'steamUpdateChannel', kind: 'channel', label: 'Steam updates channel', hint: 'Game update alerts. Empty = disabled.', emoji: '🆙',
      read: (g) => steamGameUpdatesManager.getGuildConfig(g)?.channelId,
      write: async (g, v) => { await steamGameUpdatesManager.updateGuildConfig(g, v || null, undefined, { enabled: !!v }); } },
  ],
  telegram: [
    { key: 'tgEnabled', kind: 'toggle', label: 'Telegram sync', hint: 'Bridge Discord <-> Telegram.', emoji: '✈️',
      read: (g) => telegramSyncManager.getGuildConfig(g)?.enabled === true,
      write: async (g, v) => { const c = telegramSyncManager.getGuildConfig(g) || {}; await telegramSyncManager.updateGuildConfig(g, { ...c, enabled: !!v }); } },
    { key: 'tgChannel', kind: 'channel', label: 'Discord channel', hint: 'Discord channel bridged to Telegram.', emoji: '💬',
      read: (g) => telegramSyncManager.getGuildConfig(g)?.discordChannelId,
      write: async (g, v) => { const c = telegramSyncManager.getGuildConfig(g) || {}; await telegramSyncManager.updateGuildConfig(g, { ...c, discordChannelId: v || null }); } },
    { key: 'tgChatId', kind: 'string', label: 'Telegram chat ID', hint: 'Telegram chat to bridge (numeric or @username).', emoji: '📲',
      read: (g) => telegramSyncManager.getGuildConfig(g)?.telegramChatId,
      write: async (g, v) => { const c = telegramSyncManager.getGuildConfig(g) || {}; await telegramSyncManager.updateGuildConfig(g, { ...c, telegramChatId: String(v || '') }); } },
    { key: 'tgToDiscord', kind: 'toggle', label: 'Telegram -> Discord', hint: 'Forward Telegram messages to Discord.', emoji: '⬇️',
      read: (g) => telegramSyncManager.getGuildConfig(g)?.syncTelegramToDiscord === true,
      write: async (g, v) => { const c = telegramSyncManager.getGuildConfig(g) || {}; await telegramSyncManager.updateGuildConfig(g, { ...c, syncTelegramToDiscord: !!v }); } },
    { key: 'tgToTelegram', kind: 'toggle', label: 'Discord -> Telegram', hint: 'Forward Discord messages to Telegram.', emoji: '⬆️',
      read: (g) => telegramSyncManager.getGuildConfig(g)?.syncDiscordToTelegram === true,
      write: async (g, v) => { const c = telegramSyncManager.getGuildConfig(g) || {}; await telegramSyncManager.updateGuildConfig(g, { ...c, syncDiscordToTelegram: !!v }); } },
  ],
  commands: [
    { key: '_commands_list', kind: 'commandlist', label: 'Custom commands', hint: 'Manage custom commands (add / remove).', emoji: '⌨️' },
  ],
  serverprofile: [
    { key: 'serverProfile', kind: 'json', label: 'Server profile (JSON)', hint: 'Paste a JSON object. Advanced — malformed JSON is rejected.', maxLength: 2000, emoji: '🖥️' },
  ],
};

// ---------------------------------------------------------------------------
// Read / format helpers
// ---------------------------------------------------------------------------

/**
 * @param {SettingDescriptor} setting
 * @param {string} guildId
 * @returns {unknown}
 */
function readSetting(setting, guildId) {
  if (typeof setting.read === 'function') {
    try { return setting.read(guildId); } catch { return undefined; }
  }
  const s = settingsManager.get(guildId);
  return s ? s[setting.key] : undefined;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === undefined || value === null) return '*not set*';
  if (typeof value === 'boolean') return value ? '✅ Enabled' : '❌ Disabled';
  if (Array.isArray(value)) return value.length ? `\`${value.join('\`, \`')}\``.slice(0, 300) : '*empty*';
  if (typeof value === 'object') {
    try { return '```json\n' + JSON.stringify(value, null, 2).slice(0, 900) + '```'; } catch { return '```' + String(value).slice(0, 900) + '```'; }
  }
  const s = String(value);
  return s.length > 900 ? s.slice(0, 897) + '...' : s;
}

/**
 * @param {SettingDescriptor} s
 * @param {string} guildId
 * @returns {string}
 */
function valueLine(s, guildId) {
  const v = readSetting(s, guildId);
  return `> ${formatValue(v).replace(/\n/g, ' ').slice(0, 90)}`;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * @param {import('discord.js').Guild | null} guild
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildCategoryRow(guild) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('setup:select:__category__:token')
    .setPlaceholder('Choose a category…')
    .addOptions(CATEGORY_IDS.map((id) => new StringSelectMenuOptionBuilder()
      .setLabel(CATEGORY_LABELS[id] || id)
      .setValue(id)
      .setDescription(`Configure ${CATEGORY_LABELS[id] || id}`)));
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * @param {import('discord.js').Guild | null} guild
 * @param {SettingDescriptor} s
 * @param {string} token
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildPickerRow(guild, s, token) {
  if (s.kind === 'role') {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(`setup:role:__cat__:${s.key}:${token}`);
    return new ActionRowBuilder().addComponents(menu);
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`setup:${s.kind}:__cat__:${s.key}:${token}`)
    .setPlaceholder(`Choose a ${s.kind === 'category' ? 'category' : 'channel'}…`)
    .addOptions(
      (/** @type {any} */ (guild).channels.cache
        .filter((/** @type {any} */ c) => s.kind === 'category' ? c.type === ChannelType.GuildCategory : c.type === ChannelType.GuildText)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => a.position - b.position)
        .first(25))
        .map((/** @type {any} */ c) => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.id).setDescription(`#${c.name} · ${c.id}`))
    );
  return new ActionRowBuilder().addComponents(menu);
}

/**
 * @param {string} customId
 * @param {string} title
 * @param {SettingDescriptor} s
 * @param {unknown} current
 * @returns {import('discord.js').ModalBuilder}
 */
function buildValueModal(customId, title, s, current) {
  const isNumber = s.kind === 'number';
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(s.label.slice(0, 45))
    .setRequired(true)
    .setStyle(isNumber ? TextInputStyle.Short : TextInputStyle.Paragraph);
  if (typeof s.maxLength === 'number') input.setMaxLength(s.maxLength);
  if (typeof s.minLength === 'number') input.setMinLength(s.minLength);
  if (current !== undefined && current !== null) input.setValue(String(current).slice(0, 1000));
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(/** @type {any} */ (new ActionRowBuilder().addComponents(input)));
}

/**
 * @param {import('discord.js').Guild | null} guild
 * @param {SettingDescriptor} s
 * @param {string} token
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildSettingRow(guild, s, token) {
  const btn = new ButtonBuilder()
    .setCustomId(`setup:${s.kind}:__cat__:${s.key}:${token}`)
    .setLabel(s.label.length > 45 ? s.label.slice(0, 42) + '…' : s.label)
    .setStyle(s.kind === 'toggle' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setEmoji(s.emoji || '⚙️');
  return new ActionRowBuilder().addComponents(btn);
}

/**
 * @param {import('discord.js').Guild | null} guild
 * @param {string} category
 * @param {string} token
 * @returns {{ embed: import('discord.js').EmbedBuilder, components: any[] }}
 */
function renderCategory(guild, category, token) {
  const catId = CATEGORY_IDS.find((c) => encC(c) === encC(category)) || category;
  const list = SETTINGS[catId] || [];
  const guildId = String(guild?.id || '');

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`${CATEGORY_LABELS[catId] || catId}`)
    .setDescription('Choose a setting to change it.');

  const components = [];

  for (const s of list) {
    if (s.kind === 'commandlist') {
      const cmds = getCustomCommands(guildId);
      const summary = cmds.length ? cmds.map((c) => c.name).join(', ').slice(0, 200) : '*none*';
      embed.addFields([{ name: 'Custom commands', value: `> ${summary}`, inline: false }]);
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:cmd-add:${token}`).setLabel('Add command').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`setup:cmd-remove:${token}`).setLabel('Remove command').setStyle(ButtonStyle.Danger).setEmoji('➖')
      ));
    } else {
      embed.addFields([{ name: `${s.emoji || '⚙️'} ${s.label}`, value: valueLine(s, guildId), inline: false }]);
      components.push(buildSettingRow(guild, s, token));
    }
  }
  if (!list.length) embed.addFields([{ name: 'Empty', value: '> No settings in this category.', inline: false }]);

  // Pack setting rows ≤5 components each, then append nav.
  const packed = [];
  let cur = null;
  for (const r of components) {
    if (!cur) { cur = r; continue; }
    if (cur.components.length + r.components.length > 5) { packed.push(cur); cur = r; }
    else { cur.addComponents(r.components[0]); }
  }
  if (cur) packed.push(cur);

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setup:back:${token}`).setLabel('‹ Back').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    new ButtonBuilder().setCustomId(`setup:done:${token}`).setLabel('Done').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`setup:reset:${token}`).setLabel('Reset all').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
  );
  packed.push(nav);

  return { embed, components: packed };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Acknowledge a component/modal interaction and render the given payload.
 * Component & modal interactions must be acked with update() (repo's editReply
 * throws InteractionNotReplied on a fresh, un-deferred interaction -> Discord
 * times out with "did not respond"). Slash-command interactions use editReply.
 *
 * @param {any} interaction
 * @param {any} payload
 * @returns {Promise<void>}
 */
async function safeAck(interaction, payload) {
  try {
    if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      await interaction.update(payload);
    } else if (interaction.isMessageComponent && interaction.isMessageComponent()) {
      await interaction.update(payload);
    } else {
      await interaction.editReply(payload);
    }
  } catch (e) {
    console.error('[setup] ack failed:', e && /** @type {any} */ (e).message);
  }
}

/**
 * @param {import('discord.js').ModalSubmitInteraction | import('discord.js').CommandInteraction} interaction
 * @param {string} category
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
async function saveSetting(interaction, category, key, value) {
  const catId = CATEGORY_IDS.find((c) => encC(c) === encC(category)) || category;
  const list = SETTINGS[catId] || [];
  const s = list.find((x) => x.key === key);
  if (!s) {
    await safeAck(interaction, { embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Setting not found.')], components: [] });
    return false;
  }
  const guildId = String(interaction.guildId);

  try {
    const write = s.write || (async (g, v) => { await settingsManager.set(g, s.key, v); });
    const guild = /** @type {any} */ (interaction.guild);
    await write(guildId, value, guild);

    // Welcome / leave: sync welcomeChannel/leaveChannel to welcomeMessageManager.
    if (key === 'welcomeChannel' || key === 'leaveChannel') {
      const wm = /** @type {any} */ (interaction.client)?.welcomeMessageManager;
      if (wm) {
        const cfg = wm.getWelcomeConfig(guildId) || {};
        const isLeave = catId === 'leave';
        await wm.setWelcomeConfig(guildId, {
          ...cfg,
          enabled: cfg.enabled !== undefined ? cfg.enabled : true,
          channelId: isLeave ? cfg.channelId : String(value || cfg.channelId || ''),
        });
      }
    }

    await safeAck(interaction, { embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Setting updated').setDescription(`**${s.label}** set to:\n${formatValue(value)}`)], components: [] });
    return true;
  } catch (err) {
    const msg = /** @type {any} */ (err)?.message || 'Unknown error';
    await safeAck(interaction, { embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription(`Could not save **${s.label}**: ${msg}`)], components: [] });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Category action loop
// ---------------------------------------------------------------------------

/**
 * Await a modal submission on the interaction that opened the modal.
 * channel.awaitMessageComponent does NOT yield modal submissions — they must
 * be awaited via the opening interaction's awaitModalSubmit.
 *
 * @param {any} opener interaction that called showModal
 * @param {string} customId the modal's customId
 * @param {string} userId actor id to filter on
 * @returns {Promise<import('discord.js').ModalSubmitInteraction | null>}
 */
async function awaitModal(opener, customId, userId) {
  try {
    return await opener.awaitModalSubmit({
      filter: (/** @type {any} */ i) => i.customId === customId && i.user.id === userId,
      time: COMPONENT_TIMEOUT,
    });
  } catch {
    return null;
  }
}

/**
 * @param {import('discord.js').CommandInteraction} interaction
 * @param {string} categoryId
 * @param {string} token
 * @returns {Promise<'done' | 'back' | 'timeout'>}
 */
async function categoryLoop(interaction, categoryId, token) {
  const channel = /** @type {any} */ (interaction.channel);
  const guild = /** @type {any} */ (interaction.guild);
  const userId = interaction.user.id;
  const catId = CATEGORY_IDS.find((c) => encC(c) === encC(categoryId)) || categoryId;

  while (true) {
    const collected = await Promise.race([
      channel.awaitMessageComponent({
        filter: (/** @type {any} */ i) => i.customId.startsWith('setup:') && i.user.id === userId,
        time: COMPONENT_TIMEOUT,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
    ]);
    if (!collected) return 'timeout';

    const parts = /** @type {string} */ (collected.customId).split(':');
    const kind = parts[1];

    if (kind === 'done') { await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Setup complete').setDescription('Your configuration has been saved.')], components: [] }).catch(() => {}); return 'done'; }
    if (kind === 'back') { await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle('⚙️ Server setup').setDescription('Choose a category below.')], components: [buildCategoryRow(guild)] }).catch(() => {}); return 'back'; }
    if (kind === 'reset') {
      await collected.update({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Reset ALL settings?').setDescription('This restores core settings to defaults. This cannot be undone.')],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`setup:reset-confirm:${token}`).setLabel('Yes, reset').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`setup:reset-cancel:${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        )],
      }).catch(() => {});
      continue;
    }
    if (kind === 'reset-confirm') { settingsManager.reset(String(interaction.guildId)); await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Configuration reset').setDescription('Core settings restored to defaults.')], components: [] }).catch(() => {}); return 'done'; }
    if (kind === 'reset-cancel') { await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Reset cancelled').setDescription('No changes made.')], components: [] }).catch(() => {}); return 'back'; }

    if (kind === 'cmd-add') {
      const modal = new ModalBuilder()
        .setCustomId(`setup:cmd-create:${token}`)
        .setTitle('New custom command')
        .addComponents(
          /** @type {any} */ (new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Command name (no prefix)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20))),
          /** @type {any} */ (new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('response').setLabel('Response text').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)))
        );
      await collected.showModal(modal);
      // Modals are awaited on the interaction that opened them, NOT via
      // channel.awaitMessageComponent. Await the submit inline.
      const modalSubmit = await awaitModal(collected, `setup:cmd-create:${token}`, userId);
      if (!modalSubmit) continue;
      const name = String(modalSubmit.fields.getTextInputValue('name') || '').toLowerCase().trim();
      const response = String(modalSubmit.fields.getTextInputValue('response') || '');
      if (!name || !response) { await modalSubmit.reply({ content: 'Name and response are required.', flags: MessageFlags.Ephemeral }).catch(() => {}); continue; }
      let exists = false;
      try { exists = !!customCommandManager.getCommand && !!customCommandManager.getCommand(String(interaction.guildId), name); } catch { exists = false; }
      if (exists) { await modalSubmit.reply({ content: `Command **${name}** already exists.`, flags: MessageFlags.Ephemeral }).catch(() => {}); continue; }
      try {
        await customCommandManager.addCommand(String(interaction.guildId), name, response);
        await modalSubmit.reply({ content: `✅ Custom command **${name}** created.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      } catch (e) { await modalSubmit.reply({ content: `Error: ${/** @type {any} */ (e)?.message || e}`, flags: MessageFlags.Ephemeral }).catch(() => {}); }
      const rc = renderCategory(guild, catId, token);
      await collected.editReply({ embeds: [rc.embed], components: rc.components }).catch(() => {});
      continue;
    }
    if (kind === 'cmd-remove') {
      const cmds = getCustomCommands(String(interaction.guildId));
      if (!cmds.length) { await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('No custom commands').setDescription('There are no custom commands to remove.')], components: [] }).catch(() => {}); continue; }
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`setup:cmd-delete:${token}`)
        .setPlaceholder('Choose a command to delete…')
        .addOptions(cmds.slice(0, 25).map((c) => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.name)));
      await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Remove a command').setDescription('Pick a command to remove.')], components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => {});
      continue;
    }
    if (kind === 'cmd-delete') {
      const name = String(collected.values[0]);
      try { await customCommandManager.removeCommand(String(interaction.guildId), name); await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Removed').setDescription(`Command **${name}** removed.`)], components: [] }).catch(() => {}); }
      catch { await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Error').setDescription('Could not remove command.')], components: [] }).catch(() => {}); }
      const rc2 = renderCategory(guild, catId, token);
      await collected.editReply({ embeds: [rc2.embed], components: rc2.components }).catch(() => {});
      continue;
    }

    // setup:KIND:CAT:KEY:TOKEN
    const key = parts[3] || '';
    const s = (SETTINGS[catId] || []).find((x) => x.key === key);

    if (kind === 'toggle' && s) {
      const current = Boolean(readSetting(s, String(interaction.guildId)));
      const ok = await saveSetting(collected, catId, key, !current);
      if (ok) { const rc = renderCategory(guild, catId, token); await collected.editReply({ embeds: [rc.embed], components: rc.components }).catch(() => {}); }
      continue;
    }

    if ((kind === 'channel' || kind === 'category') && s) {
      if (collected.isStringSelectMenu()) {
        const value = collected.values && collected.values[0] ? collected.values[0] : null;
        const ok = await saveSetting(collected, catId, key, value);
        if (ok) { const rc = renderCategory(guild, catId, token); await collected.editReply({ embeds: [rc.embed], components: rc.components }).catch(() => {}); }
      } else {
        const row = buildPickerRow(guild, s, token);
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle(`Select ${s.label}`).setDescription('Pick from the menu.')], components: [row] }).catch(() => {});
      }
      continue;
    }

    if (kind === 'role' && s) {
      if (collected.isRoleSelectMenu()) {
        const value = collected.values && collected.values[0] ? collected.values[0] : null;
        const ok = await saveSetting(collected, catId, key, value);
        if (ok) { const rc = renderCategory(guild, catId, token); await collected.editReply({ embeds: [rc.embed], components: rc.components }).catch(() => {}); }
      } else {
        const row = buildPickerRow(guild, s, token);
        await collected.update({ embeds: [new EmbedBuilder().setColor(Colors.Blurple).setTitle(`Select ${s.label}`).setDescription('Pick a role from the menu.')], components: [row] }).catch(() => {});
      }
      continue;
    }

    if ((kind === 'string' || kind === 'number' || kind === 'json' || kind === 'text') && s) {
      const modalCustomId = `setup:${kind}:${encC(catId)}:${key}:${token}`;
      const modal = buildValueModal(modalCustomId, `Edit ${s.label}`, s, readSetting(s, String(interaction.guildId)));
      await collected.showModal(modal);
      // Await the modal submit inline — channel.awaitMessageComponent never
      // yields modal submissions.
      const submit = await awaitModal(collected, modalCustomId, userId);
      if (!submit) continue;
      const raw = String(submit.fields.getTextInputValue('value') || '');
      let value = /** @type {any} */ (raw);
      if (kind === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n)) { await submit.reply({ content: 'Please enter a valid number.', flags: MessageFlags.Ephemeral }).catch(() => {}); continue; }
        const mn = s.min !== undefined ? s.min : Number.NEGATIVE_INFINITY;
        const mx = s.max !== undefined ? s.max : Number.POSITIVE_INFINITY;
        if (n < mn || n > mx) { await submit.reply({ content: `Number must be between ${mn} and ${mx}.`, flags: MessageFlags.Ephemeral }).catch(() => {}); continue; }
        value = n;
      } else if (kind === 'json') {
        try { JSON.parse(raw); } catch { await submit.reply({ content: 'Invalid JSON. Please check your input.', flags: MessageFlags.Ephemeral }).catch(() => {}); continue; }
      }
      const ok = await saveSetting(submit, catId, key, value);
      if (ok) { const rc = renderCategory(guild, catId, token); await submit.editReply({ embeds: [rc.embed], components: rc.components }).catch(() => {}); }
      continue;
    }

    await collected.deferUpdate().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure this server from inside Discord (mirrors the dashboard).')
    .setDefaultMemberPermissions(0x8n)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the current server configuration.'))
    .addSubcommand((sub) => sub.setName('config').setDescription('Open the interactive configuration flow.'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Restore all settings to defaults (confirm in Discord).')),

  /**
   * @param {import('discord.js').CommandInteraction} interaction
   * @param {import('discord.js').Client} client
   * @returns {Promise<void>}
   */
  async execute(interaction, client) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Guild only').setDescription('This command can only be used inside a server.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    const member = /** @type {import('discord.js').GuildMember | null} */ (interaction.member);
    if (!member || !member.permissions.has('ManageGuild')) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('No permission').setDescription('You need the **Manage Server** permission to use this command.')], flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }

    const sub = /** @type {any} */ (interaction).options.getSubcommand();
    const token = Math.random().toString(36).slice(2, 10);
    const guildId = String(interaction.guildId);

    if (sub === 'view') {
      /** @type {Array<{ category: string, label: string, value: string }>} */
      const rows = [];
      for (const c of CATEGORY_IDS) {
        for (const s of SETTINGS[c] || []) {
          if (s.kind === 'commandlist') {
            const cmds = getCustomCommands(guildId);
            rows.push({ category: c, label: 'Custom commands', value: cmds.length ? cmds.map((x) => x.name).join(', ') : '*none*' });
          } else {
            rows.push({ category: c, label: s.label, value: formatValue(readSetting(s, guildId)).replace(/\n/g, ' ') });
          }
        }
      }
      const totalPages = Math.max(1, Math.ceil(rows.length / VIEW_PAGE_SIZE));
      const page = 0;
      const mkEmbed = (/** @type {number} */ p) => {
        const pRows = rows.slice(p * VIEW_PAGE_SIZE, (p + 1) * VIEW_PAGE_SIZE);
        const e = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setAuthor({ name: 'Server Configuration', iconURL: /** @type {any} */ (interaction.guild).iconURL({ size: 64 }) ?? undefined })
          .setTitle('⚙️ /setup view')
          .setDescription('Current server configuration. Use `/setup config` to change values.')
          .setFooter({ text: `Page ${p + 1}/${totalPages} · ${rows.length} settings` });
        for (const r of pRows) e.addFields({ name: `${CATEGORY_LABELS[r.category] || r.category} — ${r.label}`, value: `> ${r.value}` || '', inline: false });
        if (!pRows.length) e.addFields({ name: 'No settings', value: 'This page is empty.', inline: false });
        return e;
      };
      const mkNav = (/** @type {number} */ p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:pagination:${token}:prev`).setLabel('‹ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId(`setup:pagination:${token}:next`).setLabel('Next ›').setStyle(ButtonStyle.Secondary).setDisabled(p === totalPages - 1),
        new ButtonBuilder().setCustomId(`setup:view-done:${token}`).setLabel('Close').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ embeds: [mkEmbed(page)], components: /** @type {any} */ ([mkNav(page)]), flags: MessageFlags.Ephemeral }).catch(() => {});
      let cur = 0;
      try {
        while (true) {
          const collected = await Promise.race([
            /** @type {any} */ (interaction.channel).awaitMessageComponent({
              filter: (/** @type {any} */ i) => (i.customId.startsWith(`setup:pagination:${token}`) || i.customId === `setup:view-done:${token}`) && i.user.id === interaction.user.id,
              time: COMPONENT_TIMEOUT,
              componentType: 2,
            }),
            new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
          ]);
          if (!collected) break;
          if (collected.customId === `setup:view-done:${token}`) { await collected.deferUpdate().catch(() => {}); break; }
          cur = collected.customId.endsWith(':next') ? Math.min(totalPages - 1, cur + 1) : Math.max(0, cur - 1);
          await collected.update({ embeds: [mkEmbed(cur)], components: [mkNav(cur)] }).catch(() => {});
        }
      } catch { /* timeout */ }
      return;
    }

    if (sub === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup:reset-confirm:${token}`).setLabel('Yes, reset everything').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`setup:reset-cancel:${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Reset server configuration?').setDescription('This restores the core settings to defaults. This cannot be undone.')],
        components: /** @type {any} */ ([row]), flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      try {
        const confirm = await /** @type {any} */ (interaction.channel).awaitMessageComponent({
          filter: (/** @type {any} */ i) => (i.customId === `setup:reset-confirm:${token}` || i.customId === `setup:reset-cancel:${token}`) && i.user.id === interaction.user.id,
          time: COMPONENT_TIMEOUT,
        });
        if (confirm.customId.startsWith('setup:reset-confirm')) {
          settingsManager.reset(guildId);
          await confirm.update({ embeds: [new EmbedBuilder().setColor(Colors.Green).setTitle('Configuration reset').setDescription('Core settings restored to defaults.')], components: [] }).catch(() => {});
        } else {
          await confirm.update({ embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Reset cancelled').setDescription('No changes made.')], components: [] }).catch(() => {});
        }
      } catch { /* timeout */ }
      return;
    }

    // /setup config — category loop
    const startEmbed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle('⚙️ Server setup')
      .setDescription('Choose a category to configure.\n\nUse `/setup view` to see the current config.');
    await interaction.reply({ embeds: [startEmbed], components: /** @type {any} */ ([buildCategoryRow(interaction.guild)]), flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
      while (true) {
        const select = await Promise.race([
          /** @type {any} */ (interaction.channel).awaitMessageComponent({
            filter: (/** @type {any} */ i) => i.customId === 'setup:select:__category__:token' && i.user.id === interaction.user.id,
            time: COMPONENT_TIMEOUT,
          }),
          new Promise((resolve) => setTimeout(() => resolve(null), COMPONENT_TIMEOUT)),
        ]);
        if (!select) break;
        const cat = String(select.values[0]);
        const { embed, components } = renderCategory(interaction.guild, cat, token);
        await select.update({ embeds: [embed], components }).catch(() => {});
        const result = await categoryLoop(interaction, cat, token);
        if (result === 'done' || result === 'timeout') break;
        // result === 'back' — re-show the category picker
        const again = new EmbedBuilder().setColor(Colors.Blurple).setTitle('⚙️ Server setup').setDescription('Choose a category below, or close this message.');
        await interaction.editReply({ embeds: [again], components: /** @type {any} */ ([buildCategoryRow(interaction.guild)]) }).catch(() => {});
      }
    } catch (err) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Grey).setTitle('Setup closed').setDescription('Setup timed out or was closed. Run `/setup config` again to continue.')], components: [] }).catch(() => {});
    }
  },
};
