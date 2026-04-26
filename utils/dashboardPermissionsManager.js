const fs = require('fs').promises;
const path = require('path');

const SECTION_KEYS = [
    'settings',
    'economy',
    'shop',
    'commands',
    'liveAlerts',
    'epicGamesAlerts',
    'steamGameUpdates',
    'telegramSync',
    'community',
    'voiceTools',
    'moderation',
    'automod',
    'safety',
    'analytics',
    'activity',
    'health'
];

class DashboardPermissionsManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'dashboardPermissions.json');
        this.data = { guilds: {} };
        this.loaded = false;
    }

    async init() {
        try {
            const dataDir = path.dirname(this.dataPath);
            await fs.mkdir(dataDir, { recursive: true });

            const fileData = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileData);
            this.loaded = true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
                this.loaded = true;
            } else {
                console.error('Error loading dashboard permissions:', error);
            }
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving dashboard permissions:', error);
        }
    }

    normalizeRoleIds(roleIds = []) {
        if (!Array.isArray(roleIds)) {
            return [];
        }

        return Array.from(new Set(roleIds.map((roleId) => String(roleId || '').trim()).filter(Boolean)));
    }

    getDefaultSectionConfig() {
        return SECTION_KEYS.reduce((accumulator, key) => {
            accumulator[key] = [];
            return accumulator;
        }, {});
    }

    getGuildConfig(guildId) {
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = {
                sections: this.getDefaultSectionConfig()
            };
        }

        if (!this.data.guilds[guildId].sections) {
            this.data.guilds[guildId].sections = this.getDefaultSectionConfig();
        }

        for (const key of SECTION_KEYS) {
            this.data.guilds[guildId].sections[key] = this.normalizeRoleIds(this.data.guilds[guildId].sections[key]);
        }

        return this.data.guilds[guildId];
    }

    getSectionRoleIds(guildId, sectionKey) {
        const config = this.getGuildConfig(guildId);
        return config.sections[sectionKey] || [];
    }

    getSectionConfig(guildId) {
        const config = this.getGuildConfig(guildId);
        return { ...config.sections };
    }

    async setSectionRoleIds(guildId, sectionKey, roleIds) {
        if (!SECTION_KEYS.includes(sectionKey)) {
            throw new Error(`Unknown dashboard section: ${sectionKey}`);
        }

        const config = this.getGuildConfig(guildId);
        config.sections[sectionKey] = this.normalizeRoleIds(roleIds);
        await this.save();
        return this.getSectionConfig(guildId);
    }

    async setSectionConfig(guildId, sectionConfig = {}) {
        const config = this.getGuildConfig(guildId);

        for (const key of SECTION_KEYS) {
            if (Object.prototype.hasOwnProperty.call(sectionConfig, key)) {
                config.sections[key] = this.normalizeRoleIds(sectionConfig[key]);
            }
        }

        await this.save();
        return this.getSectionConfig(guildId);
    }

    memberCanAccessSection(member, sectionKey) {
        if (!member || !SECTION_KEYS.includes(sectionKey)) {
            return false;
        }

        if (member.permissions?.has?.('Administrator')) {
            return true;
        }

        const roleIds = this.getSectionRoleIds(member.guild.id, sectionKey);
        if (roleIds.length === 0) {
            return false;
        }

        return roleIds.some((roleId) => member.roles.cache.has(roleId));
    }
}

module.exports = {
    dashboardPermissionsManager: new DashboardPermissionsManager(),
    DASHBOARD_PERMISSION_SECTION_KEYS: SECTION_KEYS
};