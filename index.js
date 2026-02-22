require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, BaseInteraction, MessageFlags } = require('discord.js');
const CommandHandler = require('./utils/commandHandler');
const EventHandler = require('./utils/eventHandler');
const SlashCommandHandler = require('./utils/slashCommandHandler');
const settingsManager = require('./utils/settingsManager');
const languageManager = require('./utils/languageManager');
const economyManager = require('./utils/economyManager');
const moderationManager = require('./utils/moderationManager');
const gameStatsManager = require('./utils/gameStatsManager');
const statsManager = require('./utils/statsManager');
const reactionRoleManager = require('./utils/reactionRoleManager');
const starboardManager = require('./utils/starboardManager');
const customCommandManager = require('./utils/customCommandManager');
const ticketManager = require('./utils/ticketManager');
const relationshipManager = require('./utils/relationshipManager');
const databaseManager = require('./utils/databaseManager');
const analyticsManager = require('./utils/analyticsManager');
const musicPlaylistManager = require('./utils/musicPlaylistManager');
const enhancedAIManager = require('./utils/enhancedAIManager');
const levelRewardsManager = require('./utils/levelRewardsManager');
const suggestionManager = require('./utils/suggestionManager');
const shopManager = require('./utils/shopManager');
const afkManager = require('./utils/afkManager');
const voiceRewardsManager = require('./utils/voiceRewardsManager');
const raidProtectionManager = require('./utils/raidProtectionManager');
const scheduledMessagesManager = require('./utils/scheduledMessagesManager');
const birthdayManager = require('./utils/birthdayManager');
const customRoleShop = require('./utils/customRoleShop');
const activityTracker = require('./utils/activityTracker');
const serverMilestones = require('./utils/serverMilestones');
const seasonManager = require('./utils/seasonManager');
const seasonLeaderboardManager = require('./utils/seasonLeaderboardManager');
const commandPermissionsManager = require('./utils/commandPermissionsManager');
const Dashboard = require('./dashboard/server');
const { fetchMemberSafe, withTimeout } = require('./utils/discordFetch');

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

// Normalize deprecated ephemeral option to flags to avoid warnings
const normalizeEphemeralOptions = (options) => {
    if (!options || typeof options !== 'object') return options;
    if (!Object.prototype.hasOwnProperty.call(options, 'ephemeral')) return options;

    const normalized = { ...options };
    if (normalized.ephemeral) {
        const currentFlags = normalized.flags || 0;
        normalized.flags = currentFlags | MessageFlags.Ephemeral;
    }
    delete normalized.ephemeral;
    return normalized;
};

const wrapInteractionMethod = (methodName) => {
    const original = BaseInteraction.prototype[methodName];
    if (!original) return;
    BaseInteraction.prototype[methodName] = function (options, ...rest) {
        return original.call(this, normalizeEphemeralOptions(options), ...rest);
    };
};

wrapInteractionMethod('reply');
wrapInteractionMethod('deferReply');
wrapInteractionMethod('followUp');
wrapInteractionMethod('editReply');

// Initialize handlers
const commandHandler = new CommandHandler(client);
const eventHandler = new EventHandler(client);
const slashCommandHandler = new SlashCommandHandler(client);

// Load all commands and events
async function loadHandlers() {
    try {
        // Initialize database first
        await databaseManager.init();
        console.log('✅ Database manager initialized!');

        // Initialize managers first
        await settingsManager.init();
        console.log('✅ Settings manager initialized!');
        
        await languageManager.init();
        console.log('✅ Language manager initialized!');
        
        await economyManager.init();
        console.log('✅ Economy manager initialized!');
        
        await moderationManager.init();
        console.log('✅ Moderation manager initialized!');

        await commandPermissionsManager.init();
        console.log('✅ Command permissions manager initialized!');
        
        await gameStatsManager.init();
        console.log('✅ Game stats manager initialized!');

        await statsManager.init();
        console.log('✅ Stats manager initialized!');

         await levelRewardsManager.init();
        console.log('✅ Level rewards manager initialized!');
        
        await suggestionManager.init();
        console.log('✅ Suggestion manager initialized!');
        
        await shopManager.init();
        console.log('✅ Shop manager initialized!');
        
        await afkManager.init();
        console.log('✅ AFK manager initialized!');
        
        await voiceRewardsManager.init();
        console.log('✅ Voice rewards manager initialized!');
        
        await raidProtectionManager.init();
        console.log('✅ Raid protection manager initialized!');
        
        await scheduledMessagesManager.init(client);
        console.log('✅ Scheduled messages manager initialized!');

        await birthdayManager.init();
        console.log('✅ Birthday manager initialized!');

        await customRoleShop.init();
        console.log('✅ Custom role shop initialized!');

        await activityTracker.init();
        console.log('✅ Activity tracker initialized!');

        await serverMilestones.init();
        console.log('✅ Server milestones initialized!');

        await seasonManager.init();
        console.log('✅ Season manager initialized!');

        await seasonLeaderboardManager.init();
        console.log('✅ Season leaderboard manager initialized!');

        await reactionRoleManager.init();
        console.log('✅ Reaction role manager initialized!');

        await starboardManager.init();
        console.log('✅ Starboard manager initialized!');

        await customCommandManager.init();
        console.log('✅ Custom command manager initialized!');

        await ticketManager.init();
        console.log('✅ Ticket manager initialized!');

        await relationshipManager.init();
        console.log('✅ Relationship manager initialized!');

        await analyticsManager.init();
        console.log('✅ Analytics manager initialized!');

        await musicPlaylistManager.init();
        console.log('✅ Music playlist manager initialized!');

        await enhancedAIManager.init();
        console.log('✅ Enhanced AI manager initialized!');
        
        await commandHandler.loadCommands();
        await eventHandler.loadEvents();
        await slashCommandHandler.loadSlashCommands();
        console.log('✅ All handlers loaded successfully!');
    } catch (error) {
        console.error('❌ Error loading handlers:', error);
        process.exit(1);
    }
}

// Load handlers before logging in
let seasonLeaderboardTaskRunning = false;

loadHandlers().then(() => {
    // Handle messages for commands
    client.on(Events.MessageCreate, async (message) => {
        await commandHandler.handleCommand(message);
    });

    // Handle slash commands
    client.on(Events.InteractionCreate, async (interaction) => {
        await slashCommandHandler.handleInteraction(interaction);
    });

    // Login to Discord with your bot token
    client.login(process.env.DISCORD_TOKEN);

    // Start dashboard and register slash commands when bot is ready
    client.once(Events.ClientReady, async () => {
        console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
        
        // Migrate usernames in existing seasons
        const migrated = await seasonManager.migrateUsernames(client);
        if (migrated > 0) {
            console.log(`✅ Migrated ${migrated} usernames in seasons`);
        }
        
        // Register slash commands
        await slashCommandHandler.registerCommands();
        
        if (process.env.DASHBOARD_ENABLED === 'true') {
            const dashboard = new Dashboard(client);
            dashboard.start();
        }

        // Start season leaderboard update task (runs every minute, respects per-guild interval)
        setInterval(async () => {
            if (seasonLeaderboardTaskRunning) return;
            seasonLeaderboardTaskRunning = true;
            try {
                await updateSeasonLeaderboards(client);
            } finally {
                seasonLeaderboardTaskRunning = false;
            }
        }, 60 * 1000); // 1 minute

        // Initial update
        if (!seasonLeaderboardTaskRunning) {
            seasonLeaderboardTaskRunning = true;
            try {
                await updateSeasonLeaderboards(client);
            } finally {
                seasonLeaderboardTaskRunning = false;
            }
        }
    });
});

/**
 * Update season leaderboards in all configured channels
 * @param {Client} client - Discord client
 */
async function updateSeasonLeaderboards(client) {
    try {
        const guildConfigs = seasonLeaderboardManager.config;

        for (const guildId in guildConfigs) {
            const config = guildConfigs[guildId];
            if (!config.channelId) continue;

            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(config.channelId);
            if (!channel || !channel.isTextBased()) continue;

            const seasonName = seasonManager.getCurrentSeason(guildId);
            if (!seasonName) continue;

            const cfg = seasonLeaderboardManager.getGuildConfig(guildId);
            if (!cfg.enabled) continue;
            const now = Date.now();
            const intervalMs = (cfg.updateIntervalMinutes || 15) * 60 * 1000;
            if (now - (cfg.lastAutoUpdate || 0) < intervalMs) {
                continue;
            }

            // Refresh season stats from live economy/game data
            await seasonManager.refreshSeasonStats(
                guildId,
                seasonName,
                (userId) => ({
                    username: guild.members.cache.get(userId)?.user.username || 'Unknown User',
                    balance: economyManager.getUserData(guildId, userId).balance,
                    xp: economyManager.getUserData(guildId, userId).xp,
                    level: economyManager.getUserData(guildId, userId).level,
                    seasonalCoins: economyManager.getUserData(guildId, userId).seasonalCoins,
                    gambling: gameStatsManager.getStats(userId)
                })
            );

            // Prune inactive players
            await seasonManager.pruneInactivePlayers(guildId, seasonName, cfg.pruneDays || 30);

            try {
                const season = seasonManager.getSeason(guildId, seasonName);
                if (season && !season.isActive && !season.summaryPosted) {
                    const winners = seasonManager.getSeasonLeaderboard(guildId, seasonName, 'balance', 3);
                    const payouts = cfg.payouts || [];
                    const rewardRoles = cfg.rewardRoles || [];

                    for (let i = 0; i < winners.length; i++) {
                        const winner = winners[i];
                        const payout = payouts[i] || 0;
                        if (payout > 0) {
                            await economyManager.addBalance(guildId, winner.userId, payout);
                        }

                        const roleId = rewardRoles[i];
                        if (roleId) {
                            const member = await fetchMemberSafe(guild, winner.userId);
                            const role = guild.roles.cache.get(roleId);
                            if (member && role) {
                                await member.roles.add(role).catch(() => null);
                            }
                        }
                    }

                    const summaryEmbed = await seasonLeaderboardManager.generateSeasonSummaryEmbed(guildId, seasonManager, seasonName);
                    if (summaryEmbed) {
                        await channel.send({ embeds: [summaryEmbed] });
                        await seasonManager.markSeasonSummaryPosted(guildId, seasonName);
                    }
                }

                const embeds = await seasonLeaderboardManager.generateSeasonEmbeds(guildId, seasonManager, seasonName, client);
                
                if (embeds.length === 0) continue;

                const existingMessageId = seasonLeaderboardManager.getLeaderboardMessage(guildId);
                const totalPages = embeds.length;
                const components = totalPages > 1
                    ? [buildLeaderboardPageComponents(guildId, 0, totalPages)]
                    : [];

                let leaderboardMessage = null;
                let messageEdited = false;

                // Try to edit existing message
                if (existingMessageId) {
                    try {
                        const msg = await withTimeout(channel.messages.fetch(existingMessageId), 5000);
                        if (msg) {
                            await withTimeout(msg.edit({ embeds: [embeds[0]], components }), 5000);
                            leaderboardMessage = msg;
                            messageEdited = true;
                            console.log(`✅ Edited existing leaderboard message ${existingMessageId} for guild ${guildId}`);
                        }
                    } catch (error) {
                        console.warn(`Could not fetch/edit message ${existingMessageId}: ${error.message}`);
                    }
                }

                // If couldn't edit, create new message
                if (!leaderboardMessage) {
                    try {
                        leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
                        console.log(`✅ Created new leaderboard message ${leaderboardMessage.id} for guild ${guildId}`);
                    } catch (error) {
                        console.error(`Failed to send leaderboard message for guild ${guildId}:`, error);
                        continue;
                    }
                }

                // Always save the messageId for next cycle
                cfg.messageId = leaderboardMessage.id;
                cfg.lastAutoUpdate = Date.now();
                await seasonLeaderboardManager.save();
                seasonLeaderboardManager.setPageCache(guildId, {
                    embeds,
                    messageId: leaderboardMessage.id,
                    channelId: channel.id
                });

                if (messageEdited) {
                    console.log(`✅ Updated leaderboard message for guild ${guildId}`);
                } else {
                    console.log(`✅ Created new leaderboard message for guild ${guildId}`);
                }
            } catch (error) {
                console.error(`Error updating leaderboards for guild ${guildId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in leaderboard update task:', error);
    }
}

function buildLeaderboardPageComponents(guildId, page, totalPages) {
    const prevPage = Math.max(0, page - 1);
    const nextPage = Math.min(totalPages - 1, page + 1);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${prevPage}`)
            .setLabel('⬅️ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${nextPage}`)
            .setLabel('Next ➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`lb_page:${guildId}:${page}`)
            .setLabel(`Page ${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
    );
}