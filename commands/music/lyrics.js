const { EmbedBuilder } = require('discord.js');
const queues = require('../../utils/queues');

module.exports = {
    name: 'lyrics',
    description: 'Get lyrics for the current song or search query',
    async execute(message, args, client) {
        let searchQuery = args.join(' ');
        
        // If no args, get current song
        if (!searchQuery) {
            const queue = queues.get(message.guild.id);
            if (!queue || !queue.currentSong) {
                return message.reply('❌ No song is currently playing! Provide a song name to search.\nExample: `!lyrics never gonna give you up`');
            }
            searchQuery = queue.currentSong.title;
        }

        try {
            await message.reply('🔍 Searching for lyrics...');

            // Using a free lyrics API (you can use genius-lyrics or lyrics.ovh)
            const fetch = require('undici').fetch;
            
            // Clean the search query (remove special characters, "official video", etc.)
            const cleanQuery = searchQuery
                .replace(/\(.*?\)/g, '') // Remove parentheses content
                .replace(/\[.*?\]/g, '') // Remove brackets content
                .replace(/official|video|audio|lyrics|hd|4k/gi, '')
                .trim();

            // Try lyrics.ovh API (free, no key required)
            const [artist, ...songParts] = cleanQuery.split(' - ');
            const song = songParts.join(' - ') || cleanQuery;
            
            let response;
            let lyrics;
            
            if (artist && songParts.length > 0) {
                // If we have artist - song format
                response = await fetch(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(song.trim())}`
                );
            } else {
                // Try to split by common patterns
                const parts = cleanQuery.split(/\s+-\s+|\s+by\s+/i);
                if (parts.length >= 2) {
                    response = await fetch(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(parts[0].trim())}/${encodeURIComponent(parts[1].trim())}`
                    );
                } else {
                    return message.reply(`❌ Couldn't find lyrics! Try using format: \`!lyrics Artist - Song Name\``);
                }
            }

            if (!response.ok) {
                return message.reply(`❌ Couldn't find lyrics for "${cleanQuery}"!\nTry using format: \`!lyrics Artist - Song Name\``);
            }

            const data = await response.json();
            lyrics = data.lyrics;

            if (!lyrics) {
                return message.reply(`❌ No lyrics found for "${cleanQuery}"!`);
            }

            // Split lyrics into chunks (Discord embed has 4096 char limit)
            const maxLength = 4000;
            const chunks = [];
            let currentChunk = '';

            const lines = lyrics.split('\n');
            for (const line of lines) {
                if (currentChunk.length + line.length + 1 > maxLength) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? '\n' : '') + line;
                }
            }
            if (currentChunk) {
                chunks.push(currentChunk);
            }

            // Send first chunk
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`🎤 Lyrics: ${cleanQuery}`)
                .setDescription(chunks[0])
                .setFooter({ text: chunks.length > 1 ? `Page 1/${chunks.length}` : '' });

            await message.channel.send({ embeds: [embed] });

            // Send additional chunks if needed
            for (let i = 1; i < Math.min(chunks.length, 3); i++) {
                const continueEmbed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setDescription(chunks[i])
                    .setFooter({ text: `Page ${i + 1}/${chunks.length}` });
                
                await message.channel.send({ embeds: [continueEmbed] });
            }

            if (chunks.length > 3) {
                await message.channel.send('_Lyrics too long, showing first 3 pages only..._');
            }

        } catch (error) {
            console.error('Error fetching lyrics:', error);
            message.reply(`❌ An error occurred while fetching lyrics!\nTry format: \`!lyrics Artist - Song Name\``);
        }
    }
};
