const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const systemStatsManager = require('../../utils/systemStatsManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('system-stats')
        .setDescription('Display system CPU and RAM usage (updates every 30 seconds)'),

    async execute(interaction) {
        try {
            // Check if user is bot owner
            const OWNER_ID = process.env.BOT_OWNER_ID;
            
            if (interaction.user.id !== OWNER_ID) {
                return interaction.reply({
                    content: '❌ This command is only available to the bot owner.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Initial embed
            const embed = generateStatsEmbed();
            
            // Create stop button
            const components = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('stop_stats')
                        .setLabel('Stop Monitoring')
                        .setStyle(ButtonStyle.Danger)
                )
            ];

            // Send initial message
            const message = await interaction.reply({
                embeds: [embed],
                components: components,
                fetchReply: true
            });

            // Set up auto-update every 30 seconds
            const updateInterval = setInterval(async () => {
                try {
                    const updatedEmbed = generateStatsEmbed();
                    await message.edit({ embeds: [updatedEmbed] });
                } catch (error) {
                    console.error('Error updating stats embed:', error);
                    clearInterval(updateInterval);
                }
            }, 30000); // 30 seconds

            // Store interval for cleanup
            const userId = interaction.user.id;
            if (!global.statsMonitors) {
                global.statsMonitors = new Map();
            }
            global.statsMonitors.set(message.id, {
                interval: updateInterval,
                userId: userId,
                channelId: interaction.channelId
            });

            // Handle button click to stop monitoring
            const collector = message.createMessageComponentCollector({
                componentType: 2, // Button type
                time: 60 * 60 * 1000 // 1 hour timeout
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'stop_stats') {
                    if (buttonInteraction.user.id !== userId) {
                        return buttonInteraction.reply({
                            content: '❌ Only the person who started monitoring can stop it.',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    clearInterval(updateInterval);
                    global.statsMonitors.delete(message.id);

                    await message.edit({
                        content: '⏹️ System monitoring stopped.',
                        embeds: [],
                        components: []
                    });

                    await buttonInteraction.reply({
                        content: '✅ Monitoring stopped.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            });

            collector.on('end', () => {
                clearInterval(updateInterval);
                global.statsMonitors.delete(message.id);
            });

        } catch (error) {
            console.error('Error in system-stats command:', error);
            const reply = {
                content: `❌ Error: ${error.message}`,
                flags: MessageFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
};

/**
 * Generate system stats embed
 */
function generateStatsEmbed() {
    const stats = systemStatsManager.getSystemStats();
    const cpuPercent = stats.cpu;
    const ramPercent = stats.ram.percent;
    const botMemory = stats.botMemory;

    // Determine colors based on usage
    const cpuColor = getCPUColor(cpuPercent);
    const ramColor = getRAMColor(ramPercent);
    const overallColor = Math.max(cpuColor, ramColor);

    const embed = new EmbedBuilder()
        .setColor(overallColor)
        .setTitle('💻 System Monitoring Dashboard')
        .setDescription(`Last updated: <t:${Math.floor(Date.now() / 1000)}:R>`)
        .addFields(
            {
                name: '📊 CPU Usage',
                value: `\`\`\`${getCPUBar(cpuPercent)}\`\`\``,
                inline: false
            },
            {
                name: '🧠 System RAM Usage',
                value: `\`\`\`${getRAMBar(ramPercent)}\`\`\`\n**Used:** ${stats.ram.used} / ${stats.ram.total}\n**Free:** ${stats.ram.free}`,
                inline: false
            },
            {
                name: '🤖 Bot Memory Usage',
                value: `**Heap:** ${botMemory.heapUsed} / ${botMemory.heapTotal}\n**RSS:** ${botMemory.rss}\n**External:** ${botMemory.external}`,
                inline: false
            },
            {
                name: '⏱️ Bot Uptime',
                value: `\`${stats.uptime}\``,
                inline: true
            },
            {
                name: '🖥️ System Info',
                value: `**CPU Cores:** ${require('os').cpus().length}\n**Platform:** ${require('os').platform()}`,
                inline: true
            }
        )
        .setFooter({ text: '🔄 Updates every 30 seconds' })
        .setTimestamp();

    return embed;
}

/**
 * Get color based on CPU usage
 */
function getCPUColor(percentage) {
    if (percentage < 25) return 0x57F287; // Green
    if (percentage < 50) return 0x5865F2; // Blue
    if (percentage < 75) return 0xFFD700; // Yellow
    return 0xFF6B6B; // Red
}

/**
 * Get color based on RAM usage
 */
function getRAMColor(percentage) {
    if (percentage < 25) return 0x57F287; // Green
    if (percentage < 50) return 0x5865F2; // Blue
    if (percentage < 75) return 0xFFD700; // Yellow
    return 0xFF6B6B; // Red
}

/**
 * Generate CPU bar visual
 */
function getCPUBar(percentage) {
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${percentage.toFixed(1)}%`;
}

/**
 * Generate RAM bar visual
 */
function getRAMBar(percentage) {
    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${percentage.toFixed(1)}%`;
}
