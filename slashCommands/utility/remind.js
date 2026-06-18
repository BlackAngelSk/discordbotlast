const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { parseReminderText } = require('../../utils/reminderParser');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set and manage your personal reminders')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a new reminder (e.g. "in 10 minutes to check the oven")')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('When to remind you (e.g. "10 minutes", "2 hours", "1 day", "1h 30m")')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('What to remind you about')
                        .setRequired(true)
                        .setMaxLength(500)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View your active reminders')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete one of your reminders')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The reminder ID to delete (from /remind list)')
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const InputValidator = interaction.client.InputValidator;
        const reminderManager = interaction.client.reminderManager;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const timeStr = interaction.options.getString('time');
            const message = interaction.options.getString('message');

            const msgValidation = InputValidator.validateString(message, { minLength: 1, maxLength: 500 });
            if (!msgValidation.valid) {
                return await interaction.reply({ content: `❌ ${msgValidation.error}`, flags: 64 });
            }

            const timeValidation = InputValidator.parseNaturalDuration(timeStr);
            if (!timeValidation.valid) {
                return await interaction.reply({ content: `❌ ${timeValidation.error}`, flags: 64 });
            }

            const reminderId = reminderManager.createReminder(
                interaction.user.id,
                message,
                timeValidation.value
            );

            const dueDate = new Date(Date.now() + timeValidation.value);
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Reminder Created')
                .addFields(
                    { name: 'Message', value: message },
                    { name: 'Due', value: `<t:${Math.floor(dueDate.getTime() / 1000)}:R> (${dueDate.toLocaleString()})` },
                    { name: 'ID', value: reminderId }
                )
                .setFooter({ text: 'You\'ll get a DM when it\'s time. Use /remind list to view or /remind delete to cancel.' })
                .setTimestamp();

            return await interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'list') {
            const reminders = reminderManager.getReminders(interaction.user.id, false);

            if (reminders.length === 0) {
                return await interaction.reply({ content: '📭 You have no active reminders!', flags: 64 });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⏰ Your Reminders')
                .setDescription(reminders
                    .map(r => `**${r.message}**\nDue: <t:${Math.floor(new Date(r.dueAt).getTime() / 1000)}:R>\nID: \`${r.id}\``)
                    .join('\n\n')
                )
                .setFooter({ text: `Total: ${reminders.length} reminder(s) • Use /remind delete <id> to cancel` })
                .setTimestamp();

            return await interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (subcommand === 'delete') {
            const id = interaction.options.getString('id');
            const success = reminderManager.deleteReminder(interaction.user.id, id);

            if (!success) {
                return await interaction.reply({ content: '❌ Reminder not found! Use `/remind list` to see your reminder IDs.', flags: 64 });
            }

            return await interaction.reply({ content: '✅ Reminder deleted!', flags: 64 });
        }
    }
};
