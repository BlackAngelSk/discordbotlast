const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const queues = require('../utils/queues');
const { isDJ } = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set loop mode for the music player')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Song', value: 'song' },
                    { name: 'Queue', value: 'queue' }
                )),
    
    async execute(interaction) {
        const mode = interaction.options.getString('mode');
        const queue = queues.get(interaction.guildId);

        if (!queue || !queue.isPlaying) {
            return interaction.reply({ content: '❌ Nothing is playing right now!', flags: MessageFlags.Ephemeral });
        }

        if (!await isDJ(interaction.member)) {
            return interaction.reply({ content: '❌ You need the DJ role to use this command!', flags: MessageFlags.Ephemeral });
        }

        queue.setLoop(mode);

        const modeEmojis = {
            off: '⏹️',
            song: '🔂',
            queue: '🔁'
        };

        const modeNames = {
            off: 'Loop Off',
            song: 'Looping Current Song',
            queue: 'Looping Queue'
        };

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`${modeEmojis[mode]} ${modeNames[mode]}`)
            .setDescription(mode === 'off' ? 'Loop has been disabled' : 
                          mode === 'song' ? 'Current song will repeat' : 
                          'All songs in the queue will loop')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
