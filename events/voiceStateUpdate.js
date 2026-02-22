const { Events } = require('discord.js');
const voiceRewardsManager = require('../utils/voiceRewardsManager');
const activityTracker = require('../utils/activityTracker');
const seasonManager = require('../utils/seasonManager');

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
                    await activityTracker.startVoiceSession(guildId, userId, newState.channelId);
                    console.log(`🎤 ${newState.member.user.tag} joined voice channel`);
                }
            }
            
            // User left a voice channel
            if (oldState.channelId && !newState.channelId) {
                const session = await voiceRewardsManager.leaveVoice(guildId, userId);
                const activitySession = await activityTracker.endVoiceSession(userId);
                
                // Update season manager with voice hours
                if (session && session.minutes > 0) {
                    try {
                        const currentSeason = seasonManager.getCurrentSeason(guildId);
                        if (currentSeason) {
                            const username = newState.member.user.username || `User${userId.slice(-4)}`;
                            console.log(`🎤 [Season] Adding ${session.minutes} minutes to season: ${currentSeason}`);
                            const result = await seasonManager.addVoiceHours(guildId, currentSeason, userId, session.minutes, username);
                            if (result.success) {
                                console.log(`✅ [Season] ${newState.member.user.tag} voice hours updated: ${result.voiceHours.toFixed(2)}h in ${currentSeason}`);
                            }
                        } else {
                            console.log(`⚠️  [Season] No active season for guild ${guildId}`);
                        }
                    } catch (error) {
                        console.error('❌ Error updating season voice hours:', error);
                    }
                    console.log(`🎤 ${newState.member.user.tag} left voice after ${session.minutes} minutes`);
                }
            }

            // User switched channels
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                const session = await voiceRewardsManager.leaveVoice(guildId, userId);
                await voiceRewardsManager.joinVoice(guildId, userId, newState.channelId);
                const activitySession = await activityTracker.endVoiceSession(userId);
                await activityTracker.startVoiceSession(guildId, userId, newState.channelId);
                
                // Update season with voice hours from the previous channel
                if (session && session.minutes > 0) {
                    try {
                        const currentSeason = seasonManager.getCurrentSeason(guildId);
                        if (currentSeason) {
                            const username = newState.member.user.username || `User${userId.slice(-4)}`;
                            await seasonManager.addVoiceHours(guildId, currentSeason, userId, session.minutes, username);
                        }
                    } catch (error) {
                        console.error('Error updating season voice hours on channel switch:', error);
                    }
                }
                console.log(`🎤 ${newState.member.user.tag} switched voice channels`);
            }

            // User changed deaf/mute status
            if (oldState.channelId === newState.channelId && newState.channelId) {
                const wasActive = !oldState.selfDeaf && !oldState.selfMute;
                const isActive = !newState.selfDeaf && !newState.selfMute;

                if (wasActive && !isActive) {
                    // User went AFK
                    const session = await voiceRewardsManager.leaveVoice(guildId, userId);
                    await activityTracker.endVoiceSession(userId);
                    
                    // Update season with voice hours
                    if (session && session.minutes > 0) {
                        try {
                            const currentSeason = seasonManager.getCurrentSeason(guildId);
                            if (currentSeason) {
                                const username = newState.member.user.username || `User${userId.slice(-4)}`;
                                await seasonManager.addVoiceHours(guildId, currentSeason, userId, session.minutes, username);
                            }
                        } catch (error) {
                            console.error('Error updating season voice hours on AFK:', error);
                        }
                    }
                } else if (!wasActive && isActive) {
                    // User came back from AFK
                    await voiceRewardsManager.joinVoice(guildId, userId, newState.channelId);
                    await activityTracker.startVoiceSession(guildId, userId, newState.channelId);
                }
            }
        } catch (error) {
            console.error('Error in voiceStateUpdate event:', error);
        }
    }
};
