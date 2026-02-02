const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'welcomecard',
    description: 'Configure welcome cards for new members!',
    usage: '<enable/disable> [#channel]',
    aliases: ['welcome'],
    category: 'moderation',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const action = args[0]?.toLowerCase();

            if (!action || !['enable', 'disable'].includes(action)) {
                return message.reply('❌ Usage: `!welcomecard enable <#channel>` or `!welcomecard disable`');
            }

            const settingsPath = path.join(__dirname, '..', '..', 'data', 'settings.json');
            
            let settings = {};
            try {
                const data = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(data);
            } catch (error) {
                // File doesn't exist, create empty settings
                if (error.code === 'ENOENT') {
                    settings = {};
                    // Create data directory if it doesn't exist
                    const dataDir = path.join(__dirname, '..', '..', 'data');
                    try {
                        await fs.mkdir(dataDir, { recursive: true });
                    } catch (mkdirError) {
                        console.error('Error creating data directory:', mkdirError);
                    }
                } else {
                    throw error;
                }
            }

            if (!settings[message.guild.id]) {
                settings[message.guild.id] = {};
            }

            if (action === 'enable') {
                // Try to get channel from mention first
                let channel = message.mentions.channels.first();
                
                // If no mention, try to find by ID or name
                if (!channel) {
                    const channelArg = args[1];
                    if (!channelArg) {
                        return message.reply('❌ Please specify a channel! Usage: `!welcomecard enable #channel` or `!welcomecard enable <channel-id>`');
                    }
                    
                    // Try to find by ID
                    if (/^\d+$/.test(channelArg)) {
                        channel = await message.guild.channels.fetch(channelArg).catch(() => null);
                    }
                    
                    // If still not found, try to find by name
                    if (!channel) {
                        channel = message.guild.channels.cache.find(c => 
                            c.name.toLowerCase() === channelArg.toLowerCase() && c.isTextBased()
                        );
                    }
                }
                
                if (!channel) {
                    return message.reply('❌ Channel not found! Usage: `!welcomecard enable #channel` or `!welcomecard enable <channel-id>`');
                }

                settings[message.guild.id].welcomeCardChannel = channel.id;
                await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Welcome Cards Enabled')
                    .setDescription(`New members will receive a welcome card in ${channel}!`);

                return message.reply({ embeds: [embed] });
            }

            if (action === 'disable') {
                delete settings[message.guild.id].welcomeCardChannel;
                await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('✅ Welcome Cards Disabled')
                    .setDescription('New members will no longer receive welcome cards.');

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in welcomecard command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
