const fs = require('fs');
const path = require('path');
const settingsManager = require('./settingsManager');
const commandPermissionsManager = require('./commandPermissionsManager');
const { memberHasBetaAccess, getBetaRoleName } = require('../betaAccess');

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Map();
  }

  async loadCommands() {
    const commandsPath = path.join(__dirname, '..', '..', 'commands');

    // Pass 1: discover every command module (recursively), pass 2: register.
    // Two passes are required so that a command's *alias* can never shadow
    // another command's *real name* (e.g. `botprefix` aliasing `prefix` used to
    // make the real `prefix` command unreachable).
    const discovered = [];

    const collect = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip conventional non-command directories (archive/disabled/vcs)
          if (entry.name.startsWith('.') || entry.name.startsWith('_')) {
            continue;
          }
          collect(fullPath);
        } else if (entry.name.endsWith('.js')) {
          discovered.push({ fullPath, command: require(fullPath) });
        }
      }
    };

    collect(commandsPath);

    // ── Pass 1: real names win ───────────────────────────────────────────────
    const aliasesToRegister = [];

    for (const { fullPath, command } of discovered) {
      if (!('name' in command) || !('execute' in command)) {
        console.warn(`⚠️ Command at ${fullPath} is missing required "name" or "execute" property.`);
        continue;
      }

      const existing = this.commands.get(command.name);
      if (existing) {
        // Same module object re-exported through another path (e.g. a thin
        // `poker.js` -> `poker.multiplayer.v2.js` shim): not a clash.
        if (existing === command) {
          continue;
        }

        const existingPath = existing.__filePath || 'unknown file';
        console.warn(
          `⚠️ Duplicate command name "${command.name}": ${fullPath} is shadowed by ${existingPath}. ` +
            `Rename or move one of them (see commands/_archive/).`
        );
        continue;
      }

      Object.defineProperty(command, '__filePath', {
        value: fullPath,
        enumerable: false,
        configurable: true,
      });
      this.commands.set(command.name, command);
      console.log(`✅ Loaded command: ${command.name}`);

      if (command.aliases) {
        aliasesToRegister.push({ command, aliases: command.aliases, fullPath });
      }
    }

    // ── Pass 2: aliases only fill gaps ───────────────────────────────────────
    for (const { command, aliases, fullPath } of aliasesToRegister) {
      for (const alias of aliases) {
        const taken = this.commands.get(alias);
        if (taken) {
          if (taken === command) {
            continue;
          }

          console.warn(
            `⚠️ Alias "${alias}" of ${fullPath} is ignored: it collides with ` +
              `${taken.__filePath || `command "${taken.name}"`}. Real command names take precedence.`
          );
          continue;
        }

        this.commands.set(alias, command);
      }
    }
  }

  async handleCommand(message) {
    if (message.author.bot) return;

    // Ignore DMs - only work in servers
    if (!message.guild) return;

    // Get all prefixes for this server
    const prefixes = settingsManager.getPrefixes(message.guild.id);

    // Check if message starts with any prefix
    let usedPrefix = null;
    for (const prefix of prefixes) {
      if (message.content.startsWith(prefix)) {
        usedPrefix = prefix;
        break;
      }
    }

    if (!usedPrefix) return;

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = this.commands.get(commandName);
    if (!command) return;

    const baseCommandName = command.name;
    if (!commandPermissionsManager.isCommandEnabled(message.guild.id, baseCommandName)) {
      return message.reply('❌ This command is disabled in this server.');
    }

    const requiredRoleId = commandPermissionsManager.getRequiredRole(
      message.guild.id,
      baseCommandName
    );
    if (requiredRoleId && !message.member.permissions.has('Administrator')) {
      if (!message.member.roles.cache.has(requiredRoleId)) {
        return message.reply('❌ You do not have permission to use this command.');
      }
    }

    const isBetaCommand = !!command.beta;
    if (isBetaCommand && !memberHasBetaAccess(message.member)) {
      return message.reply(
        `❌ This is a beta command. You need the \`${getBetaRoleName()}\` role.`
      );
    }

    try {
      if (isBetaCommand) {
        message.betaInfiniteBalance = true;
      }
      await command.execute(message, args, this.client);
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      await message.reply('❌ There was an error executing that command!');
    } finally {
      if (isBetaCommand) {
        delete message.betaInfiniteBalance;
      }
    }
  }
}

module.exports = CommandHandler;
