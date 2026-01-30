const { Events } = require('discord.js');
const settingsManager = require('../utils/settingsManager');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        try {
            console.log(`👋 New member joined: ${member.user.tag}`);
            
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
        } catch (error) {
            console.error('Error in guildMemberAdd event:', error);
        }
    }
};
