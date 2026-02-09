const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const moderationManager = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure auto-moderation settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable auto-moderation'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable auto-moderation'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('antiinvite')
                .setDescription('Toggle anti-invite protection')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('antispam')
                .setDescription('Toggle anti-spam protection')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('emojionly')
                .setDescription('Delete emoji-only messages')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('badwords')
                .setDescription('Manage bad words list')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add', value: 'add' },
                            { name: 'Remove', value: 'remove' },
                            { name: 'List', value: 'list' }
                        ))
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Word to add or remove')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('View current auto-mod settings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('scan')
                .setDescription('Scan recent messages and remove violations')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Messages per channel (1-100)')
                        .setMinValue(1)
                        .setMaxValue(100)
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('maxmessages')
                        .setDescription('Max messages per channel to scan (100-5000)')
                        .setMinValue(100)
                        .setMaxValue(5000)
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('full')
                        .setDescription('Scan as much history as allowed by maxmessages')
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Scan a specific channel only')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'enable') {
            await moderationManager.updateAutomodSettings(interaction.guildId, { enabled: true });
            return interaction.reply('✅ Auto-moderation enabled!');
        }

        if (subcommand === 'disable') {
            await moderationManager.updateAutomodSettings(interaction.guildId, { enabled: false });
            return interaction.reply('✅ Auto-moderation disabled!');
        }

        if (subcommand === 'antiinvite') {
            const enabled = interaction.options.getBoolean('enabled');
            await moderationManager.updateAutomodSettings(interaction.guildId, { antiInvite: enabled });
            return interaction.reply(`✅ Anti-invite ${enabled ? 'enabled' : 'disabled'}!`);
        }

        if (subcommand === 'antispam') {
            const enabled = interaction.options.getBoolean('enabled');
            await moderationManager.updateAutomodSettings(interaction.guildId, { antiSpam: enabled });
            return interaction.reply(`✅ Anti-spam ${enabled ? 'enabled' : 'disabled'}!`);
        }

        if (subcommand === 'emojionly') {
            const enabled = interaction.options.getBoolean('enabled');
            await moderationManager.updateAutomodSettings(interaction.guildId, { emojiOnly: enabled });
            return interaction.reply(`✅ Emoji-only deletion ${enabled ? 'enabled' : 'disabled'}!`);
        }

        if (subcommand === 'badwords') {
            const action = interaction.options.getString('action');
            const word = interaction.options.getString('word');
            const settings = moderationManager.getAutomodSettings(interaction.guildId);

            if (action === 'list') {
                if (settings.badWords.length === 0) {
                    return interaction.reply({ content: '📝 No bad words configured.', flags: MessageFlags.Ephemeral });
                }
                return interaction.reply({ content: `📝 Bad words: ${settings.badWords.join(', ')}`, flags: MessageFlags.Ephemeral });
            }

            if (!word) {
                return interaction.reply({ content: '❌ Please provide a word!', flags: MessageFlags.Ephemeral });
            }

            if (action === 'add') {
                if (!settings.badWords.includes(word.toLowerCase())) {
                    settings.badWords.push(word.toLowerCase());
                    await moderationManager.updateAutomodSettings(interaction.guildId, settings);
                    return interaction.reply(`✅ Added "${word}" to bad words list!`);
                }
                return interaction.reply({ content: '❌ Word already in list!', flags: MessageFlags.Ephemeral });
            }

            if (action === 'remove') {
                const index = settings.badWords.indexOf(word.toLowerCase());
                if (index > -1) {
                    settings.badWords.splice(index, 1);
                    await moderationManager.updateAutomodSettings(interaction.guildId, settings);
                    return interaction.reply(`✅ Removed "${word}" from bad words list!`);
                }
                return interaction.reply({ content: '❌ Word not in list!', flags: MessageFlags.Ephemeral });
            }
        }

        if (subcommand === 'settings') {
            const settings = moderationManager.getAutomodSettings(interaction.guildId);
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🛡️ Auto-Moderation Settings')
                .addFields(
                    { name: 'Status', value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: 'Anti-Invite', value: settings.antiInvite ? '✅ On' : '❌ Off', inline: true },
                    { name: 'Anti-Spam', value: settings.antiSpam ? '✅ On' : '❌ Off', inline: true },
                    { name: 'Emoji-Only Delete', value: settings.emojiOnly ? '✅ On' : '❌ Off', inline: true },
                    { name: 'Max Mentions', value: settings.maxMentions.toString(), inline: true },
                    { name: 'Max Emojis', value: settings.maxEmojis.toString(), inline: true },
                    { name: 'Bad Words', value: settings.badWords.length > 0 ? settings.badWords.join(', ') : 'None' }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'scan') {
            const limit = interaction.options.getInteger('limit') || 100;
            const maxMessages = interaction.options.getInteger('maxmessages') || 1000;
            const full = interaction.options.getBoolean('full') || false;
            const channelOption = interaction.options.getChannel('channel');
            const botMember = interaction.guild.members.me;

            await interaction.reply({ content: '🔎 Scanning recent messages...', flags: MessageFlags.Ephemeral });

            let scannedChannels = 0;
            let skippedChannels = 0;
            let scannedMessages = 0;
            let deletedMessages = 0;

            const channels = channelOption
                ? [channelOption]
                : Array.from(interaction.guild.channels.cache.values()).filter(c =>
                    (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement));

            for (const channel of channels) {
                const perms = channel.permissionsFor(botMember);
                if (!perms || !perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.ReadMessageHistory) || !perms.has(PermissionFlagsBits.ManageMessages)) {
                    skippedChannels++;
                    continue;
                }

                scannedChannels++;

                let scannedThisChannel = 0;
                let lastId = undefined;

                while (scannedThisChannel < maxMessages) {
                    const batchLimit = full ? Math.min(limit, maxMessages - scannedThisChannel) : limit;
                    const messages = await channel.messages.fetch({ limit: batchLimit, before: lastId }).catch(() => null);
                    if (!messages || messages.size === 0) break;

                    scannedMessages += messages.size;
                    scannedThisChannel += messages.size;

                    const violations = messages.filter(m => {
                        if (m.author.bot || m.pinned) return false;
                        const result = moderationManager.checkMessage(m.guildId, m.content, m.mentions.users.size);
                        return result.violation;
                    });

                    if (violations.size > 0) {
                        const now = Date.now();
                        const bulkDeletable = violations.filter(m => now - m.createdTimestamp < 1209600000);
                        const older = violations.filter(m => now - m.createdTimestamp >= 1209600000);

                        if (bulkDeletable.size > 0) {
                            const deleted = await channel.bulkDelete(bulkDeletable, true).catch(() => null);
                            if (deleted) deletedMessages += deleted.size;
                        }

                        for (const msg of older.values()) {
                            try {
                                await msg.delete();
                                deletedMessages++;
                            } catch {
                                // ignore individual delete failures
                            }
                        }
                    }

                    lastId = messages.last()?.id;
                    if (!full) break;
                }
            }

            const summary = `✅ Scan complete. Channels scanned: ${scannedChannels}, skipped: ${skippedChannels}, messages scanned: ${scannedMessages}, deleted: ${deletedMessages}.`;

            const modLogChannel = moderationManager.getModLogChannel(interaction.guildId);
            if (modLogChannel) {
                const logChannel = await interaction.client.channels.fetch(modLogChannel).catch(() => null);
                if (logChannel && logChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🧹 Auto-Mod Scan Summary')
                        .addFields(
                            { name: 'Requested By', value: interaction.user.tag, inline: true },
                            { name: 'Full Scan', value: full ? 'Yes' : 'No', inline: true },
                            { name: 'Max Messages/Channel', value: maxMessages.toString(), inline: true },
                            { name: 'Channels Scanned', value: scannedChannels.toString(), inline: true },
                            { name: 'Channels Skipped', value: skippedChannels.toString(), inline: true },
                            { name: 'Messages Scanned', value: scannedMessages.toString(), inline: true },
                            { name: 'Messages Deleted', value: deletedMessages.toString(), inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }

            return interaction.editReply({ content: summary });
        }
    },
};
