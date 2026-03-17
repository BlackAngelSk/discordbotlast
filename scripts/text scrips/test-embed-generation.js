/**
 * Test Leaderboard Embed Generation
 * Checks what embeds are being generated for the season leaderboard
 */

require('dotenv').config();
const seasonManager = require('../../utils/seasonManager');
const seasonLeaderboardManager = require('../../utils/seasonLeaderboardManager');

async function testEmbedGeneration() {
    try {
        console.log('🧪 Testing Leaderboard Embed Generation\n');

        await seasonManager.init();
        await seasonLeaderboardManager.init();

        const guildId = '421968526547353601';
        const seasonName = 'season-development';

        console.log(`📅 Generating embeds for: ${seasonName}\n`);

        // We need a mock client object for user fetching
        const mockClient = {
            users: {
                fetch: async (id) => ({
                    username: `User${id.slice(-4)}`
                })
            }
        };

        const embeds = await seasonLeaderboardManager.generateSeasonEmbeds(
            guildId,
            seasonManager,
            seasonName,
            mockClient
        );

        console.log(`📊 Total embeds generated: ${embeds.length}\n`);

        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            console.log(`─────────────────────────────────────────`);
            console.log(`Embed ${i + 1}:`);
            console.log(`Title: ${embed.data.title || '(no title)'}`);
            console.log(`Description: ${embed.data.description?.substring(0, 50) || '(no description)'}...`);
            console.log(`Fields: ${embed.data.fields?.length || 0}`);
            
            if (embed.data.fields) {
                embed.data.fields.forEach((field, j) => {
                    console.log(`  Field ${j + 1}: ${field.name}`);
                    if (field.name.includes('Voice')) {
                        console.log(`    Value: ${field.value.substring(0, 100)}...`);
                    }
                });
            }
        }

        console.log(`─────────────────────────────────────────\n`);

        // Check specifically for voice hours
        const voiceEmbed = embeds.find(e => 
            e.data.title?.includes('Voice') || 
            e.data.fields?.some(f => f.name.includes('Voice'))
        );

        if (voiceEmbed) {
            console.log('✅ Voice Hours embed found!');
            console.log(`Title: ${voiceEmbed.data.title}`);
            const voiceField = voiceEmbed.data.fields?.find(f => f.name.includes('Voice'));
            if (voiceField) {
                console.log(`Content:\n${voiceField.value}`);
            }
        } else {
            console.log('❌ Voice Hours embed NOT found!');
            console.log('   This could mean:');
            console.log('   1. No players have voice hours');
            console.log('   2. Voice hours leaderboard is empty');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

testEmbedGeneration();
