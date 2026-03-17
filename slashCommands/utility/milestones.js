const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
        )
        .addSubcommand(sub =>
            sub.setName('sync')
                .setDescription('Sync milestones with current server member count')
        ),

    async execute(interaction) {
        const respond = async (payload) => {
            const normalizedPayload = { ...payload };
            const wantsEphemeral = Boolean(normalizedPayload.ephemeral);
            delete normalizedPayload.ephemeral;

            try {
                if (interaction.deferred) {
                    return await interaction.editReply(normalizedPayload);
                }

                if (interaction.replied) {
                    return await interaction.followUp(wantsEphemeral ? { ...normalizedPayload, flags: 64 } : normalizedPayload);
                }

                await interaction.deferReply(wantsEphemeral ? { flags: 64 } : {});
                return await interaction.editReply(normalizedPayload);
            } catch (error) {
                const alreadyAcknowledged =
                    error?.code === 'InteractionAlreadyReplied' ||
                    error?.code === 40060 ||
                    error?.rawError?.code === 40060;

                if (!alreadyAcknowledged) {
                    throw error;
                }

                try {
                    return await interaction.editReply(normalizedPayload);
                } catch {
                    try {
                        return await interaction.followUp(wantsEphemeral ? { ...normalizedPayload, flags: 64 } : normalizedPayload);
                    } catch {
                        return null;
                    }
                }
            }
        };

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const memberCount = interaction.guild.memberCount;

        serverMilestones.initializeGuild(guildId);

        if (subcommand === 'sync') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return respond({
                    content: '❌ You need the **Manage Server** permission to sync milestones.',
                    ephemeral: true
                });
            }

            const syncedMilestones = serverMilestones.checkMilestones(guildId, memberCount);
            await serverMilestones.save();

            if (syncedMilestones.length === 0) {
                return respond({
                    content: `✅ Milestones are already synced with **${memberCount}** members.`,
                    ephemeral: true
                });
            }

            const syncedList = syncedMilestones
                .sort((a, b) => a.count - b.count)
                .map(m => `${m.emoji} **${m.name}**`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🔄 Milestones Synced')
                .setDescription(syncedList)
                .setFooter({ text: `Current members: ${memberCount}` });

            return respond({ embeds: [embed], ephemeral: true });
        }

        // Always keep milestone state in sync with current member count.
        serverMilestones.checkMilestones(guildId, memberCount);
        await serverMilestones.save();

        if (subcommand === 'achieved') {
            const achieved = serverMilestones.getAchievedMilestones(guildId);

            if (achieved.length === 0) {
                return respond({
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

            return respond({ embeds: [embed] });
        }

        if (subcommand === 'upcoming') {
            const upcoming = serverMilestones.getUpcomingMilestone(guildId, memberCount);

            if (!upcoming) {
                return respond({
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

            return respond({ embeds: [embed] });
        }
    }
};
