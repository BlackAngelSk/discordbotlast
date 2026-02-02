const { Events, ActionRowBuilder, ButtonBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const queues = require('../utils/queues');
const ticketManager = require('../utils/ticketManager');
const settingsManager = require('../utils/settingsManager');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (!interaction.isButton()) return;

        // Handle help category buttons
        if (interaction.customId.startsWith('help_')) {
            try {
                const category = interaction.customId.replace('help_', '');
                const settings = settingsManager.get(interaction.guildId);
                const p = settings.prefix;
                
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTimestamp()
                    .setFooter({ text: `${p}help - Back to main menu | DJ = Requires DJ role` });

                switch (category) {
                    case 'music':
                        embed.setTitle('🎵 Music Commands')
                            .setDescription('Play music from YouTube, Spotify, and SoundCloud!')
                            .addFields(
                                { name: '▶️ Playback', value: `\`${p}play <url/query>\` - Play a song\n\`${p}pause\` - Pause playback (DJ)\n\`${p}resume\` - Resume playback (DJ)\n\`${p}skip\` - Skip current song (DJ)\n\`${p}stop\` - Stop and clear queue (DJ)\n\`${p}leave\` - Leave voice channel` },
                                { name: '📋 Queue', value: `\`${p}queue\` - View song queue\n\`${p}nowplaying\` - Current song info\n\`${p}remove <pos>\` - Remove song (DJ)\n\`${p}move <from> <to>\` - Move song (DJ)\n\`${p}shuffle\` - Shuffle queue (DJ)\n\`${p}clear\` - Clear queue (DJ)` },
                                { name: '🔧 Controls', value: `\`${p}volume <0-200>\` - Set volume (DJ)\n\`${p}loop <off/song/queue>\` - Loop mode (DJ)\n\`${p}previous\` - Play previous song (DJ)\n\`${p}jump <pos>\` - Jump to position (DJ)\n\`${p}autoplay\` - Toggle autoplay (DJ)` },
                                { name: '📝 Info', value: `\`${p}lyrics [song]\` - Get song lyrics` }
                            );
                        break;

                    case 'economy':
                        embed.setTitle('💰 Economy Commands')
                            .setDescription('Earn coins, gamble, and climb the leaderboard!')
                            .addFields(
                                { name: '💵 Balance', value: `\`/balance [@user]\` - Check balance\n\`/daily\` - Daily coins + streak bonus\n\`/weekly\` - Weekly coins\n\`${p}profile [@user]\` - View full profile with XP` },
                                { name: '🎰 Gambling', value: `\`${p}slots <bet>\` - Slot machine\n\`${p}coinflip <h/t> <bet>\` - 2.5x multiplier\n\`${p}dice <1-6> <bet>\` - 6x multiplier\n\`${p}roulette <bet>\` - Roulette wheel\n\`${p}blackjack <bet>\` - Card game\n\`${p}rps <bet>\` - Rock paper scissors` },
                                { name: '🏆 Leaderboards', value: `\`${p}leaderboard balance\` - Richest users\n\`${p}leaderboard xp\` - Top levels\n\`${p}leaderboard seasonal\` - Seasonal coins` },
                                { name: '🛒 Shop', value: `\`/shop\` - View items to buy\n\`${p}transfer @user <amount>\` - Send coins` }
                            );
                        break;

                    case 'games':
                        embed.setTitle('🎮 Game Commands')
                            .setDescription('Play games and track your stats!')
                            .addFields(
                                { name: '🎲 Mini Games', value: `\`${p}minigame rps\` - Rock paper scissors\n\`${p}minigame guess\` - Guess the number\n\`${p}minigame trivia\` - Trivia questions\n\`${p}ttt [@user]\` - Tic tac toe` },
                                { name: '🎰 Betting Games', value: `\`${p}slots <bet>\` - Slot machine\n\`${p}blackjack <bet>\` - Card game\n\`${p}roulette <bet>\` - Roulette\n\`${p}coinflip <h/t> <bet>\` - Coin flip\n\`${p}dice <1-6> <bet>\` - Dice roll\n\`${p}rps <bet>\` - RPS with betting` },
                                { name: '📊 Stats', value: `\`${p}gamestats [@user]\` - View game statistics` }
                            );
                        break;

                    case 'moderation':
                        embed.setTitle('🛡️ Moderation Commands')
                            .setDescription('Keep your server safe and organized!')
                            .addFields(
                                { name: '👮 Actions', value: `\`${p}kick @user [reason]\` - Kick member\n\`${p}ban @user [reason]\` - Ban member\n\`${p}unban <userId>\` - Unban user\n\`${p}timeout @user <mins> [reason]\` - Timeout\n\`${p}untimeout @user\` - Remove timeout\n\`${p}warn @user <reason>\` - Warn user` },
                                { name: '🗑️ Cleanup', value: `\`${p}purge <amount>\` - Delete messages\n\`${p}clear <amount>\` - Clear messages\n\`${p}lock\` - Lock channel\n\`${p}unlock\` - Unlock channel` },
                                { name: '📋 Warnings', value: `\`/warnings add @user <reason>\`\n\`/warnings list @user\`\n\`/warnings remove @user <id>\`\n\`/warnings clear @user\`\n\`/modlog #channel\` - Set log channel` },
                                { name: '🤖 Auto-Mod', value: `\`/automod enable/disable\`\n\`/automod antiinvite\` - Block invites\n\`/automod antispam\` - Block spam\n\`/automod badwords add/remove\`\n\`/automod settings\` - View settings` }
                            );
                        break;
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            } catch (error) {
                console.error('Error handling help button:', error);
                await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
                return;
            }
        }

        // Handle ticket system
        if (interaction.customId === 'create_ticket') {
            try {
                await interaction.deferReply({ ephemeral: true });
                
                const settings = ticketManager.getSettings(interaction.guildId);
                if (!settings.categoryId) {
                    return interaction.editReply('❌ Ticket system is not properly configured!');
                }

                const category = await interaction.guild.channels.fetch(settings.categoryId).catch(() => null);
                if (!category) {
                    return interaction.editReply('❌ Ticket category was deleted!');
                }

                // Create ticket channel
                const ticketChannel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            id: interaction.guildId,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                        }
                    ]
                });

                // Create ticket record
                const ticketId = await ticketManager.createTicket(interaction.guildId, interaction.user.id, 'Support request');

                // Send welcome message
                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🎫 Support Ticket')
                    .setDescription('Thank you for contacting support!\n\nA staff member will be with you shortly.')
                    .addFields(
                        { name: 'User', value: `${interaction.user}`, inline: true },
                        { name: 'Ticket ID', value: ticketId, inline: true }
                    )
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`close_ticket_${ticketId}`)
                        .setLabel('Close Ticket')
                        .setEmoji('🔒')
                        .setStyle(1)
                );

                await ticketChannel.send({ embeds: [embed], components: [closeRow] });

                // Log ticket creation
                if (settings.logsChannelId) {
                    const logsChannel = await client.channels.fetch(settings.logsChannelId).catch(() => null);
                    if (logsChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor(0x57f287)
                            .setTitle('🎫 Ticket Created')
                            .addFields(
                                { name: 'User', value: `${interaction.user}`, inline: true },
                                { name: 'Channel', value: ticketChannel.toString(), inline: true },
                                { name: 'Ticket ID', value: ticketId, inline: false }
                            )
                            .setTimestamp();
                        await logsChannel.send({ embeds: [logEmbed] });
                    }
                }

                return interaction.editReply(`✅ Ticket created! ${ticketChannel}`);
            } catch (error) {
                console.error('Error creating ticket:', error);
                return interaction.editReply('❌ Failed to create ticket!');
            }
        }

        // Handle close ticket
        if (interaction.customId.startsWith('close_ticket_')) {
            try {
                await interaction.deferReply({ ephemeral: true });

                const ticketId = interaction.customId.replace('close_ticket_', '');
                await ticketManager.closeTicket(interaction.guildId, ticketId);

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('✅ Ticket Closed')
                    .setDescription('This ticket has been closed and the channel will be deleted in 10 seconds.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                setTimeout(async () => {
                    try {
                        await interaction.channel.delete();
                    } catch (error) {
                        console.error('Error deleting ticket channel:', error);
                    }
                }, 10000);

                return;
            } catch (error) {
                console.error('Error closing ticket:', error);
                return interaction.editReply('❌ Failed to close ticket!');
            }
        }

        // Music controls
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

