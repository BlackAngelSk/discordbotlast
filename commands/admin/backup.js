const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'backup',
    description: 'Create a backup of all bot data (Admin only)',
    usage: '!backup',
    aliases: ['savedata'],
    category: 'admin',
    async execute(message, args) {
        try {
            // Check permissions
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ You need "Administrator" permission!');
            }

            const dataDir = path.join(__dirname, '../../data');
            const backupDir = path.join(__dirname, '../../backups');

            // Create backups directory if doesn't exist
            await fs.mkdir(backupDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `backup_${timestamp}`);
            await fs.mkdir(backupPath, { recursive: true });

            // Copy all JSON files
            const files = await fs.readdir(dataDir);
            let backupCount = 0;

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const source = path.join(dataDir, file);
                    const dest = path.join(backupPath, file);
                    await fs.copyFile(source, dest);
                    backupCount++;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Backup Created')
                .addFields(
                    { name: 'Files Backed Up', value: `${backupCount}`, inline: true },
                    { name: 'Backup Time', value: timestamp, inline: true },
                    { name: 'Location', value: '`/backups/`', inline: false }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in backup command:', error);
            message.reply('❌ An error occurred while creating backup!');
        }
    }
};
