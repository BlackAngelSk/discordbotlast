const { MessageFlags } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');
const {
    getAccessContext,
    canViewCategory,
    getVisibleCategories,
    buildCategoryRows,
    buildMainHelpEmbed,
    getCategoryEmbed
} = require('../../utils/helpCatalog');

module.exports = {
    name: 'help',
    description: 'Show available commands',
    aliases: ['commands', 'h'],
    async execute(message, args, client) {
        const settings = settingsManager.get(message.guild.id);
        const p = settings.prefix;
        const accessContext = getAccessContext(message.author.id, message.member);
        const visibleCategories = getVisibleCategories(accessContext);

        // Show specific category help if requested
        const category = args[0]?.toLowerCase();

        if (category) {
            if (!canViewCategory(category, accessContext)) {
                return message.reply('❌ You do not have permission to view that help category.');
            }
            return sendCategoryHelp(message, p, category, accessContext);
        }

        // Main help menu with categories
        const mainEmbed = buildMainHelpEmbed(p, visibleCategories);

        const rows = buildCategoryRows(visibleCategories);
        const reply = await message.reply({ embeds: [mainEmbed], components: rows });

        // Button interaction collector
        const collector = reply.createMessageComponentCollector({ time: 300000 }); // 5 minutes

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ These buttons are not for you!', flags: MessageFlags.Ephemeral });
            }

            const category = i.customId.replace('help_', '');
            if (!canViewCategory(category, accessContext)) {
                return i.reply({ content: '❌ You do not have permission to view that help category.', flags: MessageFlags.Ephemeral });
            }

            try {
                if (!i.deferred && !i.replied) {
                    await i.deferUpdate();
                }

                const categoryEmbed = getCategoryEmbed(p, category, accessContext);
                await i.editReply({ embeds: [categoryEmbed], components: rows });
            } catch (error) {
                if (error?.code !== 10062) {
                    console.error('Help button interaction error:', error);
                }
            }
        });

        collector.on('end', () => {
            // Disable buttons after timeout
            rows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
            reply.edit({ components: rows }).catch(() => {});
        });
    }
};

function sendCategoryHelp(message, p, category, accessContext) {
    const embed = getCategoryEmbed(p, category, accessContext);
    return message.reply({ embeds: [embed] });
}
