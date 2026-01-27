const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Softban a user (ban and immediately unban to clear messages)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to softban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for softban')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (target.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot softban yourself!', flags: MessageFlags.Ephemeral });
        }

        if (target.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot softban the server owner!', flags: MessageFlags.Ephemeral });
        }

        try {
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);
            
            if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ content: '❌ You cannot softban someone with a higher or equal role!', flags: MessageFlags.Ephemeral });
            }

            await interaction.guild.members.ban(target, { deleteMessageSeconds: 604800, reason });
            await interaction.guild.members.unban(target, 'Softban - Auto unban');

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🔨 Member Softbanned')
                .setDescription(`**${target.tag}** has been softbanned (messages deleted)`)
                .addFields(
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true }
                )
                .setThumbnail(target.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Softban error:', error);
            await interaction.reply({ content: '❌ Failed to softban user!', flags: MessageFlags.Ephemeral });
        }
    },
};
