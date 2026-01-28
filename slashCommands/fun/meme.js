const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetch } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme from Reddit'),
    
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await fetch('https://api.imgflip.com/get_memes');
            
            if (!response.ok) {
                return interaction.editReply('❌ Could not fetch meme. Try again!');
            }

            const data = await response.json();
            
            if (!data.success || !data.data || !data.data.memes || data.data.memes.length === 0) {
                return interaction.editReply('❌ Could not fetch meme. Try again!');
            }

            // Get a random meme from the list
            const meme = data.data.memes[Math.floor(Math.random() * data.data.memes.length)];

            // Validate the meme has required fields
            if (!meme.url || !meme.name) {
                return interaction.editReply('❌ Could not fetch meme. Try again!');
            }

            const embed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle(meme.name.length > 256 ? meme.name.substring(0, 253) + '...' : meme.name)
                .setImage(meme.url)
                .setFooter({ text: 'Powered by imgflip' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Meme error:', error);
            await interaction.editReply('❌ Failed to fetch meme!');
        }
    },
};
