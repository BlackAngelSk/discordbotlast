const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class WelcomeMessageManager {
    constructor() {
        this.configDir = path.join(__dirname, '../data');
        this.configFile = path.join(this.configDir, 'welcomeMessages.json');
        this.configs = this.loadConfigs();
    }

    loadConfigs() {
        try {
            if (fs.existsSync(this.configFile)) {
                return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load welcome configs:', e);
        }
        return {};
    }

    saveConfigs() {
        try {
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }
            fs.writeFileSync(this.configFile, JSON.stringify(this.configs, null, 2));
        } catch (e) {
            console.error('Failed to save welcome configs:', e);
        }
    }

    /**
     * Set welcome message for a guild
     * @param {string} guildId - Guild ID
     * @param {object} config - Welcome config
     */
    setWelcomeConfig(guildId, config) {
        this.configs[guildId] = {
            enabled: config.enabled !== undefined ? config.enabled : true,
            channelId: config.channelId,
            title: config.title || 'Welcome to {SERVER_NAME}!',
            description: config.description || 'Welcome {USER}, enjoy your stay!',
            color: config.color || '#0099ff',
            includeAvatar: config.includeAvatar || true,
            includeCount: config.includeCount || true,
            dm: config.dm || false,
            dmMessage: config.dmMessage || 'Welcome to {SERVER_NAME}! Please read the rules.'
        };
        this.saveConfigs();
    }

    /**
     * Get welcome config for a guild
     * @param {string} guildId - Guild ID
     * @returns {object} - Welcome config
     */
    getWelcomeConfig(guildId) {
        return this.configs[guildId] || null;
    }

    /**
     * Remove welcome config for a guild
     * @param {string} guildId - Guild ID
     */
    removeWelcomeConfig(guildId) {
        delete this.configs[guildId];
        this.saveConfigs();
    }

    /**
     * Send welcome message
     * @param {GuildMember} member - Guild member
     * @returns {Promise<void>}
     */
    async sendWelcomeMessage(member) {
        const config = this.getWelcomeConfig(member.guild.id);

        if (!config || !config.enabled) return;

        try {
            // Send channel message
            if (config.channelId) {
                const channel = member.guild.channels.cache.get(config.channelId);
                if (channel && channel.isTextBased()) {
                    const embed = this.createWelcomeEmbed(member, config);
                    await channel.send({ embeds: [embed] }).catch(() => {});
                }
            }

            // Send DM
            if (config.dm) {
                const dmMessage = this.replaceVariables(config.dmMessage, member);
                await member.send(dmMessage).catch(() => {});
            }
        } catch (e) {
            console.error('Failed to send welcome message:', e);
        }
    }

    /**
     * Create welcome embed
     * @param {GuildMember} member - Guild member
     * @param {object} config - Welcome config
     * @returns {EmbedBuilder} - Welcome embed
     */
    createWelcomeEmbed(member, config) {
        const embed = new EmbedBuilder()
            .setColor(config.color)
            .setTitle(this.replaceVariables(config.title, member))
            .setDescription(this.replaceVariables(config.description, member))
            .setTimestamp();

        if (config.includeAvatar) {
            embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
        }

        if (config.includeCount) {
            embed.addFields(
                { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
            );
        }

        return embed;
    }

    /**
     * Replace variables in message
     * @param {string} text - Text with variables
     * @param {GuildMember} member - Guild member
     * @returns {string} - Processed text
     */
    replaceVariables(text, member) {
        return text
            .replace(/{USER}/g, member.user.toString())
            .replace(/{USERNAME}/g, member.user.username)
            .replace(/{SERVER_NAME}/g, member.guild.name)
            .replace(/{MEMBER_COUNT}/g, member.guild.memberCount)
            .replace(/{USER_ID}/g, member.id)
            .replace(/{SERVER_ID}/g, member.guild.id);
    }

    /**
     * Get available variables
     * @returns {array} - List of available variables
     */
    getAvailableVariables() {
        return [
            { name: '{USER}', description: 'Mention the user' },
            { name: '{USERNAME}', description: 'Username only' },
            { name: '{SERVER_NAME}', description: 'Server name' },
            { name: '{MEMBER_COUNT}', description: 'Total member count' },
            { name: '{USER_ID}', description: 'User ID' },
            { name: '{SERVER_ID}', description: 'Server ID' }
        ];
    }
}

module.exports = WelcomeMessageManager;
