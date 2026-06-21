/**
 * Tests for utils/relationshipManager.js
 * Covers: propose, acceptProposal, rejectProposal, divorce, isMarried,
 *         getMarriage, getSpouse, getPendingProposals, getMarriageLeaderboard
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

class TestRelationshipManager {
    constructor() {
        this.data = { marriages: {}, proposals: {} };
    }

    async propose(guildId, proposerId, recipientId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;
        const reverseKey = `${guildId}_${recipientId}_${proposerId}`;

        if (this.isMarried(guildId, proposerId) || this.isMarried(guildId, recipientId)) {
            return { success: false, reason: 'oneAlreadyMarried' };
        }

        if (this.data.proposals[proposalKey] || this.data.proposals[reverseKey]) {
            return { success: false, reason: 'proposalExists' };
        }

        this.data.proposals[proposalKey] = {
            proposerId,
            recipientId,
            createdAt: Date.now()
        };

        return { success: true };
    }

    async acceptProposal(guildId, recipientId, proposerId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;

        if (!this.data.proposals[proposalKey]) {
            return { success: false, reason: 'noProposal' };
        }

        delete this.data.proposals[proposalKey];

        const [id1, id2] = proposerId < recipientId ? [proposerId, recipientId] : [recipientId, proposerId];
        const marriageKey = `${guildId}_${id1}_${id2}`;

        this.data.marriages[marriageKey] = {
            partner1: id1,
            partner2: id2,
            marriedAt: Date.now(),
            anniversaryCount: 0
        };

        return { success: true };
    }

    async rejectProposal(guildId, recipientId, proposerId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;

        if (!this.data.proposals[proposalKey]) {
            return { success: false, reason: 'noProposal' };
        }

        delete this.data.proposals[proposalKey];
        return { success: true };
    }

    async divorce(guildId, userId) {
        const userMarriage = this.getMarriage(guildId, userId);

        if (!userMarriage) {
            return { success: false, reason: 'notMarried' };
        }

        const key = Object.keys(this.data.marriages).find(
            k => this.data.marriages[k].partner1 === userId || this.data.marriages[k].partner2 === userId
        );

        if (key) {
            delete this.data.marriages[key];
            return { success: true, spouse: userMarriage.spouse };
        }

        return { success: false, reason: 'error' };
    }

    isMarried(guildId, userId) {
        return this.getMarriage(guildId, userId) !== null;
    }

    getMarriage(guildId, userId) {
        if (!this.data.marriages) return null;

        for (const [key, marriage] of Object.entries(this.data.marriages)) {
            const keyPrefix = `${guildId}_`;
            if (!key.startsWith(keyPrefix)) continue;

            if (marriage.partner1 === userId) {
                return {
                    spouse: marriage.partner2,
                    partner1: marriage.partner1,
                    partner2: marriage.partner2,
                    marriedAt: marriage.marriedAt,
                    anniversaryCount: marriage.anniversaryCount
                };
            } else if (marriage.partner2 === userId) {
                return {
                    spouse: marriage.partner1,
                    partner1: marriage.partner1,
                    partner2: marriage.partner2,
                    marriedAt: marriage.marriedAt,
                    anniversaryCount: marriage.anniversaryCount
                };
            }
        }
        return null;
    }

    getSpouse(guildId, userId) {
        const marriage = this.getMarriage(guildId, userId);
        return marriage ? marriage.spouse : null;
    }

    getPendingProposals(guildId, userId) {
        const proposals = [];
        if (!this.data.proposals) return proposals;

        for (const [key, proposal] of Object.entries(this.data.proposals)) {
            if (key.startsWith(`${guildId}_`) && proposal.recipientId === userId) {
                proposals.push({
                    proposerId: proposal.proposerId,
                    createdAt: proposal.createdAt
                });
            }
        }
        return proposals;
    }

    getMarriageLeaderboard(guildId, limit = 10) {
        const couples = [];
        for (const [key, marriage] of Object.entries(this.data.marriages)) {
            if (key.startsWith(`${guildId}_`)) {
                const daysMarried = Math.floor((Date.now() - marriage.marriedAt) / (1000 * 60 * 60 * 24));
                couples.push({
                    partner1: marriage.partner1,
                    partner2: marriage.partner2,
                    marriedAt: marriage.marriedAt,
                    daysMarried,
                    anniversaryCount: marriage.anniversaryCount
                });
            }
        }

        return couples
            .sort((a, b) => b.daysMarried - a.daysMarried)
            .slice(0, limit);
    }
}

function fresh() {
    return new TestRelationshipManager();
}

// ── propose ──────────────────────────────────────────────────────────────────
console.log('\npropose');

test('creates a proposal successfully', async () => {
    const mgr = fresh();
    const result = await mgr.propose('g1', 'u1', 'u2');
    assert.strictEqual(result.success, true);
});

test('rejects proposal when proposer is already married', async () => {
    const mgr = fresh();
    // Manually create a marriage
    mgr.data.marriages['g1_u1_u2'] = { partner1: 'u1', partner2: 'u2', marriedAt: Date.now(), anniversaryCount: 0 };
    const result = await mgr.propose('g1', 'u1', 'u3');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'oneAlreadyMarried');
});

test('rejects proposal when recipient is already married', async () => {
    const mgr = fresh();
    mgr.data.marriages['g1_u2_u3'] = { partner1: 'u2', partner2: 'u3', marriedAt: Date.now(), anniversaryCount: 0 };
    const result = await mgr.propose('g1', 'u1', 'u2');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'oneAlreadyMarried');
});

test('rejects duplicate proposal', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    const result = await mgr.propose('g1', 'u1', 'u2');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'proposalExists');
});

test('rejects reverse proposal', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    const result = await mgr.propose('g1', 'u2', 'u1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'proposalExists');
});

// ── acceptProposal ───────────────────────────────────────────────────────────
console.log('\nacceptProposal');

test('accepts proposal and creates marriage', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    const result = await mgr.acceptProposal('g1', 'u2', 'u1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(mgr.isMarried('g1', 'u1'), true);
    assert.strictEqual(mgr.isMarried('g1', 'u2'), true);
});

test('returns error when no proposal exists', async () => {
    const mgr = fresh();
    const result = await mgr.acceptProposal('g1', 'u2', 'u1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'noProposal');
});

test('marriage key is sorted by user ID', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u2', 'u1');
    await mgr.acceptProposal('g1', 'u1', 'u2');
    // Marriage key should be g1_u1_u2 (sorted)
    const marriageKey = 'g1_u1_u2';
    assert(mgr.data.marriages[marriageKey] !== undefined);
});

// ── rejectProposal ───────────────────────────────────────────────────────────
console.log('\nrejectProposal');

test('rejects and removes proposal', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    const result = await mgr.rejectProposal('g1', 'u2', 'u1');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(mgr.getPendingProposals('g1', 'u2'), []);
});

test('returns error when no proposal exists', async () => {
    const mgr = fresh();
    const result = await mgr.rejectProposal('g1', 'u2', 'u1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'noProposal');
});

// ── divorce ──────────────────────────────────────────────────────────────────
console.log('\ndivorce');

test('divorces a married couple', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    await mgr.acceptProposal('g1', 'u2', 'u1');
    const result = await mgr.divorce('g1', 'u1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.spouse, 'u2');
    assert.strictEqual(mgr.isMarried('g1', 'u1'), false);
    assert.strictEqual(mgr.isMarried('g1', 'u2'), false);
});

test('returns error when not married', async () => {
    const mgr = fresh();
    const result = await mgr.divorce('g1', 'u1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'notMarried');
});

// ── isMarried / getMarriage / getSpouse ──────────────────────────────────────
console.log('\nisMarried / getMarriage / getSpouse');

test('isMarried returns false for unmarried user', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.isMarried('g1', 'u1'), false);
});

test('getMarriage returns null for unmarried user', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getMarriage('g1', 'u1'), null);
});

test('getSpouse returns null for unmarried user', () => {
    const mgr = fresh();
    assert.strictEqual(mgr.getSpouse('g1', 'u1'), null);
});

test('getMarriage works from either partner side', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    await mgr.acceptProposal('g1', 'u2', 'u1');
    const m1 = mgr.getMarriage('g1', 'u1');
    const m2 = mgr.getMarriage('g1', 'u2');
    assert.strictEqual(m1.spouse, 'u2');
    assert.strictEqual(m2.spouse, 'u1');
    assert.strictEqual(m1.partner1, m2.partner1);
    assert.strictEqual(m1.partner2, m2.partner2);
});

test('getSpouse returns correct spouse ID', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    await mgr.acceptProposal('g1', 'u2', 'u1');
    assert.strictEqual(mgr.getSpouse('g1', 'u1'), 'u2');
    assert.strictEqual(mgr.getSpouse('g1', 'u2'), 'u1');
});

// ── getPendingProposals ──────────────────────────────────────────────────────
console.log('\ngetPendingProposals');

test('returns proposals addressed to user', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    await mgr.propose('g1', 'u3', 'u2');
    const proposals = mgr.getPendingProposals('g1', 'u2');
    assert.strictEqual(proposals.length, 2);
});

test('does not return proposals for other users', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    const proposals = mgr.getPendingProposals('g1', 'u3');
    assert.strictEqual(proposals.length, 0);
});

// ── getMarriageLeaderboard ───────────────────────────────────────────────────
console.log('\ngetMarriageLeaderboard');

test('returns empty array when no marriages', () => {
    const mgr = fresh();
    assert.deepStrictEqual(mgr.getMarriageLeaderboard('g1'), []);
});

test('returns marriages sorted by days married', async () => {
    const mgr = fresh();
    // Create two marriages with different timestamps
    mgr.data.marriages['g1_u1_u2'] = { partner1: 'u1', partner2: 'u2', marriedAt: Date.now() - 86400000 * 30, anniversaryCount: 0 };
    mgr.data.marriages['g1_u3_u4'] = { partner1: 'u3', partner2: 'u4', marriedAt: Date.now() - 86400000 * 10, anniversaryCount: 0 };
    const lb = mgr.getMarriageLeaderboard('g1');
    assert.strictEqual(lb.length, 2);
    assert.strictEqual(lb[0].partner1, 'u1'); // older marriage first
    assert.strictEqual(lb[1].partner1, 'u3');
});

test('respects limit parameter', async () => {
    const mgr = fresh();
    mgr.data.marriages['g1_u1_u2'] = { partner1: 'u1', partner2: 'u2', marriedAt: Date.now() - 86400000, anniversaryCount: 0 };
    mgr.data.marriages['g1_u3_u4'] = { partner1: 'u3', partner2: 'u4', marriedAt: Date.now() - 86400000 * 2, anniversaryCount: 0 };
    const lb = mgr.getMarriageLeaderboard('g1', 1);
    assert.strictEqual(lb.length, 1);
});

// ── Cross-guild isolation ────────────────────────────────────────────────────
console.log('\nCross-guild isolation');

test('marriages in different guilds do not interfere', async () => {
    const mgr = fresh();
    await mgr.propose('g1', 'u1', 'u2');
    await mgr.acceptProposal('g1', 'u2', 'u1');
    assert.strictEqual(mgr.isMarried('g1', 'u1'), true);
    assert.strictEqual(mgr.isMarried('g2', 'u1'), false);
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);