const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const moderationManager = require('../../utils/moderationManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Manage user warnings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a warning to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to warn')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for warning')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List warnings for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check warnings')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all warnings for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to clear warnings')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a specific warning')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User with the warning')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('id')
                        .setDescription('Warning ID to remove')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await handleAdd(interaction);
        } else if (subcommand === 'list') {
            await handleList(interaction);
        } else if (subcommand === 'clear') {
            await handleClear(interaction);
        } else if (subcommand === 'remove') {
            await handleRemove(interaction);
        }
    },
};

async function handleAdd(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const warning = await moderationManager.addWarning(
        interaction.guildId,
        target.id,
        interaction.user.id,
        reason
    );

    const warnings = moderationManager.getWarnings(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Warning Added')
        .setDescription(`**${target.tag}** has been warned`)
        .addFields(
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: `${warnings.length}`, inline: true },
            { name: 'Warning ID', value: `${warning.id}`, inline: true }
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleList(interaction) {
    const target = interaction.options.getUser('user');
    const warnings = moderationManager.getWarnings(interaction.guildId, target.id);

    if (warnings.length === 0) {
        return interaction.reply({ content: `✅ **${target.tag}** has no warnings!`, flags: MessageFlags.Ephemeral });
    }

    const warningList = warnings.map((w, i) => {
        const date = new Date(w.timestamp).toLocaleDateString();
        return `**${i + 1}.** ID: \`${w.id}\` - ${w.reason}\n   📅 ${date} by <@${w.moderatorId}>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(`⚠️ Warnings for ${target.tag}`)
        .setDescription(warningList)
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: `Total: ${warnings.length} warnings` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleClear(interaction) {
    const target = interaction.options.getUser('user');
    await moderationManager.clearWarnings(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Warnings Cleared')
        .setDescription(`All warnings for **${target.tag}** have been cleared`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction) {
    const target = interaction.options.getUser('user');
    const warningId = interaction.options.getInteger('id');

    const success = await moderationManager.removeWarning(interaction.guildId, target.id, warningId);

    if (!success) {
        return interaction.reply({ content: '❌ Warning not found!', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Warning Removed')
        .setDescription(`Warning ID \`${warningId}\` for **${target.tag}** has been removed`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
