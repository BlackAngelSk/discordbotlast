const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

// Registered toggleable features and their descriptions
const FEATURES = {
    economy: 'Economy system (XP, coins, shop, leaderboard)',
    leveling: 'Level-up announcements and level rewards',
    music: 'Music playback commands',
    ai: 'AI chat responses',
    games: 'Fun games (wordle, hangman, heist, fish, hunt)',
    pets: 'Pet system',
    confessions: 'Anonymous confessions',
    reports: 'User report system',
    verification: 'Server verification gate',
    sticky: 'Sticky messages',
    achievements: 'Achievement / badge system',
    welcomeCards: 'Welcome/leave cards',
    automod: 'Auto-moderation (anti-spam, anti-invite, etc.)',
    starboard: 'Starboard',
    suggestions: 'Suggestion system',
    tickets: 'Support ticket system',
    birthdays: 'Birthday announcements',
    analytics: 'Analytics tracking',
    liveAlerts: 'Twitch/YouTube live alerts',
    bumpReminder: 'Disboard bump reminders',
};

function getFlags(guildId) {
    const settings = settingsManager.get(guildId);
    if (!settings.features) settings.features = {};
    return settings.features;
}

module.exports = {
    name: 'features',
    description: 'Enable or disable bot features per server.',
    usage: '!features list\n!features enable <feature>\n!features disable <feature>',
    aliases: ['feature', 'toggle'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        // ── list ──────────────────────────────────────────────────────────────
        if (!sub || sub === 'list') {
            const flags = getFlags(guildId);
            const lines = Object.entries(FEATURES).map(([key, desc]) => {
                const enabled = flags[key] !== false; // default enabled
                return `${enabled ? '✅' : '❌'} \`${key}\` — ${desc}`;
            });
            const embed = new EmbedBuilder()
                .setTitle('🎛️ Server Feature Flags')
                .setColor(0x5865f2)
                .setDescription(lines.join('\n'))
                .setFooter({ text: 'All features are enabled by default. Use !features disable <name> to turn one off.' });
            return message.reply({ embeds: [embed] });
        }

        // ── enable / disable ──────────────────────────────────────────────────
        if (sub === 'enable' || sub === 'disable') {
            const featureName = args[1]?.toLowerCase();
            if (!featureName) return message.reply(`❌ Provide a feature name. See \`!features list\`.`);
            if (!FEATURES[featureName]) {
                return message.reply(`❌ Unknown feature \`${featureName}\`. See \`!features list\` for valid options.`);
            }

            const settings = settingsManager.get(guildId);
            if (!settings.features) settings.features = {};
            settings.features[featureName] = sub === 'enable';
            settingsManager.save();

            const state = sub === 'enable' ? '✅ Enabled' : '❌ Disabled';
            return message.reply(`${state} feature **${featureName}** — ${FEATURES[featureName]}`);
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};

// Helper: check if a feature is enabled for a guild (use in other commands if needed)
module.exports.isEnabled = function(guildId, featureName) {
    const settings = settingsManager.get(guildId);
    if (!settings.features) return true;
    return settings.features[featureName] !== false; // default true
};
