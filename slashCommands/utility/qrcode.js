const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const QRCode = require('qrcode');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qrcode')
        .setDescription('Generate a QR code from text or URL')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text or URL to encode')
                .setRequired(true)
                .setMaxLength(2048)),

    async execute(interaction) {
        const text = interaction.options.getString('text');

        try {
            await interaction.deferReply();

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
                .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error('Error generating QR code:', error);
            await interaction.editReply({ content: '❌ Failed to generate QR code. Please try again with different text.', flags: MessageFlags.Ephemeral });
        }
    }
};