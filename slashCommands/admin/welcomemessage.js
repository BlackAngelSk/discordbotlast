const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomemessage')
        .setDescription('Setup welcome messages for new members')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup welcome message')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to send welcome messages')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Welcome message title')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Welcome message description')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview welcome message')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable welcome messages')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('variables')
                .setDescription('View available variables for messages')
        ),
    async execute(interaction) {
        const welcomeMessageManager = interaction.client.welcomeMessageManager;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'Welcome to {SERVER_NAME}!';
            const description = interaction.options.getString('description') || 'Welcome {USER}!';

            welcomeMessageManager.setWelcomeConfig(interaction.guild.id, {
                enabled: true,
                channelId: channel.id,
                title,
                description,
                includeAvatar: true,
                includeCount: true,
                dm: false
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Welcome Message Setup')
                .addFields(
                    { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                    { name: 'Status', value: 'Enabled', inline: true },
                    { name: 'Title', value: title, inline: false },
                    { name: 'Description', value: description, inline: false }
                )
                .setFooter({ text: 'Use /welcomemessage variables to see available variables' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'preview') {
            const config = welcomeMessageManager.getWelcomeConfig(interaction.guild.id);

            if (!config || !config.enabled) {
                return await interaction.reply({ 
                    content: '❌ Welcome messages are not setup!', 
                    flags: 64 
                });
            }

            const embed = welcomeMessageManager.createWelcomeEmbed(interaction.member, config);
            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'disable') {
            welcomeMessageManager.removeWelcomeConfig(interaction.guild.id);

            await interaction.reply({ 
                content: '✅ Welcome messages disabled!', 
                flags: 64 
            });
        } else if (subcommand === 'variables') {
            const variables = welcomeMessageManager.getAvailableVariables();

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📝 Welcome Message Variables')
                .setDescription('Use these variables in your welcome messages:')
                .addFields(
                    variables.map(v => ({ name: v.name, value: v.description, inline: true }))
                )
                .setFooter({ text: 'Example: "Welcome {USER} to {SERVER_NAME}!"' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }
};
