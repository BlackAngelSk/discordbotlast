const { createAudioPlayer, AudioPlayerStatus, entersState, VoiceConnectionStatus } = require('@discordjs/voice');

class MusicQueue {
    constructor(guildId) {
        this.guildId = guildId;
        this.songs = [];
        this.connection = null;
        this.player = createAudioPlayer();
        this.isPlaying = false;
        this.currentSong = null;
        this.disconnectTimer = null;
        this.nowPlayingMessage = null;
        this.readyLock = false;
        this.volume = 0.5; // Default volume 50%
        this.currentResource = null;
        this.autoplay = false; // Autoplay feature

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.playNext();
        });

        this.player.on('error', error => {
            console.error('❌ Audio player error:', error);
            this.playNext();
        });
    }

    async setupConnection(connection) {
        this.connection = connection;
        this.connection.on('stateChange', async (_, newState) => {
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                try {
                    await Promise.race([
                        entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    console.error('❌ Connection lost, cleaning up...');
                    this.connection.destroy();
                    const queues = require('./queues');
                    queues.delete(this.guildId);
                }
            } else if (newState.status === VoiceConnectionStatus.Destroyed) {
                this.stop();
            } else if (!this.readyLock && (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)) {
                this.readyLock = true;
                try {
                    await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
                } catch {
                    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                        this.connection.destroy();
                    }
                } finally {
                    this.readyLock = false;
                }
            }
        });
    }

    addSong(song) {
        this.songs.push(song);
    }

    async playNext() {
        if (this.songs.length === 0) {
            // Try autoplay if enabled
            if (this.autoplay && this.currentSong) {
                await this.getRelatedSong();
                return;
            }
            
            this.isPlaying = false;
            this.currentSong = null;
            
            // Set a timer to disconnect after 15 seconds of inactivity
            this.disconnectTimer = setTimeout(() => {
                if (this.connection && !this.isPlaying && this.songs.length === 0) {
                    try {
                        this.connection.destroy();
                        const queues = require('./queues');
                        queues.delete(this.guildId);
                        console.log(`⏱️ Auto-disconnected from voice channel in guild ${this.guildId}`);
                    } catch (error) {
                        // Connection already destroyed, just clean up
                        const queues = require('./queues');
                        queues.delete(this.guildId);
                    }
                }
            }, 15000);
            return;
        }

        // Clear disconnect timer if we're playing again
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }

        this.currentSong = this.songs.shift();
        this.isPlaying = true;

        console.log('Playing song:', this.currentSong);

        try {
            if (!this.currentSong || !this.currentSong.url) {
                console.error('❌ Invalid song URL, currentSong:', this.currentSong);
                this.playNext();
                return;
            }

            const youtubedl = require('youtube-dl-exec');
            const { createAudioResource } = require('@discordjs/voice');

            // Get stream URL from yt-dlp
            const info = await youtubedl(this.currentSong.url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                format: 'bestaudio[ext=webm]/bestaudio/best'
            });

            const audioUrl = info.url;
            
            console.log('Streaming from URL');
            
            // Create audio resource directly from URL
            const resource = createAudioResource(audioUrl, {
                inlineVolume: true,
                inputType: require('@discordjs/voice').StreamType.Arbitrary
            });

            this.currentResource = resource;
            // Set the volume on the resource
            if (resource.volume) {
                resource.volume.setVolume(this.volume);
            }

            this.player.play(resource);
            this.connection.subscribe(this.player);
        } catch (error) {
            console.error('❌ Error playing song:', error);
            this.playNext();
        }
    }

    stop() {
        this.songs = [];
        this.player.stop();
        this.isPlaying = false;
        this.currentSong = null;
    }

    skip() {
        this.player.stop();
    }

    pause() {
        this.player.pause();
    }

    resume() {
        this.player.unpause();
    }

    setVolume(volume) {
        // Clamp volume between 0 and 2 (0% to 200%)
        this.volume = Math.max(0, Math.min(2, volume));
        if (this.currentResource && this.currentResource.volume) {
            this.currentResource.volume.setVolume(this.volume);
        }
        return Math.round(this.volume * 100); // Return percentage
    }

    increaseVolume() {
        return this.setVolume(this.volume + 0.1);
    }

    decreaseVolume() {
        return this.setVolume(this.volume - 0.1);
    }

    async getRelatedSong() {
        if (!this.currentSong || !this.currentSong.url) return;
        
        try {
            const ytsr = require('ytsr');
            // Search for related content based on current song title
            const searchResults = await ytsr(this.currentSong.title, { limit: 5 });
            const videos = searchResults.items.filter(item => item.type === 'video');
            
            // Get a random video from results (not the same as current)
            const relatedVideos = videos.filter(v => v.url !== this.currentSong.url);
            if (relatedVideos.length === 0) return;
            
            const randomVideo = relatedVideos[Math.floor(Math.random() * relatedVideos.length)];
            const { parseDuration } = require('./helpers');
            
            const song = {
                title: randomVideo.title,
                url: randomVideo.url,
                duration: randomVideo.duration ? parseDuration(randomVideo.duration) : 0,
                thumbnail: randomVideo.bestThumbnail?.url,
                requester: 'Autoplay'
            };
            
            this.addSong(song);
            console.log('🎵 Autoplay added:', song.title);
            this.playNext();
        } catch (error) {
            console.error('Error getting related song:', error);
            this.isPlaying = false;
        }
    }
}

module.exports = MusicQueue;
