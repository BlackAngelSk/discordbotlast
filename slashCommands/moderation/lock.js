const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel to prevent members from sending messages')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to lock (current channel if not specified)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: '❌ I don\'t have permission to manage channels!', ephemeral: true });
        }

        try {
            await channel.permissionOverwrites.edit(interaction.guild.id, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🔒 Channel Locked')
                .setDescription(`${channel} has been locked!`)
                .setFooter({ text: `Locked by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error locking channel:', error);
            await interaction.reply({ content: '❌ Failed to lock the channel!', ephemeral: true });
        }
    }
};
