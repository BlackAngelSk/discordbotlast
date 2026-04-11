/**
 * Temporary Voice Channel Manager
 * When a user joins a designated "hub" VC, a private channel is auto-created for them.
 * The channel is deleted when it becomes empty.
 */

const fs = require('fs').promises;
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'data', 'tempVoice.json');

class TempVoiceManager {
    constructor() {
        this.data = { hubs: {}, channels: {} };
        // hubs: { guildId: channelId }      — hub VC ids
        // channels: { channelId: { guildId, ownerId, hubId } }  — active temp VCs
    }

    async init() {
        try {
            const raw = await fs.readFile(DATA_FILE, 'utf8');
            this.data = JSON.parse(raw);
        } catch {
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2));
    }

    setHub(guildId, channelId) {
        this.data.hubs[guildId] = channelId;
        return this.save();
    }

    removeHub(guildId) {
        delete this.data.hubs[guildId];
        return this.save();
    }

    getHub(guildId) {
        return this.data.hubs[guildId] || null;
    }

    isTempChannel(channelId) {
        return !!this.data.channels[channelId];
    }

    async registerChannel(channelId, guildId, ownerId, hubId) {
        this.data.channels[channelId] = { guildId, ownerId, hubId };
        await this.save();
    }

    async unregisterChannel(channelId) {
        delete this.data.channels[channelId];
        await this.save();
    }

    async handleJoin(member, channel) {
        const hubId = this.getHub(member.guild.id);
        if (!hubId || channel.id !== hubId) return;

        const hub = member.guild.channels.cache.get(hubId);
        if (!hub) return;

        try {
            const tempChannel = await member.guild.channels.create({
                name: `${member.displayName}'s Channel`,
                type: ChannelType.GuildVoice,
                parent: hub.parentId,
                permissionOverwrites: [
                    {
                        id: member.guild.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.MuteMembers,
                            PermissionFlagsBits.DeafenMembers,
                            PermissionFlagsBits.MoveMembers,
                        ],
                    },
                ],
            });

            await member.voice.setChannel(tempChannel);
            await this.registerChannel(tempChannel.id, member.guild.id, member.id, hubId);
            console.log(`🔊 Created temp VC "${tempChannel.name}" for ${member.user.tag}`);
        } catch (err) {
            console.error('TempVoice create error:', err);
        }
    }

    async handleLeave(member, channel) {
        if (!this.isTempChannel(channel.id)) return;
        // Wait a tick for the member count to update
        setTimeout(async () => {
            try {
                const ch = await member.guild.channels.fetch(channel.id).catch(() => null);
                if (ch && ch.members.size === 0) {
                    await ch.delete('Temp VC empty');
                    await this.unregisterChannel(channel.id);
                    console.log(`🔇 Deleted empty temp VC "${ch.name}"`);
                }
            } catch (err) {
                console.error('TempVoice delete error:', err);
            }
        }, 500);
    }
}

module.exports = new TempVoiceManager();
