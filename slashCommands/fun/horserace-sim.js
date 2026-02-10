const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('horseracesim')
        .setDescription('Simulate horse races for statistics (admin/owner only)')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of races to simulate (1-5000)')
                .setMinValue(1)
                .setMaxValue(5000)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('course')
                .setDescription('Course to simulate')
                .setRequired(false)
                .addChoices(
                    { name: 'Random', value: 'random' },
                    { name: 'Short', value: 'short' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Long', value: 'long' }
                )),
    category: 'fun',
    async execute(interaction) {
        // Send immediate response to prevent timeout
        await interaction.reply({ content: '⏳ Processing simulation, please wait...', flags: [4096] }).catch(() => {});
        
        try {
            console.log(`[horseracesim] Command triggered by ${interaction.user.tag}`);
            
            if (!interaction.inGuild()) {
                console.log('[horseracesim] Not in guild');
                return interaction.editReply({ content: '❌ This command can only be used in a server.' }).catch(() => {});
            }

            const isOwner = interaction.guild.ownerId === interaction.user.id;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            console.log(`[horseracesim] isOwner: ${isOwner}, isAdmin: ${isAdmin}`);
            
            if (!isOwner && !isAdmin) {
                console.log('[horseracesim] Permission denied');
                return interaction.editReply({ content: '❌ Only the server owner or an administrator can use this command.' }).catch(() => {});
            }

            const countInput = interaction.options.getInteger('count') || 1000;
            const count = Math.min(5000, Math.max(1, countInput));
            const courseOption = (interaction.options.getString('course') || 'random').toLowerCase();
            const courses = ['short', 'medium', 'long'];
            console.log(`[horseracesim] Simulating ${count} races on ${courseOption} course`);

            const horses = [1, 2, 3, 4, 5];
            const now = Date.now();
            const records = [];

            for (let i = 0; i < count; i++) {
                const course = courseOption === 'random'
                    ? courses[Math.floor(Math.random() * courses.length)]
                    : (courses.includes(courseOption) ? courseOption : 'medium');

                const choice = horses[Math.floor(Math.random() * horses.length)];
                const winner = horses[Math.floor(Math.random() * horses.length)];

                records.push({
                    guildId: interaction.guild.id,
                    userId: interaction.user.id,
                    bet: 0,
                    payout: 0,
                    choice,
                    winner,
                    course,
                    timestamp: new Date(now - i * 1000).toISOString()
                });
            }

            await horseRaceManager.addRecords(records);
            console.log(`[horseracesim] Added ${records.length} records`);

            const statsCourse = courseOption === 'random' ? null : courseOption;
            const stats = await horseRaceManager.getHorseStats(interaction.guild.id, statsCourse);

            let statsText = '';
            for (let h = 1; h <= 5; h++) {
                const w = stats[h].wins;
                const l = stats[h].losses;
                const total = w + l;
                const wr = total > 0 ? ((w / total) * 100).toFixed(1) : 0;
                statsText += `Horse ${h}: ${w}W-${l}L (${wr}%)\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🏇 Horse Race Simulation Complete')
                .setDescription(`Simulated **${count}** races${statsCourse ? ` on **${statsCourse}**` : ''}.`)
                .addFields({ name: 'Stats', value: statsText, inline: false });

            await interaction.editReply({ embeds: [embed] });
            console.log(`[horseracesim] Successfully sent response`);
        } catch (error) {
            console.error('Error in horseracesim command:', error);
            try {
                await interaction.editReply({ content: `❌ An error occurred while simulating races: ${error.message}` }).catch(() => {});
            } catch (e) {
                console.error('Failed to send error response:', e.message);
            }
        }
    }
};
