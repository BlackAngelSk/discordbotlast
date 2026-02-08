const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer coins to another user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to transfer coins to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to transfer')
                .setRequired(true)
                .setMinValue(1)),
    
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            if (targetUser.id === interaction.user.id) {
                return interaction.reply({ content: '❌ You cannot transfer coins to yourself!', ephemeral: true });
            }

            if (targetUser.bot) {
                return interaction.reply({ content: '❌ You cannot transfer coins to bots!', ephemeral: true });
            }

            const senderData = economyManager.getUserData(interaction.guild.id, interaction.user.id);
            if (senderData.balance < amount) {
                return interaction.reply({ content: `❌ You don't have enough coins! Your balance: ${senderData.balance} coins`, ephemeral: true });
            }

            await economyManager.removeMoney(interaction.guild.id, interaction.user.id, amount);
            await economyManager.addMoney(interaction.guild.id, targetUser.id, amount);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💸 Transfer Successful')
                .setDescription(`${interaction.user} transferred **${amount} coins** to ${targetUser}!`)
                .addFields(
                    { name: 'Your new balance', value: `${senderData.balance - amount} coins`, inline: true },
                    { name: `${targetUser.username}'s new balance`, value: `${economyManager.getUserData(interaction.guild.id, targetUser.id).balance} coins`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in transfer command:', error);
            await interaction.reply({ content: '❌ An error occurred while transferring coins!', ephemeral: true });
        }
    }
};
