const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const customRoleShop = require('../../utils/customRoleShop');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customrole')
        .setDescription('Buy custom roles and colors')
        .addSubcommand(sub =>
            sub.setName('shop')
                .setDescription('Browse the custom role shop')
        )
        .addSubcommand(sub =>
            sub.setName('mybuy')
                .setDescription('View your custom role')
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove your custom role')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        console.log(`[customrole] Executing for user ${userId} in guild ${guildId}`);

        if (subcommand === 'shop') {
            const shop = customRoleShop.getShopItems(guildId);
            const userData = economyManager.getUserData(guildId, userId);
            const balance = userData.balance;
            console.log(`[customrole] User data:`, userData);
            console.log(`[customrole] Balance: ${balance}`);

            // Create color roles embed
            let colorDescription = '';
            const colorOptions = [];

            for (const item of shop.colorRoles) {
                const afford = balance >= item.price ? '✅' : '❌';
                colorDescription += `\n**${item.name}** ${afford}\nPrice: **${item.price}** coins`;

                colorOptions.push({
                    label: `${item.name} - ${item.price} coins`,
                    value: `buyrole_${item.id}`,
                    description: item.description,
                    emoji: '🎨'
                });
            }

            const colorEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🎨 Color Roles')
                .setDescription(colorDescription || 'No color roles available')
                .setFooter({ text: `Your balance: ${balance} coins` });

            // Create color select menu
            const colorMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_color_select')
                .setPlaceholder('Select a color role to buy')
                .addOptions(colorOptions);

            const colorRow = new ActionRowBuilder().addComponents(colorMenu);

            // Create badges embed
            let badgeDescription = '';
            const badgeOptions = [];

            for (const item of shop.badges) {
                const afford = balance >= item.price ? '✅' : '❌';
                badgeDescription += `\n**${item.name}** ${afford}\nPrice: **${item.price}** coins`;

                badgeOptions.push({
                    label: `${item.name} - ${item.price} coins`,
                    value: `buyrole_${item.id}`,
                    description: item.description,
                    emoji: '🏷️'
                });
            }

            const badgeEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🏷️ Badges')
                .setDescription(badgeDescription || 'No badges available');

            // Create badge select menu
            const badgeMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_badge_select')
                .setPlaceholder('Select a badge to buy')
                .addOptions(badgeOptions);

            const badgeRow = new ActionRowBuilder().addComponents(badgeMenu);

            return interaction.reply({
                embeds: [colorEmbed, badgeEmbed],
                components: [colorRow, badgeRow],
                ephemeral: true
            });
        }

        if (subcommand === 'mybuy') {
            const customRole = customRoleShop.getCustomRole(guildId, userId);

            if (!customRole) {
                return interaction.reply({
                    content: '❌ You don\'t have a custom role yet! Use `/customrole shop` to browse.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('👑 Your Custom Role')
                .addFields(
                    { name: 'Name', value: customRole.name, inline: true },
                    { name: 'Color', value: `\`${customRole.colorHex}\``, inline: true },
                    { name: 'Purchased', value: new Date(customRole.boughtAt).toLocaleDateString(), inline: false }
                )
                .setThumbnail(interaction.user.displayAvatarURL());

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'remove') {
            const customRole = customRoleShop.getCustomRole(guildId, userId);

            if (!customRole) {
                return interaction.reply({
                    content: '❌ You don\'t have a custom role to remove!',
                    ephemeral: true
                });
            }

            await customRoleShop.removeCustomRole(guildId, userId, interaction.guild);

            return interaction.reply({
                content: '✅ Your custom role has been removed!',
                ephemeral: true
            });
        }
    }
};
