const { Events, ActivityType } = require('discord.js');

function createStartupBanner(botName) {
    const title = (botName || 'DISCORD BOT').toUpperCase();
    const paddedTitle = `  ${title}  `;
    const border = '='.repeat(paddedTitle.length);

    return [
        '░▒▓███████▓▒░░▒▓█▓▒░       ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓███████▓▒░ ░▒▓██████▓▒░░▒▓████████▓▒░▒▓█▓▒░       ░▒▓███████▓▒░▒▓█▓▒░░▒▓█▓▒░ ',
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ ',
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ ',
        '░▒▓███████▓▒░░▒▓█▓▒░      ░▒▓████████▓▒░▒▓█▓▒░      ░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒▒▓███▓▒░▒▓██████▓▒░ ░▒▓█▓▒░       ░▒▓██████▓▒░░▒▓███████▓▒░  ',
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ',
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ',
        '░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░░▒▓██████▓▒░░▒▓████████▓▒░▒▓████████▓▒░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░ ',
        '                                                                                                                                                      ',
        '░▒▓███████▓▒░░▒▓█▓▒░░▒▓███████▓▒░░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓███████▓▒░░▒▓███████▓▒░ ░▒▓██████▓▒░▒▓████████▓▒░ ',                                  
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░   ',                                    
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░  ',                                     
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓██████▓▒░░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░ ',                                      
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░ ',                                      
        '░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░ ',                                      
        '░▒▓███████▓▒░░▒▓█▓▒░▒▓███████▓▒░ ░▒▓██████▓▒░ ░▒▓██████▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓███████▓▒░░▒▓███████▓▒░ ░▒▓██████▓▒░  ░▒▓█▓▒░ ',                           
        border,
        paddedTitle,
        border,
        ''
    ].join('\n');
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(readyClient) {
        console.log(createStartupBanner(readyClient.user.username));
        console.log(`✅ Logged in as ${readyClient.user.tag}!`);
        console.log(`🤖 Bot is ready and serving ${readyClient.guilds.cache.size} servers`);

        // Unified startup coordinator from index.js (non-blocking)
        if (typeof readyClient.startReadyTasks === 'function') {
            readyClient.startReadyTasks();
        }
        
        // Set bot presence/status
        const activities = [
            { name: '/help for commands', type: ActivityType.Playing },
            { name: `${readyClient.guilds.cache.size} servers`, type: ActivityType.Watching },
            { name: 'music 🎵', type: ActivityType.Listening },
            { name: '/play to start', type: ActivityType.Playing },
        ];

        let currentActivity = 0;

        // Set initial activity
        readyClient.user.setPresence({
            activities: [activities[currentActivity]],
            status: 'online'
        });

        // Rotate activities every 30 seconds
        setInterval(() => {
            currentActivity = (currentActivity + 1) % activities.length;
            readyClient.user.setPresence({
                activities: [activities[currentActivity]],
                status: 'online'
            });
        }, 30000); // 30 seconds

        console.log('✅ Bot status set successfully');

        // Restart active giveaways in background to keep ready path fast
        setTimeout(async () => {
            try {
                const giveawayCommand = require('../commands/utility/giveaway');
                if (giveawayCommand.restartGiveaways) {
                    await giveawayCommand.restartGiveaways(readyClient);
                    console.log('✅ Active giveaways restarted');
                }
            } catch (error) {
                console.error('Error restarting giveaways:', error);
            }
        }, 0);

        // Start rainbow role color updates
        try {
            const customRoleShop = require('../utils/customRoleShop');
            let rainbowRunning = false;
            setInterval(async () => {
                if (rainbowRunning) return;
                rainbowRunning = true;
                try {
                    await customRoleShop.applyRainbowUpdates(readyClient);
                } finally {
                    rainbowRunning = false;
                }
            }, 3000); // Every 3 seconds
            console.log('✅ Rainbow role updates started');
        } catch (error) {
            console.error('Error starting rainbow updates:', error);
        }

        // Start live stream alerts polling
        setTimeout(async () => {
            try {
                const liveAlertsManager = require('../utils/liveAlertsManager');
                await liveAlertsManager.init(readyClient);
                console.log('✅ Live alerts polling started');
            } catch (error) {
                console.error('Error starting live alerts:', error);
            }
        }, 15000);

        setTimeout(async () => {
            try {
                const epicGamesAlertsManager = require('../utils/epicGamesAlertsManager');
                await epicGamesAlertsManager.init(readyClient);
                console.log('✅ Epic Games alerts polling started');
            } catch (error) {
                console.error('Error starting Epic Games alerts:', error);
            }
        }, 17000);

        setTimeout(async () => {
            try {
                const steamGameUpdatesManager = require('../utils/steamGameUpdatesManager');
                await steamGameUpdatesManager.init(readyClient);
                console.log('✅ Steam game update polling started');
            } catch (error) {
                console.error('Error starting Steam game updates:', error);
            }
        }, 19000);

        // Start stat channel updater
        setTimeout(async () => {
            try {
                const statChannelsManager = require('../utils/statChannelsManager');
                await statChannelsManager.startUpdater(readyClient);
                console.log('✅ Stat channel updater started');
            } catch (error) {
                console.error('Error starting stat channels:', error);
            }
        }, 20000);
    }
};
