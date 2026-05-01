const { fetch } = require('undici');

module.exports = {
    name: 'refreshicon',
    description: 'Refresh the bot avatar using an attached image or direct image URL.',
    usage: '!refreshicon <image-url> or attach an image',
    aliases: ['boticon', 'refreshavatar', 'setboticon'],
    category: 'admin',
    async execute(message, args, client) {
        const botOwnerId = process.env.BOT_OWNER_ID;
        if (!botOwnerId) {
            return message.reply('❌ BOT_OWNER_ID is not configured, so this owner-only command is disabled.');
        }

        const isOwner = message.author.id === botOwnerId;

        if (!isOwner) {
            return message.reply('❌ Only the bot owner can refresh the bot icon.');
        }

        const attachment = message.attachments.first();
        const imageSource = args[0] || attachment?.url;

        if (!imageSource) {
            return message.reply('❌ Provide a direct image URL or attach an image.');
        }

        const isDirectImageUrl = /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(imageSource);
        const isImageAttachment = Boolean(attachment) && (
            String(attachment.contentType || '').startsWith('image/') ||
            /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(String(attachment.url || ''))
        );

        if (!isDirectImageUrl && !isImageAttachment) {
            return message.reply('❌ The icon must be a direct image URL or an image attachment.');
        }

        try {
            const response = await fetch(imageSource);
            if (!response.ok) {
                return message.reply(`❌ Could not download the image. HTTP ${response.status}.`);
            }

            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (!contentType.startsWith('image/')) {
                return message.reply('❌ The provided URL did not return an image.');
            }

            const imageBuffer = Buffer.from(await response.arrayBuffer());

            await client.user.setAvatar(imageBuffer);
            await client.user.fetch(true);

            return message.reply({
                content: `✅ Bot icon refreshed successfully.\n${client.user.displayAvatarURL({ size: 256, extension: 'png' })}`
            });
        } catch (error) {
            console.error('Error refreshing bot icon:', error);
            return message.reply(`❌ Failed to refresh the bot icon: ${error.message}`);
        }
    }
};