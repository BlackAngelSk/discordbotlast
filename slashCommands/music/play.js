const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const ytsr = require('ytsr');
const youtubedl = require('youtube-dl-exec');
const queues = require('../../utils/queues');
const MusicQueue = require('../../utils/MusicQueue');
const { parseDuration } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from YouTube, Spotify, or SoundCloud')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name, YouTube URL, Spotify URL, or SoundCloud URL')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('❌ You need to be in a voice channel to play music!');
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.editReply('❌ I need permissions to join and speak in your voice channel!');
        }

        try {
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
            await interaction.editReply('❌ An error occurred while trying to play the song!');
        }
    },
};

async function handleYouTubeVideo(url, queue, interaction) {
    const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
    });

    const song = {
        title: info.title,
        url: info.webpage_url,
        duration: info.duration,
        thumbnail: info.thumbnail,
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
        await interaction.editReply({ embeds: [embed] });
    } else {
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleYouTubePlaylist(url, queue, interaction) {
    await interaction.editReply('🔍 Fetching playlist...');

    const playlistInfo = await youtubedl(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
    });

    const entries = playlistInfo.entries || [];
    const maxSongs = Math.min(entries.length, 50);

    for (let i = 0; i < maxSongs; i++) {
        const entry = entries[i];
        if (entry && entry.url) {
            const song = {
                title: entry.title,
                url: entry.url,
                duration: entry.duration || 0,
                thumbnail: entry.thumbnail,
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

    await interaction.editReply({ embeds: [embed] });
}

async function handleYouTubeSearch(query, queue, interaction) {
    const searchResults = await ytsr(query, { limit: 1 });
    const video = searchResults.items.find(item => item.type === 'video');

    if (!video) {
        return interaction.editReply('❌ No results found!');
    }

    const info = await youtubedl(video.url, {
        dumpSingleJson: true,
        noWarnings: true,
    });

    const song = {
        title: info.title,
        url: info.webpage_url,
        duration: info.duration,
        thumbnail: info.thumbnail,
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

    await interaction.editReply({ embeds: [embed] });
}

async function handleSpotify(url, queue, interaction) {
    // Convert Spotify to YouTube search
    try {
        const spotifyRegex = /spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/;
        const match = url.match(spotifyRegex);
        
        if (!match) {
            return interaction.editReply('❌ Invalid Spotify URL!');
        }

        // For now, we'll use a simple search approach
        // In production, you'd want to use Spotify API
        await interaction.editReply('🎵 Spotify support: Searching on YouTube...');
        
        // Extract track info from URL if possible, otherwise generic search
        const searchQuery = url;
        await handleYouTubeSearch(searchQuery, queue, interaction);
    } catch (error) {
        console.error('Spotify error:', error);
        await interaction.editReply('❌ Could not process Spotify URL. Try a YouTube link instead!');
    }
}

async function handleSoundCloud(url, queue, interaction) {
    try {
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
        });

        const song = {
            title: info.title,
            url: info.webpage_url,
            duration: info.duration,
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

        await interaction.editReply({ embeds: [embed] });
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
