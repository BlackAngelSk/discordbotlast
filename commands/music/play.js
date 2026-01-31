const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');
const https = require('https');
const MusicQueue = require('../../utils/MusicQueue');
const queues = require('../../utils/queues');
const { parseDuration, formatDuration } = require('../../utils/helpers');

module.exports = {
    name: 'play',
    description: 'Play music from YouTube',
    async execute(message, args, client) {
        const fetchSpotifyMetadata = (url) => new Promise((resolve, reject) => {
            const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
            https.get(oembedUrl, res => {
                let data = '';
                res.on('data', chunk => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });

        const createMusicControls = (disabled = false) => {
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_previous')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setEmoji('⏸️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_resume')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_skip')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(disabled)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_vol_down')
                    .setEmoji('🔉')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_vol_up')
                    .setEmoji('🔊')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled),
                new ButtonBuilder()
                    .setCustomId('music_loop')
                    .setLabel('Loop: Off')
                    .setEmoji('🔁')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            );

            return [row1, row2];
        };
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        let query = args.join(' ');
        if (!query) {
            return message.reply('❌ Please provide a YouTube URL or search query!\nExample: `!play never gonna give you up`');
        }

        try {
            await message.reply('🔍 Searching...');

            let songInfo;
            let videoUrl;
            
            // Check if it's a YouTube URL
            let isUrl = query.startsWith('http://') || query.startsWith('https://');
            
            // Check if it's a playlist
            const isPlaylist = query.includes('list=');
            
            // Convert Spotify URLs to YouTube search queries
            if (isUrl && query.includes('spotify.com')) {
                try {
                    const meta = await fetchSpotifyMetadata(query);
                    const title = meta?.title || '';
                    const author = meta?.author_name || '';
                    const searchQuery = `${title} ${author}`.trim();

                    if (!searchQuery) {
                        return message.reply('❌ Could not read Spotify metadata. Try a YouTube link instead!');
                    }

                    query = searchQuery;
                    isUrl = false;
                } catch (error) {
                    console.error('Spotify error:', error);
                    return message.reply('❌ Could not process Spotify URL. Try a YouTube link instead!');
                }
            }

            if (isUrl && isPlaylist) {
                // Handle playlist with play-dl
                const playlistInfo = await play.playlist_info(query, { incomplete: true });
                
                if (!playlistInfo) {
                    return message.reply('❌ Could not fetch playlist information!');
                }

                const videos = await playlistInfo.all_videos();
                
                if (videos.length === 0) {
                    return message.reply('❌ No videos found in playlist!');
                }
                
                let queue = queues.get(message.guild.id);
                if (!queue) {
                    queue = new MusicQueue(message.guild.id);
                    queues.set(message.guild.id, queue);

                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: message.guild.id,
                        adapterCreator: message.guild.voiceAdapterCreator,
                    });

                    await queue.setupConnection(connection);
                }
                
                // Add all songs from playlist
                const songs = [];
                for (const video of videos.slice(0, 50)) { // Limit to 50 songs
                    const song = {
                        title: video.title,
                        url: video.url,
                        duration: video.durationInSec || 0,
                        thumbnail: video.thumbnails?.[0]?.url,
                        requester: message.author.tag
                    };
                    queue.addSong(song);
                    songs.push(song);
                }
                
                const playlistEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('📋 Playlist Added')
                    .setDescription(`Added ${songs.length} songs from playlist`)
                    .addFields(
                        { name: '🎧 Requested by', value: message.author.tag, inline: true }
                    );
                
                await message.channel.send({ embeds: [playlistEmbed] });
                
                const isFirstSong = !queue.isPlaying;
                if (isFirstSong) {
                    queue.playNext();
                    
                    const nowPlayingEmbed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle('🎵 Now Playing')
                        .setDescription(`[${songs[0].title}](${songs[0].url})`)
                        .addFields(
                            { name: '⏱️ Duration', value: formatDuration(songs[0].duration), inline: true },
                            { name: '🎧 Requested by', value: songs[0].requester, inline: true }
                        )
                        .setThumbnail(songs[0].thumbnail);

                    const msg = await message.channel.send({
                        embeds: [nowPlayingEmbed],
                        components: createMusicControls()
                    });
                    queue.nowPlayingMessage = msg;
                }
                
                return;
            }
            
            if (isUrl) {
                // Validate YouTube URL with play-dl
                const isValid = play.yt_validate(query);
                if (isValid === 'video') {
                    videoUrl = query;
                    const info = await play.video_info(query);
                    const video = info.video_details;
                    songInfo = {
                        title: video.title,
                        duration: video.durationInSec || 0,
                        thumbnail: video.thumbnails?.[0]?.url
                    };
                } else {
                    return message.reply('❌ Invalid YouTube URL!');
                }
            } else {
                // Search using play-dl
                const searchResults = await play.search(query, { limit: 1 });
                
                if (!searchResults || searchResults.length === 0) {
                    return message.reply('❌ No results found!');
                }
                
                const video = searchResults[0];
                videoUrl = video.url;
                songInfo = {
                    title: video.title,
                    duration: video.durationInSec || 0,
                    thumbnail: video.thumbnails?.[0]?.url
                };
            }

            console.log('Song Info:', { title: songInfo.title, url: videoUrl, duration: songInfo.duration });

            if (!videoUrl) {
                return message.reply('❌ Could not get video URL!');
            }

            const song = {
                title: songInfo.title,
                url: videoUrl,
                duration: songInfo.duration,
                thumbnail: songInfo.thumbnail,
                requester: message.author.tag
            };

            let queue = queues.get(message.guild.id);
            if (!queue) {
                queue = new MusicQueue(message.guild.id);
                queues.set(message.guild.id, queue);

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });

                await queue.setupConnection(connection);
            }

            queue.addSong(song);

            const isFirstSong = !queue.isPlaying;
            
            if (isFirstSong) {
                queue.playNext();
                
                const nowPlayingEmbed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('🎵 Now Playing')
                    .setDescription(`[${song.title}](${song.url})`)
                    .addFields(
                        { name: '⏱️ Duration', value: formatDuration(song.duration), inline: true },
                        { name: '🎧 Requested by', value: song.requester, inline: true }
                    )
                    .setThumbnail(song.thumbnail);

                const msg = await message.channel.send({
                    embeds: [nowPlayingEmbed],
                    components: createMusicControls()
                });
                queue.nowPlayingMessage = msg;
            } else {
                const queueEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Added to Queue')
                    .setDescription(`[${song.title}](${song.url})`)
                    .addFields(
                        { name: '⏱️ Duration', value: formatDuration(song.duration), inline: true },
                        { name: '📍 Position', value: `${queue.songs.length}`, inline: true },
                        { name: '🎧 Requested by', value: song.requester, inline: true }
                    )
                    .setThumbnail(song.thumbnail);

                const msg = await message.channel.send({
                    embeds: [queueEmbed],
                    components: createMusicControls()
                });
                queue.nowPlayingMessage = msg;
            }
        } catch (error) {
            console.error('Error playing song:', error);
            message.reply('❌ An error occurred while trying to play the song!');
        }
    }
};
