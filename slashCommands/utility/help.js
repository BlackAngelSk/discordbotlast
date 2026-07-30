const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const settingsManager = require('../../utils/settingsManager');
const commandPermissionsManager = require('../../utils/commandPermissionsManager');
const { memberHasBetaAccess } = require('../../utils/betaAccess');
const {
  getAccessContext,
  canViewCategory,
  getVisibleCategories,
  buildCategoryRows,
  buildCategorySelectMenu,
  buildMainHelpEmbed,
  getCategoryEmbed,
} = require('../../utils/helpCatalog');

const OWNER_ONLY_COMMANDS = new Set([
  'testcommands',
  'testerror',
  'mongodb-space',
  'mongodb-sync',
  'force-update',
]);
const SEARCH_PAGE_SIZE = 8;

function canViewAccessLevel(accessLevel, accessContext) {
  if (accessLevel === 'owner') return accessContext.isOwner;
  if (accessLevel === 'admin') return accessContext.isOwner || accessContext.isAdmin;
  return true;
}

function normalizePrefixUsage(rawUsage, prefix, name) {
  const usage = String(rawUsage || '').trim();
  if (!usage) return `${prefix}${name}`;
  if (usage.startsWith(prefix)) return usage;
  if (usage.startsWith('!')) return `${prefix}${usage.slice(1)}`;
  if (usage.startsWith('/')) return usage;
  return `${prefix}${usage}`;
}

function inferAccessLevel(commandName, category) {
  if (OWNER_ONLY_COMMANDS.has(commandName)) return 'owner';
  if (category === 'admin') return 'admin';
  return 'everyone';
}

function getPrefixCatalog(client, prefix) {
  const map = client?.commandHandler?.commands;
  if (!map || typeof map.values !== 'function') return [];

  const seen = new Set();
  const catalog = [];

  for (const command of map.values()) {
    if (!command?.name) continue;
    const name = String(command.name).toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);

    const aliases = Array.isArray(command.aliases)
      ? command.aliases.map((alias) => String(alias).toLowerCase())
      : [];
    const category = String(command.category || 'utility').toLowerCase();

    catalog.push({
      name,
      displayName: command.name,
      type: 'prefix',
      category,
      description: command.description || 'No description available',
      usage: normalizePrefixUsage(command.usage, prefix, command.name),
      aliases,
      accessLevel: inferAccessLevel(name, category),
      beta: !!command.beta,
    });
  }

  return catalog;
}

function getSlashCatalog(client) {
  const collection = client?.slashCommandHandler?.commands;
  if (!collection || typeof collection.values !== 'function') return [];

  const catalog = [];
  for (const command of collection.values()) {
    const commandName = command?.data?.name;
    if (!commandName) continue;

    const name = String(commandName).toLowerCase();
    const category = String(command.category || 'utility').toLowerCase();
    catalog.push({
      name,
      displayName: commandName,
      type: 'slash',
      category,
      description: command?.data?.description || command?.description || 'No description available',
      usage: `/${commandName}`,
      aliases: [],
      accessLevel: inferAccessLevel(name, category),
      beta: !!command.beta,
    });
  }

  return catalog;
}

function canUseCommand(command, interaction, accessContext) {
  if (!canViewAccessLevel(command.accessLevel, accessContext)) return false;
  if (!commandPermissionsManager.isCommandEnabled(interaction.guildId, command.name)) return false;

  const requiredRoleId = commandPermissionsManager.getRequiredRole(
    interaction.guildId,
    command.name
  );
  if (requiredRoleId && !interaction.member.permissions.has('Administrator')) {
    if (!interaction.member.roles?.cache?.has(requiredRoleId)) return false;
  }

  if (command.beta && !memberHasBetaAccess(interaction.member)) return false;
  return true;
}

function scoreSearchResult(command, query) {
  const name = command.name.toLowerCase();
  const displayName = String(command.displayName || '').toLowerCase();
  const description = String(command.description || '').toLowerCase();
  const aliases = command.aliases || [];

  let score = 0;
  if (name === query) score += 120;
  else if (displayName === query) score += 115;
  else if (name.startsWith(query)) score += 90;
  else if (displayName.startsWith(query)) score += 85;
  else if (name.includes(query)) score += 70;

  if (aliases.includes(query)) score += 80;
  else if (aliases.some((alias) => alias.startsWith(query))) score += 55;
  else if (aliases.some((alias) => alias.includes(query))) score += 40;

  if (description.includes(query)) score += 25;
  return score;
}

function buildSearchRows(searchId, currentPage, totalPages) {
  if (totalPages <= 1) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${searchId}_prev`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`${searchId}_next`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1)
    ),
  ];
}

function buildSearchEmbed(searchTerm, results, currentPage, totalPages) {
  const start = currentPage * SEARCH_PAGE_SIZE;
  const pageItems = results.slice(start, start + SEARCH_PAGE_SIZE);
  const lines = pageItems.map((command) => {
    const icon = command.type === 'slash' ? '⚡' : '⌨️';
    const aliasText = command.aliases.length
      ? ` (aliases: ${command.aliases.slice(0, 3).join(', ')})`
      : '';
    const categoryText = command.category ? ` [${command.category}]` : '';
    return `${icon} **${command.usage}** — ${command.description}${aliasText}${categoryText}`;
  });

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🔎 Help Search: ${searchTerm}`)
    .setDescription(lines.join('\n').slice(0, 3800))
    .setFooter({
      text: `Found ${results.length} result(s) • Page ${currentPage + 1}/${totalPages} • ⚡ slash • ⌨️ prefix`,
    })
    .setTimestamp();
}

/**
 * Creates the "Search" button that opens a modal popup
 */
function buildSearchButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_search_open')
      .setLabel('🔍 Search Commands')
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Creates the modal popup for command search
 */
function buildSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('help_search_modal')
    .setTitle('🔍 Search Commands');

  const searchInput = new TextInputBuilder()
    .setCustomId('help_search_query')
    .setLabel('Enter command name or keyword')
    .setPlaceholder('e.g. play, economy, music, ban...')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(searchInput));

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands')
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('Get detailed help for a specific command')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('search').setDescription('Search commands by keyword').setRequired(false)
    ),

  async execute(interaction) {
    // Defer immediately so Discord doesn't timeout the interaction (3s limit)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const commandName = interaction.options.getString('command');
    const searchTerm = interaction.options.getString('search');
    const settings = settingsManager.get(interaction.guildId);
    const p = settings.prefix;
    const accessContext = getAccessContext(interaction.user.id, interaction.member);

    const catalog = [
      ...getPrefixCatalog(interaction.client, p),
      ...getSlashCatalog(interaction.client),
    ];
    const visibleCatalog = catalog.filter((command) =>
      canUseCommand(command, interaction, accessContext)
    );

    if (searchTerm) {
      const q = searchTerm.toLowerCase().trim();
      const results = visibleCatalog
        .map((command) => ({ command, score: scoreSearchResult(command, q) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
        .map((item) => item.command);

      if (results.length === 0) {
        return interaction.editReply({
          content: `❌ No commands found for "${searchTerm}".`,
        });
      }

      const totalPages = Math.max(1, Math.ceil(results.length / SEARCH_PAGE_SIZE));
      let currentPage = 0;
      const searchId = `help_search_${interaction.id}`;
      const embed = buildSearchEmbed(searchTerm, results, currentPage, totalPages);
      const rows = buildSearchRows(searchId, currentPage, totalPages);

      await interaction.editReply({ embeds: [embed], components: rows });

      if (totalPages > 1) {
        const message = await interaction.fetchReply();
        if (message && typeof message.createMessageComponentCollector === 'function') {
          const collector = message.createMessageComponentCollector({ time: 180000 });

          collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
              return i.reply({
                content: '❌ These buttons are not for you!',
                flags: MessageFlags.Ephemeral,
              });
            }
            if (!i.customId.startsWith(searchId)) return;

            if (i.customId.endsWith('_prev') && currentPage > 0) currentPage -= 1;
            else if (i.customId.endsWith('_next') && currentPage < totalPages - 1) currentPage += 1;

            const nextEmbed = buildSearchEmbed(searchTerm, results, currentPage, totalPages);
            const nextRows = buildSearchRows(searchId, currentPage, totalPages);
            await i.update({ embeds: [nextEmbed], components: nextRows });
          });

          collector.on('end', () => {
            const disabledRows = buildSearchRows(searchId, currentPage, totalPages).map((row) => {
              row.components.forEach((button) => button.setDisabled(true));
              return row;
            });
            interaction.editReply({ components: disabledRows }).catch(() => {});
          });
        }
      }

      return;
    }

    if (commandName) {
      const needle = commandName.toLowerCase();
      const command = visibleCatalog.find(
        (entry) => entry.name === needle || entry.aliases.includes(needle)
      );

      if (!command) {
        return interaction.editReply({
          content: `❌ Command "${commandName}" not found!`,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Help: ${command.displayName}`)
        .setDescription(command.description || 'No description available')
        .addFields(
          { name: 'Usage', value: command.usage || `/${command.displayName}` },
          {
            name: 'Type',
            value: command.type === 'slash' ? 'Slash Command' : 'Prefix Command',
            inline: true,
          },
          { name: 'Category', value: command.category || 'utility', inline: true }
        );

      if (command.aliases.length > 0) {
        embed.addFields({ name: 'Aliases', value: command.aliases.join(', ') });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    const visibleCategories = getVisibleCategories(accessContext);
    const embed = buildMainHelpEmbed(p, visibleCategories);
    const selectMenu = buildCategorySelectMenu(visibleCategories);
    const searchBtn = buildSearchButton();

    // Ephemeral reply — only the user sees the help popup
    await interaction.editReply({
      embeds: [embed],
      components: [selectMenu, searchBtn],
    });

    const message = await interaction.fetchReply();
    if (!message || typeof message.createMessageComponentCollector !== 'function') {
      return;
    }

    const collector = message.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: '❌ This help menu is not for you!',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Handle "Search" button — open modal popup
      if (i.customId === 'help_search_open') {
        const modal = buildSearchModal();
        try {
          await i.showModal(modal);
        } catch (error) {
          console.error('Failed to show help search modal:', error);
        }
        return;
      }

      // Handle dropdown category selection
      if (i.customId === 'help_category_select') {
        const category = i.values[0];
        if (!canViewCategory(category, accessContext)) {
          return i.reply({
            content: '❌ You do not have permission to view that help category.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const categoryEmbed = getCategoryEmbed(p, category, accessContext);
          await i.update({ embeds: [categoryEmbed], components: [selectMenu, searchBtn] });
        } catch (error) {
          if (error?.code !== 10062) {
            console.error('Help select menu interaction error:', error);
          }
        }
        return;
      }

      // Legacy button compatibility
      const category = i.customId.replace('help_', '');
      if (!canViewCategory(category, accessContext)) {
        return i.reply({
          content: '❌ You do not have permission to view that help category.',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        if (!i.deferred && !i.replied) {
          await i.deferUpdate();
        }

        const categoryEmbed = getCategoryEmbed(p, category, accessContext);
        await i.editReply({ embeds: [categoryEmbed], components: [selectMenu, searchBtn] });
      } catch (error) {
        if (error?.code !== 10062) {
          console.error('Help button interaction error:', error);
        }
      }
    });

    collector.on('end', () => {
      selectMenu.components.forEach((comp) => comp.setDisabled(true));
      searchBtn.components.forEach((comp) => comp.setDisabled(true));
      interaction.editReply({ components: [selectMenu, searchBtn] }).catch(() => {});
    });
  },
};