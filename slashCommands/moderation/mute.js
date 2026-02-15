const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Mute duration in minutes')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for mute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ User not found in this server!', flags: MessageFlags.Ephemeral });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot mute yourself!', flags: MessageFlags.Ephemeral });
        }

        if (target.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot mute the server owner!', flags: MessageFlags.Ephemeral });
        }

        // Prevent muting bot owner
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && target.id === botOwnerId) {
            return interaction.reply({ content: '❌ Cannot mute the bot owner! 🔑', flags: MessageFlags.Ephemeral });
        }

        if (target.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot mute someone with a higher or equal role!', flags: MessageFlags.Ephemeral });
        }

        try {
            await target.timeout(duration * 60 * 1000, reason);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔇 Member Muted')
                .setDescription(`**${target.user.tag}** has been muted`)
                .addFields(
                    { name: 'Duration', value: `${duration} minutes`, inline: true },
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true }
                )
                .setThumbnail(target.user.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Mute error:', error);
            await interaction.reply({ content: '❌ Failed to mute user!', flags: MessageFlags.Ephemeral });
        }
    },
};
