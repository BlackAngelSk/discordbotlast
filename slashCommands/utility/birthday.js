const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const birthdayManager = require('../../utils/birthdayManager');
const economyManager = require('../../utils/economyManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Manage your birthday')
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set your birthday (MM/DD/YYYY)')
                .addStringOption(opt =>
                    opt.setName('date')
                        .setDescription('Your birthday in MM/DD/YYYY format')
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('year')
                        .setDescription('Birth year (optional, for age calculation)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your birthday info')
        )
        .addSubcommand(sub =>
            sub.setName('upcoming')
                .setDescription('View upcoming birthdays in this server')
                .addIntegerOption(opt =>
                    opt.setName('days')
                        .setDescription('Days ahead to check (default: 7)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove your birthday from the server')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (subcommand === 'set') {
            const dateStr = interaction.options.getString('date');
            const year = interaction.options.getInteger('year');

            // Parse MM/DD/YYYY
            const parts = dateStr.split('/');
            if (parts.length < 2) {
                return interaction.reply({
                    content: '❌ Invalid date format! Use MM/DD/YYYY or MM/DD',
                    ephemeral: true
                });
            }

            const month = parseInt(parts[0]);
            const day = parseInt(parts[1]);

            if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
                return interaction.reply({
                    content: '❌ Invalid date! Month must be 1-12, day must be 1-31',
                    ephemeral: true
                });
            }

            await birthdayManager.setBirthday(guildId, userId, month, day, year);

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle('✅ Birthday Set!')
                .setDescription(`Your birthday is now set to **${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}${year ? `/${year}` : ''}**`)
                .setFooter({ text: 'You\'ll receive a surprise on your birthday!' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'view') {
            const birthday = birthdayManager.getBirthday(guildId, userId);

            if (!birthday) {
                return interaction.reply({
                    content: '❌ You haven\'t set your birthday yet! Use `/birthday set` to set it.',
                    ephemeral: true
                });
            }

            const age = birthdayManager.getAge(birthday);
            const dateStr = `${String(birthday.month).padStart(2, '0')}/${String(birthday.day).padStart(2, '0')}`;

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle('🎂 Your Birthday')
                .addFields(
                    { name: 'Date', value: dateStr, inline: true },
                    { name: 'Age', value: age ? `${age} years old` : 'Not specified', inline: true }
                )
                .setThumbnail(interaction.user.displayAvatarURL());

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'upcoming') {
            const days = interaction.options.getInteger('days') || 7;
            const upcoming = birthdayManager.getUpcomingBirthdays(guildId, days);

            if (upcoming.length === 0) {
                return interaction.reply({
                    content: `🎉 No birthdays in the next ${days} days!`,
                    ephemeral: true
                });
            }

            let description = '';
            for (const bday of upcoming) {
                const user = await interaction.client.users.fetch(bday.userId).catch(() => null);
                const userName = user?.username || 'Unknown User';
                const daysText = bday.daysUntil === 0 ? '🎂 TODAY!' : `in ${bday.daysUntil} day${bday.daysUntil !== 1 ? 's' : ''}`;
                const dateStr = `${String(bday.birthday.month).padStart(2, '0')}/${String(bday.birthday.day).padStart(2, '0')}`;
                description += `**${userName}** - ${dateStr} (${daysText})\n`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎉 Upcoming Birthdays (Next ${days} Days)`)
                .setDescription(description);

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'remove') {
            const birthday = birthdayManager.getBirthday(guildId, userId);

            if (!birthday) {
                return interaction.reply({
                    content: '❌ You haven\'t set a birthday to remove!',
                    ephemeral: true
                });
            }

            await birthdayManager.removeBirthday(guildId, userId);

            return interaction.reply({
                content: '✅ Your birthday has been removed!',
                ephemeral: true
            });
        }
    }
};
