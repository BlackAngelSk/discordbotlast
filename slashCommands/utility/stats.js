const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const statsManager = require('../../utils/statsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View bot statistics'),
    
    async execute(interaction) {
        try {
            const stats = await statsManager.getStats();
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('📊 Bot Statistics')
                .addFields(
                    { name: '🏠 Servers', value: `${interaction.client.guilds.cache.size}`, inline: true },
                    { name: '👥 Users', value: `${interaction.client.users.cache.size}`, inline: true },
                    { name: '💬 Channels', value: `${interaction.client.channels.cache.size}`, inline: true },
                    { name: '⏰ Uptime', value: `${days}d ${hours}h ${minutes}m`, inline: true },
                    { name: '🎮 Commands Used', value: `${stats?.commandsUsed || 0}`, inline: true },
                    { name: '🎵 Songs Played', value: `${stats?.songsPlayed || 0}`, inline: true }
                )
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.reply({ content: '❌ An error occurred while fetching statistics!', flags: MessageFlags.Ephemeral });
        }
    }
};
