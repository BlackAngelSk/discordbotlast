const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const horseRaceManager = require('../../utils/horseRaceManager');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('horserace')
        .setDescription('Create or join a horse race')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new horse race')
                .addIntegerOption(option =>
                    option.setName('buyin')
                        .setDescription('Buy-in amount for the race')
                        .setRequired(true)
                        .setMinValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join an active horse race')
                .addStringOption(option =>
                    option.setName('horse')
                        .setDescription('Choose your horse')
                        .setRequired(true)
                        .addChoices(
                            { name: '🐴 Thunder', value: 'thunder' },
                            { name: '🐎 Lightning', value: 'lightning' },
                            { name: '🏇 Storm', value: 'storm' },
                            { name: '🦄 Spirit', value: 'spirit' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start the horse race'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel the horse race')),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const buyin = interaction.options.getInteger('buyin');
            const result = await horseRaceManager.createRace(interaction.guild.id, interaction.channel.id, interaction.user.id, buyin);
            
            if (!result.success) {
                return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🏇 Horse Race Created!')
                .setDescription(`Buy-in: **${buyin} coins**\n\nUse \`/horserace join\` to join the race!`)
                .setFooter({ text: 'Use /horserace start to begin when ready' });

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'join') {
            const horse = interaction.options.getString('horse');
            const result = await horseRaceManager.joinRace(interaction.guild.id, interaction.channel.id, interaction.user.id, horse);
            
            if (!result.success) {
                return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
            }

            await interaction.reply({ content: `✅ You joined the race with **${horse}**!` });

        } else if (subcommand === 'start') {
            await horseRaceManager.startRace(interaction);

        } else if (subcommand === 'cancel') {
            const result = await horseRaceManager.cancelRace(interaction.guild.id, interaction.channel.id, interaction.user.id);
            
            if (!result.success) {
                return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
            }

            await interaction.reply({ content: '✅ Horse race cancelled and bets refunded!' });
        }
    }
};
