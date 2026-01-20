require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, StreamType, demuxProbe } = require('@discordjs/voice');
const ytsr = require('ytsr');
const youtubedl = require('youtube-dl-exec');

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

// Music queue system
const queues = new Map();

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

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.playNext();
        });

        this.player.on('error', error => {
            console.error('❌ Audio player error:', error);
            this.playNext();
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
                        queues.delete(this.guildId);
                        console.log(`⏱️ Auto-disconnected from voice channel in guild ${this.guildId}`);
                    } catch (error) {
                        // Connection already destroyed, just clean up
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

            // Get stream URL from yt-dlp
            const info = await youtubedl(this.currentSong.url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                format: 'bestaudio[ext=webm]/bestaudio/best'
            });

            const audioUrl = info.url;
            
            console.log('Streaming from URL');
            
            // Create audio resource directly from URL (simpler approach)
            const resource = createAudioResource(audioUrl, {
                inlineVolume: true
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

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Logged in as ${readyClient.user.tag}!`);
    console.log(`🤖 Bot is ready and serving ${readyClient.guilds.cache.size} servers`);
});

// Handle reaction-based music controls
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    const message = reaction.message;
    const queue = queues.get(message.guild.id);
    
    if (!queue || !queue.nowPlayingMessage || queue.nowPlayingMessage.id !== message.id) {
        return;
    }

    try {
        switch (reaction.emoji.name) {
            case '⏸️': // Pause
                queue.pause();
                await message.channel.send('⏸️ Paused playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                break;
            case '▶️': // Resume
                queue.resume();
                await message.channel.send('▶️ Resumed playback!').then(msg => setTimeout(() => msg.delete(), 3000));
                break;
            case '⏭️': // Skip
                queue.skip();
                await message.channel.send('⏭️ Skipped to next song!').then(msg => setTimeout(() => msg.delete(), 3000));
                break;
            case '⏹️': // Stop
                queue.stop();
                await message.channel.send('⏹️ Stopped music and cleared queue!').then(msg => setTimeout(() => msg.delete(), 3000));
                break;
        }
        
        // Remove user's reaction
        await reaction.users.remove(user.id);
    } catch (error) {
        console.error('Error handling reaction:', error);
    }
});

// Listen for messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Respond to !ping command
    if (message.content.toLowerCase() === '!ping') {
        const sent = await message.reply('🏓 Pinging...');
        const timeDiff = sent.createdTimestamp - message.createdTimestamp;
        await sent.edit(`🏓 Pong! Latency: ${timeDiff}ms | API Latency: ${Math.round(client.ws.ping)}ms`);
    }

    // Respond to !hello command
    if (message.content.toLowerCase() === '!hello') {
        await message.reply(`👋 Hello ${message.author.username}!`);
    }

    // Respond to !help command
    if (message.content.toLowerCase() === '!help') {
        await message.reply({
            content: '📋 **Available Commands:**\n' +
                     '**General:**\n' +
                     '`!ping` - Check bot latency\n' +
                     '`!hello` - Get a greeting\n' +
                     '`!help` - Show this help message\n' +
                     '`!server` - Get server info\n\n' +
                     '**Music:**\n' +
                     '`!play <url or search>` - Play music from YouTube\n' +
                     '`!stop` - Stop music and clear queue\n' +
                     '`!skip` - Skip current song\n' +
                     '`!pause` - Pause playback\n' +
                     '`!resume` - Resume playback\n' +
                     '`!queue` - Show current queue\n' +
                     '`!nowplaying` - Show current song\n' +
                     '`!leave` - Leave voice channel'
        });
    }

    // Respond to !server command
    if (message.content.toLowerCase() === '!server') {
        await message.reply({
            content: `📊 **Server Info:**\n` +
                     `**Name:** ${message.guild.name}\n` +
                     `**Members:** ${message.guild.memberCount}\n` +
                     `**Created:** ${message.guild.createdAt.toDateString()}`
        });
    }

    // Music commands
    // !play command
    if (message.content.toLowerCase().startsWith('!play')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to play music!');
        }

        const args = message.content.slice(6).trim();
        if (!args) {
            return message.reply('❌ Please provide a YouTube URL or search query!\nExample: `!play never gonna give you up`');
        }

        try {
            await message.reply('🔍 Searching...');

            let songInfo;
            let videoUrl;
            
            // Check if it's a YouTube URL (simple check)
            const isUrl = args.startsWith('http://') || args.startsWith('https://');
            
            if (isUrl) {
                videoUrl = args;
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
                const searchResults = await ytsr(args, { limit: 1 });
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

                queue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });

                queue.connection.on(VoiceConnectionStatus.Disconnected, () => {
                    queue.stop();
                    queues.delete(message.guild.id);
                });
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

    // !stop command
    if (message.content.toLowerCase() === '!stop') {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ There is no music playing!');
        }

        queue.stop();
        await message.reply('⏹️ Stopped music and cleared the queue!');
    }

    // !skip command
    if (message.content.toLowerCase() === '!skip') {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.isPlaying) {
            return message.reply('❌ There is no music playing!');
        }

        queue.skip();
        await message.reply('⏭️ Skipped to next song!');
    }

    // !pause command
    if (message.content.toLowerCase() === '!pause') {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.isPlaying) {
            return message.reply('❌ There is no music playing!');
        }

        queue.pause();
        await message.reply('⏸️ Paused playback!');
    }

    // !resume command
    if (message.content.toLowerCase() === '!resume') {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ There is no music playing!');
        }

        queue.resume();
        await message.reply('▶️ Resumed playback!');
    }

    // !queue command
    if (message.content.toLowerCase() === '!queue') {
        const queue = queues.get(message.guild.id);
        if (!queue || (!queue.isPlaying && queue.songs.length === 0)) {
            return message.reply('❌ The queue is empty!');
        }

        let queueText = '';
        if (queue.currentSong) {
            queueText += `**Now Playing:**\n🎵 [${queue.currentSong.title}](${queue.currentSong.url})\n\n`;
        }

        if (queue.songs.length > 0) {
            queueText += '**Up Next:**\n';
            queue.songs.slice(0, 10).forEach((song, index) => {
                queueText += `${index + 1}. [${song.title}](${song.url}) - ${formatDuration(song.duration)}\n`;
            });

            if (queue.songs.length > 10) {
                queueText += `\n*...and ${queue.songs.length - 10} more*`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📋 Music Queue')
            .setDescription(queueText);

        await message.reply({ embeds: [embed] });
    }

    // !nowplaying command
    if (message.content.toLowerCase() === '!nowplaying' || message.content.toLowerCase() === '!np') {
        const queue = queues.get(message.guild.id);
        if (!queue || !queue.currentSong) {
            return message.reply('❌ There is no music playing!');
        }

        const song = queue.currentSong;
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🎵 Now Playing')
            .setDescription(`[${song.title}](${song.url})`)
            .addFields({ name: 'Duration', value: formatDuration(song.duration), inline: true })
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Requested by ${song.requester}` });

        await message.reply({ embeds: [embed] });
    }

    // !leave command
    if (message.content.toLowerCase() === '!leave') {
        const queue = queues.get(message.guild.id);
        if (!queue) {
            return message.reply('❌ I am not in a voice channel!');
        }

        queue.connection.destroy();
        queues.delete(message.guild.id);
        await message.reply('👋 Left the voice channel!');
    }
});

// Handle errors
client.on(Events.Error, error => {
    console.error('❌ Discord client error:', error);
});

// Helper function to parse duration from string (e.g., "3:45" to seconds)
function parseDuration(duration) {
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return 0;
}

// Helper function to format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Login to Discord with your bot token
client.login(process.env.DISCORD_TOKEN);