const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const play = require('play-dl');
const https = require('https');
const queues = require('../../utils/queues');
const MusicQueue = require('../../utils/MusicQueue');
const { parseDuration } = require('../../utils/helpers');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube, Spotify, or SoundCloud')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name, YouTube URL, Spotify URL, or SoundCloud URL')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            // Defer IMMEDIATELY - must happen within 3 seconds
            await interaction.deferReply().catch(err => {
                console.error('Failed to defer reply:', err.message);
            });

            const query = interaction.options.getString('query');
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.editReply('❌ You need to be in a voice channel to play music!').catch(() => {});
            }

            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has('Connect') || !permissions.has('Speak')) {
                return interaction.editReply('❌ I need permissions to join and speak in your voice channel!').catch(() => {});
            }
            let queue = queues.get(interaction.guildId);

            if (!queue) {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                queue = new MusicQueue(interaction.guildId);
                await queue.setupConnection(connection);
                queues.set(interaction.guildId, queue);
            }

            // Check if it's a Spotify URL
            if (query.includes('spotify.com')) {
                await handleSpotify(query, queue, interaction);
                return;
            }

            // Check if it's a SoundCloud URL
            if (query.includes('soundcloud.com')) {
                await handleSoundCloud(query, queue, interaction);
                return;
            }

            // Check if it's a YouTube playlist
            if (query.includes('list=')) {
                await handleYouTubePlaylist(query, queue, interaction);
                return;
            }

            // Check if it's a YouTube video URL
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                await handleYouTubeVideo(query, queue, interaction);
                return;
            }

            // Search YouTube
            await handleYouTubeSearch(query, queue, interaction);

        } catch (error) {
            console.error('Error in play command:', error);
            try {
                await interaction.editReply('❌ An error occurred while trying to play the song!');
            } catch (e) {
                console.error('Failed to send error message:', e.message);
            }
        }
    },
};

async function handleYouTubeVideo(url, queue, interaction) {
    try {
        const isValid = play.yt_validate(url);
        if (isValid !== 'video') {
            await interaction.editReply('❌ Invalid YouTube video URL!');
            return;
        }

        const info = await play.video_info(url);
        const video = info.video_details;

        const song = {
            title: video.title,
            url: video.url,
            duration: video.durationInSec,
            thumbnail: video.thumbnails?.[0]?.url,
            requester: interaction.user.tag
        };

        queue.addSong(song);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎵 Added to Queue')
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields(
                { name: 'Duration', value: formatTime(song.duration), inline: true },
                { name: 'Position', value: `${queue.songs.length}`, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        if (!queue.isPlaying) {
            queue.playNext();
            await interaction.editReply({ embeds: [embed], components: createMusicControls() });
        } else {
            await interaction.editReply({ embeds: [embed], components: createMusicControls() });
        }
    } catch (error) {
        console.error('Error handling YouTube video:', error);
        await interaction.editReply('❌ Failed to process video!');
    }
}

async function handleYouTubePlaylist(url, queue, interaction) {
    await interaction.editReply('🔍 Fetching playlist...');

    const playlistInfo = await play.playlist_info(url, { incomplete: true });
    
    if (!playlistInfo) {
        await interaction.editReply('❌ Could not fetch playlist information!');
        return;
    }

    const videos = await playlistInfo.all_videos();
    const maxSongs = Math.min(videos.length, 50);

    for (let i = 0; i < maxSongs; i++) {
        const video = videos[i];
        if (video && video.url) {
            const song = {
                title: video.title,
                url: video.url,
                duration: video.durationInSec || 0,
                thumbnail: video.thumbnails?.[0]?.url,
                requester: interaction.user.tag
            };
            queue.addSong(song);
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📃 Playlist Added')
        .setDescription(`Added **${maxSongs}** songs to the queue`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` });

    if (!queue.isPlaying) {
        queue.playNext();
    }

    await interaction.editReply({ embeds: [embed], components: createMusicControls() });
}

async function handleYouTubeSearch(query, queue, interaction) {
    try {
        // Use play-dl to search
        const searchResults = await play.search(query, { limit: 1 });
        
        if (!searchResults || searchResults.length === 0) {
            return interaction.editReply('❌ No results found!');
        }

        const video = searchResults[0];

        const song = {
            title: video.title,
            url: video.url,
            duration: video.durationInSec || 0,
            thumbnail: video.thumbnails?.[0]?.url,
            requester: interaction.user.tag
        };

        queue.addSong(song);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎵 Added to Queue')
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields(
                { name: 'Duration', value: formatTime(song.duration), inline: true },
                { name: 'Position', value: `${queue.songs.length}`, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        if (!queue.isPlaying) {
            queue.playNext();
        }

        await interaction.editReply({ embeds: [embed], components: createMusicControls() });
    } catch (error) {
        console.error('Search error:', error);
        await interaction.editReply('❌ Failed to search for the song!');
    }
}

async function handleSpotify(url, queue, interaction) {
    try {
        const spotifyRegex = /spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/;
        const match = url.match(spotifyRegex);
        
        if (!match) {
            return interaction.editReply('❌ Invalid Spotify URL!');
        }

        await interaction.editReply('🎵 Spotify support: Fetching details...');

        const meta = await fetchSpotifyMetadata(url);
        const title = meta?.title || '';
        const author = meta?.author_name || '';
        const searchQuery = `${title} ${author}`.trim();

        if (!searchQuery) {
            return interaction.editReply('❌ Could not read Spotify metadata. Try a YouTube link instead!');
        }

        await interaction.editReply('🎵 Spotify support: Searching on YouTube...');
        await handleYouTubeSearch(searchQuery, queue, interaction);
    } catch (error) {
        console.error('Spotify error:', error);
        await interaction.editReply('❌ Could not process Spotify URL. Try a YouTube link instead!');
    }
}

async function handleSoundCloud(url, queue, interaction) {
    try {
        const isValid = play.so_validate(url);
        if (!isValid) {
            return interaction.editReply('❌ Invalid SoundCloud URL!');
        }

        const info = await play.soundcloud(url);

        const song = {
            title: info.name,
            url: info.url,
            duration: info.durationInSec,
            thumbnail: info.thumbnail,
            requester: interaction.user.tag
        };

        queue.addSong(song);

        const embed = new EmbedBuilder()
            .setColor('#FF5500')
            .setTitle('🎵 Added to Queue (SoundCloud)')
            .setDescription(`**[${song.title}](${song.url})**`)
            .addFields(
                { name: 'Duration', value: formatTime(song.duration), inline: true },
                { name: 'Position', value: `${queue.songs.length}`, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        if (!queue.isPlaying) {
            queue.playNext();
        }

        await interaction.editReply({ embeds: [embed], components: createMusicControls() });
    } catch (error) {
        console.error('SoundCloud error:', error);
        await interaction.editReply('❌ Could not play SoundCloud track!');
    }
}

function formatTime(seconds) {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
