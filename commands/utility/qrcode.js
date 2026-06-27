const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const QRCode = require('qrcode');

module.exports = {
    name: 'qrcode',
    description: 'Generate a QR code from text or URL',
    aliases: ['qr'],
    usage: '!qrcode <text or URL>',
    async execute(message, args, client) {
        const text = args.join(' ');

        if (!text) {
            return message.reply('❌ Please provide text or a URL to generate a QR code.\n**Usage:** `!qrcode <text or URL>`');
        }

        if (text.length > 2048) {
            return message.reply('❌ Text is too long. Maximum 2048 characters allowed.');
        }

        try {
            const buffer = await QRCode.toBuffer(text, {
                type: 'png',
                width: 512,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📱 QR Code Generated')
                .setDescription(`QR code for: **${text.length > 100 ? text.substring(0, 100) + '...' : text}**`)
                .setImage('attachment://qrcode.png')
                .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await message.reply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error('Error generating QR code:', error);
            await message.reply('❌ Failed to generate QR code. Please try again with different text.');
        }
    }
};