const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetch } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme from Reddit'),
    
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subreddits = ['memes', 'dankmemes', 'funny', 'me_irl'];
            const subreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
            
            const response = await fetch(`https://www.reddit.com/r/${subreddit}/random.json`);
            const data = await response.json();

            if (!data || !data[0] || !data[0].data || !data[0].data.children || data[0].data.children.length === 0) {
                return interaction.editReply('❌ Could not fetch meme. Try again!');
            }

            const post = data[0].data.children[0].data;

            // Skip if NSFW
            if (post.over_18) {
                return interaction.editReply('❌ NSFW content detected. Try again for a SFW meme!');
            }

            const embed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle(post.title.length > 256 ? post.title.substring(0, 253) + '...' : post.title)
                .setURL(`https://reddit.com${post.permalink}`)
                .setImage(post.url)
                .setFooter({ text: `👍 ${post.ups} | r/${subreddit}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Meme error:', error);
            await interaction.editReply('❌ Failed to fetch meme!');
        }
    },
};
