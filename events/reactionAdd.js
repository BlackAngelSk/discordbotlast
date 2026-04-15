const { Events, EmbedBuilder } = require('discord.js');
const queues = require('../utils/queues');
const reactionRoleManager = require('../utils/reactionRoleManager');
const starboardManager = require('../utils/starboardManager');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {
        if (user.bot) return;
        
        const message = reaction.message;

        try {
            // Await partial reactions
            if (reaction.partial) {
                await reaction.fetch();
            }

            // Check for reaction roles
            const roleId = reactionRoleManager.getRoleForReaction(message.guildId, message.id, reaction.emoji.toString());

            if (roleId) {
                try {
                    const member = await message.guild.members.fetch(user.id);
                    const role = await message.guild.roles.fetch(roleId);
                    if (role) {
                        await member.roles.add(role);
                    }
                } catch (error) {
                    console.error('Error adding reaction role:', error);
                }
            }

            // Check for starboard
            const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
            let settings = {};
            try {
                const data = await fs.readFile(settingsPath, 'utf8');
                settings = JSON.parse(data);
            } catch (error) {
                settings = {};
            }

            const starboardChannelId = settings[message.guildId]?.starboardChannel;
            const starboardThreshold = Math.max(1, Number(settings[message.guildId]?.starboardThreshold) || 3);
            if (starboardChannelId && (reaction.emoji.name === 'star' || reaction.emoji.toString() === '⭐')) {
                const starCount = reaction.count;

                // Add to starboard if threshold is reached
                if (starCount >= starboardThreshold) {
                    const isInStarboard = starboardManager.isInStarboard(message.guildId, message.id);

                    if (!isInStarboard) {
                        const starboardChannel = await client.channels.fetch(starboardChannelId).catch(() => null);
                        
                        if (starboardChannel) {
                            const embed = new EmbedBuilder()
                                .setColor('#FFD700')
                                .setTitle('⭐ Starboard')
                                .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                                .setDescription(message.content || 'No text content')
                                .addFields({ name: 'Source', value: `[Jump to message](${message.url})` })
                                .setFooter({ text: `⭐ ${starCount} | ${message.channelId}` })
                                .setTimestamp();

                            if (message.embeds.length > 0) {
                                embed.addFields({ name: 'Original Embeds', value: `${message.embeds.length} embed(s)` });
                            }

                            if (message.attachments.size > 0) {
                                const firstAttachment = message.attachments.first();
                                if (firstAttachment.contentType?.startsWith('image/')) {
                                    embed.setImage(firstAttachment.url);
                                }
                            }

                            const starboardMsg = await starboardChannel.send({ embeds: [embed] });
                            await starboardManager.addToStarboard(message.guildId, message.id, message.channelId, starboardChannelId, message, starCount);
                        }
                    }
                }
            }

            // Music reactions (now playing)
            const queue = queues.get(message.guild.id);
            
            if (queue && queue.nowPlayingMessage && queue.nowPlayingMessage.id === message.id) {
                switch (reaction.emoji.name) {
                    case '⏸️': // Pause
                        queue.pause();
                        await message.channel.send('⏸️ Paused playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                    case '▶️': // Resume
                        queue.resume();
                        await message.channel.send('▶️ Resumed playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                    case '⏭️': // Skip
                        queue.skip();
                        await message.channel.send('⏭️ Skipped to next song!').then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                    case '⏹️': // Stop
                        queue.stop();
                        await message.channel.send('⏹️ Stopped music and cleared queue!').then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                    case '🔉': // Volume down
                        const volumeDown = queue.decreaseVolume();
                        await message.channel.send(`🔉 Volume: ${volumeDown}%`).then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                    case '🔊': // Volume up
                        const volumeUp = queue.increaseVolume();
                        await message.channel.send(`🔊 Volume: ${volumeUp}%`).then(msg => setTimeout(() => msg.delete(), 3000));
                        break;
                }
                
                // Remove user's reaction
                await reaction.users.remove(user.id);
            }
        } catch (error) {
            console.error('Error handling reaction:', error);
        }
    }
};
