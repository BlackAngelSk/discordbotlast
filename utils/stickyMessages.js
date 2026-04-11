/**
 * Sticky Messages Manager
 * A sticky message re-posts itself as the latest message whenever others are sent.
 */
const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'stickyMessages.json');

class StickyMessagesManager {
    constructor() {
        // { channelId: { content, lastMessageId, guildId } }
        this.data = {};
        // In-flight debounce timers
        this._timers = new Map();
    }

    async init() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    set(channelId, guildId, content) {
        this.data[channelId] = { content, lastMessageId: null, guildId };
        return this.save();
    }

    remove(channelId) {
        delete this.data[channelId];
        return this.save();
    }

    get(channelId) {
        return this.data[channelId] || null;
    }

    /**
     * Called on every messageCreate for channels with a sticky.
     * Deletes the old sticky post and re-posts it with a debounce.
     */
    async handleMessage(message) {
        const sticky = this.get(message.channelId);
        if (!sticky) return;
        // Don't re-post on own sticky post (would loop)
        if (message.id === sticky.lastMessageId) return;
        // Debounce: wait 2s to batch rapid messages
        if (this._timers.has(message.channelId)) {
            clearTimeout(this._timers.get(message.channelId));
        }
        this._timers.set(message.channelId, setTimeout(async () => {
            this._timers.delete(message.channelId);
            try {
                // Delete old sticky
                if (sticky.lastMessageId) {
                    const old = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
                    if (old) await old.delete().catch(() => {});
                }
                const newMsg = await message.channel.send({ content: sticky.content });
                sticky.lastMessageId = newMsg.id;
                await this.save();
            } catch (err) {
                console.error('StickyMessage repost error:', err);
            }
        }, 2000));
    }
}

module.exports = new StickyMessagesManager();
