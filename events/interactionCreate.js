const { Events, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const queues = require('../utils/queues');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (!interaction.isButton()) return;

        // Only handle music control buttons
        if (!interaction.customId.startsWith('music_')) return;

        const message = interaction.message;
        const queue = queues.get(message.guild?.id);

        if (!queue) {
            return interaction.reply({ content: '❌ These controls are no longer active.', flags: 64 });
        }

        try {
            switch (interaction.customId) {
                case 'music_previous':
                    const hasPrevious = queue.playPrevious();
                    if (hasPrevious) {
                        await interaction.reply({ content: '⏮️ Playing previous song!', flags: 64 });
                    } else {
                        await interaction.reply({ content: '❌ No previous song in history!', flags: 64 });
                    }
                    break;
                case 'music_pause':
                    queue.pause();
                    await interaction.reply({ content: '⏸️ Paused playback!', flags: 64 });
                    break;
                case 'music_resume':
                    queue.resume();
                    await interaction.reply({ content: '▶️ Resumed playback!', flags: 64 });
                    break;
                case 'music_skip':
                    queue.skip();
                    await interaction.reply({ content: '⏭️ Skipped to next song!', flags: 64 });
                    break;
                case 'music_stop':
                    queue.stop();
                    await interaction.reply({ content: '⏹️ Stopped music and cleared queue!', flags: 64 });
                    break;
                case 'music_vol_down': {
                    const volumeDown = queue.decreaseVolume();
                    await interaction.reply({ content: `🔉 Volume: ${volumeDown}%`, flags: 64 });
                    break;
                }
                case 'music_vol_up': {
                    const volumeUp = queue.increaseVolume();
                    await interaction.reply({ content: `🔊 Volume: ${volumeUp}%`, flags: 64 });
                    break;
                }
                case 'music_loop': {
                    const loopModes = ['off', 'song', 'queue'];
                    const currentIndex = loopModes.indexOf(queue.loop || 'off');
                    const nextMode = loopModes[(currentIndex + 1) % loopModes.length];
                    
                    queue.setLoop(nextMode);
                    
                    const loopEmojis = { off: '⏹️', song: '🔂', queue: '🔁' };
                    const loopMessages = { off: 'Loop disabled', song: 'Looping current song', queue: 'Looping queue' };
                    
                    await interaction.reply({ content: `${loopEmojis[nextMode]} ${loopMessages[nextMode]}`, flags: 64 });
                    
                    // Update button label
                    const loopLabels = { off: 'Loop: Off', song: 'Loop: Song', queue: 'Loop: Queue' };
                    const updatedRows = interaction.message.components.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(button => {
                            const newButton = ButtonBuilder.from(button);
                            if (button.customId === 'music_loop') {
                                newButton.setLabel(loopLabels[nextMode]);
                            }
                            newRow.addComponents(newButton);
                        });
                        return newRow;
                    });
                    
                    await interaction.message.edit({ components: updatedRows });
                    break;
                }
            }
        } catch (error) {
            console.error('Error handling music button:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ Failed to handle that control.', flags: 64 });
            }
        }
    }
};

