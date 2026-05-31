const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const steamFreeGamesAlertsManager = require('../../utils/steamFreeGamesAlertsManager');

module.exports = {
    name: 'steampromos',
    description: 'Configure Steam limited-time promo game alerts.',
    usage: '!steampromos list\n!steampromos set #channel\n!steampromos remove\n!steampromos test [#channel]',
    aliases: ['steampromoalerts', 'steamfreeweekend'],
    category: 'admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission to use this command.');
        }

        const subcommand = args[0]?.toLowerCase() || 'list';
        const config = steamFreeGamesAlertsManager.getPromoGuildConfig(message.guild.id);

        if (subcommand === 'list' || subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(0xf4a318)
                .setTitle('🕹️ Steam Promo Game Alerts')
                .setTimestamp();

            if (!config?.channelId) {
                embed.setDescription('No alert channel is configured. Use `!steampromos set #channel` to enable alerts for limited-time free-to-play Steam games.');
            } else {
                embed.setDescription(`Alerts are enabled in <#${config.channelId}>.`)
                    .addFields(
                        {
                            name: 'What gets posted',
                            value: '• Steam games available free for a limited time (free weekends, trials, promos)'
                        },
                        {
                            name: 'Last checked',
                            value: config.lastCheckedAt ? `<t:${Math.floor(new Date(config.lastCheckedAt).getTime() / 1000)}:R>` : 'Not checked yet'
                        }
                    );
            }

            return message.reply({ embeds: [embed] });
        }

        if (subcommand === 'set') {
            const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
            if (!channel) {
                return message.reply('❌ Mention a valid text channel, for example `!steampromos set #game-alerts`.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The Steam promo alert channel must be a text channel.');
            }

            const botMember = message.guild.members.me;
            if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
                return message.reply(`❌ I need **Send Messages** and **Embed Links** in ${channel}.`);
            }

            const snapshot = await steamFreeGamesAlertsManager.enablePromoAlerts(message.guild.id, channel.id);
            const currentNames = snapshot?.promoGiveaways?.map(g => `**${g.title}**`).join(', ') || 'none right now';

            return message.reply(
                `✅ Steam promo game alerts will now be sent to ${channel}. Current promos: ${currentNames}.`
            );
        }

        if (subcommand === 'remove' || subcommand === 'clear' || subcommand === 'disable') {
            await steamFreeGamesAlertsManager.disablePromoAlerts(message.guild.id);
            return message.reply('✅ Steam promo game alerts have been disabled for this server.');
        }

        if (subcommand === 'test') {
            const channel = message.mentions.channels.first()
                || (config?.channelId ? message.guild.channels.cache.get(config.channelId) : null)
                || message.channel;

            if (!channel?.isTextBased()) {
                return message.reply('❌ I could not find a valid text channel for the test alert.');
            }

            const snapshot = await steamFreeGamesAlertsManager.fetchSnapshot();
            const payload = steamFreeGamesAlertsManager.buildPromoAlert(snapshot);

            if (!payload) {
                return message.reply('❌ No Steam promo games are available right now.');
            }

            for (const messagePayload of payload.messages) {
                await channel.send(messagePayload);
            }

            return message.reply(`✅ Sent a test Steam promo alert to ${channel}.`);
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};
