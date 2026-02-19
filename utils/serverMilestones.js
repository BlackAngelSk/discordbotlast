const fs = require('fs').promises;
const path = require('path');

class ServerMilestones {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'milestones.json');
        this.data = {
            milestones: {}, // guildId: { achieved: [milestoneIds], lastMemberCount }
            milestoneDefinitions: {
                10: { name: '10 Members', reward: 1000, emoji: '🎉' },
                25: { name: '25 Members', reward: 2500, emoji: '🎊' },
                50: { name: '50 Members', reward: 5000, emoji: '👑' },
                100: { name: '100 Members', reward: 10000, emoji: '🏆' },
                250: { name: '250 Members', reward: 25000, emoji: '🔱' },
                500: { name: '500 Members', reward: 50000, emoji: '⚡' },
                1000: { name: '1,000 Members', reward: 100000, emoji: '💎' },
                2500: { name: '2,500 Members', reward: 250000, emoji: '👸' },
                5000: { name: '5,000 Members', reward: 500000, emoji: '🌟' },
                10000: { name: '10,000 Members', reward: 1000000, emoji: '✨' }
            }
        };
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                console.error('Error loading milestones data:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving milestones data:', error);
        }
    }

    initializeGuild(guildId) {
        if (!this.data.milestones[guildId]) {
            this.data.milestones[guildId] = {
                achieved: [],
                lastMemberCount: 0
            };
        }
    }

    checkMilestones(guildId, memberCount) {
        this.initializeGuild(guildId);
        const guild = this.data.milestones[guildId];
        const newMilestones = [];

        for (const [count, milestone] of Object.entries(this.data.milestoneDefinitions)) {
            const countNum = parseInt(count);
            if (memberCount >= countNum && !guild.achieved.includes(countNum)) {
                newMilestones.push({ count: countNum, ...milestone });
                guild.achieved.push(countNum);
            }
        }

        guild.lastMemberCount = memberCount;
        return newMilestones;
    }

    getMilestoneInfo(memberCount) {
        const milestone = this.data.milestoneDefinitions[memberCount];
        return milestone ? { count: memberCount, ...milestone } : null;
    }

    getAchievedMilestones(guildId) {
        this.initializeGuild(guildId);
        const achieved = this.data.milestones[guildId].achieved;
        return achieved
            .map(count => ({ count, ...this.data.milestoneDefinitions[count] }))
            .sort((a, b) => a.count - b.count);
    }

    getUpcomingMilestone(guildId, currentMemberCount) {
        const milestones = Object.entries(this.data.milestoneDefinitions)
            .map(([count, data]) => ({ count: parseInt(count), ...data }))
            .sort((a, b) => a.count - b.count);

        for (const milestone of milestones) {
            if (milestone.count > currentMemberCount) {
                return {
                    ...milestone,
                    membersNeeded: milestone.count - currentMemberCount
                };
            }
        }

        return null;
    }

    createMilestoneEmbed(milestone, guildName, currentCount) {
        return {
            color: 0x00FF00,
            title: `${milestone.emoji} Server Milestone Reached!`,
            description: `**${guildName}** has reached **${milestone.name}**!`,
            fields: [
                {
                    name: '🎉 Milestone',
                    value: milestone.name,
                    inline: true
                },
                {
                    name: '📊 Current Members',
                    value: `${currentCount}`,
                    inline: true
                },
                {
                    name: '💰 Community Reward',
                    value: `${milestone.reward.toLocaleString()} coins distributed to top members`,
                    inline: false
                }
            ],
            thumbnail: {
                url: 'https://cdn.discordapp.com/attachments/1000000000000000000/emoji.png'
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new ServerMilestones();
