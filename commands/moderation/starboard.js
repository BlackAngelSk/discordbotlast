const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'starboard',
    description: 'Configure the starboard for your server!',
    usage: '!starboard <set/remove> [#channel]',
    aliases: ['setstarboard'],
    category: 'moderation',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('ManageChannels')) {
                return message.reply('❌ You need "Manage Channels" permission!');
            }

            const action = args[0]?.toLowerCase();

            if (!action || !['set', 'remove'].includes(action)) {
                return message.reply('❌ Usage: `!starboard set <#channel>` or `!starboard remove`');
            }

            if (action === 'set') {
                const channel = message.mentions.channels.first();
                if (!channel) {
                    return message.reply('❌ Please specify a channel! Usage: `!starboard set #starboard`');
                }

                // Store starboard channel in settings
                const settingsPath = require('path').join(__dirname, '..', 'data', 'settings.json');
                const fs = require('fs').promises;
                
                let settings = {};
                try {
                    const data = await fs.readFile(settingsPath, 'utf8');
                    settings = JSON.parse(data);
                } catch (error) {
                    settings = {};
                }

                if (!settings[message.guild.id]) {
                    settings[message.guild.id] = {};
                }

                settings[message.guild.id].starboardChannel = channel.id;
                await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

                const embed = new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Starboard Configured')
                    .setDescription(`Starboard channel set to ${channel}\n\nMessages with ⭐ reactions will be posted here!`);

                return message.reply({ embeds: [embed] });
            }

            if (action === 'remove') {
                const settingsPath = require('path').join(__dirname, '..', 'data', 'settings.json');
                const fs = require('fs').promises;
                
                let settings = {};
                try {
                    const data = await fs.readFile(settingsPath, 'utf8');
                    settings = JSON.parse(data);
                } catch (error) {
                    settings = {};
                }

                if (settings[message.guild.id]) {
                    delete settings[message.guild.id].starboardChannel;
                    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
                }

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('✅ Starboard Removed')
                    .setDescription('The starboard has been disabled for this server.');

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in starboard command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
