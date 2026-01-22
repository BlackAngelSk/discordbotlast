const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'dashboard',
    description: 'Get the dashboard link',
    async execute(message, args, client) {
        const dashboardEnabled = process.env.DASHBOARD_ENABLED === 'true';
        
        if (!dashboardEnabled) {
            return message.reply('❌ Dashboard is not enabled on this bot.');
        }

        const port = process.env.DASHBOARD_PORT || 3000;
        const dashboardUrl = process.env.DASHBOARD_URL || `http://localhost:${port}`;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🌐 Web Dashboard')
            .setDescription('Manage your bot settings from a beautiful web interface!')
            .addFields(
                {
                    name: '📱 Access Dashboard',
                    value: `[Click here to open dashboard](${dashboardUrl})`,
                    inline: false
                },
                {
                    name: '✨ Features',
                    value: '• Change bot settings\n• Configure welcome/leave messages\n• Manage roles\n• And more!',
                    inline: false
                },
                {
                    name: '🔐 Authentication',
                    value: 'Login with your Discord account to manage servers where you have admin permissions.',
                    inline: false
                }
            )
            .setFooter({ text: 'You must have Administrator permissions to change settings' });

        await message.reply({ embeds: [embed] });
    }
};
