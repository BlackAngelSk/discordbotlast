const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel to allow members to send messages')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to unlock (current channel if not specified)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: '❌ I don\'t have permission to manage channels!', ephemeral: true });
        }

        try {
            await channel.permissionOverwrites.edit(interaction.guild.id, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`${channel} has been unlocked!`)
                .setFooter({ text: `Unlocked by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error unlocking channel:', error);
            await interaction.reply({ content: '❌ Failed to unlock the channel!', ephemeral: true });
        }
    }
};
