const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const economyManager = require('../../utils/economyManager');

// Discord hard limits: 25 options per select menu, 100 chars per label/description.
const MAX_SHOP_OPTIONS = 25;
const MAX_OPTION_TEXT = 100;
const MAX_EMBED_DESCRIPTION = 4000;

function shorten(value, maxLength = MAX_OPTION_TEXT) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View and purchase items from the server shop'),

  async execute(interaction) {
    const shopItems = economyManager.getShopItems(interaction.guildId) || [];
    const userData = economyManager.getUserData(interaction.guildId, interaction.user.id);

    if (shopItems.length === 0) {
      return interaction.reply({
        content: '🛒 The server shop is empty right now.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemsList = shopItems
      .map(
        (item, index) =>
          `**${index + 1}. ${item.name}**\n💰 Price: ${item.price} coins\n📦 Type: ${item.type}`
      )
      .join('\n\n');

    const embed = new EmbedBuilder()
      .setColor('#00FFFF')
      .setTitle('🛒 Server Shop')
      .setDescription(shorten(itemsList, MAX_EMBED_DESCRIPTION))
      .addFields({ name: 'Your Balance', value: `💵 ${userData.balance} coins` })
      .setFooter({ text: 'Use the menu below to purchase items' })
      .setTimestamp();

    // A select menu can only hold 25 options with unique values — dedupe ids and cap.
    const menuItems = [];
    const seenIds = new Set();

    for (const [index, item] of shopItems.entries()) {
      const id = String(item?.id ?? `item_${index}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      menuItems.push(item);
      if (menuItems.length >= MAX_SHOP_OPTIONS) break;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_purchase')
      .setPlaceholder('Select an item to purchase')
      .addOptions(
        menuItems.map((item, index) => ({
          label: shorten(item.name || `Item ${index + 1}`),
          description: shorten(`${item.price} coins`),
          // values must be unique and non-empty
          value: shorten(item.id || `item_${index}`, MAX_OPTION_TEXT),
          emoji: item.type === 'role' ? '🎭' : '🏅',
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row] });

    const response = await interaction.fetchReply();
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: '❌ This is not your shop menu!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const itemId = i.values[0];
      const item = shopItems.find((it) => it.id === itemId);
      const userBalance = economyManager.getUserData(interaction.guildId, i.user.id).balance;

      if (userBalance < item.price) {
        return i.reply({
          content: `❌ You don't have enough coins! You need **${item.price - userBalance}** more coins.`,
          flags: MessageFlags.Ephemeral,
        });
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
