const { EmbedBuilder } = require('discord.js');
const reactionRoleManager = require('../../utils/reactionRoleManager');

module.exports = {
    name: 'reactionrole',
    description: 'Set up reaction roles for a message!',
    usage: '!reactionrole <message_id> <emoji> <@role>',
    aliases: ['rr', 'reactrole'],
    category: 'moderation',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('ManageRoles')) {
                return message.reply('❌ You need "Manage Roles" permission!');
            }

            const messageId = args[0];
            const emoji = args[1];
            const role = message.mentions.roles.first();

            if (!messageId || !emoji || !role) {
                return message.reply('❌ Usage: `!reactionrole <message_id> <emoji> <@role>`\n\nExample: `!reactionrole 123456789 🎮 @Gamers`');
            }

            // Try to fetch the message
            let targetMessage;
            try {
                targetMessage = await message.channel.messages.fetch(messageId);
            } catch (error) {
                return message.reply('❌ Could not find that message! Make sure it\'s in this channel.');
            }

            // Add reaction to the message
            await targetMessage.react(emoji);

            // Store in manager
            await reactionRoleManager.addReactionRole(message.guild.id, messageId, emoji, role.id);

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Reaction Role Added')
                .addFields(
                    { name: 'Message ID', value: messageId, inline: true },
                    { name: 'Emoji', value: emoji, inline: true },
                    { name: 'Role', value: `<@&${role.id}>`, inline: true }
                )
                .setDescription(`Users can now react with ${emoji} to get the ${role.name} role!`);

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in reactionrole command:', error);
            message.reply('❌ An error occurred!');
        }
    }
};
