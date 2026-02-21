const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const seasonManager = require('../../utils/seasonManager');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard-update')
        .setDescription('Force update the season leaderboards immediately'),
    
    async execute(interaction) {
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ You need "Administrator" permission!',
                    ephemeral: true
                });
            }

            const channelId = seasonLeaderboardManager.getLeaderboardChannel(interaction.guildId);
            if (!channelId) {
                return interaction.reply({
                    content: '❌ No leaderboard channel configured! Use `/leaderboard-channel` first.',
                    ephemeral: true
                });
            }

            const seasonName = seasonManager.getCurrentSeason(interaction.guildId);
            if (!seasonName) {
                return interaction.reply({
                    content: '❌ No active season found!',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const guild = interaction.guild;
            const channel = guild.channels.cache.get(channelId);
            
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({
                    content: '❌ Leaderboard channel not found or is not text-based!'
                });
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

            // Delete old message if exists
            const oldMessageId = seasonLeaderboardManager.getLeaderboardMessage(interaction.guildId);
            if (oldMessageId) {
                try {
                    const oldMessage = await channel.messages.fetch(oldMessageId);
                    await oldMessage.delete();
                } catch (error) {
                    // Message already deleted or not found
                }
            }

            // Send new embeds in chunks (Discord has a limit of 10 embeds per message)
            const embedChunks = [];
            for (let i = 0; i < embeds.length; i += 10) {
                embedChunks.push(embeds.slice(i, i + 10));
            }

            let messagesSent = 0;

            // Send first chunk and save message ID
            if (embedChunks.length > 0) {
                const firstMessage = await channel.send({ embeds: embedChunks[0] });
                await seasonLeaderboardManager.setLeaderboardMessage(interaction.guildId, firstMessage.id);
                messagesSent++;

                // Send remaining chunks
                for (let i = 1; i < embedChunks.length; i++) {
                    await channel.send({ embeds: embedChunks[i] });
                    messagesSent++;
                }
            }

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
            interaction.editReply({
                content: '❌ An error occurred while updating leaderboards!'
            });
        }
    }
};
