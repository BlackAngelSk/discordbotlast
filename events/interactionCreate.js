const { Events, ActionRowBuilder, ButtonBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits, ButtonStyle, AttachmentBuilder } = require('discord.js');
const queues = require('../utils/queues');
const ticketManager = require('../utils/ticketManager');
const settingsManager = require('../utils/settingsManager');
const customRoleShop = require('../utils/customRoleShop');
const economyManager = require('../utils/economyManager');
const seasonLeaderboardManager = require('../utils/seasonLeaderboardManager');
const moderationManager = require('../utils/moderationManager');
const activityTracker = require('../utils/activityTracker');
const verificationManager = require('../utils/verificationManager');
const roleMenuManager = require('../utils/roleMenuManager');

function isInteractionAckError(error) {
    const code = error?.code ?? error?.rawError?.code;
    return code === 10062 || code === 40060;
}

async function safeInteractionErrorResponse(interaction, content) {
    try {
        if (interaction.deferred) {
            return await interaction.editReply({ content });
        }
        if (interaction.replied) {
            return await interaction.followUp({ content, flags: 64 });
        }
        return await interaction.reply({ content, flags: 64 });
    } catch (err) {
        if (!isInteractionAckError(err)) {
            console.error('Failed to send interaction error response:', err);
        }
        return null;
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand() && interaction.guildId && interaction.user?.id) {
            try {
                await activityTracker.recordActivity(interaction.guildId, interaction.user.id, 'interaction');
            } catch (error) {
                console.error('Interaction activity tracking error:', error);
            }
        }

        // Handle select menu interactions
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('shop_')) {
                try {
                    await interaction.deferReply({ flags: 64 });

                    let itemId = interaction.values[0];
                    if (itemId.startsWith('buyrole_')) {
                        itemId = itemId.replace('buyrole_', '');
                    }
                    const guildId = interaction.guildId;
                    const userId = interaction.user.id;

                    console.log(`[Shop] Guild: ${guildId}, User: ${userId}, Item: ${itemId}`);

                    const result = await customRoleShop.buyCustomRole(guildId, userId, itemId, interaction.guild, economyManager);

                    if (result.success) {
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ Purchase Successful!')
                            .setDescription(result.message)
                            .setThumbnail(interaction.user.displayAvatarURL());

                        return await interaction.editReply({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ Purchase Failed')
                            .setDescription(result.message);

                        return await interaction.editReply({ embeds: [embed] });
                    }
                } catch (error) {
                    console.error('Error handling shop select menu:', error);
                    if (isInteractionAckError(error)) {
                        return;
                    }

                    await safeInteractionErrorResponse(
                        interaction,
                        '❌ An error occurred while processing your purchase.'
                    );
                }
            // ── Role menu select ──────────────────────────────────────────────
            } else if (interaction.customId.startsWith('rolemenu:')) {
                try {
                    await interaction.deferReply({ flags: 64 });
                    const [, guildId, menuId] = interaction.customId.split(':');
                    const menu = roleMenuManager.getMenu(guildId, menuId);
                    if (!menu) return interaction.editReply('❌ This role menu no longer exists.');

                    const selectedRoleIds = interaction.values.map(v => v.split('_').pop());
                    const menuRoleIds = menu.roles.map(r => r.roleId);

                    const added = [];
                    const removed = [];

                    for (const rId of menuRoleIds) {
                        const role = interaction.guild.roles.cache.get(rId);
                        if (!role) continue;
                        if (selectedRoleIds.includes(rId)) {
                            if (!interaction.member.roles.cache.has(rId)) {
                                await interaction.member.roles.add(role, 'Role menu selection').catch(() => {});
                                added.push(role.name);
                            }
                        } else {
                            if (interaction.member.roles.cache.has(rId)) {
                                await interaction.member.roles.remove(role, 'Role menu deselection').catch(() => {});
                                removed.push(role.name);
                            }
                        }
                    }

                    const lines = [];
                    if (added.length) lines.push(`✅ Added: ${added.map(r => `**${r}**`).join(', ')}`);
                    if (removed.length) lines.push(`🗑️ Removed: ${removed.map(r => `**${r}**`).join(', ')}`);
                    if (!lines.length) lines.push('No changes made.');

                    return interaction.editReply(lines.join('\n'));
                } catch (err) {
                    console.error('Role menu interaction error:', err);
                    return interaction.editReply('❌ Failed to update roles.').catch(() => {});
                }
            }
            return;
        }

        if (!interaction.isButton()) return;

        // ── Verification gate ─────────────────────────────────────────────────
        if (interaction.customId.startsWith('verify_')) {
            try {
                const guildId = interaction.customId.split('_')[1];
                if (guildId !== interaction.guildId) return;
                const config = verificationManager.get(guildId);
                if (!config) return interaction.reply({ content: '❌ Verification is not configured.', flags: 64 });
                const role = interaction.guild.roles.cache.get(config.roleId);
                if (!role) return interaction.reply({ content: '❌ Verification role not found. Contact an admin.', flags: 64 });
                if (interaction.member.roles.cache.has(config.roleId)) {
                    return interaction.reply({ content: '✅ You are already verified!', flags: 64 });
                }
                await interaction.member.roles.add(role, 'Verification gate');
                return interaction.reply({ content: `✅ You have been verified and given the **${role.name}** role!`, flags: 64 });
            } catch (err) {
                console.error('Verification button error:', err);
                return interaction.reply({ content: '❌ Something went wrong during verification.', flags: 64 });
            }
        }
        // ── Confession delete ──────────────────────────────────────────────────
        if (interaction.customId.startsWith('confession_delete_')) {
            try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    return interaction.reply({ content: '❌ You need the Manage Messages permission to delete confessions.', flags: 64 });
                }
                await interaction.message.delete();
                return interaction.reply({ content: '🗑️ Confession deleted.', flags: 64 });
            } catch (err) {
                console.error('Confession delete button error:', err);
                return interaction.reply({ content: '❌ Failed to delete the confession.', flags: 64 });
            }
        }
        // ── Report resolve / dismiss ──────────────────────────────────────────
        if (interaction.customId.startsWith('report_resolve_') || interaction.customId.startsWith('report_dismiss_')) {
            try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                    return interaction.reply({ content: '❌ You need the **Manage Messages** permission to handle reports.', flags: 64 });
                }

                const isResolve = interaction.customId.startsWith('report_resolve_');
                const label = isResolve ? '✅ Resolved' : '🚫 Dismissed';
                const color = isResolve ? 0x00c851 : 0x9e9e9e;

                const originalEmbed = interaction.message.embeds[0];
                if (!originalEmbed) return interaction.reply({ content: '❌ Could not find the report embed.', flags: 64 });

                const updatedEmbed = EmbedBuilder.from(originalEmbed)
                    .setColor(color)
                    .setTitle(`🚨 User Report — ${label}`)
                    .addFields({ name: '🔧 Handled By', value: `${interaction.user.tag} (${interaction.user.id}) at <t:${Math.floor(Date.now() / 1000)}:f>` });

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(interaction.message.components[0].components[0].customId)
                        .setLabel('✅ Resolve')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(interaction.message.components[0].components[1].customId)
                        .setLabel('🚫 Dismiss')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

                await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
            } catch (err) {
                console.error('Report button error:', err);
                return safeInteractionErrorResponse(interaction, '❌ Failed to handle the report.');
            }
            return;
        }
        // ─────────────────────────────────────────────────────────────────────
        if (interaction.customId.startsWith('automod_toggle:')) {
            try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: '❌ You need Manage Server permission.', flags: 64 });
                }

                const parts = interaction.customId.split(':');
                const guildId = parts[1];
                const key = parts[2];
                if (!guildId || !key || guildId !== interaction.guildId) {
                    return interaction.reply({ content: '❌ Invalid auto-mod toggle.', flags: 64 });
                }

                const settings = moderationManager.getAutomodSettings(guildId);
                if (typeof settings[key] === 'boolean') {
                    settings[key] = !settings[key];
                    await moderationManager.updateAutomodSettings(guildId, settings);
                }

                const updated = moderationManager.getAutomodSettings(guildId);
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🛡️ Auto-Mod Dashboard')
                    .setDescription('Toggle settings using the buttons below.')
                    .addFields(
                        { name: 'Status', value: updated.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                        { name: 'Anti-Invite', value: updated.antiInvite ? '✅ On' : '❌ Off', inline: true },
                        { name: 'Anti-Spam', value: updated.antiSpam ? '✅ On' : '❌ Off', inline: true },
                        { name: 'Emoji-Only Delete', value: updated.emojiOnly ? '✅ On' : '❌ Off', inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`automod_toggle:${guildId}:enabled`)
                        .setLabel(updated.enabled ? 'Disable' : 'Enable')
                        .setStyle(updated.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`automod_toggle:${guildId}:antiInvite`)
                        .setLabel('Anti-Invite')
                        .setStyle(updated.antiInvite ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`automod_toggle:${guildId}:antiSpam`)
                        .setLabel('Anti-Spam')
                        .setStyle(updated.antiSpam ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`automod_toggle:${guildId}:emojiOnly`)
                        .setLabel('Emoji-Only')
                        .setStyle(updated.emojiOnly ? ButtonStyle.Success : ButtonStyle.Secondary)
                );

                await interaction.update({ embeds: [embed], components: [row] });
                return;
            } catch (error) {
                console.error('Error handling automod dashboard:', error);
                return interaction.reply({ content: '❌ Failed to update auto-mod settings.', flags: 64 });
            }
        }

        if (interaction.customId.startsWith('lb_page:')) {
            try {
                const parts = interaction.customId.split(':');
                const guildId = parts[1];
                const page = parseInt(parts[2], 10);
                if (!guildId || Number.isNaN(page)) {
                    return interaction.reply({ content: '❌ Invalid leaderboard page.', flags: 64 });
                }

                const cached = seasonLeaderboardManager.getPageCache(guildId);
                if (!cached || !cached.embeds || cached.embeds.length === 0) {
                    return interaction.reply({ content: '⏳ Leaderboard cache expired. Please wait for the next update.', flags: 64 });
                }

                if (interaction.channelId !== cached.channelId || interaction.message.id !== cached.messageId) {
                    return interaction.reply({ content: '❌ This leaderboard is no longer active.', flags: 64 });
                }

                const totalPages = cached.embeds.length;
                const safePage = Math.min(Math.max(page, 0), totalPages - 1);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lb_page:${guildId}:${Math.max(0, safePage - 1)}`)
                        .setLabel('⬅️ Prev')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(safePage === 0),
                    new ButtonBuilder()
                        .setCustomId(`lb_page:${guildId}:${Math.min(totalPages - 1, safePage + 1)}`)
                        .setLabel('Next ➡️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(safePage === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId(`lb_page:${guildId}:${safePage}`)
                        .setLabel(`Page ${safePage + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                );

                await interaction.update({ embeds: [cached.embeds[safePage]], components: [row] });
                return;
            } catch (error) {
                console.error('Error handling leaderboard pagination:', error);
                return interaction.reply({ content: '❌ Failed to change page.', flags: 64 });
            }
        }

        // Help button interactions are handled by per-message collectors in help command files.

        // Handle ticket system
        if (interaction.customId === 'create_ticket') {
            try {
                await interaction.deferReply({ flags: 64 });
                
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
                await interaction.deferReply({ flags: 64 });

                const ticketId = interaction.customId.replace('close_ticket_', '');

                // Build transcript
                const messages = [];
                let lastId;
                while (true) {
                    const batch = await interaction.channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
                    if (!batch || batch.size === 0) break;
                    messages.push(...Array.from(batch.values()));
                    lastId = batch.last().id;
                }

                const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                const transcriptLines = sorted.map(m => {
                    const time = new Date(m.createdTimestamp).toISOString();
                    const author = `${m.author?.tag || 'Unknown'}`;
                    const content = (m.content || '').replace(/\n/g, ' ');
                    return `[${time}] ${author}: ${content}`;
                });

                const transcriptContent = transcriptLines.join('\n');
                const transcriptPath = await ticketManager.saveTranscript(interaction.guildId, ticketId, transcriptContent);

                await ticketManager.closeTicket(interaction.guildId, ticketId);

                const embed = new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('✅ Ticket Closed')
                    .setDescription('This ticket has been closed and the channel will be deleted in 10 seconds.')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                const settings = ticketManager.getSettings(interaction.guildId);
                if (settings.logsChannelId && transcriptPath) {
                    const logsChannel = await interaction.client.channels.fetch(settings.logsChannelId).catch(() => null);
                    if (logsChannel && logsChannel.isTextBased()) {
                        const file = new AttachmentBuilder(transcriptPath, { name: `${ticketId}.txt` });
                        const logEmbed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('🧾 Ticket Transcript')
                            .setDescription(`Ticket **${ticketId}** transcript attached.`)
                            .addFields(
                                { name: 'Closed By', value: `${interaction.user}`, inline: true },
                                { name: 'Channel', value: `${interaction.channel}`, inline: true }
                            )
                            .setTimestamp();
                        await logsChannel.send({ embeds: [logEmbed], files: [file] });
                    }
                }

                const channelIdToDelete = interaction.channelId;
                setTimeout(async () => {
                    try {
                        const channel = await interaction.guild?.channels.fetch(channelIdToDelete).catch(() => null);
                        if (channel) {
                            await channel.delete();
                        }
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

        // Poll vote buttons
        if (interaction.customId.startsWith('poll_vote_')) {
            try {
                const optionIndex = parseInt(interaction.customId.replace('poll_vote_', ''), 10);
                if (!interaction.client.polls) interaction.client.polls = new Map();
                const pollData = interaction.client.polls.get(interaction.message.id);

                if (!pollData) {
                    return interaction.reply({ content: '❌ This poll has ended or is no longer active.', flags: 64 });
                }
                if (Date.now() > pollData.endsAt) {
                    return interaction.reply({ content: '❌ This poll has already ended.', flags: 64 });
                }

                const userId = interaction.user.id;

                // Remove previous vote from any option
                for (const [idx, voters] of Object.entries(pollData.votes)) {
                    voters.delete(userId);
                }

                // Cast new vote
                if (!pollData.votes[optionIndex]) pollData.votes[optionIndex] = new Set();
                pollData.votes[optionIndex].add(userId);

                // Rebuild vote counts display
                const totalVotes = Object.values(pollData.votes).reduce((sum, s) => sum + s.size, 0);
                const voteField = pollData.options.map((opt, idx) => {
                    const count = (pollData.votes[idx] || new Set()).size;
                    const bar = totalVotes > 0 ? '█'.repeat(Math.round((count / totalVotes) * 10)) + '░'.repeat(10 - Math.round((count / totalVotes) * 10)) : '░░░░░░░░░░';
                    return `**${String.fromCharCode(65 + idx)}**: ${bar} ${count} vote${count !== 1 ? 's' : ''}`;
                }).join('\n');

                const originalEmbed = interaction.message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(originalEmbed)
                    .spliceFields(0, originalEmbed.fields.length, { name: `Votes (${totalVotes} total)`, value: voteField, inline: false });

                await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
            } catch (err) {
                console.error('Poll vote error:', err);
                if (!interaction.replied && !interaction.deferred) {
                    interaction.reply({ content: '❌ Failed to record your vote.', flags: 64 }).catch(() => {});
                }
            }
            return;
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

        // Handle custom role shop buttons (deprecated - using select menus now)
        // Keeping for backward compatibility
        if (interaction.customId.startsWith('buyrole_')) {
            try {
                await interaction.deferReply({ flags: 64 });

                const itemId = interaction.customId.replace('buyrole_', '');
                const guildId = interaction.guildId;
                const userId = interaction.user.id;

                const result = await customRoleShop.buyCustomRole(guildId, userId, itemId, interaction.guild, economyManager);

                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('✅ Purchase Successful!')
                        .setDescription(result.message)
                        .setThumbnail(interaction.user.displayAvatarURL());

                    return await interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('❌ Purchase Failed')
                        .setDescription(result.message);

                    return await interaction.editReply({ embeds: [embed] });
                }
            } catch (error) {
                console.error('Error handling custom role purchase:', error);
                if (!interaction.replied) {
                    await interaction.reply({ content: '❌ An error occurred while processing your purchase.', flags: 64 });
                }
            }
        }
    }
};

