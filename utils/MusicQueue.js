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
        this.loop = 'off'; // 'off', 'song', or 'queue'
        this.previousSongs = []; // Track song history
        this.filters = {}; // Audio filters
        this.ffmpegProcess = null;

        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log('🔄 Player entered Idle state');
            this.playNext();
        });

        this.player.on('error', error => {
            console.error('❌ Audio player error:', error);
            this.playNext();
        });

        this.player.on(AudioPlayerStatus.Playing, () => {
            console.log('▶️ Player is now playing');
        });
    }

    async setupConnection(connection) {
        this.connection = connection;
        
        // Wait for connection to be ready before subscribing
        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
            console.log('✅ Connection is ready');
        } catch (error) {
            console.error('❌ Connection failed to become ready:', error);
            this.connection.destroy();
            const queues = require('./queues');
            queues.delete(this.guildId);
            throw new Error('Failed to establish voice connection');
        }
        
        // Subscribe the connection to the player after connection is ready
        this.connection.subscribe(this.player);
        console.log('✅ Player subscribed to connection');
        
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
        console.log(`🔄 playNext called - Loop: ${this.loop}, Songs in queue: ${this.songs.length}`);
        
        // Handle loop modes
        if (this.loop === 'song' && this.currentSong) {
            // Loop the current song
            console.log('🔁 Looping current song');
            const songToLoop = { ...this.currentSong };
            this.playSong(songToLoop);
            return;
        }

        if (this.loop === 'queue' && this.currentSong) {
            // Add current song to end of queue
            console.log('🔁 Adding song to end of queue');
            this.songs.push({ ...this.currentSong });
        }

        // Save current song to history
        if (this.currentSong) {
            this.previousSongs.push({ ...this.currentSong });
            // Keep only last 10 songs
            if (this.previousSongs.length > 10) {
                this.previousSongs.shift();
            }
        }

        if (this.songs.length === 0) {
            console.log('⏹️ No more songs in queue');
            
            // Try autoplay if enabled
            if (this.autoplay && this.currentSong) {
                console.log('🎲 Attempting autoplay...');
                await this.getRelatedSong();
                return;
            }
            
            this.isPlaying = false;
            this.currentSong = null;
            
            // Set a timer to disconnect after 15 seconds of inactivity
            console.log('⏱️ Setting 15 second disconnect timer');
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
            console.log('⏱️ Clearing disconnect timer');
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }

        this.currentSong = this.songs.shift();
        console.log(`⏭️ Playing next song: ${this.currentSong.title}`);
        await this.playSong(this.currentSong);
    }

    async playSong(song) {
        this.isPlaying = true;

        console.log('🎵 Playing song:', song);

        try {
            if (!song || !song.url) {
                console.error('❌ Invalid song URL, song:', song);
                this.playNext();
                return;
            }

            const { createAudioResource, StreamType } = require('@discordjs/voice');
            const { spawn } = require('child_process');
            const ffmpegPath = require('ffmpeg-static');
            const path = require('path');

            // Make sure connection is ready before playing
            if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
                console.error('❌ Connection is destroyed, cannot play');
                this.playNext();
                return;
            }

            console.log('🎧 Streaming with yt-dlp → FFmpeg pipeline...');

            // Clean up any previous processes
            if (this.ffmpegProcess) {
                try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
                this.ffmpegProcess = null;
            }
            if (this.ytdlpProcess) {
                try { this.ytdlpProcess.kill('SIGKILL'); } catch (_) {}
                this.ytdlpProcess = null;
            }

            // Get yt-dlp path
            const ytdlp = require('@distube/yt-dlp');
            const ytdlpPath = typeof ytdlp === 'string' ? ytdlp : ytdlp.path || path.join(__dirname, '..', 'node_modules', '@distube', 'yt-dlp', 'bin', 'yt-dlp.exe');

            // Spawn yt-dlp to download and output audio to stdout
            const ytdlpProcess = spawn(ytdlpPath, [
                '--format', 'bestaudio',
                '--no-playlist',
                '--no-warnings',
                '--quiet',
                '--output', '-',
                song.url
            ], {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Spawn FFmpeg to convert audio to Opus
            const ffmpegProcess = spawn(ffmpegPath, [
                '-i', 'pipe:0',
                '-analyzeduration', '0',
                '-loglevel', '0',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                'pipe:1'
            ], {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'ignore']
            });

            // Store process references
            this.ytdlpProcess = ytdlpProcess;
            this.ffmpegProcess = ffmpegProcess;

            // Pipe yt-dlp output to FFmpeg input
            ytdlpProcess.stdout.pipe(ffmpegProcess.stdin);

            // Prevent stream errors from crashing the bot
            ytdlpProcess.stdout.on('error', () => {});
            ffmpegProcess.stdin.on('error', () => {});
            ffmpegProcess.stdout.on('error', () => {});

            // Error handling
            ytdlpProcess.on('error', (err) => {
                console.error('❌ yt-dlp error:', err);
                this.playNext();
            });

            ffmpegProcess.on('error', (err) => {
                console.error('❌ FFmpeg error:', err);
                this.playNext();
            });

            ytdlpProcess.stderr.on('data', (data) => {
                console.error('yt-dlp stderr:', data.toString());
            });

            // Create audio resource from FFmpeg output
            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Raw,
                inlineVolume: true,
                metadata: {
                    title: song.title
                }
            });

            this.currentResource = resource;
            
            // Set volume
            if (resource.volume) {
                resource.volume.setVolume(this.volume);
            }

            // Make sure we're still subscribed (redundancy check)
            if (this.connection) {
                this.connection.subscribe(this.player);
            }
            
            console.log('▶️ Starting playback...');
            this.player.play(resource);
            
            // Wait a moment to confirm playback started
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`✅ Player status: ${this.player.state.status}`);
            
        } catch (error) {
            console.error('❌ Error playing song:', error);
            this.playNext();
        }
    }

    playPrevious() {
        if (this.previousSongs.length === 0) {
            return false;
        }

        const previousSong = this.previousSongs.pop();
        // Add current song back to front of queue if it exists
        if (this.currentSong) {
            this.songs.unshift(this.currentSong);
        }
        
        this.player.stop();
        // Manually set current song and play
        this.currentSong = null;
        this.songs.unshift(previousSong);
        return true;
    }

    setLoop(mode) {
        const validModes = ['off', 'song', 'queue'];
        if (!validModes.includes(mode)) {
            return false;
        }
        this.loop = mode;
        return true;
    }

    jump(position) {
        if (position < 1 || position > this.songs.length) {
            return false;
        }

        // Remove all songs before the position
        const skipped = position - 1;
        this.songs.splice(0, skipped);
        this.player.stop();
        return true;
    }

    stop() {
        this.songs = [];
        
        // Stop the player first
        this.player.stop();
        
        // Close FFmpeg stdin to prevent write errors
        if (this.ffmpegProcess && this.ffmpegProcess.stdin) {
            try { 
                this.ffmpegProcess.stdin.end();
            } catch (_) {}
        }
        
        // Kill processes after a short delay
        setTimeout(() => {
            if (this.ffmpegProcess) {
                try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
                this.ffmpegProcess = null;
            }
            if (this.ytdlpProcess) {
                try { this.ytdlpProcess.kill('SIGKILL'); } catch (_) {}
                this.ytdlpProcess = null;
            }
        }, 100);
        
        this.isPlaying = false;
        this.currentSong = null;
    }

    skip() {
        // Stop the player first
        this.player.stop();
        
        // Close FFmpeg stdin to prevent write errors
        if (this.ffmpegProcess && this.ffmpegProcess.stdin) {
            try { 
                this.ffmpegProcess.stdin.end();
            } catch (_) {}
        }
        
        // Kill processes after a short delay
        setTimeout(() => {
            if (this.ffmpegProcess) {
                try { this.ffmpegProcess.kill('SIGKILL'); } catch (_) {}
                this.ffmpegProcess = null;
            }
            if (this.ytdlpProcess) {
                try { this.ytdlpProcess.kill('SIGKILL'); } catch (_) {}
                this.ytdlpProcess = null;
            }
        }, 100);
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
