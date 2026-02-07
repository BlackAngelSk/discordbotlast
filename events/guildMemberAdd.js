const { Events, EmbedBuilder } = require('discord.js');
const settingsManager = require('../utils/settingsManager');
const statsManager = require('../utils/statsManager');
const inviteManager = require('../utils/inviteManager');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        try {
            console.log(`👋 New member joined: ${member.user.tag}`);

            // Track invite
            try {
                const invites = await member.guild.invites.fetch();
                const guildInvites = client.invites || new Map();
                
                if (!guildInvites.has(member.guild.id)) {
                    guildInvites.set(member.guild.id, new Map());
                }

                const oldInvites = guildInvites.get(member.guild.id);
                let inviter = null;

                for (const invite of invites.values()) {
                    const oldInvite = oldInvites.get(invite.code);
                    
                    if (!oldInvite || oldInvite.uses < invite.uses) {
                        inviter = invite.inviter;
                        break;
                    }
                }

                // Update cached invites
                const newInviteMap = new Map();
                invites.forEach(invite => {
                    newInviteMap.set(invite.code, invite);
                });
                guildInvites.set(member.guild.id, newInviteMap);

                // Track the invite if we found an inviter
                if (inviter) {
                    inviteManager.trackInvite(member.guild.id, inviter.id, member.id, member.user.username);
                    console.log(`📊 ${inviter.username} invited ${member.user.username}`);
                }
            } catch (error) {
                console.error('Error tracking invite:', error);
            }
            
            const settings = settingsManager.get(member.guild.id);
            
            // Auto-assign role if configured
            if (settings.autoRole) {
                const role = member.guild.roles.cache.find(r => r.name === settings.autoRole);
                
                if (role) {
                    await member.roles.add(role);
                    console.log(`✅ Assigned ${settings.autoRole} role to ${member.user.tag}`);
                } else {
                    console.log(`⚠️ Role "${settings.autoRole}" not found in guild ${member.guild.name}`);
                    // Optionally create the role if it doesn't exist
                    try {
                        const newRole = await member.guild.roles.create({
                            name: settings.autoRole,
                            color: 0x99AAB5, // Grey color
                            reason: 'Auto-created default member role',
                        });
                        await member.roles.add(newRole);
                        console.log(`✅ Created and assigned ${settings.autoRole} role to ${member.user.tag}`);
                    } catch (error) {
                        console.error('❌ Error creating role:', error);
                    }
                }
            }

            // Update server stats
            try {
                await statsManager.recordMemberUpdate(member.guild.id, member.guild.memberCount);
            } catch (error) {
                console.error('Error updating stats:', error);
            }

            // Send welcome message if enabled
            if (settings.welcomeEnabled && settings.welcomeChannel) {
                // Try to get channel by ID first, then by name
                let channel = member.guild.channels.cache.get(settings.welcomeChannel);
                if (!channel) {
                    channel = member.guild.channels.cache.find(
                        ch => ch.name === settings.welcomeChannel && ch.isTextBased()
                    );
                }
                
                if (channel && channel.isTextBased()) {
                    // Format welcome message with placeholders
                    const welcomeMessage = settings.welcomeMessage
                        .replace('{user}', `${member}`)
                        .replace('{username}', member.user.username)
                        .replace('{server}', member.guild.name)
                        .replace('{memberCount}', member.guild.memberCount.toString());

                    await channel.send(welcomeMessage);
                } else {
                    console.log(`⚠️ Welcome channel not found or not text-based in guild ${member.guild.name}`);
                }
            }

            // Send welcome card if enabled
            try {
                const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
                let settingsData = {};
                try {
                    const data = await fs.readFile(settingsPath, 'utf8');
                    settingsData = JSON.parse(data);
                } catch (error) {
                    settingsData = {};
                }

                const welcomeCardChannelId = settingsData[member.guild.id]?.welcomeCardChannel;
                if (welcomeCardChannelId) {
                    const welcomeChannel = await client.channels.fetch(welcomeCardChannelId).catch(() => null);
                    
                    if (welcomeChannel) {
                        const embed = new EmbedBuilder()
                            .setColor(0x5865f2)
                            .setTitle('👋 Welcome!')
                            .setDescription(`Welcome to **${member.guild.name}**, ${member}!`)
                            .addFields(
                                { name: 'Member Count', value: `You are member #${member.guild.memberCount}`, inline: true },
                                { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
                            )
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                            .setImage(member.guild.iconURL({ dynamic: true }))
                            .setFooter({ text: 'Welcome to our community!' })
                            .setTimestamp();

                        await welcomeChannel.send({ embeds: [embed] });
                    }
                }
            } catch (error) {
                console.error('Error sending welcome card:', error);
            }

        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    }
};
