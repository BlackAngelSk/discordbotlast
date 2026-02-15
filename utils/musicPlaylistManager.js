/**
 * Music Playlist Manager
 * Handles playlist creation, management, and recommendations
 */

const fs = require('fs').promises;
const path = require('path');
const play = require('play-dl');

class MusicPlaylistManager {
    constructor() {
        this.dataFile = path.join(__dirname, '..', 'data', 'playlists.json');
    }

    async init() {
        try {
            await fs.access(this.dataFile);
        } catch {
            await fs.writeFile(this.dataFile, JSON.stringify({}, null, 2));
        }
    }

    async createPlaylist(userId, name, description = '') {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        const playlist = {
            id: Date.now().toString(),
            userId,
            name,
            description,
            songs: [],
            created: new Date(),
            updated: new Date(),
            public: false
        };

        if (!data[userId]) data[userId] = [];
        data[userId].push(playlist);

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        return playlist;
    }

    async addSongToPlaylist(userId, playlistId, song) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data[userId]) return null;

        const playlist = data[userId].find(p => p.id === playlistId);
        if (!playlist) return null;

        const songData = {
            id: Date.now().toString(),
            title: song.title,
            url: song.url,
            duration: song.duration,
            addedBy: userId,
            addedAt: new Date()
        };

        playlist.songs.push(songData);
        playlist.updated = new Date();

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        return songData;
    }

    async removeSongFromPlaylist(userId, playlistId, songId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data[userId]) return false;

        const playlist = data[userId].find(p => p.id === playlistId);
        if (!playlist) return false;

        const initialLength = playlist.songs.length;
        playlist.songs = playlist.songs.filter(s => s.id !== songId);
        playlist.updated = new Date();

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        return playlist.songs.length < initialLength;
    }

    async deletePlaylist(userId, playlistId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data[userId]) return false;

        const initialLength = data[userId].length;
        data[userId] = data[userId].filter(p => p.id !== playlistId);

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        return data[userId].length < initialLength;
    }

    async getPlaylist(userId, playlistId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data[userId]) return null;
        return data[userId].find(p => p.id === playlistId);
    }

    async getUserPlaylists(userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        return data[userId] || [];
    }

    async makePlaylistPublic(userId, playlistId, isPublic = true) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        
        if (!data[userId]) return null;

        const playlist = data[userId].find(p => p.id === playlistId);
        if (!playlist) return null;

        playlist.public = isPublic;
        playlist.updated = new Date();

        await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
        return playlist;
    }

    async getPublicPlaylists(limit = 10) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        const publicPlaylists = [];

        for (const userId in data) {
            for (const playlist of data[userId]) {
                if (playlist.public) {
                    publicPlaylists.push({ ...playlist, createdBy: userId });
                }
            }
        }

        return publicPlaylists.sort((a, b) => b.songs.length - a.songs.length).slice(0, limit);
    }

    async getRecommendations(userId) {
        const data = JSON.parse(await fs.readFile(this.dataFile, 'utf-8'));
        const userPlaylists = data[userId] || [];
        
        // Get all songs from user's playlists
        const userSongs = userPlaylists.flatMap(p => p.songs);
        if (userSongs.length === 0) return [];

        // Get similar songs from public playlists
        const allPublicSongs = [];
        for (const otherId in data) {
            if (otherId !== userId) {
                for (const playlist of data[otherId]) {
                    if (playlist.public) {
                        allPublicSongs.push(...playlist.songs);
                    }
                }
            }
        }

        // Return random recommendations from other playlists
        return allPublicSongs.sort(() => Math.random() - 0.5).slice(0, 5);
    }

    async searchSongs(query) {
        try {
            // This would use play-dl or similar to search
            // For now, return a simple structure
            return [
                {
                    title: `Search result for: ${query}`,
                    url: 'https://youtube.com/search?q=' + encodeURIComponent(query),
                    duration: 0
                }
            ];
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    async getLyrics(songTitle) {
        // Placeholder for lyrics API integration
        // Could integrate with genius.com or lyrics.ovh API
        return {
            title: songTitle,
            lyrics: 'Lyrics feature coming soon...',
            source: 'placeholder'
        };
    }
}

module.exports = new MusicPlaylistManager();
