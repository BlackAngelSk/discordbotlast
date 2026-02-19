const { Events, EmbedBuilder } = require('discord.js');
const birthdayManager = require('../utils/birthdayManager');
const economyManager = require('../utils/economyManager');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log('✅ Birthday celebration checker started');

        // Check birthdays every hour
        setInterval(async () => {
            try {
                const guilds = client.guilds.cache;

                for (const guild of guilds.values()) {
                    const guildId = guild.id;
                    const birthdays = birthdayManager.getTodaysBirthdays(guildId);

                    if (birthdays.length === 0) continue;

                    // Find announcement channel
                    let announcementChannel = guild.channels.cache.find(
                        c => c.name === 'announcements' || c.name === 'general'
                    );

                    if (!announcementChannel && guild.systemChannel) {
                        announcementChannel = guild.systemChannel;
                    }

                    if (!announcementChannel) continue;

                    for (const { userId, birthday } of birthdays) {
                        // Check if already celebrated today
                        if (birthdayManager.hasBeenCelebratedToday(guildId, userId)) {
                            continue;
                        }

                        try {
                            const user = await client.users.fetch(userId);
                            const age = birthdayManager.getAge(birthday);
                            const reward = 1000;

                            // Give birthday reward
                            await economyManager.addMoney(guildId, userId, reward);

                            const embed = new EmbedBuilder()
                                .setColor(0xFF69B4)
                                .setTitle('🎂 Birthday Celebration!')
                                .setDescription(`🎉 Happy Birthday to <@${userId}>!`)
                                .addFields(
                                    { name: 'Birthday', value: `${String(birthday.month).padStart(2, '0')}/${String(birthday.day).padStart(2, '0')}`, inline: true },
                                    { name: 'Age', value: age ? `${age} years young! 🎊` : 'Turning a year older! 🎊', inline: true },
                                    { name: '🎁 Birthday Reward', value: `${reward} coins`, inline: false }
                                )
                                .setThumbnail(user.displayAvatarURL())
                                .setTimestamp();

                            await announcementChannel.send({
                                content: `<@${userId}>`,
                                embeds: [embed]
                            });

                            birthdayManager.setLastCelebrated(guildId, userId);
                            console.log(`🎂 Birthday celebrated for ${user.tag}`);
                        } catch (e) {
                            console.error(`Error celebrating birthday for user ${userId}:`, e);
                        }
                    }
                }
            } catch (error) {
                console.error('Error in birthday celebration check:', error);
            }
        }, 60 * 60 * 1000); // Check every hour
    }
};
