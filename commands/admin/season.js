const { EmbedBuilder } = require('discord.js');
const seasonManager = require('../../utils/seasonManager');

module.exports = {
    name: 'season',
    description: 'Manage economy seasons (Admin only)',
    usage: '!season <create|list|info|end|leaderboard> [args]',
    aliases: ['seasons'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const subcommand = args[0]?.toLowerCase();
            const guildId = message.guildId;

            if (!subcommand) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📊 Season Management Commands')
                        .setDescription('```\n!season create <name>         - Create a new season\n!season list                  - List all seasons\n!season info <season>         - Get season info\n!season leaderboard [season]  - Show season leaderboard\n!season end <season>          - End a season\n```')
                        .setFooter({ text: 'Admin only command' })
                    ]
                });
            }

            switch (subcommand) {
                case 'create':
                    await handleCreate(message, args, guildId);
                    break;
                case 'list':
                    await handleList(message, guildId);
                    break;
                case 'info':
                    await handleInfo(message, args, guildId);
                    break;
                case 'leaderboard':
                    await handleLeaderboard(message, args, guildId);
                    break;
                case 'end':
                    await handleEnd(message, args, guildId);
                    break;
                default:
                    message.reply(`❌ Unknown subcommand: ${subcommand}`);
            }

        } catch (error) {
            console.error('Error in season command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};

async function handleCreate(message, args, guildId) {
    const seasonName = args.slice(1).join('-').toLowerCase();

    if (!seasonName || seasonName.length < 3) {
        return message.reply('❌ Season name must be at least 3 characters long!');
    }

    // Format: season-name
    if (!seasonName.match(/^[a-z0-9-]+$/)) {
        return message.reply('❌ Season name can only contain lowercase letters, numbers, and hyphens!');
    }

    const result = await seasonManager.createSeason(guildId, seasonName, message.author.id);

    if (!result.success) {
        return message.reply(`❌ ${result.error}`);
    }

    const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Season Created')
        .setDescription(`New season **${seasonName}** has been created!`)
        .addFields(
            { name: '📛 Season Name', value: `\`${seasonName}\``, inline: true },
            { name: '👤 Created By', value: `<@${message.author.id}>`, inline: true },
            { name: '🕐 Started', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false },
            { name: '📝 Status', value: '🟢 Active', inline: true }
        )
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleList(message, guildId) {
    const seasons = seasonManager.listSeasons(guildId);

    if (seasons.length === 0) {
        return message.reply('❌ No seasons found for this guild. Create one with `!season create <name>`');
    }

    const currentSeason = seasonManager.getCurrentSeason(guildId);

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Guild Seasons')
        .setDescription(`Total seasons: **${seasons.length}**`)
        .setTimestamp();

    for (const season of seasons) {
        const statusEmoji = season.isActive ? '🟢' : '🔴';
        const status = season.isActive ? 'Active' : 'Ended';
        const isCurrent = season.name === currentSeason ? ' ⭐' : '';

        embed.addFields({
            name: `${statusEmoji} ${season.name}${isCurrent}`,
            value: `Players: **${season.totalPlayers}** | Started: <t:${Math.floor(new Date(season.startDate).getTime() / 1000)}:d> | Status: ${status}`,
            inline: false
        });
    }

    message.reply({ embeds: [embed] });
}

async function handleInfo(message, args, guildId) {
    const seasonName = args.slice(1).join('-').toLowerCase();

    if (!seasonName) {
        return message.reply('❌ Please specify a season name: `!season info <season-name>`');
    }

    const season = seasonManager.getSeason(guildId, seasonName);
    if (!season) {
        return message.reply(`❌ Season **${seasonName}** not found!`);
    }

    const summary = seasonManager.getSeasonSummary(guildId, seasonName);

    const embed = new EmbedBuilder()
        .setColor(season.isActive ? 0x57F287 : 0xED4245)
        .setTitle(`📊 Season: ${seasonName}`)
        .addFields(
            { name: '📛 Name', value: `\`${summary.name}\``, inline: true },
            { name: '🎯 Status', value: summary.isActive ? '🟢 Active' : '🔴 Ended', inline: true },
            { name: '👥 Total Players', value: summary.totalPlayers.toString(), inline: true },
            { name: '💰 Total Balance', value: `${summary.totalBalance.toLocaleString()} coins`, inline: true },
            { name: '⭐ Total XP', value: summary.totalXP.toLocaleString(), inline: true },
            { name: '🏆 Total Earnings', value: `${summary.totalCoins.toLocaleString()} coins`, inline: true },
            { name: '🕐 Started', value: summary.startDate, inline: false },
            { name: '👤 Created By', value: `<@${summary.createdBy}>`, inline: true }
        )
        .setTimestamp();

    if (summary.endDate) {
        embed.addFields(
            { name: '🏁 Ended', value: summary.endDate, inline: true }
        );
    }

    message.reply({ embeds: [embed] });
}

async function handleLeaderboard(message, args, guildId) {
    const currentSeason = seasonManager.getCurrentSeason(guildId);
    let seasonName = currentSeason;

    if (args[1]) {
        seasonName = args.slice(1).join('-').toLowerCase();
    }

    if (!seasonName) {
        return message.reply('❌ No active season. Create one with `!season create <name>`');
    }

    const season = seasonManager.getSeason(guildId, seasonName);
    if (!season) {
        return message.reply(`❌ Season **${seasonName}** not found!`);
    }

    const leaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'coins', 10);

    if (leaderboard.length === 0) {
        return message.reply(`ℹ️ No players in season **${seasonName}** yet!`);
    }

    let description = '';
    leaderboard.forEach((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        description += `${medal} <@${player.userId}> - **${player.coins.toLocaleString()}** coins (Lvl ${player.level})\n`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏆 Season Leaderboard: ${seasonName}`)
        .setDescription(description || 'No players yet')
        .setFooter({ text: `Total Players: ${season.totalPlayers}` })
        .setTimestamp();

    message.reply({ embeds: [embed] });
}

async function handleEnd(message, args, guildId) {
    const seasonName = args.slice(1).join('-').toLowerCase();

    if (!seasonName) {
        return message.reply('❌ Please specify a season name: `!season end <season-name>`');
    }

    const season = seasonManager.getSeason(guildId, seasonName);
    if (!season) {
        return message.reply(`❌ Season **${seasonName}** not found!`);
    }

    if (!season.isActive) {
        return message.reply(`❌ Season **${seasonName}** is already ended!`);
    }

    const result = await seasonManager.archiveSeason(guildId, seasonName);

    if (!result.success) {
        return message.reply(`❌ ${result.error}`);
    }

    const leaderboard = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'coins', 3);
    let winners = '';

    leaderboard.forEach((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        winners += `${medal} <@${player.userId}> - ${player.coins.toLocaleString()} coins\n`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`🏁 Season Ended: ${seasonName}`)
        .setDescription('This season has been archived.')
        .addFields(
            { name: '🏆 Top Winners', value: winners || 'No players', inline: false },
            { name: '👥 Total Players', value: season.totalPlayers.toString(), inline: true }
        )
        .setTimestamp();

    message.reply({ embeds: [embed] });
}
