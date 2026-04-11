const { EmbedBuilder } = require('discord.js');
const aiManager = require('../../utils/enhancedAIManager');

module.exports = {
    name: 'aipersona',
    description: 'Set a custom AI persona/personality for this server.',
    usage: '!aipersona set <name> | <personality>\n!aipersona remove\n!aipersona view',
    aliases: ['persona', 'aiconfig'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        if (!sub || sub === 'view') {
            const persona = aiManager.getPersona(guildId);
            if (!persona) {
                return message.reply('No custom AI persona set for this server. The bot uses its default personality.\nUse `!aipersona set <name> | <personality>` to set one.');
            }
            const embed = new EmbedBuilder()
                .setTitle('🤖 AI Persona')
                .setColor(0x5865f2)
                .addFields(
                    { name: 'Name', value: persona.name, inline: true },
                    { name: 'Personality', value: persona.personality }
                );
            return message.reply({ embeds: [embed] });
        }

        if (sub === 'set') {
            // Format: !aipersona set Name | personality description
            const fullText = args.slice(1).join(' ');
            const parts = fullText.split('|');
            if (parts.length < 2) {
                return message.reply('❌ Format: `!aipersona set <name> | <personality>`\nExample: `!aipersona set Alex | You are Alex, a sarcastic but helpful assistant who loves gaming.`');
            }
            const name = parts[0].trim();
            const personality = parts.slice(1).join('|').trim();
            if (!name || !personality) {
                return message.reply('❌ Both name and personality are required.');
            }

            await aiManager.setPersona(guildId, name.slice(0, 50), personality.slice(0, 500));

            const embed = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ AI Persona Set')
                .addFields(
                    { name: 'Name', value: name.slice(0, 50), inline: true },
                    { name: 'Personality', value: personality.slice(0, 500) }
                )
                .setFooter({ text: 'The AI will now use this persona for responses in this server' });
            return message.reply({ embeds: [embed] });
        }

        if (sub === 'remove' || sub === 'reset') {
            await aiManager.removePersona(guildId);
            return message.reply('✅ AI persona removed. The bot will use its default personality.');
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};
