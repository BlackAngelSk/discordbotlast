const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'purge',
    description: 'Delete multiple messages at once',
    async execute(message, args, client) {
        // Check if user has manage messages permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ You need **Manage Messages** permission to use this command.');
        }

        // Check if bot has manage messages permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ I need **Manage Messages** permission to do that.');
        }

        const amount = parseInt(args[0]);
        
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ Please provide a number between 1 and 100. Usage: `!purge <amount>`');
        }

        try {
            // Delete messages (includes the command message)
            const deleted = await message.channel.bulkDelete(amount + 1, true);
            
            const reply = await message.channel.send(`✅ Successfully deleted **${deleted.size - 1}** messages.`);
            
            // Auto-delete confirmation after 5 seconds
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        } catch (error) {
            console.error('Error purging messages:', error);
            message.reply('❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.');
        }
    }
};
