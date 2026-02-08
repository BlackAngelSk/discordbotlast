const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false)),
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');

        if (commandName) {
            const command = interaction.client.commands.get(commandName) ||
                           interaction.client.slashCommands.get(commandName);

            if (!command) {
                return interaction.reply({ content: `❌ Command "${commandName}" not found!`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`Help: ${commandName}`)
                .setDescription(command.description || command.data?.description || 'No description available')
                .addFields({ name: 'Usage', value: command.usage || `/${commandName}` || `!${commandName}` });

            if (command.aliases && command.aliases.length > 0) {
                embed.addFields({ name: 'Aliases', value: command.aliases.join(', ') });
            }

            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('📚 Bot Commands')
            .setDescription('Here are all available commands. Use `/help <command>` for more details.')
            .addFields(
                { name: '🎵 Music', value: '`play` `pause` `resume` `stop` `skip` `queue` `volume` `nowplaying` `loop` `shuffle` `previous`' },
                { name: '🎮 Fun & Games', value: '`blackjack` `coinflip` `dice` `rps` `slots` `roulette` `ttt` `propose` `accept` `reject` `divorce` `spouse` `couples` `horserace`' },
                { name: '💰 Economy', value: '`balance` `daily` `weekly` `transfer` `shop` `leaderboard`' },
                { name: '🛡️ Moderation', value: '`ban` `kick` `timeout` `warn` `clear` `lock` `unlock` `slowmode` `automod` `logging`' },
                { name: '🔧 Utility', value: '`help` `ping` `stats` `profile` `avatar` `userinfo` `serverinfo` `giveaway` `invites`' }
            )
            .setFooter({ text: 'Use /help <command> for detailed information' });

        await interaction.reply({ embeds: [embed] });
    }
};
