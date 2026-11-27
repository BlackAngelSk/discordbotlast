/**
 * Automatic Humble Bundle alerts: posts new bundles to a configured channel and
 * announces the ones that ended.
 *
 * Config lives in data/humbleBundleAlerts.json:
 *   guilds[guildId] = {
 *     channelId, types: ['games'], enabled,
 *     seen: { [slug]: { title, url, endDate, type } },
 *     lastCheckedAt, lastPostedAt
 *   }
 */
'use strict';

const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { fetchChannelSafe } = require('../core/discordFetch');
const { getHumbleBundles, buildBundleCard, BUNDLE_TYPES } = require('./humbleBundle');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'humbleBundleAlerts.json');
const POLL_INTERVAL = 30 * 60 * 1000;
const INITIAL_DELAY_MS = 45 * 1000;
const MAX_NEW_PER_POLL = 6;
const MAX_SEEN_ENTRIES = 500;

const TYPE_LABELS = {
  games: 'Games',
  books: 'Books & Comics',
  software: 'Software',
};

const TYPE_COLORS = {
  games: 0xcc2929,
  books: 0x1f6feb,
  software: 0x2ea043,
};

function sanitizeTypes(types) {
  if (types === 'all') return [...BUNDLE_TYPES];

  const list = (Array.isArray(types) ? types : [types])
    .map((type) => String(type || '').toLowerCase())
    .filter((type) => BUNDLE_TYPES.includes(type));

  return list.length > 0 ? [...new Set(list)] : ['games'];
}

class HumbleBundleAlertsManager {
  constructor() {
    this.client = null;
    this.data = { guilds: {} };
    this.interval = null;
    this.initialTimer = null;
    this.pollInFlight = false;
    // Injectable so tests can feed fixtures without touching the network.
    this.fetcher = getHumbleBundles;
    this.dataFile = DATA_FILE;
  }

  async init(client) {
    this.client = client;

    try {
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      this.data = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save();
      } else {
        console.error('Error loading Humble Bundle alert config:', error.message || error);
      }
    }

    if (!this.data || typeof this.data !== 'object') this.data = { guilds: {} };
    if (!this.data.guilds) this.data.guilds = {};

    this.startPolling();
  }

  async save() {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2));
  }

  getGuildConfig(guildId) {
    return this.data.guilds[guildId] || null;
  }

  /**
   * Point alerts at a channel. Existing bundles are seeded as "already seen" so
   * enabling the feature doesn't dump every live bundle into the channel.
   */
  async enable(guildId, channelId, { types = ['games'] } = {}) {
    const normalizedTypes = sanitizeTypes(types);
    const existing = this.data.guilds[guildId] || {};

    let snapshot = null;
    try {
      snapshot = await this.fetcher({ types: normalizedTypes });
    } catch (error) {
      console.error('[humblebundle] could not seed alerts:', error.message || error);
    }

    const seen = { ...(existing.seen || {}) };
    if (snapshot) {
      for (const bundle of snapshot.bundles) {
        if (!seen[bundle.slug]) seen[bundle.slug] = this.toSeenEntry(bundle);
      }
    }

    this.data.guilds[guildId] = {
      channelId,
      types: normalizedTypes,
      enabled: true,
      seen,
      lastCheckedAt: snapshot ? snapshot.fetchedAt : new Date().toISOString(),
      lastPostedAt: existing.lastPostedAt || null,
    };

    await this.save();

    return {
      config: this.data.guilds[guildId],
      seeded: snapshot ? snapshot.bundles.length : 0,
    };
  }

  async disable(guildId) {
    const config = this.data.guilds[guildId];
    if (!config) return false;

    config.enabled = false;
    await this.save();
    return true;
  }

  async remove(guildId) {
    if (!this.data.guilds[guildId]) return false;
    delete this.data.guilds[guildId];
    await this.save();
    return true;
  }

  toSeenEntry(bundle) {
    return {
      title: bundle.title,
      url: bundle.url,
      type: bundle.type,
      endDate: bundle.endDate ? bundle.endDate.toISOString() : null,
    };
  }

  startPolling() {
    if (this.interval) clearInterval(this.interval);

    this.interval = setInterval(() => {
      this.poll().catch((error) => {
        console.error('[humblebundle] alert poll failed:', error.message || error);
      });
    }, POLL_INTERVAL);
    this.interval.unref?.();

    this.initialTimer = setTimeout(() => {
      this.poll().catch((error) => {
        console.error('[humblebundle] initial alert poll failed:', error.message || error);
      });
    }, INITIAL_DELAY_MS);
    this.initialTimer.unref?.();
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.interval = null;
    this.initialTimer = null;
  }

  async poll() {
    if (this.pollInFlight || !this.client) return;
    this.pollInFlight = true;

    try {
      for (const [guildId, config] of Object.entries(this.data.guilds)) {
        if (!config?.channelId || config.enabled === false) continue;

        let result;
        try {
          result = await this.fetcher({ types: sanitizeTypes(config.types) });
        } catch (error) {
          console.warn(`[humblebundle] guild ${guildId}: fetch failed — ${error.message || error}`);
          continue;
        }

        const { fresh, ended } = this.diff(config, result.bundles);

        config.lastCheckedAt = new Date().toISOString();
        await this.save();

        if (fresh.length === 0 && ended.length === 0) continue;

        const channel = await fetchChannelSafe(this.client, config.channelId);
        if (!channel || !channel.isTextBased()) {
          console.warn(
            `[humblebundle] guild ${guildId}: channel ${config.channelId} is not a usable text channel`
          );
          continue;
        }

        try {
          // One message per bundle: the id is stored so the message can be
          // removed from the channel when that bundle ends.
          for (const bundle of fresh.slice(0, MAX_NEW_PER_POLL)) {
            const message = await channel.send(this.buildBundleEmbed(bundle));
            const entry = config.seen[bundle.slug];
            if (entry && message?.id) entry.messageId = message.id;
          }

          if (fresh.length > MAX_NEW_PER_POLL) {
            await channel.send(
              `🎁 ${fresh.length - MAX_NEW_PER_POLL} more new bundles are live — <https://www.humblebundle.com/bundles>`
            );
          }

          const undeletable = [];
          for (const entry of ended) {
            const removed = await this.deleteAnnouncement(channel, entry);
            if (!removed) undeletable.push(entry);
          }

          if (undeletable.length > 0) await channel.send(this.buildEndedPayload(undeletable));

          config.lastPostedAt = new Date().toISOString();
          await this.save();
        } catch (error) {
          console.error(
            `[humblebundle] guild ${guildId}: could not post alerts — ${error.message || error}`
          );
        }
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  /**
   * Split the live list into bundles we have not announced yet and tracked
   * bundles whose end date has passed. Mutates config.seen.
   */
  diff(config, bundles) {
    const now = Date.now();
    const seen = config.seen && typeof config.seen === 'object' ? config.seen : {};
    const fresh = [];
    const ended = [];

    for (const bundle of bundles) {
      if (bundle.ended) continue;

      const known = seen[bundle.slug];
      if (!known) {
        fresh.push(bundle);
        seen[bundle.slug] = this.toSeenEntry(bundle);
        continue;
      }

      // Humble sometimes extends a sale; keep the tracked end date current.
      const endDate = bundle.endDate ? bundle.endDate.toISOString() : null;
      if (endDate && endDate !== known.endDate) {
        known.endDate = endDate;
        known.title = bundle.title;
      }
    }

    for (const [slug, entry] of Object.entries(seen)) {
      const end = entry?.endDate ? new Date(entry.endDate).getTime() : null;
      if (end && end <= now) {
        ended.push({ slug, ...entry });
        delete seen[slug];
      }
    }

    // Keep the file bounded: oldest entries go first once the cap is hit.
    const entries = Object.entries(seen);
    if (entries.length > MAX_SEEN_ENTRIES) {
      for (const [slug] of entries.slice(0, entries.length - MAX_SEEN_ENTRIES)) {
        delete seen[slug];
      }
    }

    config.seen = seen;
    return { fresh, ended };
  }

  buildBundleEmbed(bundle) {
    const card = buildBundleCard(bundle, 0);
    const typeLabel = TYPE_LABELS[bundle.type] || 'Games';

    const embed = new EmbedBuilder()
      .setColor(TYPE_COLORS[bundle.type] || TYPE_COLORS.games)
      .setAuthor({ name: 'Humble Bundle', iconURL: 'https://www.humblebundle.com/favicon.ico' })
      .setTitle(`🎁 New ${typeLabel.toLowerCase()} bundle: ${bundle.title}`.slice(0, 256))
      .setURL(bundle.url)
      .setDescription(card.value)
      .setTimestamp();

    if (bundle.image) embed.setThumbnail(bundle.image);

    return { embeds: [embed] };
  }

  /** Remove the announcement message we posted for a bundle that has ended. */
  async deleteAnnouncement(channel, entry) {
    if (!entry?.messageId) return false;

    try {
      const message = await channel.messages.fetch(entry.messageId);
      await message.delete();
      return true;
    } catch {
      // Message already gone, or we lost Manage Messages — fall back to a notice.
      return false;
    }
  }

  buildEndedPayload(ended) {
    const lines = ended.slice(0, 10).map((entry) => {
      const label = entry.title || entry.slug;
      return entry.url ? `• [${label}](${entry.url})` : `• ${label}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x4e5058)
      .setTitle(ended.length === 1 ? '⌛ Bundle ended' : `⌛ ${ended.length} bundles ended`)
      .setDescription(
        `${lines.join('\n')}\n\nRemoved from the watch list — the announcement message could not be deleted.`
      )
      .setTimestamp();

    return { embeds: [embed] };
  }

  getStatus(guildId) {
    const config = this.getGuildConfig(guildId);
    if (!config) return null;

    const seen = Object.keys(config.seen || {});
    const nextEnd = Object.values(config.seen || {})
      .map((entry) => (entry.endDate ? new Date(entry.endDate).getTime() : null))
      .filter((time) => Number.isFinite(time) && time > Date.now())
      .sort((left, right) => left - right)[0];

    return {
      channelId: config.channelId,
      enabled: config.enabled !== false,
      types: sanitizeTypes(config.types),
      tracked: seen.length,
      lastCheckedAt: config.lastCheckedAt || null,
      lastPostedAt: config.lastPostedAt || null,
      nextEndAt: nextEnd ? new Date(nextEnd).toISOString() : null,
    };
  }
}

module.exports = new HumbleBundleAlertsManager();
module.exports.HumbleBundleAlertsManager = HumbleBundleAlertsManager;
module.exports.sanitizeTypes = sanitizeTypes;
module.exports.POLL_INTERVAL = POLL_INTERVAL;
