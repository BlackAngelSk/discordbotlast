const fs = require('fs').promises;
const path = require('path');

class RelationshipManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'relationships.json');
        this.data = {
            marriages: {},
            proposals: {}
        };
    }

    async init() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            const loadedData = JSON.parse(data);
            
            // Ensure correct structure even if file is incomplete
            this.data = {
                marriages: loadedData.marriages || {},
                proposals: loadedData.proposals || {}
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading relationship data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving relationship data:', error);
        }
    }

    // Create a proposal
    async propose(guildId, proposerId, recipientId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;
        const reverseKey = `${guildId}_${recipientId}_${proposerId}`;

        // Check if already married
        if (this.isMarried(guildId, proposerId) || this.isMarried(guildId, recipientId)) {
            return { success: false, reason: 'oneAlreadyMarried' };
        }

        // Check if there's already a proposal
        if (this.data.proposals[proposalKey] || this.data.proposals[reverseKey]) {
            return { success: false, reason: 'proposalExists' };
        }

        this.data.proposals[proposalKey] = {
            proposerId,
            recipientId,
            createdAt: Date.now()
        };

        await this.save();
        return { success: true };
    }

    // Accept a proposal
    async acceptProposal(guildId, recipientId, proposerId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;

        if (!this.data.proposals[proposalKey]) {
            return { success: false, reason: 'noProposal' };
        }

        delete this.data.proposals[proposalKey];

        // Create marriage (sorted by ID to ensure consistency)
        const [id1, id2] = proposerId < recipientId ? [proposerId, recipientId] : [recipientId, proposerId];
        const marriageKey = `${guildId}_${id1}_${id2}`;

        this.data.marriages[marriageKey] = {
            partner1: id1,
            partner2: id2,
            marriedAt: Date.now(),
            anniversaryCount: 0
        };

        await this.save();
        return { success: true };
    }

    // Reject a proposal
    async rejectProposal(guildId, recipientId, proposerId) {
        const proposalKey = `${guildId}_${proposerId}_${recipientId}`;

        if (!this.data.proposals[proposalKey]) {
            return { success: false, reason: 'noProposal' };
        }

        delete this.data.proposals[proposalKey];
        await this.save();
        return { success: true };
    }

    // Divorce
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
            await this.save();
            return { success: true, spouse: userMarriage.spouse };
        }

        return { success: false, reason: 'error' };
    }

    // Check if user is married
    isMarried(guildId, userId) {
        return this.getMarriage(guildId, userId) !== null;
    }

    // Get marriage info
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

    // Get pending proposals for a user
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

    // Get marriage leaderboard
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

module.exports = new RelationshipManager();
