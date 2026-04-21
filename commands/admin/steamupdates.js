const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const steamGameUpdatesManager = require('../../utils/steamGameUpdatesManager');

module.exports = {
    name: 'steamupdates',
    description: 'Configure game update and changelog alerts for Steam, Minecraft, and osu.',
    usage: '!steamupdates list\n!steamupdates search <steam game name>\n!steamupdates set #channel <appId|storeUrl|minecraft|osu, ...>\n!steamupdates remove\n!steamupdates test [#channel]',
    aliases: ['steamupdate', 'steamalerts', 'steamgames'],
    category: 'admin',
    async execute(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ You need **Manage Server** permission to use this command.');
        }

        const subcommand = args[0]?.toLowerCase() || 'list';
        const config = steamGameUpdatesManager.getGuildConfig(message.guild.id);

        if (subcommand === 'list' || subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle('🎮 Game Update Alerts')
                .setTimestamp();

            if (!config?.channelId) {
                embed.setDescription('No game update alert channel is configured. Use `!steamupdates set #channel 730, minecraft, osu` to enable alerts.');
            } else {
                const trackedGames = Array.isArray(config.trackedGames) ? config.trackedGames : [];
                embed.setDescription(`Alerts are enabled in <#${config.channelId}>.`)
                    .addFields(
                        {
                            name: 'Tracked games',
                            value: trackedGames.length > 0
                                ? trackedGames.slice(0, 10).map(game => {
                                    if (game.provider === 'steam') {
                                        return `• **${game.name || `App ${game.appId}`}** (Steam ${game.appId})`;
                                    }

                                    return `• **${game.name}** (${game.providerLabel || game.provider})`;
                                }).join('\n')
                                : 'No games saved yet'
                        },
                        {
                            name: 'Last checked',
                            value: config.lastCheckedAt ? `<t:${Math.floor(new Date(config.lastCheckedAt).getTime() / 1000)}:R>` : 'Not checked yet'
                        }
                    );

                if (trackedGames.length > 10) {
                    embed.addFields({
                        name: 'More games',
                        value: `And ${trackedGames.length - 10} more tracked game sources.`
                    });
                }
            }

            return message.reply({ embeds: [embed] });
        }

        if (subcommand === 'search') {
            const query = args.slice(1).join(' ').trim();
            if (query.length < 2) {
                return message.reply('❌ Provide a Steam game name to search, for example `!steamupdates search counter-strike`.');
            }

            const results = await steamGameUpdatesManager.searchStoreGames(query);
            if (results.length === 0) {
                return message.reply('❌ No Steam games matched that search.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x1b2838)
                .setTitle(`🔎 Steam Search: ${query}`)
                .setDescription(results.map(game => `• **${game.name}** - App ID: \`${game.appId}\``).join('\n'))
                .setFooter({ text: 'Use the app ID with !steamupdates set #channel <appId, minecraft, osu>' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (subcommand === 'set') {
            const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
            if (!channel) {
                return message.reply('❌ Mention a valid text channel, for example `!steamupdates set #game-updates 730, minecraft, osu`.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The game update alert channel must be a text channel.');
            }

            const botMember = message.guild.members.me;
            if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
                return message.reply(`❌ I need **Send Messages** and **Embed Links** in ${channel}.`);
            }

            const rawGames = args.slice(2).join(' ').trim();
            if (!rawGames) {
                return message.reply('❌ Add at least one Steam app ID, store URL, `minecraft`, or `osu` after the channel.');
            }

            const result = await steamGameUpdatesManager.updateGuildConfig(message.guild.id, channel.id, rawGames);
            const trackedNames = result.trackedGames.map(game => `**${game.name}**`).join(', ');

            return message.reply(
                `✅ Game update alerts will now be sent to ${channel}. Tracking: ${trackedNames}.`
            );
        }

        if (subcommand === 'remove' || subcommand === 'clear' || subcommand === 'disable') {
            await steamGameUpdatesManager.disableAlerts(message.guild.id);
            return message.reply('✅ Game update alerts have been disabled for this server.');
        }

        if (subcommand === 'test') {
            const channel = message.mentions.channels.first()
                || (config?.channelId ? message.guild.channels.cache.get(config.channelId) : null)
                || message.channel;

            if (!channel?.isTextBased()) {
                return message.reply('❌ I could not find a valid text channel for the test alert.');
            }

            const payloads = await steamGameUpdatesManager.buildTestAlerts(message.guild.id);
            if (payloads.length === 0) {
                return message.reply('❌ No recent updates were returned for the tracked games.');
            }

            for (const payload of payloads) {
                await channel.send(payload);
            }

            return message.reply(`✅ Sent a test game update alert to ${channel}.`);
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};