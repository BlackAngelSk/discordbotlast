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

            const normalize = (text) =>
                String(text || '')
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

            const scoreMatch = (query, candidate) => {
                const q = normalize(query);
                const c = normalize(candidate);
                if (!q || !c) return 0;
                if (c === q) return 100;
                if (c.includes(q)) return 90;

                const qWords = q.split(' ').filter(Boolean);
                const cWords = new Set(c.split(' ').filter(Boolean));
                if (qWords.length === 0) return 0;

                let hits = 0;
                for (const word of qWords) {
                    if (cWords.has(word)) hits++;
                }
                return Math.round((hits / qWords.length) * 80);
            };

            let lyrics;
            let foundLyrics = false;
            let displayTitle = cleanQuery;

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

            async function tryLyricsSuggest(query) {
                try {
                    const response = await fetch(
                        `https://api.lyrics.ovh/suggest/${encodeURIComponent(query.trim())}`
                    );

                    if (!response.ok) return null;

                    const data = await response.json();
                    const candidates = Array.isArray(data.data) ? data.data.slice(0, 8) : [];
                    if (candidates.length === 0) return null;

                    const ranked = candidates
                        .map((item) => {
                            const artist = item?.artist?.name || '';
                            const title = item?.title || '';
                            return {
                                artist,
                                title,
                                label: `${artist} - ${title}`,
                                score: scoreMatch(query, `${artist} ${title}`)
                            };
                        })
                        .sort((a, b) => b.score - a.score);

                    for (const candidate of ranked) {
                        if (!candidate.artist || !candidate.title) continue;
                        const result = await tryLyricsOVH(candidate.artist, candidate.title);
                        if (result) {
                            return { lyrics: result, label: candidate.label };
                        }
                    }

                    return null;
                } catch (_) {
                    return null;
                }
            }

            // First, try direct artist - song format
            if (cleanQuery.includes(' - ')) {
                const [artist, ...songParts] = cleanQuery.split(' - ');
                const song = songParts.join(' - ').trim();
                if (artist.trim()) {
                    lyrics = await tryLyricsOVH(artist, song);
                    if (lyrics) {
                        foundLyrics = true;
                        displayTitle = `${artist.trim()} - ${song}`;
                    }
                }
            }

            // Try by/feat patterns
            if (!foundLyrics && cleanQuery.match(/\s+by\s+|\s+feat\s+/i)) {
                const parts = cleanQuery.split(/\s+by\s+|\s+feat\s+/i);
                if (parts.length >= 2) {
                    lyrics = await tryLyricsOVH(parts[1], parts[0]);
                    if (lyrics) {
                        foundLyrics = true;
                        displayTitle = `${parts[1].trim()} - ${parts[0].trim()}`;
                    }
                }
            }

            // Try with suggestion endpoint for better artist/title matching
            if (!foundLyrics) {
                const suggested = await tryLyricsSuggest(cleanQuery);
                if (suggested?.lyrics) {
                    lyrics = suggested.lyrics;
                    foundLyrics = true;
                    displayTitle = suggested.label;
                }
            }

            // Last resort: try swapping common separators
            if (!foundLyrics && cleanQuery.includes('/')) {
                const parts = cleanQuery.split('/');
                if (parts.length >= 2) {
                    lyrics = await tryLyricsOVH(parts[0], parts[1]);
                    if (lyrics) {
                        foundLyrics = true;
                        displayTitle = `${parts[0].trim()} - ${parts[1].trim()}`;
                    }
                }
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
                .setTitle(`🎤 Lyrics: ${displayTitle}`)
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
