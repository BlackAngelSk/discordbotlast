const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('Claim your weekly reward'),
    
    async execute(interaction) {
        const result = await economyManager.claimWeekly(interaction.guildId, interaction.user.id);

        if (!result.success) {
            const days = Math.floor(result.timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((result.timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            return interaction.reply({ 
                content: `⏰ You've already claimed your weekly reward! Come back in **${days}d ${hours}h**`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎁 Weekly Reward Claimed!')
            .setDescription(`You received **${result.amount}** coins!`)
            .setFooter({ text: 'Come back next week for more!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
