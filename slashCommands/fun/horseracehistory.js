const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('horseracehistory')
        .setDescription('View horse racing history and statistics for this server')
        .addStringOption(option =>
            option.setName('course')
                .setDescription('Filter by course')
                .setRequired(false)
                .addChoices(
                    { name: 'Short', value: 'short' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Long', value: 'long' }
                ))
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of races to show (1-20)')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            // Defer immediately to prevent interaction timeout
            await interaction.deferReply();
            
            const courseArg = interaction.options.getString('course') || null;
            const validCourses = ['short', 'medium', 'long'];
            const filterCourse = validCourses.includes(courseArg) ? courseArg : null;
            const countArg = interaction.options.getInteger('count') || 10;
            const count = Math.min(20, Math.max(1, countArg));

            const records = await horseRaceManager.getRecords(interaction.guild.id, 100);
            const filtered = filterCourse ? records.filter(r => r.course === filterCourse) : records;
            const recent = filtered.slice(0, count);

            if (!recent || recent.length === 0) {
                return interaction.editReply({ content: '❌ No horse race history for this server yet.' });
            }

            const horseStats = await horseRaceManager.getHorseStats(interaction.guild.id, filterCourse);

            const emojis = {
                1: '1️⃣',
                2: '2️⃣',
                3: '3️⃣',
                4: '4️⃣',
                5: '5️⃣'
            };

            let statsText = '**Horse Records** (W-L):\n';
            for (let h = 1; h <= 5; h++) {
                const w = horseStats[h].wins;
                const l = horseStats[h].losses;
                const total = w + l;
                const wr = total > 0 ? ((w / total) * 100).toFixed(1) : 0;
                statsText += `${emojis[h]} Horse ${h}: ${w}W-${l}L (${wr}%)\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🏇 Horse Race History')
                .setColor(0x5865f2)
                .addFields({ name: 'Stats', value: statsText, inline: false })
                .setFooter({ text: `Showing last ${recent.length} races${filterCourse ? ` (${filterCourse})` : ''}` });

            const lines = recent.map(r => {
                const time = new Date(r.timestamp).toLocaleString();
                const user = `<@${r.userId}>`;
                const won = r.payout && r.payout > 0;
                return `**${time}** — ${user} bet **${r.bet}** on **${r.choice}**, winner **${r.winner}** (${r.course}) ${won ? `→ +${r.payout}` : `→ -${r.bet}`}`;
            });

            embed.setDescription(lines.join('\n'));

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in horseracehistory command:', error);
            try {
                const errorMsg = { content: '❌ An error occurred while fetching history!' };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorMsg);
                } else {
                    await interaction.reply({ ...errorMsg, flags: [4096] });
                }
            } catch (e) {
                console.error('Failed to send error response:', e.message);
            }
        }
    }
};
