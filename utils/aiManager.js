const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIManager {
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ GEMINI_API_KEY is not set in .env file. AI commands will not work.');
            this.genAI = null;
        } else {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        }
    }

    /**
     * Ask a question to the AI model
     * @param {string} question - The user's question
     * @returns {Promise<string>} - The AI's response
     */
    async ask(question) {
        if (!this.genAI) {
            throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.');
        }

        try {
            const result = await this.model.generateContent(question);
            const response = await result.response;
            const text = response.text();
            return text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw new Error(`Failed to get AI response: ${error.message}`);
        }
    }

    /**
     * Generate content with more detailed options
     * @param {string} prompt - The prompt text
     * @param {Object} options - Configuration options
     * @returns {Promise<string>} - The generated content
     */
    async generateContent(prompt, options = {}) {
        if (!this.genAI) {
            throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.');
        }

        try {
            const {
                maxTokens = 1000,
                temperature = 0.7,
                topP = 0.9,
                topK = 40
            } = options;

            const result = await this.model.generateContent({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature,
                    topP,
                    topK
                }
            });

            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error generating content:', error);
            throw new Error(`Failed to generate content: ${error.message}`);
        }
    }

    /**
     * Check if API is configured
     * @returns {boolean}
     */
    isConfigured() {
        return this.genAI !== null;
    }
}

module.exports = new AIManager();
