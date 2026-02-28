const { Events, ActivityType } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(readyClient) {
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
    }
};
