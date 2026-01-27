const { Events, EmbedBuilder } = require('discord.js');
const economyManager = require('../utils/economyManager');
const moderationManager = require('../utils/moderationManager');

// Track user message timestamps for spam detection
const userMessageTimestamps = new Map();

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check auto-moderation
        const automodResult = moderationManager.checkMessage(
            message.guildId,
            message.content,
            message.mentions.users.size
        );

        if (automodResult.violation) {
            try {
                await message.delete();
                const warning = await message.channel.send(`⚠️ ${message.author}, your message was deleted: ${automodResult.reason}`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
                
                // Log to mod log if configured
                const modLogChannel = moderationManager.getModLogChannel(message.guildId);
                if (modLogChannel) {
                    const channel = await client.channels.fetch(modLogChannel).catch(() => null);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('🛡️ Auto-Mod Action')
                            .addFields(
                                { name: 'User', value: message.author.tag, inline: true },
                                { name: 'Channel', value: message.channel.toString(), inline: true },
                                { name: 'Reason', value: automodResult.reason },
                                { name: 'Message', value: message.content.substring(0, 1000) }
                            )
                            .setTimestamp();
                        await channel.send({ embeds: [embed] });
                    }
                }
            } catch (error) {
                console.error('Auto-mod error:', error);
            }
            return;
        }

        // Anti-spam check
        const settings = moderationManager.getAutomodSettings(message.guildId);
        if (settings.enabled && settings.antiSpam) {
            const userId = message.author.id;
            const now = Date.now();
            
            if (!userMessageTimestamps.has(userId)) {
                userMessageTimestamps.set(userId, []);
            }
            
            const timestamps = userMessageTimestamps.get(userId);
            timestamps.push(now);
            
            // Keep only messages from last 5 seconds
            const recentMessages = timestamps.filter(t => now - t < 5000);
            userMessageTimestamps.set(userId, recentMessages);
            
            // If more than 5 messages in 5 seconds, it's spam
            if (recentMessages.length > 5) {
                try {
                    await message.delete();
                    const member = message.member;
                    if (member) {
                        await member.timeout(60000, 'Spam detected');
                        const warning = await message.channel.send(`⚠️ ${message.author} has been timed out for spamming!`);
                        setTimeout(() => warning.delete().catch(() => {}), 5000);
                    }
                    userMessageTimestamps.delete(userId);
                } catch (error) {
                    console.error('Anti-spam error:', error);
                }
                return;
            }
        }

        // Add XP (5-15 XP per message, with cooldown)
        try {
            const xpCooldown = 60000; // 1 minute cooldown
            const lastXpKey = `${message.guildId}_${message.author.id}_lastXP`;
            
            if (!global[lastXpKey] || Date.now() - global[lastXpKey] > xpCooldown) {
                const xpGain = Math.floor(Math.random() * 11) + 5; // 5-15 XP
                const result = await economyManager.addXP(message.guildId, message.author.id, xpGain);
                
                if (result.leveledUp) {
                    const reward = result.level * 100;
                    await economyManager.addMoney(message.guildId, message.author.id, reward);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('🎉 Level Up!')
                        .setDescription(`${message.author} reached level **${result.level}**!`)
                        .addFields({ name: 'Reward', value: `💰 ${reward} coins` })
                        .setThumbnail(message.author.displayAvatarURL());
                    
                    await message.channel.send({ embeds: [embed] });
                }
                
                global[lastXpKey] = Date.now();
            }
        } catch (error) {
            console.error('XP tracking error:', error);
        }

        // Command handling is done in index.js through CommandHandler
    }
};

