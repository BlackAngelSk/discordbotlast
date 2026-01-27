const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Get information about a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to get information about')
                .setRequired(true)),
    
    async execute(interaction) {
        const role = interaction.options.getRole('role');

        const permissions = role.permissions.toArray().map(perm => {
            return perm.split(/(?=[A-Z])/).join(' ');
        }).slice(0, 10);

        const embed = new EmbedBuilder()
            .setColor(role.hexColor || '#0099FF')
            .setTitle(`Role Information: ${role.name}`)
            .addFields(
                { name: '🆔 ID', value: role.id, inline: true },
                { name: '🎨 Color', value: role.hexColor, inline: true },
                { name: '👥 Members', value: role.members.size.toString(), inline: true },
                { name: '📊 Position', value: role.position.toString(), inline: true },
                { name: '📌 Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                { name: '💬 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
                { name: `🔐 Key Permissions [${permissions.length}]`, value: permissions.length > 0 ? permissions.join(', ') : 'None' }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
