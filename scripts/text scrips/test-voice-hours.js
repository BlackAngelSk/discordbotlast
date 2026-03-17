/**
 * Test Voice Hours Tracking in Season Leaderboard
 * Simulates voice hours being added to a season leaderboard
 */

require('dotenv').config();
const seasonManager = require('../../utils/seasonManager');

async function testVoiceHoursTracking() {
    try {
        console.log('🧪 Testing Voice Hours Tracking...\n');

        // Initialize season manager
        await seasonManager.init();

        // Test guild and season
        const testGuildId = '421968526547353601';
        const testSeasonName = 'season-development';
        const testUserId = '349649557896036354';
        const testUsername = 'TestUser';

        console.log(`📁 Guild ID: ${testGuildId}`);
        console.log(`📅 Season: ${testSeasonName}`);
        console.log(`👤 User ID: ${testUserId}\n`);

        // Check if season exists
        const season = seasonManager.getSeason(testGuildId, testSeasonName);
        if (!season) {
            console.log('❌ Season not found!');
            return;
        }

        console.log('✅ Season found!\n');

        // Test adding voice hours (simulating 30 minutes of voice activity)
        console.log('📝 Adding 30 minutes of voice hours...');
        const result1 = await seasonManager.addVoiceHours(testGuildId, testSeasonName, testUserId, 30, testUsername);
        console.log(`✅ Result:`, result1);
        console.log(`   Total voice hours: ${result1.voiceHours.toFixed(2)}h\n`);

        // Test adding more voice hours (30 more minutes)
        console.log('📝 Adding another 60 minutes of voice hours...');
        const result2 = await seasonManager.addVoiceHours(testGuildId, testSeasonName, testUserId, 60, testUsername);
        console.log(`✅ Result:`, result2);
        console.log(`   Total voice hours: ${result2.voiceHours.toFixed(2)}h\n`);

        // Verify in leaderboard
        const player = season.leaderboard[testUserId];
        if (player) {
            console.log('📊 Player in Season Leaderboard:');
            console.log(`   Username: ${player.username}`);
            console.log(`   Voice Hours: ${(player.voiceHours || 0).toFixed(2)}h`);
            console.log(`   Balance: ${player.balance} coins`);
            console.log(`   Last Updated: ${new Date(player.lastUpdated).toLocaleString()}\n`);
        }

        // Get voice leaderboard
        console.log('🏆 Top Voice Hours Leaderboard:');
        const voiceLeaderboard = seasonManager.getSeasonLeaderboard(testGuildId, testSeasonName, 'voiceHours', 5);
        if (voiceLeaderboard.length > 0) {
            voiceLeaderboard.forEach((player, i) => {
                const hours = Math.floor(player.voiceHours || 0);
                const minutes = Math.round(((player.voiceHours || 0) - hours) * 60);
                console.log(`   ${i + 1}. ${player.username} - ${hours}h ${minutes}m`);
            });
        } else {
            console.log('   No players yet');
        }

        console.log('\n✅ Voice Hours Tracking Test Complete!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error);
    }
}

testVoiceHoursTracking();
