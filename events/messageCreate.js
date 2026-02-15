const { Events, EmbedBuilder } = require('discord.js');
const economyManager = require('../utils/economyManager');
const moderationManager = require('../utils/moderationManager');
const statsManager = require('../utils/statsManager');
const customCommandManager = require('../utils/customCommandManager');
const afkManager = require('../utils/afkManager');
const levelRewardsManager = require('../utils/levelRewardsManager');
const raidProtectionManager = require('../utils/raidProtectionManager');

// Track user message timestamps for spam detection
const userMessageTimestamps = new Map();

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check if user is AFK and remove status
        try {
            const afkData = await afkManager.removeAFK(message.guildId, message.author.id);
            if (afkData) {
                const duration = afkManager.getAFKTime(message.guildId, message.author.id);
                const reply = await message.reply(`👋 Welcome back! You were AFK for ${duration || 'a while'}.`);
                setTimeout(() => reply.delete().catch(() => {}), 5000);
            }
        } catch (error) {
            console.error('AFK check error:', error);
        }

        // Check mentions for AFK users
        try {
            if (message.mentions.users.size > 0) {
                const afkMentions = [];
                for (const [userId, user] of message.mentions.users) {
                    const afkData = afkManager.isAFK(message.guildId, userId);
                    if (afkData) {
                        const duration = afkManager.getAFKTime(message.guildId, userId);
                        afkMentions.push(`${user} is AFK: **${afkData.reason}** (${duration})`);
                    }
                }
                
                if (afkMentions.length > 0) {
                    const reply = await message.reply(afkMentions.join('\\n'));
                    setTimeout(() => reply.delete().catch(() => {}), 10000);
                }
            }
        } catch (error) {
            console.error('AFK mention check error:', error);
        }

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

        // Track message statistics
        try {
            await statsManager.recordMessage(message.guildId, message.author.id, message.channelId);
        } catch (error) {
            console.error('Stats tracking error:', error);
        }

        // Add XP (5-15 XP per message, with cooldown)
        try {
            const xpCooldown = 60000; // 1 minute cooldown
            const lastXpKey = `${message.guildId}_${message.author.id}_lastXP`;
            
            if (!global[lastXpKey] || Date.now() - global[lastXpKey] > xpCooldown) {
                // Apply channel XP multiplier
                const multiplier = levelRewardsManager.getXPMultiplier(message.guildId, message.channelId);
                const baseXP = Math.floor(Math.random() * 11) + 5; // 5-15 XP
                const xpGain = Math.floor(baseXP * multiplier);
                
                const result = await economyManager.addXP(message.guildId, message.author.id, xpGain);
                
                if (result.leveledUp) {
                    const reward = result.level * 100;
                    await economyManager.addMoney(message.guildId, message.author.id, reward);
                    
                    // Check for level role rewards
                    const roleReward = levelRewardsManager.getRoleForLevel(message.guildId, result.level);
                    let roleRewardText = '';
                    
                    if (roleReward) {
                        try {
                            const role = await message.guild.roles.fetch(roleReward);
                            if (role) {
                                await message.member.roles.add(role);
                                roleRewardText = `\\n🎭 You earned the **${role.name}** role!`;
                                
                                // Remove lower level roles if not stacking
                                const settings = levelRewardsManager.getSettings(message.guildId);
                                if (!settings.stackRoles) {
                                    const allRewards = levelRewardsManager.getAllRewardsSorted(message.guildId);
                                    for (const oldReward of allRewards) {
                                        if (oldReward.level < result.level && oldReward.roleId !== roleReward) {
                                            const oldRole = message.member.roles.cache.get(oldReward.roleId);
                                            if (oldRole) {
                                                await message.member.roles.remove(oldRole).catch(() => {});
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error assigning level role:', error);
                        }
                    }
                    
                    const settings = levelRewardsManager.getSettings(message.guildId);
                    if (settings.notificationsEnabled) {
                        const embed = new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle('🎉 Level Up!')
                            .setDescription(`${message.author} reached level **${result.level}**!${roleRewardText}`)
                            .addFields({ name: 'Reward', value: `💰 ${reward} coins` })
                            .setThumbnail(message.author.displayAvatarURL());
                        
                        await message.channel.send({ embeds: [embed] });
                    }
                }
                
                global[lastXpKey] = Date.now();
            }
        } catch (error) {
            console.error('XP tracking error:', error);
        }

        // Check for custom commands
        if (message.content.startsWith('!')) {
            const args = message.content.slice(1).split(/ +/);
            const commandName = args[0].toLowerCase();
            const customCommand = customCommandManager.getCommand(message.guildId, commandName);
            
            if (customCommand) {
                try {
                    return message.reply(customCommand);
                } catch (error) {
                    console.error('Custom command error:', error);
                }
            }
        }

        // Command handling is done in index.js through CommandHandler
    }
};

