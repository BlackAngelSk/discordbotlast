const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const serverMilestones = require('../../utils/serverMilestones');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('milestones')
        .setDescription('View server growth milestones')
        .addSubcommand(sub =>
            sub.setName('achieved')
                .setDescription('View achieved milestones')
        )
        .addSubcommand(sub =>
            sub.setName('upcoming')
                .setDescription('View upcoming milestones')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const memberCount = interaction.guild.memberCount;

        if (subcommand === 'achieved') {
            serverMilestones.initializeGuild(guildId);
            const achieved = serverMilestones.getAchievedMilestones(guildId);

            if (achieved.length === 0) {
                return interaction.reply({
                    content: '📊 No milestones achieved yet! Keep growing the server! 🚀',
                    ephemeral: true
                });
            }

            let description = '';
            for (const milestone of achieved) {
                description += `${milestone.emoji} **${milestone.name}** - ${milestone.reward.toLocaleString()} coins\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🏆 Achieved Milestones')
                .setDescription(description)
                .setFooter({ text: `Current members: ${memberCount}` });

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'upcoming') {
            const upcoming = serverMilestones.getUpcomingMilestone(guildId, memberCount);

            if (!upcoming) {
                return interaction.reply({
                    content: '🌟 You\'ve achieved all milestones! Congratulations! 🎉',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎯 Next Milestone')
                .addFields(
                    { name: `${upcoming.emoji} ${upcoming.name}`, value: `Reward: **${upcoming.reward.toLocaleString()} coins**`, inline: false },
                    { name: 'Members Needed', value: `${upcoming.membersNeeded} more members`, inline: true },
                    { name: 'Current Members', value: `${memberCount}`, inline: true }
                )
                .setFooter({ text: `Progress: ${memberCount}/${upcoming.count}` });

            return interaction.reply({ embeds: [embed] });
        }
    }
};
