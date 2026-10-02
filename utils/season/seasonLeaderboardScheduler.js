/**
 * Season leaderboard scheduler — extracted from index.js (Phase 4).
 *
 * Owns the per-guild leaderboard update state machine (scheduling timestamps,
 * in-memory last-run tracking, message edit/create) plus the pagination
 * buttons for the leaderboard message.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchMemberSafe, withTimeout } = require('../core/discordFetch');

let seasonLeaderboardTaskRunning = false;
const seasonLeaderboardLastRunByGuild = new Map();

/**
 * Run one leaderboard sync pass, guarded against overlapping runs.
 *
 * @param {import('discord.js').Client} client
 * @param {{ lazyLoadManager: Function, devModeEnabled: boolean }} deps
 * @returns {Promise<boolean>} true if a pass ran, false if already running
 */
async function runLeaderboardUpdate(client, deps) {
  if (seasonLeaderboardTaskRunning) return false;
  seasonLeaderboardTaskRunning = true;
  try {
    await updateSeasonLeaderboards(client, deps);
    return true;
  } finally {
    seasonLeaderboardTaskRunning = false;
  }
}

/**
 * Update season leaderboards in all configured channels.
 *
 * @param {import('discord.js').Client} client
 * @param {{ lazyLoadManager: Function, devModeEnabled: boolean }} deps
 */
async function updateSeasonLeaderboards(client, { lazyLoadManager, devModeEnabled }) {
  if (devModeEnabled) {
    return;
  }

  try {
    const slm = lazyLoadManager('seasonLeaderboardManager');
    const sm = lazyLoadManager('seasonManager');
    const em = lazyLoadManager('economyManager');
    const gsm = lazyLoadManager('gameStatsManager');

    const guildConfigs = slm.config;
    let schedulerStateChanged = false;

    for (const guildId in guildConfigs) {
      const config = guildConfigs[guildId];
      if (!config.channelId) continue;

      const guild =
        client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) continue;

      const channel =
        guild.channels.cache.get(config.channelId) ||
        (await guild.channels.fetch(config.channelId).catch(() => null));
      if (!channel || !channel.isTextBased()) continue;

      const seasonName = sm.getCurrentSeason(guildId);
      if (!seasonName) continue;

      const cfg = slm.getGuildConfig(guildId);
      if (!cfg.enabled) continue;
      const now = Date.now();
      const intervalMs = (cfg.updateIntervalMinutes || 15) * 60 * 1000;
      let nextAutoUpdateAt = Number(cfg.nextAutoUpdateAt) || 0;
      const existingMessageId = slm.getLeaderboardMessage(guildId);
      const inMemoryLastAutoUpdate = Number(seasonLeaderboardLastRunByGuild.get(guildId)) || 0;

      // Handle bad host clock / future timestamps so updates don't get stuck forever
      if ((cfg.lastAutoUpdate || 0) > now + 5 * 60 * 1000) {
        cfg.lastAutoUpdate = 0;
        cfg.nextAutoUpdateAt = 0;
        nextAutoUpdateAt = 0;
        schedulerStateChanged = true;
      }

      if (!nextAutoUpdateAt && (cfg.lastAutoUpdate || 0) > 0) {
        const computedNextAutoUpdateAt = Number(cfg.lastAutoUpdate) + intervalMs;
        if (computedNextAutoUpdateAt > now) {
          cfg.nextAutoUpdateAt = computedNextAutoUpdateAt;
          nextAutoUpdateAt = computedNextAutoUpdateAt;
          schedulerStateChanged = true;
        }
      }

      if (inMemoryLastAutoUpdate > 0) {
        const effectiveLastAutoUpdate = Math.max(
          Number(cfg.lastAutoUpdate) || 0,
          inMemoryLastAutoUpdate
        );
        if (effectiveLastAutoUpdate !== (Number(cfg.lastAutoUpdate) || 0)) {
          cfg.lastAutoUpdate = effectiveLastAutoUpdate;
          schedulerStateChanged = true;
        }

        if (!nextAutoUpdateAt || nextAutoUpdateAt < effectiveLastAutoUpdate + intervalMs) {
          cfg.nextAutoUpdateAt = effectiveLastAutoUpdate + intervalMs;
          nextAutoUpdateAt = cfg.nextAutoUpdateAt;
          schedulerStateChanged = true;
        }
      }

      // Use the Discord message timestamp as a fallback source of truth when
      // persisted scheduler state is stale or missing.
      if (!nextAutoUpdateAt && existingMessageId) {
        try {
          const existingMessage = await withTimeout(
            slm.findLeaderboardMessage(channel, guildId, existingMessageId),
            5000
          );
          const lastMessageUpdateAt =
            Number(existingMessage?.editedTimestamp || existingMessage?.createdTimestamp) || 0;

          if (lastMessageUpdateAt > 0 && now - lastMessageUpdateAt < intervalMs) {
            cfg.messageId = existingMessage.id;
            cfg.lastAutoUpdate = lastMessageUpdateAt;
            cfg.nextAutoUpdateAt = lastMessageUpdateAt + intervalMs;
            nextAutoUpdateAt = cfg.nextAutoUpdateAt;
            seasonLeaderboardLastRunByGuild.set(guildId, lastMessageUpdateAt);
            schedulerStateChanged = true;
          }
        } catch {
          // Ignore lookup failures and fall back to config timestamps.
        }
      }

      if (nextAutoUpdateAt > now) {
        continue;
      }

      if (now - (cfg.lastAutoUpdate || 0) < intervalMs) {
        cfg.nextAutoUpdateAt = (cfg.lastAutoUpdate || 0) + intervalMs;
        schedulerStateChanged = true;
        continue;
      }

      // Refresh season stats from live economy/game data
      await sm.refreshSeasonStats(guildId, seasonName, (userId) => ({
        username: guild.members.cache.get(userId)?.user.username || 'Unknown User',
        balance: em.getUserData(guildId, userId).balance,
        xp: em.getUserData(guildId, userId).xp,
        level: em.getUserData(guildId, userId).level,
        seasonalCoins: em.getUserData(guildId, userId).seasonalCoins,
        gambling: gsm.getStats(userId),
      }));

      // Prune inactive players
      await sm.pruneInactivePlayers(guildId, seasonName, cfg.pruneDays || 30);

      try {
        const season = sm.getSeason(guildId, seasonName);
        if (season && !season.isActive && !season.summaryPosted) {
          const winners = sm.getSeasonLeaderboard(guildId, seasonName, 'balance', 3);
          const payouts = cfg.payouts || [];
          const rewardRoles = cfg.rewardRoles || [];

          for (let i = 0; i < winners.length; i++) {
            const winner = winners[i];
            const payout = payouts[i] || 0;
            if (payout > 0) {
              await em.addBalance(guildId, winner.userId, payout);
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

          const summaryEmbed = await slm.generateSeasonSummaryEmbed(guildId, sm, seasonName);
          if (summaryEmbed) {
            await channel.send({ embeds: [summaryEmbed] });
            await sm.markSeasonSummaryPosted(guildId, seasonName);
          }
        }

        const embeds = await slm.generateSeasonEmbeds(guildId, sm, seasonName, client);

        if (embeds.length === 0) continue;

        const totalPages = embeds.length;
        const components =
          totalPages > 1 ? [buildLeaderboardPageComponents(guildId, 0, totalPages)] : [];

        let leaderboardMessage = null;
        let messageEdited = false;

        // Try to edit existing message
        try {
          const msg = await withTimeout(
            slm.findLeaderboardMessage(channel, guildId, existingMessageId),
            5000
          );
          if (msg) {
            await withTimeout(msg.edit({ embeds: [embeds[0]], components }), 5000);
            leaderboardMessage = msg;
            messageEdited = true;
            console.log(`✅ Edited existing leaderboard message ${msg.id} for guild ${guildId}`);
          }
        } catch (error) {
          console.warn(
            `Could not fetch/edit leaderboard message for guild ${guildId}: ${error.message}`
          );
        }

        // If couldn't edit, create new message
        if (!leaderboardMessage) {
          try {
            leaderboardMessage = await channel.send({ embeds: [embeds[0]], components });
            console.log(
              `✅ Created new leaderboard message ${leaderboardMessage.id} for guild ${guildId}`
            );
          } catch (error) {
            console.error(`Failed to send leaderboard message for guild ${guildId}:`, error);
            continue;
          }
        }

        // Always save the messageId for next cycle
        cfg.messageId = leaderboardMessage.id;
        cfg.lastAutoUpdate = Date.now();
        cfg.nextAutoUpdateAt = cfg.lastAutoUpdate + intervalMs;
        seasonLeaderboardLastRunByGuild.set(guildId, cfg.lastAutoUpdate);
        schedulerStateChanged = true;
        await slm.save();
        slm.setPageCache(guildId, {
          embeds,
          messageId: leaderboardMessage.id,
          channelId: channel.id,
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

    if (schedulerStateChanged) {
      await slm.save();
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

module.exports = {
  runLeaderboardUpdate,
  updateSeasonLeaderboards,
  buildLeaderboardPageComponents,
  seasonLeaderboardLastRunByGuild,
};