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
}

module.exports = MusicQueue;
