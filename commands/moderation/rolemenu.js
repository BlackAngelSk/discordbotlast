const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const roleMenuManager = require('../../utils/roleMenuManager');

const MAX_ROLES = 25; // Discord select menu max options

module.exports = {
    name: 'rolemenu',
    description: 'Create and manage dropdown role selection menus.',
    usage: '!rolemenu create <id> "<title>" [multi]\n!rolemenu add <id> @role [label]\n!rolemenu remove <id> @role\n!rolemenu post <id> [#channel]\n!rolemenu delete <id>\n!rolemenu list',
    aliases: ['rolesmenu', 'roleselect'],
    category: 'moderation',
    async execute(message, args, client) {
        if (!message.member.permissions.has('ManageRoles')) {
            return message.reply('❌ You need **Manage Roles** permission.');
        }

        const sub = args[0]?.toLowerCase();
        const guildId = message.guild.id;

        // ── list ──────────────────────────────────────────────────────────────
        if (!sub || sub === 'list') {
            const menus = roleMenuManager.getMenus(guildId);
            if (menus.length === 0) {
                return message.reply('No role menus configured. Use `!rolemenu create <id> "<title>"` to create one.');
            }
            const embed = new EmbedBuilder()
                .setTitle('📋 Role Menus')
                .setColor(0x5865f2)
                .setDescription(menus.map(m =>
                    `**${m.id}** — \`${m.title}\` (${m.roles.length} roles)${m.messageId ? ` → posted` : ' → not posted'}`
                ).join('\n'));
            return message.reply({ embeds: [embed] });
        }

        // ── create ────────────────────────────────────────────────────────────
        if (sub === 'create') {
            const menuId = args[1];
            if (!menuId) return message.reply('❌ Provide a menu ID (e.g. `colors`).');
            const existing = roleMenuManager.getMenu(guildId, menuId);
            if (existing) return message.reply(`❌ Menu \`${menuId}\` already exists. Use \`!rolemenu delete ${menuId}\` first.`);

            // Title: everything after args[1], strip surrounding quotes
            let title = args.slice(2).join(' ').replace(/^"|"$/g, '').trim() || 'Pick a Role';
            const multiSelect = title.toLowerCase().endsWith(' multi');
            if (multiSelect) title = title.slice(0, -6).trim();

            await roleMenuManager.create(guildId, menuId, {
                title,
                channelId: null,
                messageId: null,
                multiSelect,
                roles: []
            });

            return message.reply(`✅ Role menu \`${menuId}\` created with title **${title}**${multiSelect ? ' (multi-select)' : ''}.\nNow add roles with \`!rolemenu add ${menuId} @role\` then post it with \`!rolemenu post ${menuId}\`.`);
        }

        // ── add role ──────────────────────────────────────────────────────────
        if (sub === 'add') {
            const menuId = args[1];
            const menu = roleMenuManager.getMenu(guildId, menuId);
            if (!menu) return message.reply(`❌ Menu \`${menuId}\` not found.`);

            const role = message.mentions.roles.first();
            if (!role) return message.reply('❌ Mention the role to add (e.g. `@Red`).');

            if (menu.roles.length >= MAX_ROLES) return message.reply(`❌ Maximum ${MAX_ROLES} roles per menu.`);
            if (menu.roles.some(r => r.roleId === role.id)) return message.reply('❌ That role is already in the menu.');

            const label = args.slice(3).join(' ').trim() || role.name;
            menu.roles.push({ roleId: role.id, label: label.slice(0, 100) });
            await roleMenuManager.create(guildId, menuId, menu);

            return message.reply(`✅ Added **${role.name}** to menu \`${menuId}\` (${menu.roles.length}/${MAX_ROLES} roles).\nUse \`!rolemenu post ${menuId}\` to (re)post it.`);
        }

        // ── remove role ───────────────────────────────────────────────────────
        if (sub === 'remove' && message.mentions.roles.size > 0) {
            const menuId = args[1];
            const menu = roleMenuManager.getMenu(guildId, menuId);
            if (!menu) return message.reply(`❌ Menu \`${menuId}\` not found.`);
            const role = message.mentions.roles.first();
            if (!menu.roles.some(r => r.roleId === role.id)) return message.reply('❌ That role is not in the menu.');
            menu.roles = menu.roles.filter(r => r.roleId !== role.id);
            await roleMenuManager.create(guildId, menuId, menu);
            return message.reply(`✅ Removed **${role.name}** from menu \`${menuId}\`.`);
        }

        // ── post ──────────────────────────────────────────────────────────────
        if (sub === 'post') {
            const menuId = args[1];
            const menu = roleMenuManager.getMenu(guildId, menuId);
            if (!menu) return message.reply(`❌ Menu \`${menuId}\` not found.`);
            if (menu.roles.length === 0) return message.reply('❌ Add at least one role first.');

            const targetChannel = message.mentions.channels.first() || message.channel;

            // Build select menu
            const options = menu.roles.map(r => {
                const role = message.guild.roles.cache.get(r.roleId);
                return {
                    label: r.label || role?.name || r.roleId,
                    value: `rolemenu_${menuId}_${r.roleId}`,
                    description: role ? `Toggle the ${role.name} role` : undefined
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`rolemenu:${guildId}:${menuId}`)
                .setPlaceholder('Select a role...')
                .setMinValues(0)
                .setMaxValues(menu.multiSelect ? Math.min(options.length, MAX_ROLES) : 1)
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle(menu.title)
                .setColor(0x5865f2)
                .setDescription(menu.roles.map(r => `<@&${r.roleId}>`).join(' · '))
                .setFooter({ text: menu.multiSelect ? 'Select one or more roles' : 'Select a role to toggle it' });

            const posted = await targetChannel.send({ embeds: [embed], components: [row] });
            menu.channelId = targetChannel.id;
            menu.messageId = posted.id;
            await roleMenuManager.create(guildId, menuId, menu);

            return message.reply(`✅ Role menu **${menu.title}** posted in ${targetChannel}.`);
        }

        // ── delete ────────────────────────────────────────────────────────────
        if (sub === 'delete') {
            const menuId = args[1];
            const menu = roleMenuManager.getMenu(guildId, menuId);
            if (!menu) return message.reply(`❌ Menu \`${menuId}\` not found.`);

            // Try to delete the posted message
            if (menu.channelId && menu.messageId) {
                const ch = message.guild.channels.cache.get(menu.channelId);
                if (ch) {
                    const msg = await ch.messages.fetch(menu.messageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => {});
                }
            }

            await roleMenuManager.deleteMenu(guildId, menuId);
            return message.reply(`✅ Role menu \`${menuId}\` deleted.`);
        }

        return message.reply(`❓ Unknown subcommand. Usage:\n\`\`\`\n${module.exports.usage}\n\`\`\``);
    }
};
