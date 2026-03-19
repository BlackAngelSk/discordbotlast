const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const seasonManager = require('../../utils/seasonManager');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-update')
        .setDescription('Force update the season leaderboards immediately'),
    
    async execute(interaction) {
        try {
            const cfg = seasonLeaderboardManager.getGuildConfig(interaction.guildId);
            const hasAdmin = interaction.member.permissions.has('Administrator');
            const hasAllowedRole = cfg.allowedRoleId
                ? interaction.member.roles.cache.has(cfg.allowedRoleId)
                : false;
            if (!hasAdmin && !hasAllowedRole) {
                return interaction.reply({
                    content: '❌ You do not have permission to update leaderboards!',
                    ephemeral: true
                });
            }

            const now = Date.now();
            if (cfg.lastManualUpdate && now - cfg.lastManualUpdate < 60 * 1000) {
                const wait = Math.ceil((60 * 1000 - (now - cfg.lastManualUpdate)) / 1000);
                return interaction.reply({
                    content: `⏳ Please wait ${wait}s before running this again.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            cfg.lastManualUpdate = now;
            await seasonLeaderboardManager.save();

            const channelId = seasonLeaderboardManager.getLeaderboardChannel(interaction.guildId);
            if (!channelId) {
                return interaction.editReply({
                    content: '❌ No leaderboard channel configured! Use `/leaderboard-channel` first.'
                });
            }

            const seasonName = seasonManager.getCurrentSeason(interaction.guildId);
            if (!seasonName) {
                return interaction.editReply({
                    content: '❌ No active season found!'
                });
            }

            const guild = interaction.guild;
            const channel = guild.channels.cache.get(channelId);
            
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({
                    content: '❌ Leaderboard channel not found or is not text-based!'
                });
            }

            await seasonManager.refreshSeasonStats(
                interaction.guildId,
                seasonName,
                (userId) => ({
                    username: guild.members.cache.get(userId)?.user.username || 'Unknown User',
                    balance: economyManager.getUserData(interaction.guildId, userId).balance,
                    xp: economyManager.getUserData(interaction.guildId, userId).xp,
                    level: economyManager.getUserData(interaction.guildId, userId).level,
                    seasonalCoins: economyManager.getUserData(interaction.guildId, userId).seasonalCoins,
                    gambling: gameStatsManager.getStats(userId)
                })
            );

            await seasonManager.pruneInactivePlayers(interaction.guildId, seasonName, cfg.pruneDays || 30);

            const season = seasonManager.getSeason(interaction.guildId, seasonName);
            if (season && !season.isActive && !season.summaryPosted) {
                const winners = seasonManager.getSeasonLeaderboard(interaction.guildId, seasonName, 'balance', 3);
                const payouts = cfg.payouts || [];
                const rewardRoles = cfg.rewardRoles || [];

                for (let i = 0; i < winners.length; i++) {
                    const winner = winners[i];
                    const payout = payouts[i] || 0;
                    if (payout > 0) {
                        await economyManager.addBalance(interaction.guildId, winner.userId, payout);
                    }

                    const roleId = rewardRoles[i];
                    if (roleId) {
                        const member = await guild.members.fetch(winner.userId).catch(() => null);
                        const role = guild.roles.cache.get(roleId);
                        if (member && role) {
                            await member.roles.add(role).catch(() => null);
                        }
                    }
                }

                const summaryEmbed = await seasonLeaderboardManager.generateSeasonSummaryEmbed(interaction.guildId, seasonManager, seasonName);
                if (summaryEmbed) {
                    await channel.send({ embeds: [summaryEmbed] });
                    await seasonManager.markSeasonSummaryPosted(interaction.guildId, seasonName);
                }
            }

            // Generate embeds
            const embeds = await seasonLeaderboardManager.generateSeasonEmbeds(
                interaction.guildId,
                seasonManager,
                seasonName,
                interaction.client
            );

            if (embeds.length === 0) {
                return interaction.editReply({
                    content: '❌ No leaderboard data available!'
                });
            }

            const existingMessageId = seasonLeaderboardManager.getLeaderboardMessage(interaction.guildId);
            const totalPages = embeds.length;
            const components = totalPages > 1
                ? [buildLeaderboardPageComponents(interaction.guildId, 0, totalPages)]
                : [];

            const indexMessageId = seasonLeaderboardManager.getIndexMessage(interaction.guildId);
            if (indexMessageId) {
                try {
                    const oldIndex = await channel.messages.fetch(indexMessageId);
                    await oldIndex.delete();
                } catch (error) {
                    // Ignore missing/deleted index message
                }
            }

            let leaderboardMessage;
            if (existingMessageId) {
                try {
                    const msg = await channel.messages.fetch(existingMessageId);
                    leaderboardMessage = await msg.edit({ embeds: [embeds[0]], components });
                } catch (error) {
                    leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
                }
            } else {
                leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
            }

            await seasonLeaderboardManager.setLeaderboardMessage(interaction.guildId, leaderboardMessage.id);
            await seasonLeaderboardManager.setLeaderboardMessages(interaction.guildId, []);
            await seasonLeaderboardManager.setIndexMessage(interaction.guildId, null);
            seasonLeaderboardManager.setPageCache(interaction.guildId, {
                embeds,
                messageId: leaderboardMessage.id,
                channelId: channel.id
            });

            const messagesSent = 1;

            const successEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Leaderboards Updated')
                .setDescription(`Leaderboards have been force updated in ${channel}`)
                .addFields(
                    { name: '📊 Season', value: `\`${seasonName}\``, inline: true },
                    { name: '📩 Messages Sent', value: `${messagesSent}`, inline: true },
                    { name: '📈 Embeds', value: `${embeds.length}`, inline: true },
                    { name: '🕐 Updated', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            console.error('Error in leaderboard-update command:', error);
            if (interaction.deferred || interaction.replied) {
                interaction.editReply({
                    content: '❌ An error occurred while updating leaderboards!'
                }).catch(() => null);
            } else {
                interaction.reply({
                    content: '❌ An error occurred while updating leaderboards!',
                    ephemeral: true
                }).catch(() => null);
            }
        }
    }
};

function buildLeaderboardPageComponents(guildId, page, totalPages) {
    const prevPage = Math.max(0, page - 1);
    const nextPage = Math.min(totalPages - 1, page + 1);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${prevPage}`)
            .setLabel('⬅️ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${nextPage}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${page}`)
            .setLabel(`Page ${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    );
}
