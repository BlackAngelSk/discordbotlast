const { EmbedBuilder } = require('discord.js');
const { parseReminderText } = require('../../utils/reminderParser');

module.exports = {
    name: 'reminder',
    description: 'Set and manage your personal reminders (e.g. "!remind me in 10 minutes to check the oven")',
    usage: '!remind me in <time> to <message> | !remind list | !remind delete <id>',
    aliases: ['remind', 'remindme'],
    category: 'utility',
    async execute(message, args, client) {
        const reminderManager = client.reminderManager;
        const InputValidator = client.InputValidator;

        if (!reminderManager) {
            return message.reply('❌ Reminder system is not available right now.');
        }

        const sub = (args[0] || '').toLowerCase();

        // !remind list
        if (sub === 'list') {
            const reminders = reminderManager.getReminders(message.author.id, false);

            if (reminders.length === 0) {
                return message.reply('📭 You have no active reminders!');
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⏰ Your Reminders')
                .setDescription(reminders
                    .map(r => `**${r.message}**\nDue: <t:${Math.floor(new Date(r.dueAt).getTime() / 1000)}:R>\nID: \`${r.id}\``)
                    .join('\n\n')
                )
                .setFooter({ text: `Total: ${reminders.length} reminder(s) • Use !remind delete <id> to cancel` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // !remind delete <id>
        if (sub === 'delete') {
            const id = args.slice(1).join(' ').trim();
            if (!id) {
                return message.reply('❌ Please provide a reminder ID. Use `!remind list` to see your reminder IDs.');
            }
            const success = reminderManager.deleteReminder(message.author.id, id);
            if (!success) {
                return message.reply('❌ Reminder not found! Use `!remind list` to see your reminder IDs.');
            }
            return message.reply('✅ Reminder deleted!');
        }

        // !remind me in <time> to <message>
        const raw = args.join(' ');
        const parsed = parseReminderText(raw);
        if (!parsed.valid) {
            return message.reply(`❌ ${parsed.error}\n\n**Usage:** \`${this.usage}\``);
        }

        const msgValidation = InputValidator.validateString(parsed.message, { minLength: 1, maxLength: 500 });
        if (!msgValidation.valid) {
            return message.reply(`❌ ${msgValidation.error}`);
        }

        const reminderId = reminderManager.createReminder(
            message.author.id,
            parsed.message,
            parsed.durationMs
        );

        const dueDate = new Date(Date.now() + parsed.durationMs);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Reminder Created')
            .addFields(
                { name: 'Message', value: parsed.message },
                { name: 'Due', value: `<t:${Math.floor(dueDate.getTime() / 1000)}:R> (${dueDate.toLocaleString()})` },
                { name: 'ID', value: reminderId }
            )
            .setFooter({ text: 'You\'ll get a DM when it\'s time. Use !remind list to view or !remind delete to cancel.' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};
