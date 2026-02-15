const { EmbedBuilder } = require('discord.js');
const inviteManager = require('../../utils/inviteManager');

module.exports = {
    name: 'invites',
    description: 'Check your invite count and who you invited',
    category: 'utility',
    usage: 'invites [@user]',
    async execute(message, args) {
        try {
            // Get target user (mentioned user or command sender)
            const targetUser = message.mentions.users.first() || message.author;

            const inviteData = await inviteManager.getUserInvites(message.guild.id, targetUser.id);

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`📊 Invite Stats - ${targetUser.username}`)
                .setDescription(`Here are ${targetUser.username}'s invitation statistics`)
                .addFields(
                    {
                        name: '👥 Total Invites',
                        value: `${inviteData.count}`,
                        inline: true,
                    },
                    {
                        name: '👤 Unique Members Invited',
                        value: `${inviteData.invited.length}`,
                        inline: true,
                    }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Invite tracking system' })
                .setTimestamp();

            // Add list of invited members if any
            if (inviteData.invited.length > 0) {
                const invitedList = inviteData.invited
                    .slice(0, 10)
                    .map((inv, idx) => `${idx + 1}. **${inv.username}** - <t:${Math.floor(new Date(inv.invitedAt).getTime() / 1000)}:R>`)
                    .join('\n');

                embed.addFields({
                    name: 'Recently Invited Members',
                    value: invitedList || 'None',
                });
            }

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in invites command:', error);
            await message.reply('❌ Error retrieving invite data.');
        }
    },
};
