const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { startTetrisSession } = require('../../utils/tetrisSession');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tetris')
        .setDescription('Play Tetris with button controls right in Discord!'),

    async execute(interaction) {
        await startTetrisSession({
            sessionKey: `${interaction.guild.id}_${interaction.user.id}`,
            userId: interaction.user.id,
            playerMention: `<@${interaction.user.id}>`,
            sendInitial: (payload) => interaction.reply(payload),
            fetchReply: () => interaction.fetchReply(),
            editMessage: (payload) => interaction.editReply(payload),
            onSessionConflict: () => interaction.reply({
                content: '⏳ You already have an active Tetris game in this server.',
                flags: MessageFlags.Ephemeral
            })
        });
    }
};