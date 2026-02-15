const { Events } = require('discord.js');
const voiceRewardsManager = require('../utils/voiceRewardsManager');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState, client) {
        try {
            const guildId = newState.guild.id;
            const userId = newState.member.id;

            // User joined a voice channel
            if (!oldState.channelId && newState.channelId) {
                // Check if user is not deafened or muted (anti-AFK)
                if (!newState.selfDeaf && !newState.selfMute) {
                    await voiceRewardsManager.joinVoice(guildId, userId, newState.channelId);
                    console.log(`🎤 ${newState.member.user.tag} joined voice channel`);
                }
            }
            
            // User left a voice channel
            if (oldState.channelId && !newState.channelId) {
                const session = await voiceRewardsManager.leaveVoice(guildId, userId);
                if (session) {
                    console.log(`🎤 ${newState.member.user.tag} left voice after ${session.minutes} minutes`);
                }
            }

            // User switched channels
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                await voiceRewardsManager.leaveVoice(guildId, userId);
                await voiceRewardsManager.joinVoice(guildId, userId, newState.channelId);
                console.log(`🎤 ${newState.member.user.tag} switched voice channels`);
            }

            // User changed deaf/mute status
            if (oldState.channelId === newState.channelId && newState.channelId) {
                const wasActive = !oldState.selfDeaf && !oldState.selfMute;
                const isActive = !newState.selfDeaf && !newState.selfMute;

                if (wasActive && !isActive) {
                    // User went AFK
                    await voiceRewardsManager.leaveVoice(guildId, userId);
                } else if (!wasActive && isActive) {
                    // User came back from AFK
                    await voiceRewardsManager.joinVoice(guildId, userId, newState.channelId);
                }
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate event:', error);
        }
    }
};
