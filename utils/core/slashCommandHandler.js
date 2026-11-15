const { REST, Routes, Collection, MessageFlags } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const commandPermissionsManager = require('./commandPermissionsManager');
const activityTracker = require('../stats/activityTracker');

// Discord hard limit: 100 global chat-input commands per application.
const GLOBAL_SLASH_COMMAND_LIMIT = 100;
// When the cap is hit, register the most useful categories first and drop games.
const CATEGORY_PRIORITY = { admin: 0, moderation: 1, utility: 2, music: 3, economy: 4, fun: 5 };

function resolveCommandLimit() {
  const raw = Number(process.env.MAX_GLOBAL_SLASH_COMMANDS);
  if (!Number.isFinite(raw) || raw <= 0) return GLOBAL_SLASH_COMMAND_LIMIT;
  return Math.min(GLOBAL_SLASH_COMMAND_LIMIT, Math.floor(raw));
}

/**
 * Pick which commands fit into Discord's limit. Deterministic: category priority
 * first (fun last), then alphabetical, so a restart always registers the same set.
 */
function selectCommandsForRegistration(commands, limit = resolveCommandLimit()) {
  const entries = Array.from(commands.values());

  const sorted = entries.slice().sort((left, right) => {
    const leftPriority = CATEGORY_PRIORITY[left.__slashCategory] ?? 99;
    const rightPriority = CATEGORY_PRIORITY[right.__slashCategory] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return String(left.data.name).localeCompare(String(right.data.name));
  });

  return {
    selected: sorted.slice(0, limit),
    skipped: sorted.slice(limit),
  };
}

class SlashCommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Collection();
  }

  async loadSlashCommands() {
    const slashCommandsPath = path.join(__dirname, '..', '..', 'slashCommands');

    try {
      // Recursively load slash commands from all subdirectories
      const loadCommandsRecursive = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Recursively load from subdirectories
            await loadCommandsRecursive(fullPath);
          } else if (entry.name.endsWith('.js')) {
            const command = require(fullPath);

            if ('data' in command && 'execute' in command) {
              // Category drives registration priority when the 100-command cap is hit.
              command.__slashCategory = path.relative(slashCommandsPath, dir).split(path.sep)[0];
              this.commands.set(command.data.name, command);
              console.log(`✅ Loaded slash command: ${command.data.name}`);
            } else {
              console.log(
                `⚠️ [WARNING] The slash command at ${entry.name} is missing required "data" or "execute" property.`
              );
            }
          }
        }
      };

      await loadCommandsRecursive(slashCommandsPath);
      console.log(`✅ Loaded ${this.commands.size} slash commands!`);
    } catch (error) {
      console.error('Error loading slash commands:', error);
    }
  }

  async registerCommands() {
    const limit = resolveCommandLimit();
    const { selected, skipped } = selectCommandsForRegistration(this.commands, limit);

    if (skipped.length > 0) {
      console.warn(
        `⚠️ Discord allows ${limit} global slash commands — ${skipped.length} not registered: ` +
          skipped.map((command) => `/${command.data.name}`).join(', ')
      );
    }

    const commands = selected.map((command) => command.data.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
      console.log(
        `🔄 Started refreshing ${commands.length} application (/) commands` +
          (skipped.length > 0 ? ` (${this.commands.size} loaded, capped at ${limit})` : '') +
          '.'
      );

      // Register commands globally
      const data = await rest.put(Routes.applicationCommands(this.client.user.id), {
        body: commands,
      });

      console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally.`);

      // Also register to test guild if TEST_GUILD_ID is set (for instant updates)
      if (process.env.TEST_GUILD_ID) {
        const guildData = await rest.put(
          Routes.applicationGuildCommands(this.client.user.id, process.env.TEST_GUILD_ID),
          { body: commands }
        );
        console.log(
          `✅ Successfully reloaded ${guildData.length} commands to test guild instantly.`
        );
      }
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  }

  async handleInteraction(interaction) {
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = this.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(`Autocomplete error for ${interaction.commandName}:`, error);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = this.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    if (!commandPermissionsManager.isCommandEnabled(interaction.guildId, interaction.commandName)) {
      return interaction.reply({
        content: '❌ This command is disabled in this server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const requiredRoleId = commandPermissionsManager.getRequiredRole(
      interaction.guildId,
      interaction.commandName
    );
    if (requiredRoleId && !interaction.member.permissions.has('Administrator')) {
      if (!interaction.member.roles.cache.has(requiredRoleId)) {
        return interaction.reply({
          content: '❌ You do not have permission to use this command.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    try {
      // Fire-and-forget: don't block the interaction response for activity tracking.
      // Awaiting this can write large JSON files to disk and push the total time past
      // Discord's 3-second interaction acknowledgement window, causing error 10062.
      activityTracker
        .recordActivity(interaction.guildId, interaction.user.id, 'slash_command')
        .catch((err) => console.error('Activity tracking error:', err.message));

      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);

      const errorMessage = {
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      };

      try {
        if (interaction.deferred) {
          await interaction.editReply(errorMessage);
        } else if (!interaction.replied) {
          await interaction.reply(errorMessage);
        }
      } catch (e) {
        console.error('Failed to send error response:', e.message);
      }
    }
  }
}

module.exports = SlashCommandHandler;
module.exports.GLOBAL_SLASH_COMMAND_LIMIT = GLOBAL_SLASH_COMMAND_LIMIT;
module.exports.resolveCommandLimit = resolveCommandLimit;
module.exports.selectCommandsForRegistration = selectCommandsForRegistration;
