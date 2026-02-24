const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'setup',
    description: 'Setup DJ role, Member role, and Bot Watcher role for the server',
    async execute(message, args, client) {
        // Check if user has admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ You need Administrator permission to use this command!');
        }

        try {
            await message.reply('⚙️ Setting up roles...');

            const settings = settingsManager.get(message.guild.id);

            // Create DJ role if it doesn't exist
            let djRole = message.guild.roles.cache.find(r => r.name === settings.djRole);
            if (!djRole) {
                djRole = await message.guild.roles.create({
                    name: settings.djRole,
                    color: 0xFF0080, // Pink color
                    reason: 'Music bot DJ role',
                    permissions: []
                });
            }

            // Create Member role if it doesn't exist
            let memberRole = message.guild.roles.cache.find(r => r.name === settings.autoRole);
            if (!memberRole) {
                memberRole = await message.guild.roles.create({
                    name: settings.autoRole,
                    color: 0x99AAB5, // Grey color
                    reason: 'Default member role',
                    permissions: []
                });
            }

            // Create Bot Watcher role if it doesn't exist
            let botWatcherRole = message.guild.roles.cache.find(r => r.name === settings.botWatcherRole);
            if (!botWatcherRole) {
                botWatcherRole = await message.guild.roles.create({
                    name: settings.botWatcherRole,
                    color: 0x5865F2, // Blurplet color
                    reason: 'Bot watcher role (monitoring + backups)',
                    permissions: []
                });
            }

            const setupEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Server Setup Complete!')
                .setDescription('The following roles have been created:')
                .addFields(
                    { 
                        name: '🎵 DJ Role', 
                        value: `${djRole}\nUsers with this role can control music playback (skip, stop, volume, etc.)`,
                        inline: false 
                    },
                    { 
                        name: '👥 Member Role', 
                        value: `${memberRole}\nNew members will automatically receive this role`,
                        inline: false 
                    },
                    { 
                        name: '🛡️ Bot Watcher Role', 
                        value: `${botWatcherRole}\nUsers with this role can monitor bot status and run backups`,
                        inline: false 
                    }
                )
                .setFooter({ text: `Use ${settings.prefix}config to customize settings | ${settings.prefix}help for all commands` });

            await message.channel.send({ embeds: [setupEmbed] });

        } catch (error) {
            console.error('Error in setup command:', error);
            message.reply('❌ An error occurred during setup! Make sure the bot has "Manage Roles" permission.');
        }
    }
};
