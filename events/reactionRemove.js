const { Events } = require('discord.js');
const reactionRoleManager = require('../utils/reactionRoleManager');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user) {
        if (user.bot) return;

        try {
            if (reaction.partial) {
                await reaction.fetch();
            }

            const message = reaction.message;
            const roleId = reactionRoleManager.getRoleForReaction(message.guildId, message.id, reaction.emoji.toString());

            if (!roleId) {
                return;
            }

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            const role = await message.guild.roles.fetch(roleId).catch(() => null);

            if (member && role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role, 'Reaction role removed');
            }
        } catch (error) {
            console.error('Error removing reaction role:', error);
        }
    }
};