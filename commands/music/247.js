const { EmbedBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const MusicQueue = require('../../utils/MusicQueue');
const queues = require('../../utils/queues');

module.exports = {
    name: '247',
    description: 'Toggle 24/7 mode — keeps the bot in the voice channel permanently',
    usage: '!247',
    aliases: ['stay', 'noleave'],
    category: 'music',
    async execute(message, args, client) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ You need to be in a voice channel to use 24/7 mode!');
        }

        let queue = queues.get(message.guild.id);

        if (!queue) {
            // Create a queue and join the channel without playing anything
            queue = new MusicQueue(message.guild.id);
            queues.set(message.guild.id, queue);
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            await queue.setupConnection(connection);
        }

        queue.stay247 = !queue.stay247;

        const embed = new EmbedBuilder()
            .setColor(queue.stay247 ? 0x57f287 : 0xed4245)
            .setTitle(queue.stay247 ? '🔰 24/7 Mode Enabled' : '🔰 24/7 Mode Disabled')
            .setDescription(queue.stay247
                ? `I'll stay in **${voiceChannel.name}** even when the queue is empty.`
                : 'I\'ll automatically leave the voice channel when the queue is empty.')
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
