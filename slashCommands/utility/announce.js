/**
 * Slash Command: Announce
 * Schedule and send announcements
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send announcements to your server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('Schedule an announcement')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Target channel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Announcement message')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('Time to send (format: HH:MM)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send announcement immediately')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Target channel')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Announcement message')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View scheduled announcements')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel a scheduled announcement')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Announcement ID')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const NotificationManager = require('../../utils/notificationManager');
        const notificationManager = new NotificationManager(interaction.client);
        const subcommand = interaction.options.getSubcommand();

        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply('❌ You need `Manage Messages` permission to use this command.');
        }

        try {
            await notificationManager.init();

            if (subcommand === 'send') {
                const channel = interaction.options.getChannel('channel');
                const message = interaction.options.getString('message');

                await channel.send({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📢 Announcement',
                        description: message,
                        timestamp: new Date()
                    }]
                });

                return interaction.reply({
                    content: `✅ Announcement sent to ${channel}!`,
                    ephemeral: true
                });
            }

            if (subcommand === 'schedule') {
                const channel = interaction.options.getChannel('channel');
                const message = interaction.options.getString('message');
                const time = interaction.options.getString('time');

                // Parse time
                const [hours, minutes] = time.split(':').map(Number);
                const scheduledTime = new Date();
                scheduledTime.setHours(hours, minutes, 0, 0);

                if (scheduledTime < new Date()) {
                    scheduledTime.setDate(scheduledTime.getDate() + 1);
                }

                const announcement = await notificationManager.scheduleAnnouncement(
                    interaction.guildId,
                    channel.id,
                    message,
                    scheduledTime
                );

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Announcement Scheduled',
                        fields: [
                            { name: 'Channel', value: channel.toString(), inline: true },
                            { name: 'Time', value: scheduledTime.toLocaleString(), inline: true },
                            { name: 'Message', value: message, inline: false }
                        ]
                    }],
                    ephemeral: true
                });
            }

            if (subcommand === 'list') {
                const announcements = await notificationManager.getScheduledAnnouncements(interaction.guildId);

                if (announcements.length === 0) {
                    return interaction.reply('No scheduled announcements!');
                }

                const embed = {
                    color: 0x5865F2,
                    title: '📋 Scheduled Announcements',
                    fields: announcements.slice(0, 10).map(a => ({
                        name: `ID: ${a.id}`,
                        value: `Scheduled for ${new Date(a.scheduledTime).toLocaleString()}`,
                        inline: false
                    }))
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'cancel') {
                const id = interaction.options.getString('id');
                const success = await notificationManager.cancelAnnouncement(id);

                return interaction.reply({
                    content: success ? '✅ Announcement cancelled!' : '❌ Announcement not found!',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Announce command error:', error);
            return interaction.reply('❌ An error occurred while processing your announcement.');
        }
    }
};
