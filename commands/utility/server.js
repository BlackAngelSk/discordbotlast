const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'server',
    description: 'Get server information',
    async execute(message, args, client) {
        const guild = message.guild;
        
        // Fetch the owner
        const owner = await guild.fetchOwner();
        
        // Get verification level
        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Very High'
        };
        
        // Get boost information
        const boostTier = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;
        
        // Count channels
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;
        
        // Count roles
        const roleCount = guild.roles.cache.size;
        
        // Count emojis
        const emojiCount = guild.emojis.cache.size;
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
                { name: '🆔 Server ID', value: guild.id, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                { name: '🤖 Bots', value: `${guild.members.cache.filter(m => m.user.bot).size}`, inline: true },
                { name: '💬 Channels', value: `${textChannels} Text\n${voiceChannels} Voice\n${categories} Categories`, inline: true },
                { name: '🎭 Roles', value: `${roleCount}`, inline: true },
                { name: '😀 Emojis', value: `${emojiCount}`, inline: true },
                { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel], inline: true },
                { name: '💎 Boost Status', value: `Level ${boostTier}\n${boostCount} Boosts`, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();
        
        if (guild.description) {
            embed.setDescription(guild.description);
        }
        
        await message.reply({ embeds: [embed] });
    }
};
