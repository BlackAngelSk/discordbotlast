const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'warn',
    description: 'Warn a member',
    async execute(message, args, client) {
        // Check if user has moderate members permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('❌ You need **Moderate Members** permission to use this command.');
        }

        const member = message.mentions.members.first();
        if (!member) {
            return message.reply('❌ Please mention a user to warn. Usage: `!warn @user <reason>`');
        }

        // Prevent warning themselves
        if (member.id === message.author.id) {
            return message.reply('❌ You cannot warn yourself!');
        }

        // Prevent warning bot owner
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (botOwnerId && member.id === botOwnerId) {
            return message.reply('❌ Cannot warn the bot owner! 🔑');
        }

        const reason = args.slice(1).join(' ');
        if (!reason) {
            return message.reply('❌ Please provide a reason. Usage: `!warn @user <reason>`');
        }

        const warnEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Warning')
            .setDescription(`You have been warned in **${message.guild.name}**`)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Warned by', value: message.author.tag }
            )
            .setTimestamp();

        try {
            // Try to DM the user
            await member.send({ embeds: [warnEmbed] }).catch(() => {
                message.channel.send(`⚠️ Could not DM ${member.user.tag}. They may have DMs disabled.`);
            });

            // Send confirmation in channel
            const confirmEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ Member Warned')
                .addFields(
                    { name: 'User', value: `${member.user.tag}`, inline: true },
                    { name: 'Warned by', value: message.author.tag, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();

            message.channel.send({ embeds: [confirmEmbed] });
        } catch (error) {
            console.error('Error warning member:', error);
            message.reply('❌ Failed to warn the member. Please try again.');
        }
    }
};
