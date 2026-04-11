const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'bumprule',
    description: 'Configure the Disboard bump reminder system.',
    usage: '!bumprule enable #channel [@role]\n!bumprule disable\n!bumprule status',
    aliases: ['bumpreminder', 'bumpconfig'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = args[0]?.toLowerCase();
        const settings = settingsManager.get(message.guild.id);

        // ── status ────────────────────────────────────────────────────────────
        if (!sub || sub === 'status') {
            const embed = new EmbedBuilder()
                .setTitle('🔔 Bump Reminder Status')
                .setColor(settings.bumpReminderEnabled ? 0x57f287 : 0xed4245)
                .addFields(
                    { name: 'Enabled', value: settings.bumpReminderEnabled ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Channel', value: settings.bumpReminderChannel ? `<#${settings.bumpReminderChannel}>` : 'Not set', inline: true },
                    { name: 'Role Ping', value: settings.bumpReminderRole ? `<@&${settings.bumpReminderRole}>` : '@here (default)', inline: true }
                )
                .setFooter({ text: 'Reminder fires 2 hours after Disboard bump is detected' });
            return message.reply({ embeds: [embed] });
        }

        // ── enable ────────────────────────────────────────────────────────────
        if (sub === 'enable' || sub === 'set') {
            const channel = message.mentions.channels.first();
            if (!channel) return message.reply('❌ Mention the channel to send bump reminders to.\nExample: `!bumprule enable #bump-reminder @Bumper`');

            const role = message.mentions.roles.first();

            settings.bumpReminderEnabled = true;
            settings.bumpReminderChannel = channel.id;
            settings.bumpReminderRole = role?.id || null;
            settingsManager.save();

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Bump Reminder Enabled')
                .setDescription(`Reminders will be posted in ${channel} **2 hours** after a bump is detected in this server.`)
                .addFields({ name: 'Ping', value: role ? `<@&${role.id}>` : '@here (default)', inline: true });
            return message.reply({ embeds: [embed] });
        }

        // ── disable ───────────────────────────────────────────────────────────
        if (sub === 'disable' || sub === 'off') {
            settings.bumpReminderEnabled = false;
            settingsManager.save();
            return message.reply('✅ Bump reminder disabled.');
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};
