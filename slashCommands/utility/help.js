const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

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

        const settings = settingsManager.get(interaction.guildId);
        const p = settings.prefix;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🤖 Discord Bot - Command Categories')
            .setDescription(`**Server Prefix:** \`${p}\`\n**Slash Commands:** Type \`/\` in chat\n\nClick a button below or use \`${p}help <category>\` for detailed commands!`)
            .addFields(
                { name: '🎵 Music', value: 'Play songs, control playback, manage queue', inline: true },
                { name: '💰 Economy', value: 'Balance, daily rewards, gambling, shop', inline: true },
                { name: '🎮 Games', value: 'Mini games, betting, leaderboards', inline: true },
                { name: '🛡️ Moderation', value: 'Kick, ban, timeout, warnings, automod', inline: true },
                { name: '🎫 Server Tools', value: 'Tickets, reaction roles, starboard', inline: true },
                { name: '📊 Stats', value: 'Server stats, user profiles, activity', inline: true },
                { name: '📝 Custom', value: 'Custom commands (admin)', inline: true },
                { name: '🔧 Utility', value: 'Config, info commands, setup', inline: true },
                { name: '🎭 Fun', value: 'Polls, memes, 8ball', inline: true },
                { name: '🧰 Admin', value: 'Season tools, economy admin, backups', inline: true }
            )
            .setFooter({ text: `Type ${p}help <category> for detailed commands | Example: ${p}help music` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Music')
                .setEmoji('🎵')
                .setCustomId('help_music')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setLabel('Economy')
                .setEmoji('💰')
                .setCustomId('help_economy')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Games')
                .setEmoji('🎮')
                .setCustomId('help_games')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Moderation')
                .setEmoji('🛡️')
                .setCustomId('help_moderation')
                .setStyle(ButtonStyle.Danger)
        );

        const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Admin')
                .setEmoji('🧰')
                .setCustomId('help_admin')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row, adminRow] });
    }
};
