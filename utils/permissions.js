// Permission checker for DJ role
const settingsManager = require('./settingsManager');

function hasDJPermission(member) {
    // Server owner always has permission
    if (member.guild.ownerId === member.id) {
        return true;
    }

    // Administrator permission
    if (member.permissions.has('Administrator')) {
        return true;
    }

    // Get DJ role name from settings
    const settings = settingsManager.get(member.guild.id);
    const djRoleName = settings.djRole;

    // Check for DJ role
    const hasDJRole = member.roles.cache.some(role => 
        role.name === djRoleName
    );

    return hasDJRole;
}

function hasBotWatcherPermission(member) {
    // Server owner always has permission
    if (member.guild.ownerId === member.id) {
        return true;
    }

    // Administrator permission
    if (member.permissions.has('Administrator')) {
        return true;
    }

    // Get Bot Watcher role name from settings
    const settings = settingsManager.get(member.guild.id);
    const botWatcherRoleName = settings.botWatcherRole;

    // Check for Bot Watcher role
    const hasBotWatcherRole = member.roles.cache.some(role =>
        role.name === botWatcherRoleName
    );

    return hasBotWatcherRole;
}

function requireBotWatcher(execute) {
    return async function(message, args, client) {
        if (!hasBotWatcherPermission(message.member)) {
            const settings = settingsManager.get(message.guild.id);
            return message.reply(`❌ You need the ${settings.botWatcherRole} role or Administrator permission to use this command!`);
        }

        return execute(message, args, client);
    };
}

function requireDJ(execute) {
    return async function(message, args, client) {
        // If user is in voice channel alone with bot, they have permission
        const voiceChannel = message.member.voice.channel;
        if (voiceChannel) {
            const members = voiceChannel.members.filter(m => !m.user.bot);
            if (members.size === 1) {
                return execute(message, args, client);
            }
        }

        if (!hasDJPermission(message.member)) {
            const settings = settingsManager.get(message.guild.id);
            return message.reply(`❌ You need the ${settings.djRole} role or Administrator permission to use this command!`);
        }

        return execute(message, args, client);
    };
}

module.exports = {
    hasDJPermission,
    requireDJ,
    hasBotWatcherPermission,
    requireBotWatcher
};
