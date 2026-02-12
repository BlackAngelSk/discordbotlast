const fs = require('fs').promises;
const path = require('path');

class LanguageManager {
    constructor() {
        this.languages = new Map();
        this.defaultLanguage = 'en';
        this.loaded = false;
    }

    async init() {
        try {
            const languagesDir = path.join(__dirname, '..', 'languages');
            
            // Ensure languages directory exists
            await fs.mkdir(languagesDir, { recursive: true });

            // Load all language files
            const files = await fs.readdir(languagesDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            for (const file of jsonFiles) {
                const langCode = file.replace('.json', '');
                const filePath = path.join(languagesDir, file);
                
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const translations = JSON.parse(data);
                    this.languages.set(langCode, translations);
                    console.log(`✅ Loaded language: ${langCode}`);
                } catch (error) {
                    console.error(`❌ Failed to load language ${langCode}:`, error.message);
                }
            }

            if (this.languages.size === 0) {
                console.warn('⚠️ No language files found! Bot will use fallback strings.');
            }

            this.loaded = true;
        } catch (error) {
            console.error('Failed to initialize language manager:', error);
        }
    }

    /**
     * Get translation for a key
     * @param {string} guildId - Guild ID to get language for
     * @param {string} key - Translation key (e.g., 'commands.help.description')
     * @param {Object} variables - Variables to replace in translation (e.g., {user: 'John'})
     * @returns {string} Translated string
     */
    get(guildId, key, variables = {}) {
        // Get server language from settings
        const settingsManager = require('./settingsManager');
        const settings = settingsManager.get(guildId);
        const langCode = settings.language || this.defaultLanguage;

        // Get translation
        let translation = this.getTranslation(langCode, key);

        // Fallback to default language if not found
        if (!translation && langCode !== this.defaultLanguage) {
            translation = this.getTranslation(this.defaultLanguage, key);
        }

        // Fallback to key itself if still not found
        if (!translation) {
            console.warn(`⚠️ Translation not found: ${key} (lang: ${langCode})`);
            translation = key;
        }

        // Replace variables
        return this.replaceVariables(translation, variables);
    }

    /**
     * Get translation from language data
     */
    getTranslation(langCode, key) {
        const lang = this.languages.get(langCode);
        if (!lang) return null;

        // Support nested keys like 'commands.help.description'
        const keys = key.split('.');
        let value = lang;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return null;
            }
        }

        return typeof value === 'string' ? value : null;
    }

    /**
     * Replace variables in translation string
     */
    replaceVariables(text, variables) {
        let result = text;
        
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{${key}}`, 'g');
            result = result.replace(regex, value);
        }

        return result;
    }

    /**
     * Get available languages
     */
    getAvailableLanguages() {
        return Array.from(this.languages.keys());
    }

    /**
     * Check if language is available
     */
    isLanguageAvailable(langCode) {
        return this.languages.has(langCode);
    }

    /**
     * Reload all language files
     */
    async reload() {
        this.languages.clear();
        await this.init();
    }
}

// Export singleton instance
const languageManager = new LanguageManager();
module.exports = languageManager;
