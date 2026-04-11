const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const economyManager = require('../../utils/economyManager');

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return val * multipliers[unit];
}

function formatDuration(ms) {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

module.exports = {
    name: 'xpevent',
    description: 'Start or stop an XP multiplier event for the server',
    usage: '!xpevent start <multiplier> <duration> | !xpevent stop | !xpevent status',
    aliases: ['doublexp', 'xpboost'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'stop') {
            economyManager.stopXPEvent(message.guild.id);
            return message.reply('✅ XP event stopped. XP is back to normal.');
        }

        if (sub === 'status') {
            const ev = economyManager.getXPEvent(message.guild.id);
            if (!ev) return message.reply('❌ No XP event is currently active.');
            const remaining = ev.endsAt - Date.now();
            return message.reply(`✨ Active XP event: **${ev.multiplier}x** — ends <t:${Math.floor(ev.endsAt / 1000)}:R>`);
        }

        if (sub === 'start') {
            const multiplier = parseFloat(args[1]);
            if (!multiplier || multiplier < 1.1 || multiplier > 10) {
                return message.reply('❌ Multiplier must be between 1.1 and 10. Example: `2` for double XP.');
            }
            const duration = parseDuration(args[2] || '');
            if (!duration) {
                return message.reply('❌ Invalid duration. Examples: `1h`, `2h`, `1d`');
            }
            if (duration > 7 * 24 * 60 * 60 * 1000) {
                return message.reply('❌ Maximum event duration is 7 days.');
            }

            economyManager.startXPEvent(message.guild.id, multiplier, duration);

            const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle('✨ XP Event Started!')
                .setDescription(`All members will earn **${multiplier}x XP** for the next **${formatDuration(duration)}**!`)
                .addFields(
                    { name: '✖️ Multiplier', value: `${multiplier}x`, inline: true },
                    { name: '⏰ Ends', value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            return;
        }

        return message.reply('❌ Usage: `!xpevent start <multiplier> <duration>` | `!xpevent stop` | `!xpevent status`');
    }
};
