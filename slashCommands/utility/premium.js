/**
 * Slash Command: Premium
 * Manage premium subscriptions and features
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Manage premium subscriptions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View premium tier information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('subscribe')
                .setDescription('Subscribe to a premium tier')
                .addStringOption(option =>
                    option
                        .setName('tier')
                        .setDescription('Premium tier (basic, pro, elite)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Basic ($2.99/mo)', value: 'basic' },
                            { name: 'Pro ($5.99/mo)', value: 'pro' },
                            { name: 'Elite ($9.99/mo)', value: 'elite' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your premium status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('features')
                .setDescription('View premium features')
        ),
    
    async execute(interaction) {
        const premiumManager = require('../../utils/premiumManager');
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'info') {
                const tiers = premiumManager.getAllTiers();
                const embed = {
                    color: 0x5865F2,
                    title: '💎 Premium Tiers',
                    fields: Object.entries(tiers).map(([tier, data]) => ({
                        name: `${data.name} - $${data.price}/month`,
                        value: `**Features:** ${data.features.join(', ')}\n**Command Limit:** ${data.commandLimit}\n**Monthly Bonus:** ${data.monthlyBonus} coins`,
                        inline: false
                    }))
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'subscribe') {
                const tier = interaction.options.getString('tier');
                const tierData = premiumManager.premiumTiers[tier];

                const embed = {
                    color: 0x57F287,
                    title: '✅ Subscription Initiated',
                    description: `You're subscribing to **${tierData.name}**`,
                    fields: [
                        { name: 'Price', value: `$${tierData.price}/month`, inline: true },
                        { name: 'Command Limit', value: tierData.commandLimit.toString(), inline: true },
                        { name: 'Monthly Bonus', value: `${tierData.monthlyBonus} coins`, inline: true },
                        { name: 'Features', value: tierData.features.join(', '), inline: false }
                    ]
                };

                // Add premium to user
                await premiumManager.addPremium(interaction.user.id, tier, interaction.guildId);

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'status') {
                const premium = await premiumManager.getPremiumData(interaction.user.id);

                if (!premium || !premium.isActive) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xED4245,
                            title: '❌ No Active Subscription',
                            description: 'Use `/premium subscribe` to get started!'
                        }]
                    });
                }

                const embed = {
                    color: 0x57F287,
                    title: `✅ ${premium.tier.toUpperCase()} Member`,
                    fields: [
                        { name: 'Status', value: premium.isActive ? 'Active' : 'Expired', inline: true },
                        { name: 'Expires', value: new Date(premium.expiresAt).toLocaleDateString(), inline: true },
                        { name: 'Custom Commands', value: `${premium.customCommands.length} created`, inline: true }
                    ]
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'features') {
                const premium = await premiumManager.getPremiumData(interaction.user.id);

                if (!premium || !premium.isActive) {
                    return interaction.reply('You need an active premium subscription to view premium features.');
                }

                const tierData = premiumManager.premiumTiers[premium.tier];
                const embed = {
                    color: 0x5865F2,
                    title: `${premium.tier.toUpperCase()} Features`,
                    fields: [
                        { name: 'Available Features', value: tierData.features.join('\n'), inline: false },
                        { name: 'Command Slots', value: `${premium.customCommands.length}/${tierData.commandLimit}`, inline: true },
                        { name: 'Shop Slots', value: `${premium.customShopItems.length}/${tierData.customShopSlots}`, inline: true }
                    ]
                };

                return interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Premium command error:', error);
            return interaction.reply('❌ An error occurred while processing your request.');
        }
    }
};
