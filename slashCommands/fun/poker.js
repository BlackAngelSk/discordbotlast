const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poker')
        .setDescription('Play multiplayer Texas Hold\'em Poker!')
        .addSubcommand(sub =>
            sub.setName('host')
                .setDescription('Create a poker table')
                .addIntegerOption(opt => opt.setName('bet').setDescription('Bet amount').setMinValue(10).setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('join')
                .setDescription('Join an existing poker table')
                .addIntegerOption(opt => opt.setName('bet').setDescription('Bet amount').setMinValue(10).setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Check your current game status'))
        .addSubcommand(sub =>
            sub.setName('action')
                .setDescription('Take an action in the current game')
                .addStringOption(opt => opt.setName('type').setDescription('Action type').setRequired(true)
                    .addChoices(
                        { name: 'Fold', value: 'fold' },
                        { name: 'Check', value: 'check' },
                        { name: 'Call', value: 'call' },
                        { name: 'Bet', value: 'bet' },
                        { name: 'Raise', value: 'raise' }
                    ))
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount for bet/raise'))),
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            const embed = new EmbedBuilder()
                .setColor(0x228B22)
                .setTitle('🎴 Multiplayer Poker')
                .setDescription('Use **prefix commands** for the best poker experience:\n\n' +
                    '**Host a table:** `!poker host <bet>`\n' +
                    '**Join a table:** `!poker join <bet>`\n' +
                    '**Check status:** `!poker status`\n' +
                    '**Take action:** `!poker action <fold|check|call|bet|raise> [amount]`')
                .setFooter({ text: 'Slash commands are coming soon - use prefix commands for now!' });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } catch (error) {
            console.error('Error in poker command:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ An error occurred!', flags: MessageFlags.Ephemeral });
            }
        }
    }
};
