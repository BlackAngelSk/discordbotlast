const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
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
                    { name: 'Max Mentions', value: settings.maxMentions.toString(), inline: true },
                    { name: 'Max Emojis', value: settings.maxEmojis.toString(), inline: true },
                    { name: 'Bad Words', value: settings.badWords.length > 0 ? settings.badWords.join(', ') : 'None' }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
};
