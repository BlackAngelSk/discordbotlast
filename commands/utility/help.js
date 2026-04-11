const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

const CATEGORY_DEFINITIONS = [
    { key: 'music', label: 'Music', emoji: '🎵', style: ButtonStyle.Primary, fieldName: '🎵 Music', fieldValue: 'Play songs, filters, 24/7 mode, queue control' },
    { key: 'economy', label: 'Economy', emoji: '💰', style: ButtonStyle.Success, fieldName: '💰 Economy', fieldValue: 'Balance, daily/weekly, rank card, achievements, gambling, shop' },
    { key: 'games', label: 'Games', emoji: '🎮', style: ButtonStyle.Success, fieldName: '🎮 Games', fieldValue: 'Wordle, Hangman, Heist, Fish, Hunt, Pets, betting, mini-games' },
    { key: 'moderation', label: 'Moderation', emoji: '🛡️', style: ButtonStyle.Danger, fieldName: '🛡️ Moderation', fieldValue: 'Kick, ban, tempban, verification, sticky, role menus, automod' },
    { key: 'server', label: 'Server Tools', emoji: '🎫', style: ButtonStyle.Primary, fieldName: '🎫 Server Tools', fieldValue: 'Tickets, reaction roles, starboard' },
    { key: 'stats', label: 'Stats', emoji: '📊', style: ButtonStyle.Primary, fieldName: '📊 Stats', fieldValue: 'Server stats, user profiles, activity' },
    { key: 'custom', label: 'Custom', emoji: '📝', style: ButtonStyle.Secondary, fieldName: '📝 Custom', fieldValue: 'Custom commands (admin)' },
    { key: 'utility', label: 'Utility', emoji: '🔧', style: ButtonStyle.Secondary, fieldName: '🔧 Utility', fieldValue: 'Rank, achievements, confess, report, config, info' },
    { key: 'fun', label: 'Fun', emoji: '🎭', style: ButtonStyle.Success, fieldName: '🎭 Fun', fieldValue: 'Polls, memes, 8ball, word games, idle games, pets' },
    { key: 'admin', label: 'Admin', emoji: '🧰', style: ButtonStyle.Danger, fieldName: '🧰 Admin', fieldValue: 'Stat channels, XP events, live alerts, features, reload, AI persona' },
    { key: 'owner', label: 'Owner', emoji: '👑', style: ButtonStyle.Secondary, fieldName: '👑 Owner', fieldValue: 'Bot owner-only system commands' }
];

function getAccessContext(userId, member) {
    const ownerId = process.env.BOT_OWNER_ID;
    const isOwner = !!ownerId && userId === ownerId;
    const isAdmin = member?.permissions?.has('Administrator') || false;

    return { isOwner, isAdmin };
}

function canViewCategory(category, accessContext) {
    if (category === 'owner') return accessContext.isOwner;
    if (category === 'admin') return accessContext.isOwner || accessContext.isAdmin;
    return true;
}

function getVisibleCategories(accessContext) {
    return CATEGORY_DEFINITIONS.filter(category => canViewCategory(category.key, accessContext));
}

function buildCategoryRows(visibleCategories) {
    const rows = [];
    for (let i = 0; i < visibleCategories.length; i += 5) {
        const buttons = visibleCategories.slice(i, i + 5).map(category =>
            new ButtonBuilder()
                .setLabel(category.label)
                .setEmoji(category.emoji)
                .setCustomId(`help_${category.key}`)
                .setStyle(category.style)
        );

        rows.push(new ActionRowBuilder().addComponents(buttons));
    }
    return rows;
}

module.exports = {
    name: 'help',
    description: 'Show available commands',
    aliases: ['commands', 'h'],
    async execute(message, args, client) {
        const settings = settingsManager.get(message.guild.id);
        const p = settings.prefix;
        const accessContext = getAccessContext(message.author.id, message.member);
        const visibleCategories = getVisibleCategories(accessContext);

        // Show specific category help if requested
        const category = args[0]?.toLowerCase();

        if (category) {
            if (!canViewCategory(category, accessContext)) {
                return message.reply('❌ You do not have permission to view that help category.');
            }
            return sendCategoryHelp(message, p, category, accessContext);
        }

        // Main help menu with categories
        const mainEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🤖 Discord Bot - Command Categories')
            .setDescription(`**Server Prefix:** \`${p}\`\n**Slash Commands:** Type \`/\` in chat\n\nClick a button below or use \`${p}help <category>\` for detailed commands!`)
            .addFields(visibleCategories.map(category => ({ name: category.fieldName, value: category.fieldValue, inline: true })))
            .setFooter({ text: `Type ${p}help <category> for detailed commands | Example: ${p}help music` })
            .setTimestamp();

        const rows = buildCategoryRows(visibleCategories);
        const reply = await message.reply({ embeds: [mainEmbed], components: rows });

        // Button interaction collector
        const collector = reply.createMessageComponentCollector({ time: 300000 }); // 5 minutes

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ These buttons are not for you!', flags: MessageFlags.Ephemeral });
            }

            const category = i.customId.replace('help_', '');
            if (!canViewCategory(category, accessContext)) {
                return i.reply({ content: '❌ You do not have permission to view that help category.', flags: MessageFlags.Ephemeral });
            }

            await i.deferUpdate();
            
            const categoryEmbed = getCategoryEmbed(p, category, accessContext);
            await i.editReply({ embeds: [categoryEmbed], components: rows });
        });

        collector.on('end', () => {
            // Disable buttons after timeout
            rows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
            reply.edit({ components: rows }).catch(() => {});
        });
    }
};

function getCategoryEmbed(p, category, accessContext) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTimestamp();

    if (!canViewCategory(category, accessContext)) {
        return embed
            .setTitle('❌ Access Denied')
            .setDescription('You do not have permission to view this category.')
            .setColor('#ed4245');
    }

    switch (category) {
        case 'music':
            embed.setTitle('🎵 Music Commands')
                .setDescription('Play music from YouTube, Spotify, and SoundCloud!')
                .addFields(
                    { name: '▶️ Playback', value: `\`${p}play <url/query>\` - Play a song\n\`/play <song>\` - Play a song (slash)\n\`${p}pause\` - Pause playback (DJ)\n\`/pause\` - Pause (slash)\n\`${p}resume\` - Resume playback (DJ)\n\`/resume\` - Resume (slash)\n\`${p}skip\` - Skip current song (DJ)\n\`/skip\` - Skip (slash)\n\`${p}stop\` - Stop and clear queue (DJ)\n\`/stop\` - Stop (slash)\n\`${p}leave\` - Leave voice channel` },
                    { name: '📋 Queue', value: `\`${p}queue\` - View song queue\n\`/queue\` - View queue (slash)\n\`${p}nowplaying\` - Current song info\n\`/nowplaying\` - Current song (slash)\n\`${p}remove <pos>\` - Remove song (DJ)\n\`${p}move <from> <to>\` - Move song (DJ)\n\`${p}swap <a> <b>\` - Swap songs (DJ)\n\`${p}shuffle\` - Shuffle queue (DJ)` },
                    { name: '🔧 Controls', value: `\`${p}volume <0-200>\` - Set volume (DJ)\n\`/volume <amount>\` - Set volume (slash)\n\`${p}loop <off/song/queue>\` - Loop mode (DJ)\n\`/loop\` - Loop mode (slash)\n\`${p}previous\` - Play previous song (DJ)\n\`/previous\` - Previous song (slash)\n\`${p}jump <pos>\` - Jump to position (DJ)\n\`/jump <position>\` - Jump to position (slash)\n\`${p}autoplay\` - Toggle autoplay (DJ)` },
                    { name: '🎛️ Filters & 24/7', value: `\`${p}filter <name>\` - Apply audio filter (bassboost, nightcore, 8d, karaoke, echo, etc.)\n\`${p}filter list\` - Show all 12 filters\n\`${p}247\` - Toggle 24/7 mode (bot stays in VC)` },
                    { name: '📝 Info & Playlists', value: `\`${p}lyrics [song]\` - Get song lyrics\n\`/playlist create/add/remove/list\` - Manage playlists` }
                );
            break;

        case 'economy':
            embed.setTitle('💰 Economy Commands')
                .setDescription('Earn coins, gamble, and climb the leaderboard!')
                .addFields(
                    { name: '💵 Balance', value: `\`/balance [@user]\` - Check balance\n\`${p}daily\` / \`/daily\` - Daily coins + streak bonus\n\`${p}weekly\` / \`/weekly\` - Weekly coins\n\`${p}rank [@user]\` - Visual rank card with XP bar\n\`${p}achievements [@user]\` - View earned badges\n\`${p}profile [@user]\` - Full profile` },
                    { name: '🎰 Gambling', value: `\`${p}slots <bet|max|all> [bonus]\` - Slot machine (optional bonus buy)\n\`${p}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${p}coinflip <h/t> <bet>\` - 2.5x multiplier\n\`${p}dice <1-6> <bet>\` - 6x multiplier\n\`${p}roulette <bet>\` - Roulette wheel\n\`${p}blackjack <bet>\` - Card game\n\`${p}rps <bet>\` - Rock paper scissors` },
                    { name: '🏆 Leaderboards', value: `\`${p}leaderboard balance\` - Richest users\n\`${p}leaderboard xp\` - Top levels\n\`${p}leaderboard seasonal\` - Seasonal coins\n\`/leaderboard\` - Slash command leaderboard\n\`/leaderboard-update\` - Force update (admin/role)` },
                    { name: '🛒 Shop', value: `\`/shop\` - View items to buy\n\`${p}transfer @user <amount>\` - Send coins\n\`/transfer @user <amount>\` - Send coins (slash)` }
                );
            break;

        case 'games':
            embed.setTitle('🎮 Game Commands')
                .setDescription('Play games and track your stats!')
                .addFields(
                    { name: '🎲 Mini Games', value: `\`${p}minigame rps\` - Rock paper scissors\n\`${p}minigame guess\` - Guess the number\n\`${p}minigame trivia\` - Trivia questions\n\`${p}pacman\` - Pacman-style arcade game\n\`${p}2048\` - Classic 2048 sliding tile puzzle\n\`${p}ttt [@user]\` - Tic tac toe\n\`/ttt @user\` - Tic tac toe (slash)\n\`${p}count\` - Counting game\n\`/count\` - Counting game (slash)` },
                    { name: '🆕 Word & Idle Games', value: `\`${p}wordle\` - Guess the 5-letter Wordle word (6 attempts)\n\`${p}hangman\` - Classic hangman game\n\`${p}fish\` - Go fishing (30s cooldown, earn coins)\n\`${p}hunt\` - Go hunting (45s cooldown, earn coins)\n\`${p}heist\` - Start a cooperative bank heist (30s join window)\n\`${p}pet adopt/view/feed/play/release/types\` - Virtual pet system` },
                    { name: '🎰 Betting Games', value: `\`${p}slots <bet|max|all> [bonus]\` - Slot machine (optional bonus buy)\n\`${p}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${p}blackjack <bet>\` - Card game\n\`/blackjack <bet>\` - Card game (slash)\n\`${p}roulette <bet>\` - Roulette\n\`/roulette <bet>\` - Roulette (slash)\n\`${p}coinflip <h/t> <bet>\` - Coin flip\n\`/coinflip <choice> <bet>\` - Coin flip (slash)\n\`${p}dice <1-6> <bet>\` - Dice roll\n\`/dice <number> <bet>\` - Dice roll (slash)\n\`${p}rps <bet>\` - RPS with betting\n\`/rps <choice> <bet>\` - RPS (slash)\n\`${p}horserace <bet>\` - Horse race\n\`/horserace <bet>\` - Horse race (slash)` },
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
                    { name: '🤖 Auto-Mod', value: `\`/automod enable/disable\`\n\`/automod antiinvite\` - Block invites\n\`/automod antispam\` - Block spam\n\`/automod badwords add/remove\`\n\`/automod settings\` - View settings` },
                    { name: '🆕 New Moderation', value: `\`${p}tempban @user <duration> [reason]\` - Temp ban (auto-unbans, e.g. 1h/7d)\n\`${p}tempvc set [#channel]\` - Setup temporary voice channels hub\n\`${p}verification setup #channel @role\` - Server verification gate\n\`${p}sticky set [#channel] <msg>\` - Stick a message to bottom of channel\n\`${p}rolemenu create/add/post/delete/list\` - Dropdown role selection menus` }
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
                    { name: '📊 Slash Stats', value: `\`/stats\` - Quick stats\n\`/analytics\` - Server analytics\n\`/activity voice/leaderboard/afk/inactive\` - Activity stats & inactive members` }
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
                    { name: '🧰 Utility Tools', value: `\`/ask <question>\` - Ask AI\n\`/ai\` - AI chat\n\`/announce\` - Announcement\n\`/birthday\` - Birthday settings\n\`/customrole\` - Custom role shop\n\`/milestones achieved|upcoming|sync\` - Milestones & sync with current members\n\`/giveaway\` - Giveaways\n\`${p}giveaway\` - Giveaways (prefix)\n\`/invites\` - Invite stats\n\`/invitestats\` - Invite leaderboard\n\`${p}invites\` - Invite stats (prefix)\n\`${p}invitestats\` - Invite leaderboard (prefix)\n\`/reminder\` - Set reminders\n\`/activity voice/leaderboard/afk/inactive\` - Activity stats` },
                    { name: '🆕 New Utility', value: `\`${p}rank [@user]\` - Visual rank card with XP progress\n\`${p}achievements [@user]\` - View earned achievement badges\n\`${p}confess <message>\` - Post anonymous confession\n\`${p}report @user <reason>\` - Report a user to moderators` },
                    { name: '🌐 Other', value: `\`${p}dashboard\` - Web dashboard\n\`${p}hello\` - Say hello!\n\`${p}help\` - Help menu\n\`/help\` - Help menu (slash)\n\`${p}prefix\` - Show prefix\n\`/prefix\` - Show prefix (slash)\n\`${p}leave\` - Bot leaves server\n\`${p}profile [@user]\` - User profile\n\`/profile [@user]\` - User profile (slash)\n\`${p}stats\` - Stats overview\n\`/stats\` - Stats overview (slash)\n\`/analytics\` - Server analytics` }
                );
            break;

        case 'fun':
            embed.setTitle('🎭 Fun Commands')
                .setDescription('Entertainment and random fun!')
                .addFields(
                    { name: 'Commands', value: `\`/poll <question> <options>\` - Create poll\n\`/8ball <question>\` - Magic 8-ball\n\`/meme\` - Random meme\n\`/flappybird\` - Play Flappy Bird\n\`${p}hello\` - Friendly greeting\n\`${p}russianroulette\` - Russian roulette (1/7 chance of consequence)\n\`${p}propose @user\` - Propose\n\`/propose @user\` - Propose (slash)\n\`${p}accept\` - Accept proposal\n\`/accept\` - Accept (slash)\n\`${p}reject\` - Reject proposal\n\`/reject\` - Reject (slash)\n\`${p}divorce\` - Divorce\n\`/divorce\` - Divorce (slash)\n\`${p}spouse [@user]\` - View spouse\n\`/spouse [@user]\` - View spouse (slash)\n\`${p}couples\` - Top couples\n\`/couples\` - Top couples (slash)` },
                    { name: '🆕 New Fun', value: `\`${p}wordle\` - Guess the 5-letter word in 6 tries (win coins!)\n\`${p}hangman\` - Classic hangman with ASCII gallows\n\`${p}fish\` - Cast a line and catch fish for coins (30s cooldown)\n\`${p}hunt\` - Hunt animals for coins (45s cooldown)\n\`${p}heist\` - Invite friends to rob a bank together (30s join window)\n\`${p}pet adopt/view/feed/play/release/types\` - Adopt and care for a virtual pet` },
                    { name: '🧪 Beta Commands', value: `\`${p}poker host <blind> [buyin]\`, \`${p}poker join <blind>\`, \`${p}poker start\`, \`${p}poker status\`, \`${p}poker leave\`\n\`/snake\` - Play Snake with button controls\nRequires **bot beta access** role.\nIn beta poker, balance is test-only (infinite) and does not update real economy.` }
                );
            break;

        case 'admin':
            embed.setTitle('🧰 Admin Commands')
                .setDescription('Server and economy administration tools!')
                .addFields(
                    { name: '💰 Economy Admin', value: `\`${p}addcoins @user <amount>\`\n\`${p}removecoins @user <amount>\`\n\`${p}setbalance @user <amount>\`\n\`${p}giveexp @user <amount>\`` },
                    { name: '🧹 Resets', value: `\`${p}cleareconomy\`\n\`${p}reseteconomy\`\n\`${p}cleargamedata\`\n\`${p}resetwarnings\`` },
                    { name: '📅 Seasons', value: `\`${p}season create <name>\` - Create custom season\n\`${p}season list\` - View all seasons\n\`${p}season info <name>\` - Season details\n\`${p}season leaderboard [name]\` - Top players this season\n\`${p}season end <name>\` - End season & award winners\n\`${p}season enroll <name>\` - Enroll members\n\`${p}season refresh [name]\` - Refresh stats\n\n**Automatic Quarterly Seasons:**\nSeasons auto-create every quarter (Spring/Summer/Fall/Winter)\nExample: \`spring-2026\`, \`summer-2026\`\nOld season auto-archives, new members auto-enrolled` },
                    { name: '⚙️ Server Admin', value: `\`${p}botprefix <prefix>\`\n\`${p}serverlanguage <code>\`\n\`${p}serverstats\`\n\`${p}announcement <msg>\`\n\`${p}backup\`\n\`${p}betaaccess @user\` - Grant **bot beta access** role\n\`/welcomemessage\` - Configure welcome messages\n\`/roletemplate\` - Role templates\n\`/mongodb-space\` - Check MongoDB usage (Owner)\n\`/system-stats\` - System CPU/RAM stats\n\`/botstatus\` - Bot health and status` },
                    { name: '🔐 Permissions', value: `\`/command-permissions list\`\n\`/command-permissions disable <command>\`\n\`/command-permissions enable <command>\`\n\`/command-permissions role <command> <role>\`` },
                    { name: '🧾 Audit Logs', value: `\`/auditlog view\`\n\`/auditlog export\`\n\`/auditlogs\` - View logs` },
                    { name: '🆕 New Admin', value: `\`${p}statchannel set <type>\` - Dynamic stat voice channels (members/online/boosts/etc.)\n\`${p}xpevent start <mult> <duration>\` - Start double/triple XP event\n\`${p}livealerts add twitch/youtube\` - Twitch/YouTube live notifications\n\`${p}bumprule enable #channel [@role]\` - Configure Disboard bump reminders\n\`${p}aipersona set <name> | <personality>\` - Custom AI persona for this server\n\`${p}reload <command>\` - Hot-reload a command without restart\n\`${p}features list/enable/disable\` - Toggle per-server feature flags` }
                );
            break;

        case 'owner':
            embed.setTitle('👑 Owner Commands')
                .setDescription('Restricted to the bot owner only.')
                .addFields(
                    {
                        name: '🔒 Owner-only Slash Commands',
                        value: `\`/testcommands\` - Simulate all slash commands and report failures\n\`/mongodb-space\` - Check MongoDB storage usage\n\`/mongodb-sync status\` - View the current sync schedule\n\`/mongodb-sync schedule\` - Choose automatic/manual MongoDB updates\n\`/mongodb-sync run\` - Sync JSON data to MongoDB now`
                    },
                    {
                        name: 'ℹ️ Notes',
                        value: `Requires \`BOT_OWNER_ID\` in environment variables.\nSome admin commands can also be used by delegated roles, but the commands above are owner-gated.\n\nDEV mode: set \`DEV_MODE=true\` to disable MongoDB sync and automatic season leaderboard updates.`
                    }
                );
            break;

        default:
            const visibleCategoryList = getVisibleCategories(accessContext).map(c => `\`${c.key}\``).join(', ');
            embed.setTitle('❌ Unknown Category')
                .setDescription(`Category "${category}" not found!\n\nAvailable categories:\n${visibleCategoryList}`)
                .setColor('#ed4245');
    }

    embed.setFooter({ text: `Click buttons to navigate | DJ = Requires DJ role` });
    return embed;
}

function sendCategoryHelp(message, p, category, accessContext) {
    const embed = getCategoryEmbed(p, category, accessContext);
    message.reply({ embeds: [embed] });
}
