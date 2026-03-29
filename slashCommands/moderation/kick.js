const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server!', flags: MessageFlags.Ephemeral });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot kick yourself!', flags: MessageFlags.Ephemeral });
        }

        if (member.id === interaction.client.user.id) {
            return interaction.reply({ content: '❌ I cannot kick myself!', flags: MessageFlags.Ephemeral });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot kick this user due to role hierarchy!', flags: MessageFlags.Ephemeral });
        }

        if (!member.kickable) {
            return interaction.reply({ content: '❌ I cannot kick this user!', flags: MessageFlags.Ephemeral });
        }

        try {
            await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('👢 Member Kicked')
                .setDescription(`${target} has been kicked!`)
                .addFields({ name: 'Reason', value: reason })
                .setFooter({ text: `Kicked by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error kicking member:', error);
            await interaction.reply({ content: '❌ Failed to kick the member!', flags: MessageFlags.Ephemeral });
        }
    }
};
