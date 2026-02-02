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

            let lyrics;
            let foundLyrics = false;

            // Try multiple API approaches
            async function tryLyricsOVH(artist, song) {
                try {
                    const response = await fetch(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(song.trim())}`
                    );
                    if (response.ok) {
                        const data = await response.json();
                        return data.lyrics || null;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }

            // First, try direct artist - song format
            if (cleanQuery.includes(' - ')) {
                const [artist, ...songParts] = cleanQuery.split(' - ');
                const song = songParts.join(' - ').trim();
                if (artist.trim()) {
                    lyrics = await tryLyricsOVH(artist, song);
                    if (lyrics) foundLyrics = true;
                }
            }

            // Try by/feat patterns
            if (!foundLyrics && cleanQuery.match(/\s+by\s+|\s+feat\s+/i)) {
                const parts = cleanQuery.split(/\s+by\s+|\s+feat\s+/i);
                if (parts.length >= 2) {
                    lyrics = await tryLyricsOVH(parts[1], parts[0]);
                    if (lyrics) foundLyrics = true;
                }
            }

            // Try as-is (lyrics.ovh will attempt to parse it)
            if (!foundLyrics) {
                lyrics = await tryLyricsOVH(cleanQuery, cleanQuery);
                if (lyrics) foundLyrics = true;
            }

            // Last resort: try swapping common separators
            if (!foundLyrics && cleanQuery.includes('/')) {
                const parts = cleanQuery.split('/');
                lyrics = await tryLyricsOVH(parts[0], parts[1]);
                if (lyrics) foundLyrics = true;
            }

            if (!foundLyrics || !lyrics) {
                return message.reply(`❌ Couldn't find lyrics for "${cleanQuery}"!\n**Try using format:** \`!lyrics Artist - Song Name\`\n**Example:** \`!lyrics Metallica - Nothing Else Matters\``);
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
                .setDescription(chunks[0]);
            
            if (chunks.length > 1) {
                embed.setFooter({ text: `Page 1/${chunks.length}` });
            }

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
            message.reply(`❌ An error occurred while fetching lyrics!\nTry format: \`!lyrics Artist - Song Name\`\nExample: \`!lyrics Metallica - Nothing Else Matters\``);
        }
    }
};
