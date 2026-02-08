const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue'),
    
    async execute(interaction) {
        const queue = interaction.client.queues.get(interaction.guild.id);

        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: '❌ The queue is empty!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🎵 Music Queue')
            .setDescription(`**Now Playing:**\n[${queue.songs[0].title}](${queue.songs[0].url})\nRequested by: ${queue.songs[0].requester}`)
            .setThumbnail(queue.songs[0].thumbnail);

        if (queue.songs.length > 1) {
            let queueList = '';
            for (let i = 1; i < Math.min(10, queue.songs.length); i++) {
                queueList += `**${i}.** [${queue.songs[i].title}](${queue.songs[i].url})\n`;
            }
            if (queue.songs.length > 10) {
                queueList += `\n*...and ${queue.songs.length - 10} more songs*`;
            }
            embed.addFields({ name: 'Up Next', value: queueList });
        }

        embed.setFooter({ text: `Total songs: ${queue.songs.length} | Loop: ${queue.loop ? 'On' : 'Off'}` });

        await interaction.reply({ embeds: [embed] });
    }
};
