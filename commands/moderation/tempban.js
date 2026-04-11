const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Parse duration strings like "1d", "2h", "30m", "600s"
function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d|w)$/);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return val * multipliers[unit];
}

function formatDuration(ms) {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return `${Math.floor(d / 7)}w`;
}

module.exports = {
    name: 'tempban',
    description: 'Temporarily ban a member for a specified duration',
    usage: '!tempban <@user> <duration> [reason]',
    aliases: ['tban'],
    category: 'moderation',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ You need **Ban Members** permission to use this command.');
        }
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply('❌ I need **Ban Members** permission to do that.');
        }
        if (args.length < 2) {
            return message.reply('❌ Usage: `!tempban <@user> <duration> [reason]`\nDuration examples: `1h`, `2d`, `1w`');
        }

        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Please mention a valid member.');
        if (!member.bannable) return message.reply('❌ I cannot ban this member. They may have a higher role.');
        if (member.id === message.author.id) return message.reply('❌ You cannot ban yourself!');
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && member.id === botOwnerId) return message.reply('❌ Cannot ban the bot owner!');

        const duration = parseDuration(args[1]);
        if (!duration) return message.reply('❌ Invalid duration. Examples: `10m`, `1h`, `2d`, `1w`');

        const MAX_DURATION = 28 * 24 * 60 * 60 * 1000; // 28 days
        if (duration > MAX_DURATION) return message.reply('❌ Maximum temp-ban duration is 28 days.');

        const reason = args.slice(2).join(' ') || 'No reason provided';
        const unbanAt = Date.now() + duration;

        try {
            await member.ban({ reason: `[TempBan ${formatDuration(duration)}] ${reason}` });
        } catch (err) {
            console.error('Tempban error:', err);
            return message.reply('❌ Failed to ban the member.');
        }

        // Store pending unban
        if (!global._tempBans) global._tempBans = new Map();
        const key = `${message.guild.id}_${member.id}`;
        global._tempBans.set(key, {
            guildId: message.guild.id,
            userId: member.id,
            unbanAt,
            reason
        });

        // Schedule the unban
        setTimeout(async () => {
            global._tempBans.delete(key);
            try {
                await message.guild.members.unban(member.id, 'Temp-ban expired').catch(() => {});
                console.log(`✅ Auto-unbanned ${member.user.tag} in ${message.guild.name}`);
            } catch (err) {
                console.error('Auto-unban error:', err);
            }
        }, duration);

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔨 Temporary Ban')
            .addFields(
                { name: 'User', value: `${member.user.tag} (${member.id})`, inline: true },
                { name: 'Duration', value: formatDuration(duration), inline: true },
                { name: 'Unbans', value: `<t:${Math.floor(unbanAt / 1000)}:R>`, inline: true },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
