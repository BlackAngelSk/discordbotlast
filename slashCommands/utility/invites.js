const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const inviteManager = require('../../utils/inviteManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Check your invite count and who you invited')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check invites for (defaults to you)')
                .setRequired(false)
        ),
    category: 'utility',
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            const inviteData = inviteManager.getUserInvites(interaction.guildId, targetUser.id);

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

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in invites slash command:', error);
            await interaction.reply({ content: '❌ Error retrieving invite data.', ephemeral: true });
        }
    },
};
