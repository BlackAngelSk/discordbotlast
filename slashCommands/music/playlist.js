/**
 * Slash Command: Playlist
 * Manage music playlists
 */

const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const play = require('play-dl');
const queues = require('../../utils/queues');
const MusicQueue = require('../../utils/MusicQueue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Manage your music playlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Playlist description')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View all your playlists')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a song to a playlist')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Target playlist')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('song')
                        .setDescription('Song name or URL')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a song from a playlist')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Target playlist')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('song_number')
                        .setDescription('Song number in the playlist list (starting at 1)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete one of your playlists')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Playlist to delete')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Load a playlist into queue')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Playlist to load')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('public')
                .setDescription('Make playlist public')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Target playlist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Browse public playlists')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recommend')
                .setDescription('Get song recommendations')
        ),

    async execute(interaction) {
        const musicPlaylistManager = require('../../utils/musicPlaylistManager');
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'create') {
                const name = interaction.options.getString('name');
                const description = interaction.options.getString('description') || '';
                const existing = await musicPlaylistManager.getUserPlaylists(interaction.user.id);

                if (existing.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                    return interaction.reply('❌ You already have a playlist with that name.');
                }

                const playlist = await musicPlaylistManager.createPlaylist(interaction.user.id, name, description);

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Playlist Created',
                        description: `Created playlist **${name}**`,
                        fields: [
                            { name: 'Playlist ID', value: playlist.id, inline: false }
                        ]
                    }]
                });
            }

            if (subcommand === 'list') {
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);

                if (playlists.length === 0) {
                    return interaction.reply('You don\'t have any playlists yet! Use `/playlist create` to create one.');
                }

                const embed = {
                    color: 0x5865F2,
                    title: '📋 Your Playlists',
                    fields: playlists.map(p => ({
                        name: p.name,
                        value: `${p.songs.length} songs${p.public ? ' • 🌐 Public' : ''}`,
                        inline: true
                    }))
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'add') {
                const playlistName = interaction.options.getString('playlist');
                const songQuery = interaction.options.getString('song');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                const song = await resolveSongFromQuery(songQuery, interaction.user.tag);
                if (!song) {
                    return interaction.reply('❌ Could not find that song. Try a different name or URL.');
                }

                const addedSong = await musicPlaylistManager.addSongToPlaylist(interaction.user.id, playlist.id, song);
                if (!addedSong) {
                    return interaction.reply('❌ Failed to add song to playlist.');
                }

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Song Added',
                        description: `Added **${addedSong.title}** to **${playlist.name}**`,
                        fields: [
                            { name: 'Total songs', value: `${playlist.songs.length + 1}`, inline: true }
                        ]
                    }]
                });
            }

            if (subcommand === 'remove') {
                const playlistName = interaction.options.getString('playlist');
                const songNumber = interaction.options.getInteger('song_number');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                if (!playlist.songs.length) {
                    return interaction.reply('❌ That playlist is empty.');
                }

                const songIndex = songNumber - 1;
                const targetSong = playlist.songs[songIndex];

                if (!targetSong) {
                    return interaction.reply(`❌ Song number must be between 1 and ${playlist.songs.length}.`);
                }

                const removed = await musicPlaylistManager.removeSongFromPlaylist(interaction.user.id, playlist.id, targetSong.id);
                if (!removed) {
                    return interaction.reply('❌ Failed to remove that song.');
                }

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Song Removed',
                        description: `Removed **${targetSong.title}** from **${playlist.name}**`
                    }]
                });
            }

            if (subcommand === 'delete') {
                const playlistName = interaction.options.getString('playlist');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                const deleted = await musicPlaylistManager.deletePlaylist(interaction.user.id, playlist.id);
                if (!deleted) {
                    return interaction.reply('❌ Failed to delete playlist.');
                }

                return interaction.reply(`✅ Deleted playlist **${playlist.name}**.`);
            }

            if (subcommand === 'load') {
                const playlistName = interaction.options.getString('playlist');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                if (!playlist.songs.length) {
                    return interaction.reply('❌ This playlist is empty. Add songs first using `/playlist add`.');
                }

                const member = interaction.member;
                const voiceChannel = member.voice.channel;

                if (!voiceChannel) {
                    return interaction.reply('❌ You need to be in a voice channel to load a playlist.');
                }

                const permissions = voiceChannel.permissionsFor(interaction.client.user);
                if (!permissions.has('Connect') || !permissions.has('Speak')) {
                    return interaction.reply('❌ I need permissions to join and speak in your voice channel!');
                }

                let queue = queues.get(interaction.guildId);
                if (!queue) {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator
                    });

                    queue = new MusicQueue(interaction.guildId);
                    await queue.setupConnection(connection);
                    queues.set(interaction.guildId, queue);
                }

                for (const song of playlist.songs) {
                    queue.addSong({
                        title: song.title,
                        url: song.url,
                        duration: song.duration || 0,
                        requester: interaction.user.tag
                    });
                }

                if (!queue.isPlaying) {
                    queue.playNext();
                }

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Playlist Loaded',
                        description: `Added ${playlist.songs.length} songs to queue`,
                        fields: [
                            { name: 'Playlist', value: playlist.name, inline: true },
                            { name: 'Songs', value: playlist.songs.length.toString(), inline: true }
                        ]
                    }]
                });
            }

            if (subcommand === 'browse') {
                const publicPlaylists = await musicPlaylistManager.getPublicPlaylists(5);

                if (publicPlaylists.length === 0) {
                    return interaction.reply('No public playlists available yet!');
                }

                const embed = {
                    color: 0x5865F2,
                    title: '🌐 Public Playlists',
                    fields: publicPlaylists.map(p => ({
                        name: p.name,
                        value: `${p.songs.length} songs`,
                        inline: true
                    }))
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'recommend') {
                const recommendations = await musicPlaylistManager.getRecommendations(interaction.user.id);

                if (recommendations.length === 0) {
                    return interaction.reply('Create some playlists to get recommendations!');
                }

                const embed = {
                    color: 0x5865F2,
                    title: '💡 Recommendations',
                    fields: [
                        {
                            name: 'Suggested Songs',
                            value: recommendations.map(s => `• ${s.title}`).join('\n'),
                            inline: false
                        }
                    ]
                };

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'public') {
                const playlistName = interaction.options.getString('playlist');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                const updated = await musicPlaylistManager.makePlaylistPublic(interaction.user.id, playlist.id, true);

                return interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Playlist Published',
                        description: `**${updated.name}** is now public!`
                    }]
                });
            }
        } catch (error) {
            console.error('Playlist command error:', error);
            return interaction.reply('❌ An error occurred while managing playlists.');
        }
    }
};

async function resolveSongFromQuery(query, requesterTag) {
    try {
        const isYoutubeUrl = query.includes('youtube.com') || query.includes('youtu.be');
        if (isYoutubeUrl && play.yt_validate(query) === 'video') {
            const info = await play.video_info(query);
            const video = info.video_details;

            return {
                title: video.title,
                url: video.url,
                duration: video.durationInSec || 0,
                requester: requesterTag
            };
        }

        const results = await play.search(query, { limit: 1 });
        if (!results || !results.length) {
            return null;
        }

        const top = results[0];
        return {
            title: top.title,
            url: top.url,
            duration: top.durationInSec || 0,
            requester: requesterTag
        };
    } catch (error) {
        console.error('Failed to resolve song query:', error);
        return null;
    }
}
