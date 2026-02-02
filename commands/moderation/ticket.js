const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChannelType } = require('discord.js');
const ticketManager = require('../../utils/ticketManager');

module.exports = {
    name: 'ticket',
    description: 'Manage the ticket system!',
    usage: '!ticket <setup/close>',
    aliases: ['support'],
    category: 'moderation',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const action = args[0]?.toLowerCase();

            if (!action) {
                return message.reply('❌ Usage: `!ticket setup` to configure tickets, or use the ticket buttons once setup!');
            }

            if (action === 'setup') {
                // Create a category for tickets
                let category = message.guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildCategory && c.name === 'TICKETS'
                );

                if (!category) {
                    category = await message.guild.channels.create({
                        name: 'TICKETS',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: message.guild.id,
                                deny: ['ViewChannel']
                            }
                        ]
                    });
                }

                // Create logs channel if doesn't exist
                let logsChannel = message.guild.channels.cache.find(c => c.name === 'ticket-logs');
                if (!logsChannel) {
                    logsChannel = await message.guild.channels.create({
                        name: 'ticket-logs',
                        type: ChannelType.GuildText,
                        parent: category.id
                    });
                }

                // Store settings
                await ticketManager.setSettings(message.guild.id, {
                    categoryId: category.id,
                    logsChannelId: logsChannel.id,
                    enabled: true
                });

                // Create support button embed
                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🎫 Support Tickets')
                    .setDescription('Need help? Click the button below to create a support ticket!')
                    .setFooter({ text: 'A staff member will assist you soon' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setLabel('Create Ticket')
                        .setEmoji('🎫')
                        .setStyle(ButtonStyle.Primary)
                );

                await message.channel.send({ embeds: [embed], components: [row] });

                const confirmEmbed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Ticket System Setup')
                    .addFields(
                        { name: 'Category', value: `${category.name}`, inline: true },
                        { name: 'Logs Channel', value: `${logsChannel.name}`, inline: true }
                    )
                    .setDescription('Ticket system is now active!');

                return message.reply({ embeds: [confirmEmbed] });
            }

        } catch (error) {
            console.error('Error in ticket command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
