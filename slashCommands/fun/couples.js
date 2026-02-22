const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationshipManager = require('../../utils/relationshipManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('couples')
        .setDescription('View all married couples in this server'),
    
    async execute(interaction) {
        try {
            const couples = relationshipManager.getMarriageLeaderboard(interaction.guild.id, 50);

            if (couples.length === 0) {
                return interaction.reply({ content: '❌ There are no married couples in this server!' });
            }

            const withTimeout = (promise, ms) => new Promise((resolve) => {
                const timer = setTimeout(() => resolve(null), ms);
                promise
                    .then(result => {
                        clearTimeout(timer);
                        resolve(result);
                    })
                    .catch(() => {
                        clearTimeout(timer);
                        resolve(null);
                    });
            });

            const resolveUser = async (userId) => {
                const cached = interaction.client.users.cache.get(userId);
                if (cached) return cached;
                return withTimeout(interaction.client.users.fetch(userId), 3000);
            };

            let description = '';
            const batchSize = 8;
            for (let i = 0; i < couples.length; i += batchSize) {
                const batch = couples.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(async (couple, index) => {
                    const [user1, user2] = await Promise.all([
                        resolveUser(couple.partner1),
                        resolveUser(couple.partner2)
                    ]);
                    if (!user1 || !user2) return null;
                    const rank = i + index + 1;
                    return `${rank}. **${user1.username}** 💕 **${user2.username}** - ${couple.daysMarried} days`;
                }));

                description += batchResults.filter(Boolean).join('\n');
                if (i + batchSize < couples.length && description.length > 0) {
                    description += '\n';
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('💑 Married Couples')
                .setDescription(description || 'No couples found.')
                .setFooter({ text: `Total couples: ${couples.length}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in couples command:', error);
            await interaction.reply({ content: '❌ An error occurred while fetching couples!' });
        }
    }
};
