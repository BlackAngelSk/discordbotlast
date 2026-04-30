const { EmbedBuilder } = require('discord.js');
const liveAlertsManager = require('../../utils/liveAlertsManager');

module.exports = {
    name: 'livealerts',
    description: 'Manage Twitch live and YouTube new video notifications.',
    usage: '!livealerts add twitch <username> #channel [@role]\n!livealerts add youtube <channelId> #channel [@role]\n!livealerts remove twitch <username>\n!livealerts remove youtube <channelId>\n!livealerts list',
    aliases: ['streamalert', 'streamalerts'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply('❌ You need **Manage Server** permission.');
        }

        const sub = args[0]?.toLowerCase();

        // ── list ──────────────────────────────────────────────────────────────
        if (!sub || sub === 'list') {
            const cfg = liveAlertsManager.getAlerts(message.guild.id);
            const embed = new EmbedBuilder()
                .setTitle('📡 Live Stream Alerts')
                .setColor(0x5865f2)
                .setTimestamp();

            if (cfg.twitch.length === 0 && cfg.youtube.length === 0) {
                embed.setDescription('No live alerts configured. Use `!livealerts add` to add one.');
            } else {
                if (cfg.twitch.length > 0) {
                    embed.addFields({
                        name: '🟣 Twitch',
                        value: cfg.twitch.map(e =>
                            `• **${e.username}** → <#${e.channelId}>${e.roleId ? ` <@&${e.roleId}>` : ''}`
                        ).join('\n')
                    });
                }
                if (cfg.youtube.length > 0) {
                    embed.addFields({
                        name: '🔴 YouTube',
                        value: cfg.youtube.map(e =>
                            `• \`${e.channelId}\` → <#${e.discordChannelId}>${e.roleId ? ` <@&${e.roleId}>` : ''}`
                        ).join('\n')
                    });
                }
            }
            return message.reply({ embeds: [embed] });
        }

        // ── add ───────────────────────────────────────────────────────────────
        if (sub === 'add') {
            const platform = args[1]?.toLowerCase();
            if (!platform || !['twitch', 'youtube'].includes(platform)) {
                return message.reply('❌ Specify platform: `twitch` or `youtube`.');
            }

            const identifier = args[2];
            if (!identifier) {
                return message.reply(`❌ Provide the ${platform === 'twitch' ? 'Twitch username' : 'YouTube channel ID'}.`);
            }

            const discordChannel = message.mentions.channels.first()
                || (args[3]?.match(/^\d{17,19}$/) && message.guild.channels.cache.get(args[3]));
            if (!discordChannel) {
                return message.reply('❌ Mention the Discord channel to post alerts in (e.g. `#stream-alerts`).');
            }

            const roleMention = message.mentions.roles.first() || null;
            const roleId = roleMention?.id || null;

            if (platform === 'twitch') {
                await liveAlertsManager.addTwitchAlert(message.guild.id, identifier, discordChannel.id, roleId);
                const missingTwitchConfig = !process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET;
                const embed = new EmbedBuilder()
                    .setColor(0x9146ff)
                    .setTitle('✅ Twitch Alert Added')
                    .setDescription(`Now watching **${identifier}** on Twitch.\nAlerts will post to ${discordChannel}${roleId ? ` with ping <@&${roleId}>` : ''}.${missingTwitchConfig ? '\n\n⚠️ Twitch API credentials are not configured yet, so messages will not send until they are added to the env file.' : ''}`)
                    .setFooter({ text: 'Checked immediately and every 5 minutes' });
                return message.reply({ embeds: [embed] });
            }

            if (platform === 'youtube') {
                await liveAlertsManager.addYouTubeAlert(message.guild.id, identifier, discordChannel.id, roleId);
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('✅ YouTube Alert Added')
                    .setDescription(`Now watching channel ID \`${identifier}\` on YouTube for new uploads.\nAlerts will post to ${discordChannel}${roleId ? ` with ping <@&${roleId}>` : ''}.`)
                    .setFooter({ text: 'Checked every 5 minutes' });
                return message.reply({ embeds: [embed] });
            }
        }

        // ── remove ────────────────────────────────────────────────────────────
        if (sub === 'remove') {
            const platform = args[1]?.toLowerCase();
            const identifier = args[2];
            if (!platform || !identifier) {
                return message.reply('❌ Usage: `!livealerts remove <twitch|youtube> <username|channelId>`');
            }
            if (platform === 'twitch') {
                await liveAlertsManager.removeTwitchAlert(message.guild.id, identifier);
                return message.reply(`✅ Removed Twitch alert for **${identifier}**.`);
            }
            if (platform === 'youtube') {
                await liveAlertsManager.removeYouTubeAlert(message.guild.id, identifier);
                return message.reply(`✅ Removed YouTube alert for \`${identifier}\`.`);
            }
            return message.reply('❌ Unknown platform. Use `twitch` or `youtube`.');
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};
