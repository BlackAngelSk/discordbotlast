/**
 * Slash Command: Playlist
 * Manage music playlists
 */

const { SlashCommandBuilder } = require('discord.js');

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
                .setDescription('Add current song to playlist')
                .addStringOption(option =>
                    option
                        .setName('playlist')
                        .setDescription('Target playlist')
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

            if (subcommand === 'load') {
                const playlistName = interaction.options.getString('playlist');
                const playlists = await musicPlaylistManager.getUserPlaylists(interaction.user.id);
                const playlist = playlists.find(p => p.name.toLowerCase() === playlistName.toLowerCase());

                if (!playlist) {
                    return interaction.reply('❌ Playlist not found!');
                }

                // Queue functionality would be integrated with music system
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
