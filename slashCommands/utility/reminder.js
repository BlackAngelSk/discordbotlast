const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Manage your reminders')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new reminder')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Reminder message')
                        .setRequired(true)
                        .setMaxLength(500)
                )
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('When to remind (e.g., 1h, 30m, 1d)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View your reminders')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a reminder')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Reminder ID')
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        const InputValidator = interaction.client.InputValidator;
        const reminderManager = interaction.client.reminderManager;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const message = interaction.options.getString('message');
            const timeStr = interaction.options.getString('time');

            // Validate inputs
            const msgValidation = InputValidator.validateString(message, { minLength: 1, maxLength: 500 });
            if (!msgValidation.valid) {
                return await interaction.reply({ content: `❌ ${msgValidation.error}`, flags: 64 });
            }

            const timeValidation = InputValidator.validateDuration(timeStr);
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
                    { name: 'Due', value: dueDate.toLocaleString() },
                    { name: 'ID', value: reminderId }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'list') {
            const reminders = reminderManager.getReminders(interaction.user.id, false);

            if (reminders.length === 0) {
                return await interaction.reply({ 
                    content: '📭 You have no active reminders!', 
                    flags: 64 
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⏰ Your Reminders')
                .setDescription(reminders
                    .map(r => `**${r.message}**\nDue: <t:${Math.floor(new Date(r.dueAt).getTime() / 1000)}:R>\nID: \`${r.id}\``)
                    .join('\n\n')
                )
                .setFooter({ text: `Total: ${reminders.length} reminder(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'delete') {
            const id = interaction.options.getString('id');
            const success = reminderManager.deleteReminder(interaction.user.id, id);

            if (!success) {
                return await interaction.reply({ 
                    content: '❌ Reminder not found!', 
                    flags: 64 
                });
            }

            await interaction.reply({ 
                content: '✅ Reminder deleted!', 
                flags: 64 
            });
        }
    }
};
