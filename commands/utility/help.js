const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

module.exports = {
    name: 'help',
    description: 'Show available commands',
    aliases: ['commands', 'h'],
    async execute(message, args, client) {
        const settings = settingsManager.get(message.guild.id);
        const p = settings.prefix;

        // Show specific category help if requested
        const category = args[0]?.toLowerCase();

        if (category) {
            return sendCategoryHelp(message, p, category);
        }

        // Main help menu with categories
        const mainEmbed = new EmbedBuilder()
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
                { name: '🎭 Fun', value: 'Polls, memes, 8ball', inline: true }
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

        await message.reply({ embeds: [mainEmbed], components: [row] });
    }
};

function sendCategoryHelp(message, p, category) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTimestamp();

    switch (category) {
        case 'music':
            embed.setTitle('🎵 Music Commands')
                .setDescription('Play music from YouTube, Spotify, and SoundCloud!')
                .addFields(
                    { name: '▶️ Playback', value: `\`${p}play <url/query>\` - Play a song\n\`${p}pause\` - Pause playback (DJ)\n\`${p}resume\` - Resume playback (DJ)\n\`${p}skip\` - Skip current song (DJ)\n\`${p}stop\` - Stop and clear queue (DJ)\n\`${p}leave\` - Leave voice channel` },
                    { name: '📋 Queue', value: `\`${p}queue\` - View song queue\n\`${p}nowplaying\` - Current song info\n\`${p}remove <pos>\` - Remove song (DJ)\n\`${p}move <from> <to>\` - Move song (DJ)\n\`${p}shuffle\` - Shuffle queue (DJ)\n\`${p}clear\` - Clear queue (DJ)` },
                    { name: '🔧 Controls', value: `\`${p}volume <0-200>\` - Set volume (DJ)\n\`${p}loop <off/song/queue>\` - Loop mode (DJ)\n\`${p}previous\` - Play previous song (DJ)\n\`${p}jump <pos>\` - Jump to position (DJ)\n\`${p}autoplay\` - Toggle autoplay (DJ)` },
                    { name: '📝 Info', value: `\`${p}lyrics [song]\` - Get song lyrics` }
                );
            break;

        case 'economy':
            embed.setTitle('💰 Economy Commands')
                .setDescription('Earn coins, gamble, and climb the leaderboard!')
                .addFields(
                    { name: '💵 Balance', value: `\`/balance [@user]\` - Check balance\n\`/daily\` - Daily coins + streak bonus\n\`/weekly\` - Weekly coins\n\`${p}profile [@user]\` - View full profile with XP` },
                    { name: '🎰 Gambling', value: `\`${p}slots <bet>\` - Slot machine\n\`${p}coinflip <h/t> <bet>\` - 2.5x multiplier\n\`${p}dice <1-6> <bet>\` - 6x multiplier\n\`${p}roulette <bet>\` - Roulette wheel\n\`${p}blackjack <bet>\` - Card game\n\`${p}rps <bet>\` - Rock paper scissors` },
                    { name: '🏆 Leaderboards', value: `\`${p}leaderboard balance\` - Richest users\n\`${p}leaderboard xp\` - Top levels\n\`${p}leaderboard seasonal\` - Seasonal coins` },
                    { name: '🛒 Shop', value: `\`/shop\` - View items to buy\n\`${p}transfer @user <amount>\` - Send coins` }
                );
            break;

        case 'games':
            embed.setTitle('🎮 Game Commands')
                .setDescription('Play games and track your stats!')
                .addFields(
                    { name: '🎲 Mini Games', value: `\`${p}minigame rps\` - Rock paper scissors\n\`${p}minigame guess\` - Guess the number\n\`${p}minigame trivia\` - Trivia questions\n\`${p}ttt [@user]\` - Tic tac toe` },
                    { name: '🎰 Betting Games', value: `\`${p}slots <bet>\` - Slot machine\n\`${p}blackjack <bet>\` - Card game\n\`${p}roulette <bet>\` - Roulette\n\`${p}coinflip <h/t> <bet>\` - Coin flip\n\`${p}dice <1-6> <bet>\` - Dice roll\n\`${p}rps <bet>\` - RPS with betting` },
                    { name: '📊 Stats', value: `\`${p}gamestats [@user]\` - View game statistics` }
                );
            break;

        case 'moderation':
        case 'mod':
            embed.setTitle('🛡️ Moderation Commands')
                .setDescription('Keep your server safe and organized!')
                .addFields(
                    { name: '👮 Actions', value: `\`${p}kick @user [reason]\` - Kick member\n\`${p}ban @user [reason]\` - Ban member\n\`${p}unban <userId>\` - Unban user\n\`${p}timeout @user <mins> [reason]\` - Timeout\n\`${p}untimeout @user\` - Remove timeout\n\`${p}warn @user <reason>\` - Warn user` },
                    { name: '🗑️ Cleanup', value: `\`${p}purge <amount>\` - Delete messages\n\`${p}clear <amount>\` - Clear messages\n\`${p}lock\` - Lock channel\n\`${p}unlock\` - Unlock channel` },
                    { name: '📋 Warnings', value: `\`/warnings add @user <reason>\`\n\`/warnings list @user\`\n\`/warnings remove @user <id>\`\n\`/warnings clear @user\`\n\`/modlog #channel\` - Set log channel` },
                    { name: '🤖 Auto-Mod', value: `\`/automod enable/disable\`\n\`/automod antiinvite\` - Block invites\n\`/automod antispam\` - Block spam\n\`/automod badwords add/remove\`\n\`/automod settings\` - View settings` }
                );
            break;

        case 'server':
        case 'tools':
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
        case 'analytics':
            embed.setTitle('📊 Statistics & Analytics')
                .setDescription('Track server and user activity!')
                .addFields(
                    { name: '📈 Server Stats', value: `\`${p}stats overview\` - Total stats\n\`${p}stats users\` - Top 10 active users\n\`${p}stats channels\` - Most active channels\n\`${p}stats activity\` - 7-day trend` },
                    { name: '👤 User Profiles', value: `\`${p}profile [@user]\` - Full profile\n**Shows:** Level, XP, balance, streak, seasonal coins, inventory\n**Features:** XP progress bar, detailed stats` },
                    { name: '⭐ Experience', value: `Gain 5-15 XP per message (1 min cooldown)\nLevel up = coins reward\nTrack progress with \`${p}profile\`` }
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
        case 'config':
            embed.setTitle('🔧 Utility Commands')
                .setDescription('Configuration and server information!')
                .addFields(
                    { name: '⚙️ Configuration', value: `\`${p}config\` - View settings\n\`${p}config prefix <prefix>\` - Set prefix\n\`${p}config djrole <name>\` - Set DJ role\n\`${p}config autorole <name>\` - Set auto role\n\`${p}setup\` - Quick server setup\n\`${p}config reset\` - Reset settings` },
                    { name: 'ℹ️ Information', value: `\`${p}server\` - Server info\n\`${p}ping\` - Bot latency\n\`/avatar [@user]\` - User avatar\n\`/userinfo [@user]\` - User details\n\`/roleinfo <@role>\` - Role info` },
                    { name: '🌐 Other', value: `\`${p}dashboard\` - Web dashboard\n\`${p}hello\` - Say hello!` }
                );
            break;

        case 'fun':
            embed.setTitle('🎭 Fun Commands')
                .setDescription('Entertainment and random fun!')
                .addFields(
                    { name: 'Commands', value: `\`/poll <question> <options>\` - Create poll\n\`/8ball <question>\` - Magic 8-ball\n\`/meme\` - Random meme\n\`${p}hello\` - Friendly greeting` }
                );
            break;

        default:
            embed.setTitle('❌ Unknown Category')
                .setDescription(`Category "${category}" not found!\n\nAvailable categories:\n\`music\`, \`economy\`, \`games\`, \`moderation\`, \`server\`, \`stats\`, \`custom\`, \`utility\`, \`fun\``)
                .setColor('#ed4245');
    }

    embed.setFooter({ text: `${p}help - Back to main menu | DJ = Requires DJ role` });
    message.reply({ embeds: [embed] });
}
