const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

let commandCatalogCache = null;

function walkJsFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function getCommandCatalog() {
    if (commandCatalogCache) return commandCatalogCache;

    const root = path.join(__dirname, '..', '..');
    const prefixDir = path.join(root, 'commands');
    const slashDir = path.join(root, 'slashCommands');
    const catalog = [];

    for (const file of walkJsFiles(prefixDir)) {
        try {
            const mod = require(file);
            if (!mod?.name) continue;
            catalog.push({
                name: String(mod.name).toLowerCase(),
                displayName: mod.name,
                type: 'prefix',
                description: mod.description || 'No description available',
                usage: mod.usage || `!${mod.name}`,
                aliases: Array.isArray(mod.aliases) ? mod.aliases.map(a => String(a).toLowerCase()) : []
            });
        } catch {
            // ignore invalid command modules
        }
    }

    for (const file of walkJsFiles(slashDir)) {
        try {
            const mod = require(file);
            const name = mod?.data?.name;
            if (!name) continue;
            catalog.push({
                name: String(name).toLowerCase(),
                displayName: name,
                type: 'slash',
                description: mod?.data?.description || mod?.description || 'No description available',
                usage: `/${name}`,
                aliases: []
            });
        } catch {
            // ignore invalid slash modules
        }
    }

    commandCatalogCache = catalog;
    return catalog;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search commands by keyword')
                .setRequired(false)),
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const searchTerm = interaction.options.getString('search');

        if (searchTerm) {
            const q = searchTerm.toLowerCase().trim();
            const catalog = getCommandCatalog();
            const results = catalog
                .filter(c => c.name.includes(q)
                    || c.displayName.toLowerCase().includes(q)
                    || c.description.toLowerCase().includes(q)
                    || c.aliases.some(a => a.includes(q)))
                .slice(0, 10);

            if (results.length === 0) {
                return interaction.reply({
                    content: `❌ No commands found for "${searchTerm}".`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const lines = results.map(c => {
                const icon = c.type === 'slash' ? '⚡' : '⌨️';
                const aliasText = c.aliases.length ? ` (aliases: ${c.aliases.slice(0, 3).join(', ')})` : '';
                return `${icon} **${c.usage}** — ${c.description}${aliasText}`;
            });

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🔎 Help Search: ${searchTerm}`)
                .setDescription(lines.join('\n').slice(0, 3800))
                .setFooter({ text: `Found ${results.length} result(s) • ⚡ slash • ⌨️ prefix` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (commandName) {
            const needle = commandName.toLowerCase();
            const catalog = getCommandCatalog();
            const command = catalog.find(c => c.name === needle || c.aliases.includes(needle));

            if (!command) {
                return interaction.reply({ content: `❌ Command "${commandName}" not found!`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`Help: ${commandName}`)
                .setDescription(command.description || 'No description available')
                .addFields(
                    { name: 'Usage', value: command.usage || `/${command.displayName}` },
                    { name: 'Type', value: command.type === 'slash' ? 'Slash Command' : 'Prefix Command', inline: true }
                );

            if (command.aliases?.length > 0) {
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

        const row1 = new ActionRowBuilder().addComponents(
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
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setLabel('Server Tools')
                .setEmoji('🎫')
                .setCustomId('help_server')
                .setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Stats')
                .setEmoji('📊')
                .setCustomId('help_stats')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setLabel('Custom')
                .setEmoji('📝')
                .setCustomId('help_custom')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Utility')
                .setEmoji('🔧')
                .setCustomId('help_utility')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setLabel('Fun')
                .setEmoji('🎭')
                .setCustomId('help_fun')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Admin')
                .setEmoji('🧰')
                .setCustomId('help_admin')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2] });

        // Button interaction collector
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 300000 }); // 5 minutes

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ These buttons are not for you!', flags: MessageFlags.Ephemeral });
            }

            const category = i.customId.replace('help_', '');
            try {
                if (!i.deferred && !i.replied) {
                    await i.deferUpdate();
                }

                const categoryEmbed = getCategoryEmbed(p, category);
                await i.editReply({ embeds: [categoryEmbed], components: [row1, row2] });
            } catch (error) {
                // Ignore expired interaction edge-cases from stale button clicks
                if (error?.code !== 10062) {
                    console.error('Help button interaction error:', error);
                }
            }
        });

        collector.on('end', () => {
            // Disable buttons after timeout
            row1.components.forEach(btn => btn.setDisabled(true));
            row2.components.forEach(btn => btn.setDisabled(true));
            interaction.editReply({ components: [row1, row2] }).catch(() => {});
        });
    }
};

function getCategoryEmbed(p, category) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTimestamp();

    switch (category) {
        case 'music':
            embed.setTitle('🎵 Music Commands')
                .setDescription('Play music from YouTube, Spotify, and SoundCloud!')
                .addFields(
                    { name: '▶️ Playback', value: `\`${p}play <url/query>\` - Play a song\n\`/play <song>\` - Play a song (slash)\n\`${p}pause\` - Pause playback (DJ)\n\`/pause\` - Pause (slash)\n\`${p}resume\` - Resume playback (DJ)\n\`/resume\` - Resume (slash)\n\`${p}skip\` - Skip current song (DJ)\n\`/skip\` - Skip (slash)\n\`${p}stop\` - Stop and clear queue (DJ)\n\`/stop\` - Stop (slash)\n\`${p}leave\` - Leave voice channel` },
                    { name: '📋 Queue', value: `\`${p}queue\` - View song queue\n\`/queue\` - View queue (slash)\n\`${p}nowplaying\` - Current song info\n\`/nowplaying\` - Current song (slash)\n\`${p}remove <pos>\` - Remove song (DJ)\n\`${p}move <from> <to>\` - Move song (DJ)\n\`${p}swap <a> <b>\` - Swap songs (DJ)\n\`${p}shuffle\` - Shuffle queue (DJ)` },
                    { name: '🔧 Controls', value: `\`${p}volume <0-200>\` - Set volume (DJ)\n\`/volume <amount>\` - Set volume (slash)\n\`${p}loop <off/song/queue>\` - Loop mode (DJ)\n\`/loop\` - Loop mode (slash)\n\`${p}previous\` - Play previous song (DJ)\n\`/previous\` - Previous song (slash)\n\`${p}jump <pos>\` - Jump to position (DJ)\n\`/jump <position>\` - Jump to position (slash)\n\`${p}autoplay\` - Toggle autoplay (DJ)` },
                    { name: '📝 Info & Playlists', value: `\`${p}lyrics [song]\` - Get song lyrics\n\`/playlist create/add/remove/list\` - Manage playlists` }
                );
            break;

        case 'economy':
            embed.setTitle('💰 Economy Commands')
                .setDescription('Earn coins, gamble, and climb the leaderboard!')
                .addFields(
                    { name: '💵 Balance', value: `\`/balance [@user]\` - Check balance\n\`/daily\` - Daily coins + streak bonus\n\`/weekly\` - Weekly coins\n\`${p}profile [@user]\` - View full profile with XP` },
                    { name: '🎰 Gambling', value: `\`${p}slots <bet|max|all> [bonus]\` - Slot machine\n\`${p}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${p}coinflip <h/t> <bet>\` - 2.5x multiplier\n\`${p}dice <1-6> <bet>\` - 6x multiplier\n\`${p}roulette <bet>\` - Roulette wheel\n\`${p}blackjack <bet>\` - Card game\n\`${p}rps <bet>\` - Rock paper scissors\n\`${p}russianroulette\` - Risky roulette` },
                    { name: '🏆 Leaderboards', value: `\`${p}leaderboard balance\` - Richest users\n\`${p}leaderboard xp\` - Top levels\n\`${p}leaderboard seasonal\` - Seasonal coins\n\`/leaderboard\` - Slash command leaderboard\n\`/leaderboard-update\` - Force update (admin/role)` },
                    { name: '🛒 Shop', value: `\`/shop\` - View items to buy\n\`${p}transfer @user <amount>\` - Send coins\n\`/transfer @user <amount>\` - Send coins (slash)` }
                );
            break;

        case 'games':
            embed.setTitle('🎮 Game Commands')
                .setDescription('Play games and track your stats!')
                .addFields(
                    { name: '🎲 Mini Games', value: `\`${p}minigame rps\` - Rock paper scissors\n\`${p}minigame guess\` - Guess the number\n\`${p}minigame trivia\` - Trivia questions\n\`${p}ttt [@user]\` - Tic tac toe\n\`/ttt @user\` - Tic tac toe (slash)\n\`${p}count\` - Counting game\n\`/count\` - Counting game (slash)` },
                    { name: '🎰 Betting Games', value: `\`${p}slots <bet|max|all> [bonus]\` - Slot machine\n\`${p}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${p}blackjack <bet>\` - Card game\n\`/blackjack <bet>\` - Card game (slash)\n\`${p}roulette <bet>\` - Roulette\n\`/roulette <bet>\` - Roulette (slash)\n\`${p}coinflip <h/t> <bet>\` - Coin flip\n\`/coinflip <choice> <bet>\` - Coin flip (slash)\n\`${p}dice <1-6> <bet>\` - Dice roll\n\`/dice <number> <bet>\` - Dice roll (slash)\n\`${p}rps <bet>\` - RPS with betting\n\`/rps <choice> <bet>\` - RPS (slash)\n\`${p}russianroulette\` - Risky roulette\n\`/russianroulette\` - Risky roulette (slash)\n\`${p}horserace <bet>\` - Horse race\n\`/horserace <bet>\` - Horse race (slash)` },
                    { name: '📊 Stats', value: `\`${p}gamestats [@user]\` - View game statistics\n\`${p}horseracehistory [@user]\` - Horse race history\n\`/horseracehistory [@user]\` - Horse race history (slash)\n\`/horseracesim <count>\` - Simulate races (admin)` }
                );
            break;

        case 'moderation':
            embed.setTitle('🛡️ Moderation Commands')
                .setDescription('Keep your server safe and organized!')
                .addFields(
                    { name: '👮 Actions', value: `\`${p}kick @user [reason]\` - Kick member\n\`/kick @user [reason]\` - Kick (slash)\n\`${p}ban @user [reason]\` - Ban member\n\`/ban @user [reason]\` - Ban (slash)\n\`${p}unban <userId>\` - Unban user\n\`${p}timeout @user <mins> [reason]\` - Timeout\n\`${p}untimeout @user\` - Remove timeout\n\`${p}warn @user <reason>\` - Warn user\n\`/softban @user [reason]\` - Soft ban\n\`/mute @user <mins>\` - Mute member` },
                    { name: '🗑️ Cleanup', value: `\`${p}purge <amount>\` - Delete messages\n\`${p}clear <amount>\` - Clear messages\n\`/clear <amount>\` - Clear messages (slash)\n\`${p}lock\` - Lock channel\n\`/lock\` - Lock channel (slash)\n\`${p}unlock\` - Unlock channel\n\`/unlock\` - Unlock channel (slash)\n\`/slowmode <seconds>\` - Set slowmode` },
                    { name: '📋 Warnings & Logs', value: `\`/warnings add @user <reason>\`\n\`/warnings list @user\`\n\`/warnings remove @user <id>\`\n\`/warnings clear @user\`\n\`${p}logging\` - Logging settings\n\`/logging\` - Logging settings (slash)\n\`/modlog #channel\` - Set mod log` },
                    { name: '🤖 Auto-Mod', value: `\`/automod enable/disable\`\n\`/automod antiinvite\` - Block invites\n\`/automod antispam\` - Block spam\n\`/automod badwords add/remove\`\n\`/automod settings\` - View settings` }
                );
            break;

        case 'server':
            embed.setTitle('🎫 Server Tools')
                .setDescription('Advanced server management features!')
                .addFields(
                    { name: '🎫 Tickets', value: `\`${p}ticket setup\` - Setup ticket system\nUsers click button to create support tickets\nTickets auto-create private channels` },
                    { name: '🏷️ Reaction Roles', value: `\`${p}reactionrole <msgId> <emoji> <@role>\`\nUsers react to get roles automatically` },
                    { name: '⭐ Starboard', value: `\`${p}starboard set #channel\`\n\`${p}starboard remove\`\nMessages with 3+ ⭐ get featured` },
                    { name: '📝 Custom Commands', value: `\`${p}customcmd add <name> <response>\`\n\`${p}customcmd remove <name>\`\n\`${p}customcmd list\` - View all` },
                    { name: '👋 Welcome', value: `\`${p}welcomecard enable #channel\`\n\`${p}welcomecard disable\`\nSend fancy welcome cards to new members` }
                );
            break;

        case 'stats':
            embed.setTitle('📊 Statistics & Analytics')
                .setDescription('Track server and user activity!')
                .addFields(
                    { name: '📈 Server Stats', value: `\`${p}stats overview\` - Total stats\n\`${p}stats users\` - Top 10 active users\n\`${p}stats channels\` - Most active channels\n\`${p}stats activity\` - 7-day trend` },
                    { name: '👤 User Profiles', value: `\`${p}profile [@user]\` - Full profile\n**Shows:** Level, XP, balance, streak, seasonal coins, inventory\n**Features:** XP progress bar, detailed stats` },
                    { name: '⭐ Experience', value: `Gain 5-15 XP per message (1 min cooldown)\nLevel up = coins reward\nTrack progress with \`${p}profile\`` },
                    { name: '📊 Slash Stats', value: `\`/stats\` - Quick stats\n\`/analytics\` - Server analytics\n\`/activity\` - Activity leaderboard` }
                );
            break;

        case 'custom':
            embed.setTitle('📝 Custom Commands')
                .setDescription('Admins can create custom bot responses!')
                .addFields(
                    { name: 'Commands', value: `\`${p}customcmd add <name> <response>\`\nCreate a new custom command\n\n\`${p}customcmd remove <name>\`\nDelete a custom command\n\n\`${p}customcmd list\`\nView all custom commands` },
                    { name: 'Example', value: `\`${p}customcmd add rules Please read #rules!\`\nNow typing \`${p}rules\` will show that message!` },
                    { name: 'Note', value: 'Requires Administrator permission' }
                );
            break;

        case 'utility':
            embed.setTitle('🔧 Utility Commands')
                .setDescription('Configuration and server information!')
                .addFields(
                    { name: '⚙️ Configuration', value: `\`${p}config\` - View settings\n\`${p}config prefix <prefix>\` - Set prefix\n\`${p}config djrole <name>\` - Set DJ role\n\`${p}config autorole <name>\` - Set auto role\n\`${p}setup\` - Quick server setup\n\`${p}config reset\` - Reset settings` },
                    { name: '🏆 Leaderboard Admin', value: `\`/leaderboard-channel #channel\` - Set channel\n\`/leaderboard-config view\` - View config\n\`/leaderboard-config set\` - Update config\n\`/leaderboard-config export\` - Export CSV` },
                    { name: 'ℹ️ Information', value: `\`${p}server\` - Server info\n\`${p}ping\` - Bot latency\n\`/ping\` - Bot latency (slash)\n\`/avatar [@user]\` - User avatar\n\`/userinfo [@user]\` - User details\n\`/roleinfo <@role>\` - Role info\n\`/serverinfo\` - Server details` },
                    { name: '🧰 Utility Tools', value: `\`/ask <question>\` - Ask AI\n\`/ai\` - AI chat\n\`/announce\` - Announcement\n\`/birthday\` - Birthday settings\n\`/customrole\` - Custom role shop\n\`/milestones\` - Milestones\n\`/giveaway\` - Giveaways\n\`${p}giveaway\` - Giveaways (prefix)\n\`/invites\` - Invite stats\n\`/invitestats\` - Invite leaderboard\n\`${p}invites\` - Invite stats (prefix)\n\`${p}invitestats\` - Invite leaderboard (prefix)\n\`/reminder\` - Set reminders\n\`/activity voice/leaderboard\` - Activity stats` },
                    { name: '🌐 Other', value: `\`${p}dashboard\` - Web dashboard\n\`${p}hello\` - Say hello!\n\`${p}help\` - Help menu\n\`/help\` - Help menu (slash)\n\`${p}prefix\` - Show prefix\n\`/prefix\` - Show prefix (slash)\n\`${p}leave\` - Bot leaves server\n\`${p}profile [@user]\` - User profile\n\`/profile [@user]\` - User profile (slash)\n\`${p}stats\` - Stats overview\n\`/stats\` - Stats overview (slash)\n\`/analytics\` - Server analytics` }
                );
            break;

        case 'fun':
            embed.setTitle('🎭 Fun Commands')
                .setDescription('Entertainment and random fun!')
                .addFields(
                    { name: 'Commands', value: `\`/poll <question> <options>\` - Create poll\n\`/8ball <question>\` - Magic 8-ball\n\`/meme\` - Random meme\n\`${p}hello\` - Friendly greeting\n\`${p}propose @user\` - Propose\n\`/propose @user\` - Propose (slash)\n\`${p}accept\` - Accept proposal\n\`/accept\` - Accept (slash)\n\`${p}reject\` - Reject proposal\n\`/reject\` - Reject (slash)\n\`${p}divorce\` - Divorce\n\`/divorce\` - Divorce (slash)\n\`${p}spouse [@user]\` - View spouse\n\`/spouse [@user]\` - View spouse (slash)\n\`${p}couples\` - Top couples\n\`/couples\` - Top couples (slash)` }
                );
            break;

        case 'admin':
            embed.setTitle('🧰 Admin Commands')
                .setDescription('Server and economy administration tools!')
                .addFields(
                    { name: '💰 Economy Admin', value: `\`${p}addcoins @user <amount>\`\n\`${p}removecoins @user <amount>\`\n\`${p}setbalance @user <amount>\`\n\`${p}giveexp @user <amount>\`` },
                    { name: '🧹 Resets', value: `\`${p}cleareconomy\`\n\`${p}reseteconomy\`\n\`${p}cleargamedata\`\n\`${p}resetwarnings\`` },
                        { name: '📅 Seasons', value: `\`${p}season create <name>\` - Create custom season\n\`${p}season list\` - View all seasons\n\`${p}season info <name>\` - Season details\n\`${p}season leaderboard [name]\` - Top players this season\n\`${p}season end <name>\` - End season & award winners\n\`${p}season enroll <name>\` - Enroll members\n\`${p}season refresh [name]\` - Refresh stats\n\n**Automatic Quarterly Seasons:**\nSeasons auto-create every quarter (Spring/Summer/Fall/Winter)\nExample: \`spring-2026\`, \`summer-2026\`\nOld season auto-archives, new members auto-enrolled` },
                    { name: '⚙️ Server Admin', value: `\`${p}botprefix <prefix>\`\n\`${p}serverlanguage <code>\`\n\`${p}serverstats\`\n\`${p}announcement <msg>\`\n\`${p}backup\`\n\`/welcomemessage\` - Configure welcome messages\n\`/roletemplate\` - Role templates\n\`/mongodb-space\` - Check MongoDB usage (Owner)\n\`/system-stats\` - System CPU/RAM stats\n\`/botstatus\` - Bot health and status` },
                    { name: '🔐 Permissions', value: `\`/command-permissions list\`\n\`/command-permissions disable <command>\`\n\`/command-permissions enable <command>\`\n\`/command-permissions role <command> <role>\`` },
                    { name: '🧾 Audit Logs', value: `\`/auditlog view\`\n\`/auditlog export\`\n\`/auditlogs\` - View logs` }
                );
            break;

        default:
            embed.setTitle('❌ Unknown Category')
                .setDescription(`Category "${category}" not found!\n\nAvailable categories:\n\`music\`, \`economy\`, \`games\`, \`moderation\`, \`server\`, \`stats\`, \`custom\`, \`utility\`, \`fun\`, \`admin\``)
                .setColor('#ed4245');
    }

    embed.setFooter({ text: `Click buttons to navigate | DJ = Requires DJ role` });
    return embed;
}
