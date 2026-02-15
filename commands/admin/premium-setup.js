/**
 * Prefix Command: Premium Setup
 * Configure premium features
 */

module.exports = {
    name: 'premium-setup',
    description: 'Configure premium features (admin only)',
    category: 'admin',
    usage: '!premium-setup',
    
    async execute(message, args) {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('❌ You need administrator permissions!');
        }

        const premiumManager = require('../../utils/premiumManager');

        if (args[0] === 'info') {
            const tiers = premiumManager.getAllTiers();
            const info = Object.entries(tiers)
                .map(([key, tier]) => `**${tier.name}** - $${tier.price}/mo`)
                .join('\n');

            return message.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '💎 Premium Tiers',
                    description: info
                }]
            });
        }

        if (args[0] === 'check') {
            const userId = message.mentions.users.first()?.id || args[1];
            if (!userId) return message.reply('Please mention a user or provide their ID');

            const premium = await premiumManager.getPremiumData(userId);

            if (!premium || !premium.isActive) {
                return message.reply('❌ User doesn\'t have an active premium subscription');
            }

            return message.reply({
                embeds: [{
                    color: 0x57F287,
                    title: 'Premium Status',
                    fields: [
                        { name: 'Tier', value: premium.tier, inline: true },
                        { name: 'Expires', value: new Date(premium.expiresAt).toLocaleDateString(), inline: true }
                    ]
                }]
            });
        }

        message.reply({
            embeds: [{
                color: 0x5865F2,
                title: 'Premium Setup',
                description: 'Available commands:\n`!premium-setup info` - View all premium tiers\n`!premium-setup check @user` - Check user premium status'
            }]
        });
    }
};
