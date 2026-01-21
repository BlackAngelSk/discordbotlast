module.exports = {
    name: 'help',
    description: 'Show available commands',
    async execute(message, args, client) {
        const { EmbedBuilder } = require('discord.js');
        const settingsManager = require('../utils/settingsManager');
        const settings = settingsManager.get(message.guild.id);
        
        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🎵 Music Bot Commands')
            .setDescription(`Here are all available commands (prefix: \`${settings.prefix}\`):`)
            .addFields(
                {
                    name: '🎵 Music Playback',
                    value: `\`${settings.prefix}play <url/query>\` - Play music (supports playlists!)\n` +
                           `\`${settings.prefix}pause\` - Pause playback (DJ)\n` +
                           `\`${settings.prefix}resume\` - Resume playback (DJ)\n` +
                           `\`${settings.prefix}skip\` - Skip current song (DJ)\n` +
                           `\`${settings.prefix}stop\` - Stop and clear queue (DJ)\n` +
                           `\`${settings.prefix}volume <0-200>\` - Set volume (DJ)\n` +
                           `\`${settings.prefix}nowplaying\` - Show current song\n` +
                           `\`${settings.prefix}queue\` - Display song queue\n` +
                           `\`${settings.prefix}autoplay\` - Toggle autoplay mode\n` +
                           `\`${settings.prefix}lyrics [song]\` - Get lyrics`,
                    inline: false
                },
                {
                    name: '📋 Queue Management (DJ Only)',
                    value: `\`${settings.prefix}clear\` - Clear all songs\n` +
                           `\`${settings.prefix}remove <pos>\` - Remove song at position\n` +
                           `\`${settings.prefix}move <from> <to>\` - Move song\n` +
                           `\`${settings.prefix}swap <pos1> <pos2>\` - Swap two songs\n` +
                           `\`${settings.prefix}shuffle\` - Randomize queue`,
                    inline: false
                },
                {
                    name: '⚙️ Configuration (Admin Only)',
                    value: `\`${settings.prefix}config\` - View server settings\n` +
                           `\`${settings.prefix}config prefix <prefix>\` - Change prefix\n` +
                           `\`${settings.prefix}config welcomechannel #channel\` - Set welcome channel\n` +
                           `\`${settings.prefix}config welcomemessage <msg>\` - Set message\n` +
                           `\`${settings.prefix}config welcomeenable/disable\` - Toggle welcome\n` +
                           `\`${settings.prefix}config leavechannel #channel\` - Set leave channel\n` +
                           `\`${settings.prefix}config leavemessage <msg>\` - Set leave msg\n` +
                           `\`${settings.prefix}config leaveenable/disable\` - Toggle leave\n` +
                           `\`${settings.prefix}config autorole <name>\` - Set auto-role\n` +
                           `\`${settings.prefix}config djrole <name>\` - Set DJ role\n` +
                           `\`${settings.prefix}config reset\` - Reset settings\n` +
                           `\`${settings.prefix}setup\` - Create DJ/Member roles`,
                    inline: false
                },
                {
                    name: '🎮 Reaction Controls',
                    value: 'React to now playing messages:\n' +
                           '⏸️ Pause | ▶️ Resume | ⏭️ Skip\n' +
                           '⏹️ Stop | 🔉 Vol- | 🔊 Vol+',
                    inline: false
                },
                {
                    name: '⚙️ General Commands',
                    value: `\`${settings.prefix}ping\` - Check latency\n` +
                           `\`${settings.prefix}hello\` - Get a greeting\n` +
                           `\`${settings.prefix}server\` - Server information\n` +
                           `\`${settings.prefix}leave\` - Bot leaves voice channel`,
                    inline: false
                }
            )
            .setFooter({ text: `Commands marked (DJ) require ${settings.djRole} role, Admin, or being alone with bot` });

        await message.channel.send({ embeds: [helpEmbed] });
    }
};
