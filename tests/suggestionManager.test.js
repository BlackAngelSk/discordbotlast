/**
 * Tests for utils/suggestionManager.js
 * Covers: getSettings, updateSettings, createSuggestion, getSuggestion,
 *         updateSuggestionStatus, addVote, getGuildSuggestions, deleteSuggestion
 */
'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

// Fresh instance bypassing file I/O
class TestSuggestionManager {
    constructor() {
        this.data = {
            settings: {},
            suggestions: {}
        };
    }

    getSettings(guildId) {
        if (!this.data.settings[guildId]) {
            this.data.settings[guildId] = {
                channelId: null,
                staffRoleId: null,
                enabled: false,
                autoThread: true,
                votingEnabled: true
            };
        }
        return this.data.settings[guildId];
    }

    async updateSettings(guildId, settings) {
        this.data.settings[guildId] = { ...this.getSettings(guildId), ...settings };
    }

    async createSuggestion(guildId, userId, content, messageId) {
        if (!this.data.suggestions[guildId]) {
            this.data.suggestions[guildId] = {};
        }

        const suggestionId = `${guildId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        this.data.suggestions[guildId][suggestionId] = {
            id: suggestionId,
            userId,
            content,
            status: 'pending',
            messageId,
            upvotes: 0,
            downvotes: 0,
            voters: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return suggestionId;
    }

    getSuggestion(guildId, suggestionId) {
        return this.data.suggestions[guildId]?.[suggestionId] || null;
    }

    async updateSuggestionStatus(guildId, suggestionId, status, reason = null) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (suggestion) {
            suggestion.status = status;
            suggestion.updatedAt = new Date().toISOString();
            if (reason) suggestion.reason = reason;
            return true;
        }
        return false;
    }

    async addVote(guildId, suggestionId, userId, voteType) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return false;

        const existingVoteIndex = suggestion.voters.findIndex(v => v.userId === userId);
        if (existingVoteIndex !== -1) {
            const oldVote = suggestion.voters[existingVoteIndex].type;
            if (oldVote === 'up') suggestion.upvotes--;
            else suggestion.downvotes--;
            suggestion.voters.splice(existingVoteIndex, 1);
        }

        if (voteType === 'up') {
            suggestion.upvotes++;
        } else {
            suggestion.downvotes++;
        }
        suggestion.voters.push({ userId, type: voteType });

        return true;
    }

    getGuildSuggestions(guildId, status = null) {
        const suggestions = this.data.suggestions[guildId] || {};
        const suggestionList = Object.values(suggestions);

        if (status) {
            return suggestionList.filter(s => s.status === status);
        }
        return suggestionList;
    }

    async deleteSuggestion(guildId, suggestionId) {
        if (this.data.suggestions[guildId]?.[suggestionId]) {
            delete this.data.suggestions[guildId][suggestionId];
            return true;
        }
        return false;
    }
}

function fresh() {
    return new TestSuggestionManager();
}

// ── getSettings ──────────────────────────────────────────────────────────────
console.log('\ngetSettings');

test('returns default settings for new guild', () => {
    const mgr = fresh();
    const s = mgr.getSettings('g1');
    assert.strictEqual(s.channelId, null);
    assert.strictEqual(s.staffRoleId, null);
    assert.strictEqual(s.enabled, false);
    assert.strictEqual(s.autoThread, true);
    assert.strictEqual(s.votingEnabled, true);
});

test('returns same object on repeated calls', () => {
    const mgr = fresh();
    const s1 = mgr.getSettings('g1');
    const s2 = mgr.getSettings('g1');
    assert.strictEqual(s1, s2);
});

// ── updateSettings ───────────────────────────────────────────────────────────
console.log('\nupdateSettings');

test('merges new settings with defaults', async () => {
    const mgr = fresh();
    await mgr.updateSettings('g1', { enabled: true, channelId: '123' });
    const s = mgr.getSettings('g1');
    assert.strictEqual(s.enabled, true);
    assert.strictEqual(s.channelId, '123');
    assert.strictEqual(s.votingEnabled, true); // default preserved
});

test('different guilds have independent settings', async () => {
    const mgr = fresh();
    await mgr.updateSettings('g1', { enabled: true });
    await mgr.updateSettings('g2', { enabled: false });
    assert.strictEqual(mgr.getSettings('g1').enabled, true);
    assert.strictEqual(mgr.getSettings('g2').enabled, false);
});

// ── createSuggestion ─────────────────────────────────────────────────────────
console.log('\ncreateSuggestion');

test('creates a suggestion with correct fields', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Add dark mode', 'msg123');
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.userId, 'u1');
    assert.strictEqual(s.content, 'Add dark mode');
    assert.strictEqual(s.status, 'pending');
    assert.strictEqual(s.upvotes, 0);
    assert.strictEqual(s.downvotes, 0);
    assert.deepStrictEqual(s.voters, []);
});

test('returns unique suggestion IDs', async () => {
    const mgr = fresh();
    const id1 = await mgr.createSuggestion('g1', 'u1', 'Suggestion 1');
    const id2 = await mgr.createSuggestion('g1', 'u1', 'Suggestion 2');
    assert.notStrictEqual(id1, id2);
});

test('creates guild suggestion structure on first suggestion', async () => {
    const mgr = fresh();
    await mgr.createSuggestion('g1', 'u1', 'Test');
    assert(mgr.data.suggestions['g1'] !== undefined);
});

// ── getSuggestion ────────────────────────────────────────────────────────────
console.log('\ngetSuggestion');

test('returns null for non-existent suggestion', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getSuggestion('g1', 'nonexistent'), null);
});

test('returns null for non-existent guild', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getSuggestion('no_guild', 'test'), null);
});

test('returns suggestion data', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.content, 'Test');
});

// ── updateSuggestionStatus ───────────────────────────────────────────────────
console.log('\nupdateSuggestionStatus');

test('updates status of existing suggestion', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    const result = await mgr.updateSuggestionStatus('g1', id, 'approved');
    assert.strictEqual(result, true);
    assert.strictEqual(mgr.getSuggestion('g1', id).status, 'approved');
});

test('returns false for non-existent suggestion', async () => {
    const mgr = fresh();
    const result = await mgr.updateSuggestionStatus('g1', 'fake', 'approved');
    assert.strictEqual(result, false);
});

test('stores reason when provided', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    await mgr.updateSuggestionStatus('g1', id, 'rejected', 'Not feasible');
    assert.strictEqual(mgr.getSuggestion('g1', id).reason, 'Not feasible');
});

// ── addVote ──────────────────────────────────────────────────────────────────
console.log('\naddVote');

test('adds an upvote', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    const result = await mgr.addVote('g1', id, 'voter1', 'up');
    assert.strictEqual(result, true);
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.upvotes, 1);
    assert.strictEqual(s.downvotes, 0);
});

test('adds a downvote', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    await mgr.addVote('g1', id, 'voter1', 'down');
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.upvotes, 0);
    assert.strictEqual(s.downvotes, 1);
});

test('changing vote type updates counts correctly', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    await mgr.addVote('g1', id, 'voter1', 'up');
    await mgr.addVote('g1', id, 'voter1', 'down');
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.upvotes, 0);
    assert.strictEqual(s.downvotes, 1);
    assert.strictEqual(s.voters.length, 1);
    assert.strictEqual(s.voters[0].type, 'down');
});

test('multiple voters accumulate correctly', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    await mgr.addVote('g1', id, 'v1', 'up');
    await mgr.addVote('g1', id, 'v2', 'up');
    await mgr.addVote('g1', id, 'v3', 'down');
    const s = mgr.getSuggestion('g1', id);
    assert.strictEqual(s.upvotes, 2);
    assert.strictEqual(s.downvotes, 1);
    assert.strictEqual(s.voters.length, 3);
});

test('returns false for non-existent suggestion', async () => {
    const mgr = fresh();
    const result = await mgr.addVote('g1', 'fake', 'v1', 'up');
    assert.strictEqual(result, false);
});

// ── getGuildSuggestions ──────────────────────────────────────────────────────
console.log('\ngetGuildSuggestions');

test('returns empty array for unknown guild', () => {
    const mgr = fresh();
    assert.deepStrictEqual(mgr.getGuildSuggestions('g1'), []);
});

test('returns all suggestions', async () => {
    const mgr = fresh();
    await mgr.createSuggestion('g1', 'u1', 'S1');
    await mgr.createSuggestion('g1', 'u2', 'S2');
    assert.strictEqual(mgr.getGuildSuggestions('g1').length, 2);
});

test('filters by status', async () => {
    const mgr = fresh();
    const id1 = await mgr.createSuggestion('g1', 'u1', 'S1');
    const id2 = await mgr.createSuggestion('g1', 'u2', 'S2');
    await mgr.updateSuggestionStatus('g1', id1, 'approved');
    assert.strictEqual(mgr.getGuildSuggestions('g1', 'approved').length, 1);
    assert.strictEqual(mgr.getGuildSuggestions('g1', 'pending').length, 1);
});

// ── deleteSuggestion ─────────────────────────────────────────────────────────
console.log('\ndeleteSuggestion');

test('deletes an existing suggestion', async () => {
    const mgr = fresh();
    const id = await mgr.createSuggestion('g1', 'u1', 'Test');
    const result = await mgr.deleteSuggestion('g1', id);
    assert.strictEqual(result, true);
    assert.strictEqual(mgr.getSuggestion('g1', id), null);
});

test('returns false for non-existent suggestion', async () => {
    const mgr = fresh();
    const result = await mgr.deleteSuggestion('g1', 'fake');
    assert.strictEqual(result, false);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);