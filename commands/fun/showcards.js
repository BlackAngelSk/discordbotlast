const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { SUITS, RANKS } = require('../../utils/playingCards');
const { generateCardImages } = require('../../utils/cardImageGenerator');

module.exports = {
    name: 'showcards',
    description: 'TEMP: Show all 52 playing cards used by poker',
    usage: '!showcards | !showcards text | !showcards images',
    aliases: ['cards', 'deck'],
    category: 'fun',
    async execute(message, args = []) {
        const mode = (args[0] || '').toLowerCase();
        const outputDir = path.join(__dirname, '..', '..', 'assets', 'cards');

        if (mode === 'images' || mode === 'img' || mode === 'generate') {
            const result = await generateCardImages(outputDir);

            const previews = ['AS.svg', 'KH.svg', 'QD.svg', 'JC.svg', '10S.svg', 'BACK.svg']
                .map(file => new AttachmentBuilder(path.join(outputDir, file), { name: file }));

            const previewEmbed = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle('🖼️ Card Images Generated')
                .setDescription('Generated all card image files as SVG.')
                .addFields(
                    { name: 'Output Folder', value: 'assets/cards', inline: false },
                    { name: 'Files Created', value: `${result.totalWithExtras} (${result.count} cards + back + sheet)`, inline: true },
                    { name: 'Preview', value: 'Attached a few sample files.', inline: true }
                )
                .setFooter({ text: 'Use these SVGs in embeds, web dashboard, or future card rendering commands.' })
                .setTimestamp();

            return message.reply({ embeds: [previewEmbed], files: previews });
        }

        if (!mode || mode === 'sheet' || mode === 'gallery') {
            await generateCardImages(outputDir);
            const sheet = new AttachmentBuilder(path.join(outputDir, 'DECK_SHEET.svg'), { name: 'DECK_SHEET.svg' });

            const sheetEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('🖼️ Poker Deck Sheet')
                .setDescription('Using generated card images (all 52 cards)')
                .setImage('attachment://DECK_SHEET.svg')
                .setFooter({ text: 'Use !showcards text for v1 list, or !showcards images to regenerate files.' })
                .setTimestamp();

            return message.reply({ embeds: [sheetEmbed], files: [sheet] });
        }

        if (mode !== 'text') {
            return message.reply('❌ Unknown option. Use `!showcards`, `!showcards text`, or `!showcards images`.');
        }

        const suitOrder = ['♠', '♥', '♦', '♣'];
        const suitNames = {
            '♠': 'Spades',
            '♥': 'Hearts',
            '♦': 'Diamonds',
            '♣': 'Clubs'
        };

        const suits = suitOrder.filter(s => SUITS.includes(s));
        const fields = suits.map((suit) => {
            const cards = RANKS.map(rank => `\`${rank}${suit}\``).join(' ');
            return {
                name: `${suit} ${suitNames[suit]}`,
                value: cards,
                inline: false
            };
        });

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('🃏 Poker Deck (52 Cards)')
            .setDescription('Temporary debug command: all cards currently used by poker.\nStyled as clean rank+suit chips for better readability.')
            .addFields(fields)
            .setFooter({ text: `Total cards: ${RANKS.length * suits.length}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};
