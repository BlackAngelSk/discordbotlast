const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const steamFreeGamesAlertsManager = require('../../utils/steamFreeGamesAlertsManager');

module.exports = {
    name: 'steamfreegames',
    description: 'Configure Steam free game giveaway alerts.',
    usage: '!steamfreegames list\n!steamfreegames set #channel\n!steamfreegames remove\n!steamfreegames test [#channel]\n!steamfreegames forcecheck',
    aliases: ['steamgifts', 'steamgiveaways', 'steamfreealerts'],
    category: 'admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission to use this command.');
        }

        const subcommand = args[0]?.toLowerCase() || 'list';
        const config = steamFreeGamesAlertsManager.getGuildConfig(message.guild.id);

        if (subcommand === 'list' || subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle('🎮 Steam Free Game Alerts')
                .setTimestamp();

            if (!config?.channelId) {
                embed.setDescription('No alert channel is configured. Use `!steamfreegames set #channel` to enable alerts.');
            } else {
                embed.setDescription(`Alerts are enabled in <#${config.channelId}>.`)
                    .addFields(
                        {
                            name: 'What gets posted',
                            value: '• Newly detected free Steam game giveaways'
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
                return message.reply('❌ Mention a valid text channel, for example `!steamfreegames set #game-alerts`.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The Steam free game alert channel must be a text channel.');
            }

            const botMember = message.guild.members.me;
            if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
                return message.reply(`❌ I need **Send Messages** and **Embed Links** in ${channel}.`);
            }

            const snapshot = await steamFreeGamesAlertsManager.enableAlerts(message.guild.id, channel.id);
            const currentNames = snapshot?.freeToKeepGiveaways?.map(giveaway => `**${giveaway.title}**`).join(', ') || 'none right now';

            return message.reply(
                `✅ Steam free game alerts will now be sent to ${channel}. Current giveaways: ${currentNames}.`
            );
        }

        if (subcommand === 'remove' || subcommand === 'clear' || subcommand === 'disable') {
            await steamFreeGamesAlertsManager.disableAlerts(message.guild.id);
            return message.reply('✅ Steam free game alerts have been disabled for this server.');
        }

        if (subcommand === 'test') {
            const channel = message.mentions.channels.first()
                || (config?.channelId ? message.guild.channels.cache.get(config.channelId) : null)
                || message.channel;

            if (!channel?.isTextBased()) {
                return message.reply('❌ I could not find a valid text channel for the test alert.');
            }

            const snapshot = await steamFreeGamesAlertsManager.fetchSnapshot();
            const payloads = [steamFreeGamesAlertsManager.buildCurrentAlert(snapshot)].filter(Boolean);

            if (payloads.length === 0) {
                return message.reply('❌ No free Steam game giveaways were returned right now.');
            }

            for (const payload of payloads) {
                for (const messagePayload of payload.messages) {
                    await channel.send(messagePayload);
                }
            }

            return message.reply(`✅ Sent a test Steam free game alert to ${channel}.`);
        }

        if (subcommand === 'forcecheck' || subcommand === 'force' || subcommand === 'checknow') {
            if (!config?.channelId) {
                return message.reply('❌ Steam free game alerts are not enabled yet. Use `!steamfreegames set #channel` first.');
            }

            await message.reply('🔄 Running Steam free game force check now... (can take up to 90s)');

            try {
                const snapshot = await steamFreeGamesAlertsManager.forceCheckNow();
                const total = snapshot?.freeToKeepGiveaways?.length || 0;
                return message.channel.send(`✅ Force check complete. Tracking ${total} active free-to-keep Steam giveaway(s).`);
            } catch (error) {
                if (error?.code === 'STEAM_FORCE_CHECK_TIMEOUT') {
                    return message.channel.send('⚠️ Force check timed out. The data source was too slow or unresponsive. Try again in a minute.');
                }

                console.error('Steam free games force check failed:', error);
                return message.channel.send('❌ Force check failed due to an internal error. Check logs and try again.');
            }
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};