const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const queues = require('../utils/queues');
const { isDJ } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Jump to a specific song in the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Position in queue to jump to')
                .setRequired(true)
                .setMinValue(1)),
    
    async execute(interaction) {
        const position = interaction.options.getInteger('position');
        const queue = queues.get(interaction.guildId);

        if (!queue || !queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', flags: MessageFlags.Ephemeral });
        }

        if (!await isDJ(interaction.member)) {
            return interaction.reply({ content: '❌ You need the DJ role to use this command!', flags: MessageFlags.Ephemeral });
        }

        if (position > queue.songs.length) {
            return interaction.reply({ content: `❌ Position must be between 1 and ${queue.songs.length}!`, flags: MessageFlags.Ephemeral });
        }

        const targetSong = queue.songs[position - 1];
        queue.jump(position);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('⏭️ Jumped in Queue')
            .setDescription(`Jumping to **${targetSong.title}**`)
            .addFields({ name: 'Position', value: `${position}`, inline: true })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
