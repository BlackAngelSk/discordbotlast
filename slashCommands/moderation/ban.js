const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server!', flags: MessageFlags.Ephemeral });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot ban yourself!', flags: MessageFlags.Ephemeral });
        }

        if (member.id === interaction.client.user.id) {
            return interaction.reply({ content: '❌ I cannot ban myself!', flags: MessageFlags.Ephemeral });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot ban this user due to role hierarchy!', flags: MessageFlags.Ephemeral });
        }

        if (!member.bannable) {
            return interaction.reply({ content: '❌ I cannot ban this user!', flags: MessageFlags.Ephemeral });
        }

        try {
            await member.ban({ reason: `${reason} | Banned by ${interaction.user.tag}` });

            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🔨 Member Banned')
                .setDescription(`${target} has been banned!`)
                .addFields({ name: 'Reason', value: reason })
                .setFooter({ text: `Banned by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error banning member:', error);
            await interaction.reply({ content: '❌ Failed to ban the member!', flags: MessageFlags.Ephemeral });
        }
    }
};
