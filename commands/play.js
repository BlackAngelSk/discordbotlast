const { EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const ytsr = require('ytsr');
const youtubedl = require('youtube-dl-exec');
const MusicQueue = require('../utils/MusicQueue');
const queues = require('../utils/queues');
const { parseDuration, formatDuration } = require('../utils/helpers');

module.exports = {
    name: 'play',
    description: 'Play music from YouTube',
    async execute(message, args, client) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Please provide a YouTube URL or search query!\nExample: `!play never gonna give you up`');
        }

        try {
            await message.reply('🔍 Searching...');

            let songInfo;
            let videoUrl;
            
            // Check if it's a YouTube URL
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            
            // Check if it's a playlist
            const isPlaylist = query.includes('list=');
            
            if (isUrl && isPlaylist) {
                // Handle playlist
                const playlistInfo = await youtubedl(query, {
                    dumpSingleJson: true,
                    flatPlaylist: true,
                    noWarnings: true,
                    noCheckCertificate: true
                });
                
                const entries = playlistInfo.entries || [];
                if (entries.length === 0) {
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
                for (const entry of entries.slice(0, 50)) { // Limit to 50 songs
                    const song = {
                        title: entry.title,
                        url: entry.url,
                        duration: Math.floor(entry.duration || 0),
                        thumbnail: entry.thumbnail,
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

                    const msg = await message.channel.send({ embeds: [nowPlayingEmbed] });
                    queue.nowPlayingMessage = msg;
                    
                    // Add reaction controls
                    await msg.react('⏸️');
                    await msg.react('▶️');
                    await msg.react('⏭️');
                    await msg.react('⏹️');
                    await msg.react('🔉');
                    await msg.react('🔊');
                }
                
                return;
            }
            
            if (isUrl) {
                videoUrl = query;
                // Get info using youtube-dl-exec
                const info = await youtubedl(videoUrl, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCheckCertificate: true
                });
                songInfo = {
                    title: info.title,
                    duration: Math.floor(info.duration || 0),
                    thumbnail: info.thumbnail
                };
            } else {
                // Search for the video
                const searchResults = await ytsr(query, { limit: 1 });
                const videos = searchResults.items.filter(item => item.type === 'video');
                
                if (videos.length === 0) {
                    return message.reply('❌ No results found!');
                }
                
                const video = videos[0];
                videoUrl = video.url;
                songInfo = {
                    title: video.title,
                    duration: video.duration ? parseDuration(video.duration) : 0,
                    thumbnail: video.bestThumbnail?.url
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

                const msg = await message.channel.send({ embeds: [nowPlayingEmbed] });
                queue.nowPlayingMessage = msg;
                
                // Add reaction controls
                await msg.react('⏸️'); // Pause
                await msg.react('▶️');  // Resume
                await msg.react('⏭️');  // Skip
                await msg.react('⏹️');  // Stop
                await msg.react('🔉');  // Volume down
                await msg.react('🔊');  // Volume up
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

                await message.channel.send({ embeds: [queueEmbed] });
            }
        } catch (error) {
            console.error('Error playing song:', error);
            message.reply('❌ An error occurred while trying to play the song!');
        }
    }
};
