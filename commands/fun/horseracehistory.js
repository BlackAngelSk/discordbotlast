const { EmbedBuilder } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');

module.exports = {
    name: 'horseracehistory',
    description: 'Show recent horse race history for this server',
    usage: '!horseracehistory [count]',
    aliases: ['racehistory','hrhistory'],
    category: 'fun',
    async execute(message, args) {
        try {
            const courseArg = (args[0] || '').toLowerCase();
            const validCourses = ['short', 'medium', 'long'];
            const filterCourse = validCourses.includes(courseArg) ? courseArg : null;
            const countArg = filterCourse ? (parseInt(args[1]) || 10) : (parseInt(args[0]) || 10);
            const count = Math.min(20, Math.max(1, countArg));

            const records = await horseRaceManager.getRecords(message.guild.id, 100);
            const filtered = filterCourse ? records.filter(r => r.course === filterCourse) : records;
            const recent = filtered.slice(0, count);

            if (!recent || recent.length === 0) {
                return message.reply('No horse race history for this server yet.');
            }

            // Get horse stats for the course
            const horseStats = await horseRaceManager.getHorseStats(message.guild.id, filterCourse);

            // Build horse stats section
            let statsText = '**Horse Records** (W-L):\n';
            for (let h = 1; h <= 5; h++) {
                const emojis = {
                    1: '1️⃣',
                    2: '2️⃣',
                    3: '3️⃣',
                    4: '4️⃣',
                    5: '5️⃣'
                };
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

            // Discord embed description max ~4096, ensure we don't exceed
            embed.setDescription(lines.join('\n'));

            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in horseracehistory:', error);
            message.reply('❌ Could not fetch horse race history.');
        }
    }
};
