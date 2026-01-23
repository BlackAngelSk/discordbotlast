const { EmbedBuilder } = require('discord.js');
const settingsManager = require('../utils/settingsManager');

// Command categories - easy to expand
const getCommandCategories = (p) => [
    {
        name: '🎵 Music',
        cmds: [
            'play <url/query>', 'pause (DJ)', 'resume (DJ)', 'skip (DJ)', 
            'stop (DJ)', 'volume <0-200> (DJ)', 'nowplaying', 'queue', 
            'autoplay', 'lyrics [song]', 'leave'
        ]
    },
    {
        name: '📋 Queue (DJ)',
        cmds: ['clear', 'remove <pos>', 'move <from> <to>', 'swap <pos1> <pos2>', 'shuffle']
    },
    {
        name: '🛡️ Moderation',
        cmds: [
            'kick @user [reason]', 'ban @user [reason]', 'unban <userId> [reason]',
            'timeout @user <1m/1h/1d> [reason]', 'untimeout @user',
            'warn @user <reason>', 'purge <amount>', 'lock', 'unlock'
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
        cmds: ['simme rps', 'simme guess', 'simme trivia']
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
            .setTitle('🎵 Music Bot Commands')
            .setDescription(`Prefix: \`${p}\``)
            .setTimestamp();

        categories.forEach(cat => {
            const value = cat.value || cat.cmds.map(c => `\`${p}${c}\``).join(', ');
            helpEmbed.addFields({ name: cat.name, value, inline: false });
        });

        helpEmbed.setFooter({ 
            text: `DJ requires "${settings.djRole}" role | Use ${p}config for detailed settings` 
        });

        await message.channel.send({ embeds: [helpEmbed] });
    }
};
