const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');

class RoleTemplateManager {
    constructor() {
        this.dataFile = path.join(__dirname, '../data/roleTemplates.json');
        this.templates = this.loadTemplates();
        this.defaultTemplates = this.getDefaultTemplates();
    }

    loadTemplates() {
        try {
            if (fs.existsSync(this.dataFile)) {
                return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load role templates:', e);
        }
        return {};
    }

    saveTemplates() {
        try {
            const dir = path.dirname(this.dataFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataFile, JSON.stringify(this.templates, null, 2));
        } catch (e) {
            console.error('Failed to save role templates:', e);
        }
    }

    /**
     * Get default role templates
     * @returns {object} - Default templates
     */
    getDefaultTemplates() {
        return {
            admin: {
                name: 'Admin',
                permissions: [
                    'Administrator',
                    'ManageGuild',
                    'ManageChannels',
                    'ManageRoles',
                    'ManageMessages',
                    'KickMembers',
                    'BanMembers',
                    'ModerationViewAuditLog'
                ],
                color: '#FF0000',
                hoist: true
            },
            moderator: {
                name: 'Moderator',
                permissions: [
                    'ManageMessages',
                    'KickMembers',
                    'BanMembers',
                    'ModerateMembers',
                    'ManageRoles'
                ],
                color: '#FFA500',
                hoist: true
            },
            supporter: {
                name: 'Supporter',
                permissions: [
                    'SendMessages',
                    'ManageMessages',
                    'ViewAuditLog'
                ],
                color: '#0099FF',
                hoist: false
            },
            verified: {
                name: 'Verified',
                permissions: [],
                color: '#00FF00',
                hoist: false
            },
            member: {
                name: 'Member',
                permissions: [
                    'SendMessages',
                    'SendMessagesInThreads',
                    'CreatePublicThreads'
                ],
                color: '#FFFFFF',
                hoist: false
            },
            muted: {
                name: 'Muted',
                permissions: [],
                color: '#808080',
                hoist: false
            }
        };
    }

    /**
     * Create a role from template
     * @param {Guild} guild - Discord guild
     * @param {string} templateName - Template name
     * @returns {Promise<Role>} - Created role
     */
    async createRoleFromTemplate(guild, templateName) {
        let template = this.templates[`${guild.id}_${templateName}`];
        
        if (!template) {
            template = this.defaultTemplates[templateName];
        }

        if (!template) {
            throw new Error(`Template "${templateName}" not found`);
        }

        try {
            const role = await guild.roles.create({
                name: template.name,
                color: template.color,
                hoist: template.hoist,
                permissions: this.convertPermissions(template.permissions)
            });

            return role;
        } catch (e) {
            throw new Error(`Failed to create role: ${e.message}`);
        }
    }

    /**
     * Convert permission names to bits
     * @param {array} permissions - Permission names
     * @returns {bigint} - Permission bits
     */
    convertPermissions(permissions) {
        const bits = new PermissionsBitField();
        
        for (const perm of permissions) {
            try {
                bits.add(perm);
            } catch (e) {
                console.warn(`Invalid permission: ${perm}`);
            }
        }

        return bits.bitfield;
    }

    /**
     * Save a custom template
     * @param {string} guildId - Guild ID
     * @param {string} name - Template name
     * @param {object} config - Template config
     */
    saveTemplate(guildId, name, config) {
        const key = `${guildId}_${name}`;
        this.templates[key] = {
            name: config.name,
            permissions: config.permissions || [],
            color: config.color || '#FFFFFF',
            hoist: config.hoist !== undefined ? config.hoist : false
        };
        this.saveTemplates();
    }

    /**
     * Get template
     * @param {string} guildId - Guild ID
     * @param {string} name - Template name
     * @returns {object} - Template config
     */
    getTemplate(guildId, name) {
        const key = `${guildId}_${name}`;
        return this.templates[key] || this.defaultTemplates[name] || null;
    }

    /**
     * Delete a custom template
     * @param {string} guildId - Guild ID
     * @param {string} name - Template name
     */
    deleteTemplate(guildId, name) {
        const key = `${guildId}_${name}`;
        delete this.templates[key];
        this.saveTemplates();
    }

    /**
     * List all available templates for a guild
     * @param {string} guildId - Guild ID
     * @returns {array} - Template names
     */
    listTemplates(guildId) {
        const custom = Object.keys(this.templates)
            .filter(k => k.startsWith(guildId))
            .map(k => k.split('_')[1]);
        
        const defaults = Object.keys(this.defaultTemplates);
        
        return [...new Set([...custom, ...defaults])];
    }

    /**
     * Get permission list
     * @returns {array} - Available permissions
     */
    getAvailablePermissions() {
        return [
            'SendMessages',
            'ViewChannel',
            'ReadMessageHistory',
            'SendMessagesInThreads',
            'CreatePublicThreads',
            'CreatePrivateThreads',
            'ManageMessages',
            'ManageChannels',
            'ManageRoles',
            'ManageGuild',
            'Administrator',
            'KickMembers',
            'BanMembers',
            'ModerateMembers',
            'ViewAuditLog',
            'MoveMembers',
            'DeafenMembers',
            'MuteMembers',
            'Speak',
            'PrioritySpeaker'
        ];
    }
}

module.exports = RoleTemplateManager;
