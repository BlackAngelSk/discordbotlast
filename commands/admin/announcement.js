const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'announcement',
    description: 'Send a server-wide announcement (Admin only)',
    usage: '!announcement <message>',
    aliases: ['announce', 'broadcast'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const announcementText = args.join(' ');

            if (!announcementText) {
                return message.reply('❌ Please provide an announcement message! Usage: `!announcement <message>`');
            }

            const embed = new EmbedBuilder()
                .setColor(0xfaa61a)
                .setTitle('📢 Server Announcement')
                .setDescription(announcementText)
                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            // Find general or announcements channel
            let channel = message.guild.channels.cache.find(c => 
                c.name === 'announcements' || c.name === 'general'
            );

            if (!channel) {
                channel = message.channel;
            }

            await channel.send({ embeds: [embed] });

            const confirmEmbed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Announcement Sent')
                .setDescription(`Posted to ${channel}`)
                .setTimestamp();

            return message.reply({ embeds: [confirmEmbed] });
        } catch (error) {
            console.error('Error in announcement command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
