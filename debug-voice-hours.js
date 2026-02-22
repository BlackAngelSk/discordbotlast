/**
 * Debug Voice Hours Tracking
 * Checks if voice hours are being properly saved in the season
 */

require('dotenv').config();
const seasonManager = require('./utils/seasonManager');

async function debugVoiceHours() {
    try {
        console.log('🔍 Debug Voice Hours Tracking\n');

        await seasonManager.init();

        const guildId = '421968526547353601';
        const seasonName = 'season-development';

        const season = seasonManager.getSeason(guildId, seasonName);
        if (!season) {
            console.log('❌ Season not found!');
            return;
        }

        console.log(`📅 Season: ${seasonName}`);
        console.log(`📊 Total players: ${season.totalPlayers}\n`);

        // Check all players and their voice hours
        console.log('👥 All Players in Season:');
        console.log('─'.repeat(80));
        console.log('User ID'.padEnd(20) + 'Username'.padEnd(25) + 'Voice Hours'.padEnd(15) + 'Balance');
        console.log('─'.repeat(80));

        let playersWithVoice = 0;
        let totalVoiceHours = 0;

        for (const userId in season.leaderboard) {
            const player = season.leaderboard[userId];
            const voiceHours = player.voiceHours || 0;
            
            if (voiceHours > 0) {
                playersWithVoice++;
                totalVoiceHours += voiceHours;
            }

            const voiceDisplay = voiceHours > 0 ? `${voiceHours.toFixed(2)}h` : '0h';
            console.log(
                userId.slice(-8).padEnd(20) +
                player.username.padEnd(25) +
                voiceDisplay.padEnd(15) +
                player.balance
            );
        }

        console.log('─'.repeat(80));
        console.log(`\n📊 Summary:`);
        console.log(`   Total Players: ${season.totalPlayers}`);
        console.log(`   Players with Voice Time: ${playersWithVoice}`);
        console.log(`   Total Voice Hours: ${totalVoiceHours.toFixed(2)}h`);

        if (playersWithVoice === 0) {
            console.log('\n⚠️  No players have voice hours yet!');
            console.log('   This could mean:');
            console.log('   1. No one has left a voice channel since the bot started');
            console.log('   2. voiceStateUpdate event is not triggering');
            console.log('   3. Voice hours are being added but not saved properly\n');
        } else {
            console.log(`\n✅ ${playersWithVoice} player(s) have voice hours tracked!\n`);
        }

        // Show top voice leaderboard
        console.log('🏆 Top Voice Leaderboard:');
        const voiceLeaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'voiceHours', 10);
        const filteredVoiceLeaderboard = voiceLeaderboard.filter(p => (p.voiceHours || 0) > 0);
        
        if (filteredVoiceLeaderboard.length > 0) {
            filteredVoiceLeaderboard.forEach((player, i) => {
                const hours = Math.floor(player.voiceHours || 0);
                const minutes = Math.round(((player.voiceHours || 0) - hours) * 60);
                console.log(`   ${i + 1}. ${player.username} - ${hours}h ${minutes}m`);
            });
        } else {
            console.log('   No players with voice hours');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

debugVoiceHours();
