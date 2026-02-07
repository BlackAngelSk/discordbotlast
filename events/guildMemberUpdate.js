const { Events } = require('discord.js');
const loggingManager = require('../utils/loggingManager');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember, client) {
        try {
            // Log role changes
            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;

            // Check for added roles
            newRoles.forEach(role => {
                if (!oldRoles.has(role.id) && role.id !== newMember.guild.id) {
                    loggingManager.logRoleUpdate(newMember, role, true, client);
                }
            });

            // Check for removed roles
            oldRoles.forEach(role => {
                if (!newRoles.has(role.id) && role.id !== oldMember.guild.id) {
                    loggingManager.logRoleUpdate(newMember, role, false, client);
                }
            });

        } catch (error) {
            console.error('Error in guildMemberUpdate event:', error);
        }
    }
};
