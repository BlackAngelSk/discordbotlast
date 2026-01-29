const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');

// Command categories - easy to expand
const getCommandCategories = (p) => [
    {
        name: '🎵 Music (Prefix & Slash)',
        cmds: [
            'play <url/query>', 'pause (DJ)', 'resume (DJ)', 'skip (DJ)', 
            'stop (DJ)', 'volume <0-200> (DJ)', 'loop <off|song|queue> (DJ)', 
            'previous (DJ)', 'jump <pos> (DJ)', 'nowplaying', 'queue', 
            'autoplay', 'lyrics [song]', 'leave'
        ]
    },
    {
        name: '📋 Queue Management (DJ)',
        cmds: ['clear', 'remove <pos>', 'move <from> <to>', 'swap <pos1> <pos2>', 'shuffle']
    },
    {
        name: '🛡️ Moderation (Prefix & Slash)',
        cmds: [
            'kick @user [reason]', 'ban @user [reason]', 'unban <userId>',
            'timeout @user <mins> [reason]', 'untimeout @user',
            'warn @user <reason>', 'purge <amount>', 'lock', 'unlock',
            'mute @user <mins> [reason]', 'softban @user [reason]'
        ]
    },
    {
        name: '⚠️ Warnings & Logs (Slash)',
        cmds: [
            'warnings add @user <reason>', 'warnings list @user',
            'warnings remove @user <id>', 'warnings clear @user', 'modlog #channel'
        ]
    },
    {
        name: '🤖 Auto-Moderation (Slash)',
        cmds: [
            'automod enable/disable', 'automod antiinvite <true|false>',
            'automod antispam <true|false>', 'automod badwords add/remove/list <word>',
            'automod settings'
        ]
    },
    {
        name: '💰 Economy (Slash)',
        cmds: [
            'balance [user]', 'daily', 'weekly', 'leaderboard [type]', 'shop'
        ]
    },
    {
        name: '🎮 Entertainment (Slash)',
        cmds: [
            'poll <question> <options>', '8ball <question>', 'meme'
        ]
    },
    {
        name: '🔧 Utility (Slash)',
        cmds: [
            'avatar [user]', 'userinfo [user]', 'roleinfo <role>'
        ]
    },
    {
        name: '⚙️ Config (Admin)',
        cmds: [
            'config', 'config prefix <prefix>', 'config djrole <name>', 
            'config autorole <name>', 'setup', 'config reset'
        ]
    },
    {
        name: '👋 Welcome/Leave (Admin)',
        cmds: [
            'config welcomechannel/message/enable/disable',
            'config leavechannel/message/enable/disable'
        ]
    },
    {
        name: '🎮 Reactions',
        value: '⏸️ Pause | ▶️ Resume | ⏭️ Skip | ⏹️ Stop | 🔉/🔊 Volume'
    },
    {
        name: '🎯 Mini Games',
        cmds: ['minigame rps', 'minigame guess', 'minigame trivia', 'minigame tictactoe', 'minigame blackjack', 'minigame roulette', 'gamestats [@user]']
    },
    {
        name: '🛠️ General',
        cmds: ['help', 'ping', 'hello', 'server', 'dashboard']
    }
];

module.exports = {
    name: 'help',
    description: 'Show available commands',
    async execute(message, args, client) {
        const settings = settingsManager.get(message.guild.id);
        const p = settings.prefix;
        const categories = getCommandCategories(p);

        const helpEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎵 Discord Bot - Complete Command List')
            .setDescription(`**Prefix:** \`${p}\`\n**Slash Commands:** Type \`/\` to see all!\n\n**Legend:**\n✨ Slash & Prefix | 🔵 Slash Only | 📌 Prefix Only | (DJ) = DJ Role Required`)
            .setTimestamp();

        categories.forEach(cat => {
            const value = cat.value || cat.cmds.map(c => `\`${p}${c}\``).join(', ');
            helpEmbed.addFields({ name: cat.name, value, inline: false });
        });

        helpEmbed.setFooter({ 
            text: `DJ requires "${settings.djRole}" role | Use ${p}config for settings | Read QUICKSTART.md for setup!` 
        });

        await message.channel.send({ embeds: [helpEmbed] });
    }
};
