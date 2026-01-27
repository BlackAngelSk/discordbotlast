const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward'),
    
    async execute(interaction) {
        const result = await economyManager.claimDaily(interaction.guildId, interaction.user.id);

        if (!result.success) {
            const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));

            return interaction.reply({ 
                content: `⏰ You've already claimed your daily reward! Come back in **${hours}h ${minutes}m**`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎁 Daily Reward Claimed!')
            .setDescription(`You received **${result.amount}** coins!`)
            .setFooter({ text: 'Come back tomorrow for more!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
