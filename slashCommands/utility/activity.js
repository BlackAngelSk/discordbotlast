const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const activityTracker = require('../../utils/activityTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('View activity stats')
        .addSubcommand(sub =>
            sub.setName('voice')
                .setDescription('View your voice channel statistics')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User to check (default: you)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('leaderboard')
                .setDescription('View top voice channel users')
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Number of users to show (1-25, default: 10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand(sub =>
            sub.setName('afk')
                .setDescription('View AFK users in this server')
                .addIntegerOption(opt =>
                    opt.setName('minutes')
                        .setDescription('AFK threshold in minutes (default: 30)')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'voice') {
            const user = interaction.options.getUser('user') || interaction.user;
            const stats = activityTracker.getVoiceStats(guildId, user.id);

            const hours = Math.floor(stats.totalMinutes / 60);
            const minutes = stats.totalMinutes % 60;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎙️ Voice Channel Statistics')
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'Total Time', value: `${hours}h ${minutes}m`, inline: true },
                    { name: 'Last Session', value: stats.lastSession ? new Date(stats.lastSession).toLocaleDateString() : 'Never', inline: true },
                    { name: 'Streak Days', value: `${stats.streakDays} days`, inline: true }
                );

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'leaderboard') {
            const limit = interaction.options.getInteger('limit') || 10;
            const topUsers = activityTracker.getTopVoiceUsers(guildId, limit);

            if (topUsers.length === 0) {
                return interaction.reply({
                    content: '📊 No voice activity recorded yet!',
                    ephemeral: true
                });
            }

            let description = '';
            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const hours = Math.floor(user.totalMinutes / 60);
                const minutes = user.totalMinutes % 60;
                const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

                try {
                    const discordUser = await interaction.client.users.fetch(user.userId);
                    description += `${medal} **${discordUser.username}** - ${hours}h ${minutes}m\n`;
                } catch (e) {
                    description += `${medal} **Unknown User** - ${hours}h ${minutes}m\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎙️ Voice Channel Leaderboard')
                .setDescription(description);

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'afk') {
            const minutes = interaction.options.getInteger('minutes') || 30;
            const afkUsers = activityTracker.getAFKUsers(guildId, minutes);

            if (afkUsers.length === 0) {
                return interaction.reply({
                    content: `✅ No AFK users (threshold: ${minutes} minutes)`,
                    ephemeral: true
                });
            }

            let description = '';
            for (const user of afkUsers) {
                try {
                    const discordUser = await interaction.client.users.fetch(user.userId);
                    description += `👤 **${discordUser.username}** - AFK for ${user.minutesAFK} minutes\n`;
                } catch (e) {
                    description += `👤 **Unknown User** - AFK for ${user.minutesAFK} minutes\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle(`⏰ AFK Users (${minutes}+ minutes)`)
                .setDescription(description);

            return interaction.reply({ embeds: [embed] });
        }
    }
};
