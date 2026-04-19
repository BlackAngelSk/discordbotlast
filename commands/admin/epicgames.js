const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const epicGamesAlertsManager = require('../../utils/epicGamesAlertsManager');

module.exports = {
    name: 'epicgames',
    description: 'Configure Epic Games Store current free game alerts.',
    usage: '!epicgames list\n!epicgames set #channel\n!epicgames remove\n!epicgames test [#channel]',
    aliases: ['egs', 'epicalert', 'epicgamesalert'],
    category: 'admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission to use this command.');
        }

        const subcommand = args[0]?.toLowerCase() || 'list';
        const config = epicGamesAlertsManager.getGuildConfig(message.guild.id);

        if (subcommand === 'list' || subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(0x313131)
                .setTitle('🎮 Epic Games Store Alerts')
                .setTimestamp();

            if (!config?.channelId) {
                embed.setDescription('No alert channel is configured. Use `!epicgames set #channel` to enable alerts.');
            } else {
                embed.setDescription(`Alerts are enabled in <#${config.channelId}>.`)
                    .addFields(
                        {
                            name: 'What gets posted',
                            value: '• When a game becomes free on Epic Games Store right now'
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
                return message.reply('❌ Mention a valid text channel, for example `!epicgames set #game-alerts`.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The Epic Games alert channel must be a text channel.');
            }

            const botMember = message.guild.members.me;
            if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
                return message.reply(`❌ I need **Send Messages** and **Embed Links** in ${channel}.`);
            }

            const snapshot = await epicGamesAlertsManager.enableAlerts(message.guild.id, channel.id);
            const currentNames = snapshot?.currentOffers?.map(offer => `**${offer.title}**`).join(', ') || 'none right now';

            return message.reply(
                `✅ Epic Games alerts will now be sent to ${channel}. Current free games: ${currentNames}.`
            );
        }

        if (subcommand === 'remove' || subcommand === 'clear' || subcommand === 'disable') {
            await epicGamesAlertsManager.disableAlerts(message.guild.id);
            return message.reply('✅ Epic Games alerts have been disabled for this server.');
        }

        if (subcommand === 'test') {
            const channel = message.mentions.channels.first()
                || (config?.channelId ? message.guild.channels.cache.get(config.channelId) : null)
                || message.channel;

            if (!channel?.isTextBased()) {
                return message.reply('❌ I could not find a valid text channel for the test alert.');
            }

            const snapshot = await epicGamesAlertsManager.fetchSnapshot();
            const payloads = [epicGamesAlertsManager.buildCurrentAlert(snapshot)].filter(Boolean);

            if (payloads.length === 0) {
                return message.reply('❌ Epic Games did not return any free game offers right now.');
            }

            for (const payload of payloads) {
                for (const messagePayload of payload.messages) {
                    await channel.send(messagePayload);
                }
            }

            return message.reply(`✅ Sent a test Epic Games alert to ${channel}.`);
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};