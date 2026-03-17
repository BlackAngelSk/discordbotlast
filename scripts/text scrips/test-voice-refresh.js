/**
 * Test Voice Hours Preservation During Leaderboard Refresh
 * Simulates what happens when /leaderboard-update is called
 */

require('dotenv').config();
const seasonManager = require('../../utils/seasonManager');

async function testVoiceHoursPreservation() {
    try {
        console.log('🧪 Testing Voice Hours Preservation During Leaderboard Refresh...\n');

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

        // Step 1: Add voice hours
        console.log('📝 Step 1: Adding 90 minutes of voice hours...');
        const voiceResult = await seasonManager.addVoiceHours(testGuildId, testSeasonName, testUserId, 90, testUsername);
        console.log(`✅ Voice hours added: ${voiceResult.voiceHours.toFixed(2)}h\n`);

        // Check before refresh
        let player = season.leaderboard[testUserId];
        console.log('📊 Before Refresh:');
        console.log(`   Voice Hours: ${(player.voiceHours || 0).toFixed(2)}h`);
        console.log(`   Balance: ${player.balance} coins`);
        console.log(`   Username: ${player.username}\n`);

        // Step 2: Simulate leaderboard refresh (what /leaderboard-update does)
        console.log('🔄 Step 2: Simulating leaderboard refresh...');
        const refreshResult = await seasonManager.refreshSeasonStats(testGuildId, testSeasonName, (userId) => {
            // This simulates getting fresh data from economyManager and gameStatsManager
            return {
                username: 'TestUser',
                balance: 5000,  // Changed balance to show refresh is happening
                xp: 100,
                level: 5,
                seasonalCoins: 2000,
                gambling: {
                    blackjack: { wins: 2, losses: 1, ties: 0 },
                    roulette: { wins: 0, losses: 0 },
                    slots: { wins: 0, losses: 0 },
                    dice: { wins: 0, losses: 0 },
                    coinflip: { wins: 0, losses: 0 },
                    rps: { wins: 0, losses: 0, ties: 0 },
                    ttt: { wins: 0, losses: 0, ties: 0 }
                }
            };
        });
        console.log(`✅ Refresh complete. Updated: ${refreshResult.updated} player(s)\n`);

        // Check after refresh
        player = season.leaderboard[testUserId];
        console.log('📊 After Refresh:');
        console.log(`   Voice Hours: ${(player.voiceHours || 0).toFixed(2)}h`);
        console.log(`   Balance: ${player.balance} coins`);
        console.log(`   XP: ${player.xp}`);
        console.log(`   Level: ${player.level}`);
        console.log(`   Username: ${player.username}\n`);

        // Verify voice hours were preserved
        if ((player.voiceHours || 0).toFixed(2) === '1.50') {
            console.log('✅ PASS: Voice hours were preserved during refresh!');
        } else {
            console.log(`❌ FAIL: Voice hours changed! Expected 1.50h, got ${(player.voiceHours || 0).toFixed(2)}h`);
        }

        // Verify other stats were updated
        if (player.balance === 5000) {
            console.log('✅ PASS: Balance was updated correctly!');
        } else {
            console.log(`❌ FAIL: Balance not updated! Expected 5000, got ${player.balance}`);
        }

        console.log('\n✅ Voice Hours Preservation Test Complete!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error);
    }
}

testVoiceHoursPreservation();
