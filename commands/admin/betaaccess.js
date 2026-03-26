const { EmbedBuilder } = require('discord.js');
const { ensureBetaRole, getBetaRoleName } = require('../../utils/betaAccess');

module.exports = {
    name: 'betaaccess',
    description: 'Give a user access to beta text commands',
    usage: '!betaaccess @user',
    aliases: ['givebeta', 'betarole'],
    category: 'admin',
    async execute(message, args) {
        try {
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const targetUser = message.mentions.users.first();
            if (!targetUser) {
                return message.reply('❌ Please mention a user. Usage: `!betaaccess @user`');
            }

            const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) {
                return message.reply('❌ That user is not in this server.');
            }

            const betaRole = await ensureBetaRole(message.guild);
            if (targetMember.roles.cache.has(betaRole.id)) {
                return message.reply(`ℹ️ ${targetUser} already has **${betaRole.name}** role.`);
            }

            await targetMember.roles.add(betaRole, `Beta access granted by ${message.author.tag}`);

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🧪 Beta Access Granted')
                .setDescription(`${targetUser} now has **${betaRole.name}** role.`)
                .addFields(
                    { name: 'User', value: `${targetUser}`, inline: true },
                    { name: 'Role', value: betaRole.toString(), inline: true },
                    { name: 'Granted By', value: `${message.author}`, inline: true }
                )
                .setFooter({ text: `Beta role name: ${getBetaRoleName()}` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in betaaccess command:', error);
            return message.reply('❌ Failed to grant beta access. Make sure my role is above the beta role and I have Manage Roles permission.');
        }
    }
};