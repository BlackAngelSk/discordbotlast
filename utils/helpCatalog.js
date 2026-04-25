const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
    const isAdmin = member?.permissions?.has?.('Administrator') || false;

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

function buildMainHelpEmbed(prefix, visibleCategories) {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🤖 Discord Bot - Command Categories')
        .setDescription(`**Server Prefix:** \`${prefix}\`\n**Slash Commands:** Type \`/\` in chat\n\nClick a button below or use \`${prefix}help <category>\` for detailed commands!`)
        .addFields(visibleCategories.map(category => ({ name: category.fieldName, value: category.fieldValue, inline: true })))
        .setFooter({ text: `Type ${prefix}help <category> for detailed commands | Example: ${prefix}help music` })
        .setTimestamp();
}

function getCategoryEmbed(prefix, category, accessContext) {
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
                    { name: '▶️ Playback', value: `\`${prefix}play <url/query>\` - Play a song\n\`/play <song>\` - Play a song (slash)\n\`${prefix}pause\` - Pause playback (DJ)\n\`/pause\` - Pause (slash)\n\`${prefix}resume\` - Resume playback (DJ)\n\`/resume\` - Resume (slash)\n\`${prefix}skip\` - Skip current song (DJ)\n\`/skip\` - Skip (slash)\n\`${prefix}stop\` - Stop and clear queue (DJ)\n\`/stop\` - Stop (slash)\n\`${prefix}leave\` - Leave voice channel` },
                    { name: '📋 Queue', value: `\`${prefix}queue\` - View song queue\n\`/queue\` - View queue (slash)\n\`${prefix}nowplaying\` - Current song info\n\`/nowplaying\` - Current song (slash)\n\`${prefix}remove <pos>\` - Remove song (DJ)\n\`${prefix}move <from> <to>\` - Move song (DJ)\n\`${prefix}swap <a> <b>\` - Swap songs (DJ)\n\`${prefix}shuffle\` - Shuffle queue (DJ)` },
                    { name: '🔧 Controls', value: `\`${prefix}volume <0-200>\` - Set volume (DJ)\n\`/volume <amount>\` - Set volume (slash)\n\`${prefix}loop <off/song/queue>\` - Loop mode (DJ)\n\`/loop\` - Loop mode (slash)\n\`${prefix}previous\` - Play previous song (DJ)\n\`/previous\` - Previous song (slash)\n\`${prefix}jump <pos>\` - Jump to position (DJ)\n\`/jump <position>\` - Jump to position (slash)\n\`${prefix}autoplay\` - Toggle autoplay (DJ)` },
                    { name: '🎛️ Filters & 24/7', value: `\`${prefix}filter <name>\` - Apply audio filter (bassboost, nightcore, 8d, karaoke, echo, etc.)\n\`${prefix}filter list\` - Show all 12 filters\n\`${prefix}247\` - Toggle 24/7 mode (bot stays in VC)` },
                    { name: '📝 Info & Playlists', value: `\`${prefix}lyrics [song]\` - Get song lyrics\n\`/playlist create/add/remove/list\` - Manage playlists` }
                );
            break;

        case 'economy':
            embed.setTitle('💰 Economy Commands')
                .setDescription('Earn coins, gamble, and climb the leaderboard!')
                .addFields(
                    { name: '💵 Balance', value: `\`/balance [@user]\` - Check balance\n\`${prefix}daily\` / \`/daily\` - Daily coins + streak bonus\n\`${prefix}weekly\` / \`/weekly\` - Weekly coins\n\`${prefix}rank [@user]\` - Visual rank card with XP bar\n\`${prefix}achievements [@user]\` - View earned badges\n\`${prefix}profile [@user]\` - Full profile` },
                    { name: '🎰 Gambling', value: `\`${prefix}slots <bet|max|all> [bonus]\` - Slot machine (optional bonus buy)\n\`${prefix}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${prefix}coinflip <h/t> <bet>\` - 2.5x multiplier\n\`${prefix}dice <1-6> <bet>\` - 6x multiplier\n\`${prefix}roulette <bet>\` - Roulette wheel\n\`${prefix}blackjack <bet>\` - Card game\n\`${prefix}rps <bet>\` - Rock paper scissors` },
                    { name: '🏆 Leaderboards', value: `\`${prefix}leaderboard balance\` - Richest users\n\`${prefix}leaderboard xp\` - Top levels\n\`${prefix}leaderboard seasonal\` - Seasonal coins\n\`/leaderboard\` - Slash command leaderboard\n\`/leaderboard-update\` - Force update (admin/role)` },
                    { name: '🛒 Shop', value: `\`/shop\` - View items to buy\n\`${prefix}transfer @user <amount>\` - Send coins\n\`/transfer @user <amount>\` - Send coins (slash)` }
                );
            break;

        case 'games':
            embed.setTitle('🎮 Game Commands')
                .setDescription('Play games and track your stats!')
                .addFields(
                    { name: '🎲 Mini Games', value: `\`${prefix}minigame rps\` - Rock paper scissors\n\`${prefix}minigame guess\` - Guess the number\n\`${prefix}minigame trivia\` - Trivia questions\n\`${prefix}pacman\` - Pacman-style arcade game\n\`${prefix}2048\` - Classic 2048 sliding tile puzzle\n\`${prefix}tetris\` - Classic falling-block puzzle\n\`/tetris\` - Tetris with button controls\n\`${prefix}ttt [@user]\` - Tic tac toe\n\`/ttt @user\` - Tic tac toe (slash)\n\`${prefix}count\` - Counting game\n\`/count\` - Counting game (slash)` },
                    { name: '🆕 Word & Idle Games', value: `\`${prefix}wordle\` - Guess the 5-letter Wordle word (6 attempts)\n\`${prefix}hangman\` - Classic hangman game\n\`${prefix}fish\` - Go fishing (30s cooldown, earn coins)\n\`${prefix}hunt\` - Go hunting (45s cooldown, earn coins)\n\`${prefix}heist [small|medium|large]\` - Crew heists with buy-ins, cooldowns, and outcomes\n\`${prefix}heist targets/stats/upgrades\` - View targets, stats, and upgrade paths\n\`${prefix}pet adopt/view/feed/play/release/types\` - Virtual pet system` },
                    { name: '🎰 Betting Games', value: `\`${prefix}slots <bet|max|all> [bonus]\` - Slot machine (optional bonus buy)\n\`${prefix}mines <bet|max|all> [mines]\` - Reveal & cashout game\n\`${prefix}blackjack <bet>\` - Card game\n\`/blackjack <bet>\` - Card game (slash)\n\`${prefix}roulette <bet>\` - Roulette\n\`/roulette <bet>\` - Roulette (slash)\n\`${prefix}coinflip <h/t> <bet>\` - Coin flip\n\`/coinflip <choice> <bet>\` - Coin flip (slash)\n\`${prefix}dice <1-6> <bet>\` - Dice roll\n\`/dice <number> <bet>\` - Dice roll (slash)\n\`${prefix}rps <bet>\` - RPS with betting\n\`/rps <choice> <bet>\` - RPS (slash)\n\`${prefix}horserace <bet>\` - Horse race\n\`/horserace <bet>\` - Horse race (slash)` },
                    { name: '📊 Stats', value: `\`${prefix}gamestats [@user]\` - View game statistics\n\`${prefix}horseracehistory [@user]\` - Horse race history\n\`/horseracehistory [@user]\` - Horse race history (slash)\n\`/horseracesim <count>\` - Simulate races (admin)` }
                );
            break;

        case 'moderation':
            embed.setTitle('🛡️ Moderation Commands')
                .setDescription('Keep your server safe and organized!')
                .addFields(
                    { name: '👮 Actions', value: `\`${prefix}kick @user [reason]\` - Kick member\n\`/kick @user [reason]\` - Kick (slash)\n\`${prefix}ban @user [reason]\` - Ban member\n\`/ban @user [reason]\` - Ban (slash)\n\`${prefix}unban <userId>\` - Unban user\n\`${prefix}timeout @user <mins> [reason]\` - Timeout\n\`${prefix}untimeout @user\` - Remove timeout\n\`${prefix}warn @user <reason>\` - Warn user\n\`/softban @user [reason]\` - Soft ban\n\`/mute @user <mins>\` - Mute member` },
                    { name: '🗑️ Cleanup', value: `\`${prefix}purge <amount>\` - Delete messages\n\`${prefix}clear <amount>\` - Clear messages\n\`/clear <amount>\` - Clear messages (slash)\n\`${prefix}lock\` - Lock channel\n\`/lock\` - Lock channel (slash)\n\`${prefix}unlock\` - Unlock channel\n\`/unlock\` - Unlock channel (slash)\n\`/slowmode <seconds>\` - Set slowmode` },
                    { name: '📋 Warnings & Logs', value: `\`/warnings add @user <reason>\`\n\`/warnings list @user\`\n\`/warnings remove @user <id>\`\n\`/warnings clear @user\`\n\`${prefix}logging\` - Logging settings\n\`/logging\` - Logging settings (slash)\n\`/modlog #channel\` - Set mod log` },
                    { name: '🤖 Auto-Mod', value: `\`/automod enable/disable\`\n\`/automod antiinvite\` - Block invites\n\`/automod antispam\` - Block spam\n\`/automod badwords add/remove\`\n\`/automod settings\` - View settings` },
                    { name: '🆕 New Moderation', value: `\`${prefix}tempban @user <duration> [reason]\` - Temp ban (auto-unbans, e.g. 1h/7d)\n\`${prefix}tempvc set [#channel]\` - Setup temporary voice channels hub\n\`${prefix}verification setup #channel @role\` - Server verification gate\n\`${prefix}sticky set [#channel] <msg>\` - Stick a message to bottom of channel\n\`${prefix}rolemenu create/add/post/delete/list\` - Dropdown role selection menus` }
                );
            break;

        case 'server':
            embed.setTitle('🎫 Server Tools')
                .setDescription('Advanced server management features!')
                .addFields(
                    { name: '🎫 Tickets', value: `\`${prefix}ticket setup\` - Setup ticket system\nUsers click button to create support tickets\nTickets auto-create private channels` },
                    { name: '🏷️ Reaction Roles', value: `\`${prefix}reactionrole <msgId> <emoji> <@role>\`\nUsers react to get roles automatically` },
                    { name: '⭐ Starboard', value: `\`${prefix}starboard set #channel\`\n\`${prefix}starboard remove\`\nMessages with 3+ ⭐ get featured` },
                    { name: '📝 Custom Commands', value: `\`${prefix}customcmd add <name> <response>\`\n\`${prefix}customcmd remove <name>\`\n\`${prefix}customcmd list\` - View all` },
                    { name: '👋 Welcome', value: `\`${prefix}welcomecard enable #channel\`\n\`${prefix}welcomecard disable\`\nSend fancy welcome cards to new members` }
                );
            break;

        case 'stats':
            embed.setTitle('📊 Statistics & Analytics')
                .setDescription('Track server and user activity!')
                .addFields(
                    { name: '📈 Server Stats', value: `\`${prefix}stats overview\` - Total stats\n\`${prefix}stats users\` - Top 10 active users\n\`${prefix}stats channels\` - Most active channels\n\`${prefix}stats activity\` - 7-day trend` },
                    { name: '👤 User Profiles', value: `\`${prefix}profile [@user]\` - Full profile\n**Shows:** Level, XP, balance, streak, seasonal coins, inventory\n**Features:** XP progress bar, detailed stats` },
                    { name: '⭐ Experience', value: `Gain 5-15 XP per message (1 min cooldown)\nLevel up = coins reward\nTrack progress with \`${prefix}profile\`` },
                    { name: '📊 Slash Stats', value: `\`/stats\` - Quick stats\n\`/analytics\` - Server analytics\n\`/activity voice/leaderboard/afk/inactive\` - Activity stats & inactive members` }
                );
            break;

        case 'custom':
            embed.setTitle('📝 Custom Commands')
                .setDescription('Admins can create custom bot responses!')
                .addFields(
                    { name: 'Commands', value: `\`${prefix}customcmd add <name> <response>\`\nCreate a new custom command\n\n\`${prefix}customcmd remove <name>\`\nDelete a custom command\n\n\`${prefix}customcmd list\`\nView all custom commands` },
                    { name: 'Example', value: `\`${prefix}customcmd add rules Please read #rules!\`\nNow typing \`${prefix}rules\` will show that message!` },
                    { name: 'Note', value: 'Requires Administrator permission' }
                );
            break;

        case 'utility':
            embed.setTitle('🔧 Utility Commands')
                .setDescription('Configuration and server information!')
                .addFields(
                    { name: '⚙️ Configuration', value: `\`${prefix}config\` - View settings\n\`${prefix}config prefix <prefix>\` - Set prefix\n\`${prefix}config djrole <name>\` - Set DJ role\n\`${prefix}config autorole <name>\` - Set auto role\n\`${prefix}setup\` - Quick server setup\n\`${prefix}config reset\` - Reset settings` },
                    { name: '🏆 Leaderboard Admin', value: `\`/leaderboard-channel #channel\` - Set channel\n\`/leaderboard-config view\` - View config\n\`/leaderboard-config set\` - Update config\n\`/leaderboard-config export\` - Export CSV` },
                    { name: 'ℹ️ Information', value: `\`${prefix}server\` - Server info\n\`${prefix}ping\` - Bot latency\n\`/ping\` - Bot latency (slash)\n\`/avatar [@user]\` - User avatar\n\`/userinfo [@user]\` - User details\n\`/roleinfo <@role>\` - Role info\n\`/serverinfo\` - Server details` },
                    { name: '🧰 Utility Tools', value: `\`/ask <question>\` - Ask AI\n\`/ai\` - AI chat\n\`/announce\` - Announcement\n\`/birthday\` - Birthday settings\n\`/customrole\` - Custom role shop\n\`/milestones achieved|upcoming|sync\` - Milestones & sync with current members\n\`/giveaway\` - Giveaways\n\`${prefix}giveaway\` - Giveaways (prefix)\n\`/invites\` - Invite stats\n\`/invitestats\` - Invite leaderboard\n\`${prefix}invites\` - Invite stats (prefix)\n\`${prefix}invitestats\` - Invite leaderboard (prefix)\n\`/reminder\` - Set reminders\n\`/activity voice/leaderboard/afk/inactive\` - Activity stats` },
                    { name: '🆕 New Utility', value: `\`${prefix}rank [@user]\` - Visual rank card with XP progress\n\`${prefix}achievements [@user]\` - View earned achievement badges\n\`${prefix}confess <message>\` - Post anonymous confession\n\`${prefix}report @user <reason>\` - Report a user to moderators` },
                    { name: '🌐 Other', value: `\`${prefix}dashboard\` - Web dashboard\n\`${prefix}hello\` - Say hello!\n\`${prefix}help\` - Help menu\n\`/help\` - Help menu (slash)\n\`${prefix}prefix\` - Show prefix\n\`/prefix\` - Show prefix (slash)\n\`${prefix}leave\` - Bot leaves server\n\`${prefix}profile [@user]\` - User profile\n\`/profile [@user]\` - User profile (slash)\n\`${prefix}stats\` - Stats overview\n\`/stats\` - Stats overview (slash)\n\`/analytics\` - Server analytics` }
                );
            break;

        case 'fun':
            embed.setTitle('🎭 Fun Commands')
                .setDescription('Entertainment and random fun!')
                .addFields(
                    { name: 'Commands', value: `\`/poll <question> <options>\` - Create poll\n\`/8ball <question>\` - Magic 8-ball\n\`/meme\` - Random meme\n\`/flappybird\` - Play Flappy Bird\n\`${prefix}hello\` - Friendly greeting\n\`${prefix}russianroulette\` - Russian roulette (1/7 chance of consequence)\n\`${prefix}propose @user\` - Propose\n\`/propose @user\` - Propose (slash)\n\`${prefix}accept\` - Accept proposal\n\`/accept\` - Accept (slash)\n\`${prefix}reject\` - Reject proposal\n\`/reject\` - Reject (slash)\n\`${prefix}divorce\` - Divorce\n\`/divorce\` - Divorce (slash)\n\`${prefix}spouse [@user]\` - View spouse\n\`/spouse [@user]\` - View spouse (slash)\n\`${prefix}couples\` - Top couples\n\`/couples\` - Top couples (slash)` },
                    { name: '🆕 New Fun', value: `\`${prefix}wordle\` - Guess the 5-letter word in 6 tries (win coins!)\n\`${prefix}hangman\` - Classic hangman with ASCII gallows\n\`${prefix}fish\` - Cast a line and catch fish for coins (30s cooldown)\n\`${prefix}hunt\` - Hunt animals for coins (45s cooldown)\n\`${prefix}heist [small|medium|large]\` - Launch a crew heist with real risk and payout tiers\n\`${prefix}heist targets/stats/upgrades\` - Track progression and upgrade specialties\n\`${prefix}pet adopt/view/feed/play/release/types\` - Adopt and care for a virtual pet` },
                    { name: '🧪 Beta Commands', value: `\`${prefix}poker host <blind> [buyin]\`, \`${prefix}poker join <blind>\`, \`${prefix}poker start\`, \`${prefix}poker status\`, \`${prefix}poker leave\`\n\`/snake\` - Play Snake with button controls\nRequires **bot beta access** role.\nIn beta poker, balance is test-only (infinite) and does not update real economy.` }
                );
            break;

        case 'admin':
            embed.setTitle('🧰 Admin Commands')
                .setDescription('Server and economy administration tools!')
                .addFields(
                    { name: '💰 Economy Admin', value: `\`${prefix}addcoins @user <amount>\`\n\`${prefix}removecoins @user <amount>\`\n\`${prefix}setbalance @user <amount>\`\n\`${prefix}giveexp @user <amount>\`` },
                    { name: '🧹 Resets', value: `\`${prefix}cleareconomy\`\n\`${prefix}reseteconomy\`\n\`${prefix}cleargamedata\`\n\`${prefix}resetwarnings\`` },
                    { name: '📅 Seasons', value: `\`${prefix}season create <name>\` - Create custom season\n\`${prefix}season list\` - View all seasons\n\`${prefix}season info <name>\` - Season details\n\`${prefix}season leaderboard [name]\` - Top players this season\n\`${prefix}season end <name>\` - End season & award winners\n\`${prefix}season enroll <name>\` - Enroll members\n\`${prefix}season refresh [name]\` - Refresh stats\n\n**Automatic Quarterly Seasons:**\nSeasons auto-create every quarter (Spring/Summer/Fall/Winter)\nExample: \`spring-2026\`, \`summer-2026\`\nOld season auto-archives, new members auto-enrolled` },
                    { name: '⚙️ Server Admin', value: `\`${prefix}botprefix <prefix>\`\n\`${prefix}serverlanguage <code>\`\n\`${prefix}serverstats\`\n\`${prefix}announcement <msg>\`\n\`${prefix}backup\`\n\`${prefix}betaaccess @user\` - Grant **bot beta access** role\n\`/welcomemessage\` - Configure welcome messages\n\`/roletemplate\` - Role templates\n\`/mongodb-space\` - Check MongoDB usage (Owner)\n\`/system-stats\` - System CPU/RAM stats\n\`/botstatus\` - Bot health and status` },
                    { name: '🔐 Permissions', value: `\`/command-permissions list\`\n\`/command-permissions disable <command>\`\n\`/command-permissions enable <command>\`\n\`/command-permissions role <command> <role>\`` },
                    { name: '🧾 Audit Logs', value: `\`/auditlog view\`\n\`/auditlog export\`\n\`/auditlogs\` - View logs` },
                    { name: '🆕 New Admin', value: `\`${prefix}statchannel set <type>\` - Dynamic stat voice channels (members/online/boosts/etc.)\n\`${prefix}xpevent start <mult> <duration>\` - Start double/triple XP event\n\`${prefix}livealerts add twitch/youtube\` - Twitch/YouTube live notifications\n\`${prefix}bumprule enable #channel [@role]\` - Configure Disboard bump reminders\n\`${prefix}aipersona set <name> | <personality>\` - Custom AI persona for this server\n\`${prefix}reload <command>\` - Hot-reload a command without restart\n\`${prefix}features list/enable/disable\` - Toggle per-server feature flags` }
                );
            break;

        case 'owner':
            embed.setTitle('👑 Owner Commands')
                .setDescription('Restricted to the bot owner only.')
                .addFields(
                    {
                        name: '🔒 Owner-only Slash Commands',
                        value: '\`/testcommands\` - Simulate all slash commands and report failures\n\`/force-update [ref] [restart] [delete_missing]\` - Force-update bot files now\n\`/mongodb-space\` - Check MongoDB storage usage\n\`/mongodb-sync status\` - View the current sync schedule\n\`/mongodb-sync schedule\` - Choose automatic/manual MongoDB updates\n\`/mongodb-sync run\` - Sync JSON data to MongoDB now'
                    },
                    {
                        name: 'ℹ️ Notes',
                        value: 'Requires \`BOT_OWNER_ID\` in environment variables.\nSome admin commands can also be used by delegated roles, but the commands above are owner-gated.\n\nDEV mode: set \`DEV_MODE=true\` to disable MongoDB sync and automatic season leaderboard updates.'
                    }
                );
            break;

        default: {
            const visibleCategoryList = getVisibleCategories(accessContext).map(c => `\`${c.key}\``).join(', ');
            embed.setTitle('❌ Unknown Category')
                .setDescription(`Category "${category}" not found!\n\nAvailable categories:\n${visibleCategoryList}`)
                .setColor('#ed4245');
            break;
        }
    }

    embed.setFooter({ text: 'Click buttons to navigate | DJ = Requires DJ role' });
    return embed;
}

module.exports = {
    CATEGORY_DEFINITIONS,
    getAccessContext,
    canViewCategory,
    getVisibleCategories,
    buildCategoryRows,
    buildMainHelpEmbed,
    getCategoryEmbed
};