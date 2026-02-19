const { Events, EmbedBuilder } = require('discord.js');
const serverMilestones = require('../utils/serverMilestones');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        try {
            const guildId = member.guild.id;
            const memberCount = member.guild.memberCount;

            // Check for milestones when member joins
            const newMilestones = serverMilestones.checkMilestones(guildId, memberCount);

            if (newMilestones.length > 0) {
                // Find announcement channel or system channel
                let announcementChannel = member.guild.channels.cache.find(
                    c => c.name === 'announcements' || c.name === 'general'
                );

                if (!announcementChannel && member.guild.systemChannel) {
                    announcementChannel = member.guild.systemChannel;
                }

                if (announcementChannel) {
                    for (const milestone of newMilestones) {
                        const embed = serverMilestones.createMilestoneEmbed(
                            milestone,
                            member.guild.name,
                            memberCount
                        );

                        await announcementChannel.send({
                            embeds: [embed]
                        }).catch(e => console.log('Could not send milestone message:', e));
                    }
                }
            }

            console.log(`✅ Member joined: ${member.user.tag}, Total: ${memberCount}`);
        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    }
};
