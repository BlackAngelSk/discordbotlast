const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View and purchase items from the server shop'),
    
    async execute(interaction) {
        const shopItems = economyManager.getShopItems(interaction.guildId);
        const userData = economyManager.getUserData(interaction.guildId, interaction.user.id);

        const itemsList = shopItems.map((item, index) => {
            return `**${index + 1}. ${item.name}**\n💰 Price: ${item.price} coins\n📦 Type: ${item.type}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('🛒 Server Shop')
            .setDescription(itemsList)
            .addFields({ name: 'Your Balance', value: `💵 ${userData.balance} coins` })
            .setFooter({ text: 'Use the menu below to purchase items' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('shop_purchase')
            .setPlaceholder('Select an item to purchase')
            .addOptions(
                shopItems.map(item => ({
                    label: item.name,
                    description: `${item.price} coins`,
                    value: item.id,
                    emoji: item.type === 'role' ? '🎭' : '🏅'
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row] });

        const response = await interaction.fetchReply();
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ This is not your shop menu!', flags: MessageFlags.Ephemeral });
            }

            const itemId = i.values[0];
            const item = shopItems.find(it => it.id === itemId);
            const userBalance = economyManager.getUserData(interaction.guildId, i.user.id).balance;

            if (userBalance < item.price) {
                return i.reply({ content: `❌ You don't have enough coins! You need **${item.price - userBalance}** more coins.`, flags: MessageFlags.Ephemeral });
            }

            const success = await economyManager.removeMoney(interaction.guildId, i.user.id, item.price);

            if (!success) {
                return i.reply({ content: '❌ Purchase failed!', flags: MessageFlags.Ephemeral });
            }

            await economyManager.addItem(interaction.guildId, i.user.id, item);

            const purchaseEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Purchase Successful!')
                .setDescription(`You purchased **${item.name}** for **${item.price}** coins!`)
                .addFields({ name: 'New Balance', value: `💵 ${userBalance - item.price} coins` })
                .setTimestamp();

            await i.reply({ embeds: [purchaseEmbed], flags: MessageFlags.Ephemeral });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (error) {
                // Message was deleted
            }
        });
    },
};
