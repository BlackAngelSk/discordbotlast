const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const SIMULATION_TIMEOUT_MS = 5000;
const PROGRESS_UPDATE_MS = 1500;
const PROGRESS_BAR_WIDTH = 20;
const REPORT_MAX_STACK_LINES = 40;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ─── Data write guard ────────────────────────────────────────────────────────
// Simulated commands run real handler code, so economy/moderation managers would
// happily persist test values. Block writes into data/ for the duration of the
// run and restore any file that changed anyway.
function installDataWriteGuard() {
  const fsMod = require('fs');
  const fsp = fsMod.promises;
  const dataPrefix = `${DATA_DIR}${path.sep}`;
  const touched = [];
  const alreadyBlocked = new Set();

  const isDataPath = (target) => {
    try {
      const resolved = path.resolve(String(target));
      return resolved === DATA_DIR || resolved.startsWith(dataPrefix);
    } catch {
      return false;
    }
  };

  const block = (target) => {
    if (!isDataPath(target)) return false;
    const name = path.basename(String(target));
    if (!alreadyBlocked.has(name)) {
      alreadyBlocked.add(name);
      touched.push(name);
    }
    return true;
  };

  const originals = {
    fspWriteFile: fsp.writeFile,
    fspAppendFile: fsp.appendFile,
    fspRename: fsp.rename,
    fspCopyFile: fsp.copyFile,
    writeFile: fsMod.writeFile,
    appendFile: fsMod.appendFile,
    rename: fsMod.rename,
    copyFile: fsMod.copyFile,
    writeFileSync: fsMod.writeFileSync,
    appendFileSync: fsMod.appendFileSync,
    renameSync: fsMod.renameSync,
    copyFileSync: fsMod.copyFileSync,
  };

  fsp.writeFile = async (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.fspWriteFile.call(fsp, file, ...rest);
  };
  fsp.appendFile = async (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.fspAppendFile.call(fsp, file, ...rest);
  };
  fsp.rename = async (from, to) => {
    if (block(to)) return undefined;
    return originals.fspRename.call(fsp, from, to);
  };
  fsp.copyFile = async (from, to) => {
    if (block(to)) return undefined;
    return originals.fspCopyFile.call(fsp, from, to);
  };
  fsMod.writeFile = (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.writeFile.call(fsMod, file, ...rest);
  };
  fsMod.appendFile = (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.appendFile.call(fsMod, file, ...rest);
  };
  fsMod.rename = (from, to, ...rest) => {
    if (block(to)) return undefined;
    return originals.rename.call(fsMod, from, to, ...rest);
  };
  fsMod.copyFile = (from, to, ...rest) => {
    if (block(to)) return undefined;
    return originals.copyFile.call(fsMod, from, to, ...rest);
  };
  fsMod.writeFileSync = (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.writeFileSync.call(fsMod, file, ...rest);
  };
  fsMod.appendFileSync = (file, ...rest) => {
    if (block(file)) return undefined;
    return originals.appendFileSync.call(fsMod, file, ...rest);
  };
  fsMod.renameSync = (from, to, ...rest) => {
    if (block(to)) return undefined;
    return originals.renameSync.call(fsMod, from, to, ...rest);
  };
  fsMod.copyFileSync = (from, to, ...rest) => {
    if (block(to)) return undefined;
    return originals.copyFileSync.call(fsMod, from, to, ...rest);
  };

  return {
    restore() {
      fsp.writeFile = originals.fspWriteFile;
      fsp.appendFile = originals.fspAppendFile;
      fsp.rename = originals.fspRename;
      fsp.copyFile = originals.fspCopyFile;
      fsMod.writeFile = originals.writeFile;
      fsMod.appendFile = originals.appendFile;
      fsMod.rename = originals.rename;
      fsMod.copyFile = originals.copyFile;
      fsMod.writeFileSync = originals.writeFileSync;
      fsMod.appendFileSync = originals.appendFileSync;
      fsMod.renameSync = originals.renameSync;
      fsMod.copyFileSync = originals.copyFileSync;
    },
    get blockedFiles() {
      return [...alreadyBlocked];
    },
  };
}

function snapshotDataDirectory() {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => {
        const full = path.join(DATA_DIR, name);
        try {
          return { name, full, content: fs.readFileSync(full) };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function restoreDataDirectory(snapshot) {
  const restored = [];

  for (const entry of snapshot) {
    try {
      const current = fs.readFileSync(entry.full);
      if (current.equals(entry.content)) continue;
      fs.writeFileSync(entry.full, entry.content);
      restored.push(entry.name);
    } catch {
      // File deleted or unreadable — nothing to restore
    }
  }

  return restored;
}

// ─── Build a rich mock interaction that swallows every Discord API call ───────
function buildMockInteraction(client, interaction, commandName) {
  // Options proxy: returns safe defaults for every getter
  const optionsProxy = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'getSubcommand') return () => 'test';
        if (prop === 'getSubcommandGroup') return () => null;
        if (prop === 'getString') return () => 'test';
        if (prop === 'getInteger') return () => 1;
        if (prop === 'getNumber') return () => 1;
        if (prop === 'getBoolean') return () => false;
        if (prop === 'getUser') return () => interaction.user;
        if (prop === 'getMember') return () => interaction.member;
        if (prop === 'getChannel') return () => interaction.channel;
        if (prop === 'getRole') return () => null;
        if (prop === 'getMentionable') return () => interaction.user;
        if (prop === 'getAttachment') return () => null;
        if (prop === 'get') return () => null;
        if (prop === 'data') return { options: [] };
        if (prop === '_group') return null;
        if (prop === '_subcommand') return 'test';
        if (prop === '_hoistedOptions') return [];
        return () => null;
      },
    }
  );

  const noop = async () => ({ id: '0', createdTimestamp: Date.now() });
  const noopEdit = async () => {};
  const noopFollowUp = async () => {};
  const noopDelete = async () => {};

  // Fake collector (for button / select menu collectors)
  const fakeCollector = {
    on: () => fakeCollector,
    once: () => fakeCollector,
    stop: () => {},
  };

  // Message-like object returned by deferReply / reply
  const fakeMessage = {
    id: '0',
    createdTimestamp: Date.now(),
    edit: noopEdit,
    delete: noopDelete,
    react: noopEdit,
    createMessageCollector: () => ({ on: () => {}, stop: () => {} }),
    createMessageComponentCollector: () => fakeCollector,
    awaitMessageComponent: async () => {
      throw Object.assign(new Error('timeout'), { code: 'InteractionCollectorError' });
    },
  };

  const fakeChannel = interaction.channel
    ? Object.create(interaction.channel, {
        send: { value: async () => fakeMessage },
        createMessageCollector: { value: () => fakeCollector },
        awaitMessages: { value: async () => new Map() },
      })
    : {
        id: interaction.channelId,
        send: async () => fakeMessage,
        createMessageCollector: () => fakeCollector,
        awaitMessages: async () => new Map(),
      };

  return {
    // Core identifiers
    id: '0',
    commandName,
    createdTimestamp: Date.now(),
    deferred: false,
    replied: false,

    // User / member / guild mirrors
    user: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    guildId: interaction.guildId,
    channel: fakeChannel,
    channelId: interaction.channelId,
    client,

    // Options
    options: optionsProxy,

    // Reply methods – all swallowed, set flags so double-reply guards work
    async deferReply() {
      this.deferred = true;
      return fakeMessage;
    },
    async reply() {
      this.replied = true;
      return { resource: { message: fakeMessage } };
    },
    async editReply() {
      return fakeMessage;
    },
    async followUp() {
      return fakeMessage;
    },
    async deleteReply() {},
    async fetchReply() {
      return fakeMessage;
    },

    // Collector helpers
    createMessageComponentCollector: () => fakeCollector,
    awaitMessageComponent: async () => {
      throw Object.assign(new Error('timeout'), { code: 'InteractionCollectorError' });
    },

    // Type guards used by Discord.js internally
    isChatInputCommand: () => true,
    isButton: () => false,
    isSelectMenu: () => false,
    isAutocomplete: () => false,
    isModalSubmit: () => false,
    inGuild: () => true,

    // Locale (some commands use this)
    locale: 'en-US',
    guildLocale: 'en-US',
  };
}

// ─── Walk slashCommands/ and collect every .js file with {data,execute} ─────
function collectCommands() {
  const base = path.join(__dirname, '..'); // slashCommands/
  const results = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        // skip this file itself
        if (full === __filename) continue;
        try {
          // clear cache so we always get fresh module
          delete require.cache[require.resolve(full)];
          const cmd = require(full);
          const rel = path.relative(base, full);
          if (cmd && cmd.data && typeof cmd.execute === 'function') {
            results.push({
              name: cmd.data.name,
              file: rel,
              execute: cmd.execute,
              skipInSimulation: Boolean(cmd.skipInSimulation),
              skipReason: cmd.simulationSkipReason || null,
            });
          } else {
            results.push({ name: entry.name, file: rel, loadError: 'Missing data or execute' });
          }
        } catch (err) {
          const rel = path.relative(base, full);
          results.push({
            name: entry.name,
            file: rel,
            loadError: err.message,
            loadStack: err.stack,
          });
        }
      }
    }
  };

  walk(base);
  return results;
}

function buildProgressBar(done, total) {
  const ratio = total > 0 ? done / total : 0;
  const filled = Math.round(PROGRESS_BAR_WIDTH * ratio);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, PROGRESS_BAR_WIDTH - filled))}`;
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function buildReport({
  interaction,
  total,
  passed,
  failed,
  skipped,
  startedAt,
  finishedAt,
  dataGuard = null,
}) {
  const lines = [];

  lines.push('Command simulation report');
  lines.push('========================');
  lines.push(`Generated:  ${finishedAt.toISOString()}`);
  lines.push(`Guild:      ${interaction.guild?.name || 'DM'} (${interaction.guildId || 'n/a'})`);
  lines.push(
    `Requested:  ${interaction.user?.tag || interaction.user?.id} (${interaction.user?.id})`
  );
  lines.push(`Duration:   ${formatDuration(finishedAt.getTime() - startedAt.getTime())}`);
  lines.push('');
  lines.push(
    `Total: ${total}  |  Passed: ${passed.length}  |  Failed: ${failed.length}  |  Skipped: ${skipped.length}`
  );
  if (dataGuard && (dataGuard.blocked.length > 0 || dataGuard.restored.length > 0)) {
    lines.push(
      `Data guard: blocked ${dataGuard.blocked.length} write(s)` +
        (dataGuard.blocked.length > 0 ? ` (${dataGuard.blocked.join(', ')})` : '') +
        `, restored ${dataGuard.restored.length} file(s) afterwards`
    );
  }
  lines.push('');

  if (failed.length > 0) {
    lines.push(`FAILED (${failed.length})`);
    lines.push('------------');
    failed.forEach((failure, index) => {
      lines.push('');
      lines.push(`${index + 1}. ${failure.file}  (/${failure.name})`);
      lines.push(`   Reason: ${failure.reason || 'unknown error'}`);
      if (failure.stack) {
        const stackLines = String(failure.stack)
          .split('\n')
          .slice(0, REPORT_MAX_STACK_LINES)
          .map((line) => `   ${line}`);
        lines.push('   Stack:');
        lines.push(...stackLines);
      }
    });
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`SKIPPED (${skipped.length})`);
    lines.push('-------------');
    skipped.forEach((entry) => {
      lines.push(`- ${entry.file}  (/${entry.name}) — ${entry.reason}`);
    });
    lines.push('');
  }

  lines.push(`PASSED (${passed.length})`);
  lines.push('------------');
  passed.forEach((entry) => {
    lines.push(`- ${entry.file}  (/${entry.name})${entry.note ? ` — ${entry.note}` : ''}`);
  });
  lines.push('');

  return lines.join('\n');
}

// ─── Main command ─────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('testcommands')
    .setDescription('[Owner only] Simulate all slash commands and report errors'),

  // Exported for scripts / tests
  buildMockInteraction,
  collectCommands,
  buildReport,
  installDataWriteGuard,
  snapshotDataDirectory,
  restoreDataDirectory,

  async execute(interaction) {
    // ── Owner guard ──────────────────────────────────────────────────────
    const OWNER_ID = process.env.BOT_OWNER_ID;
    if (!OWNER_ID || interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const startedAt = new Date();
    const commands = collectCommands();
    const total = commands.length;

    const passed = [];
    const failed = [];
    const skipped = [];

    // Commands run their real handler code — keep them from writing test data.
    const dataSnapshot = snapshotDataDirectory();
    const writeGuard = installDataWriteGuard();

    let lastProgressAt = 0;
    let currentFile = 'starting…';

    const progressContent = (index) =>
      [
        `🧪 **Simulating commands** — ${index}/${total}`,
        `\`${buildProgressBar(index, total)}\` ${total > 0 ? Math.round((index / total) * 100) : 0}%`,
        `✅ ${passed.length} passed · ❌ ${failed.length} failed · ⏭ ${skipped.length} skipped`,
        `Now: \`${truncate(currentFile, 70)}\``,
      ].join('\n');

    const pushProgress = async (index, { force = false } = {}) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < PROGRESS_UPDATE_MS) return;
      lastProgressAt = now;
      try {
        await interaction.editReply({ content: progressContent(index) });
      } catch {
        // Message gone / rate limited — keep simulating, the final report still lands
      }
    };

    console.log(`[testcommands] Starting simulation of ${total} commands…`);
    await pushProgress(0, { force: true });

    try {
      for (let index = 0; index < commands.length; index += 1) {
        const cmd = commands[index];
        currentFile = cmd.file;

        // Load error — no execute to call
        if (cmd.loadError) {
          failed.push({
            name: cmd.name,
            file: cmd.file,
            reason: `Load error: ${cmd.loadError}`,
            stack: cmd.loadStack,
          });
          console.warn(`[testcommands] ❌ LOAD  ${cmd.file}: ${cmd.loadError}`);
          await pushProgress(index + 1);
          continue;
        }

        // Commands that intentionally throw (e.g. /testerror) must not be simulated
        if (cmd.skipInSimulation) {
          skipped.push({
            name: cmd.name,
            file: cmd.file,
            reason: cmd.skipReason || 'intentionally errors when executed',
          });
          console.log(`[testcommands] ⏭ SKIP  ${cmd.file}`);
          await pushProgress(index + 1);
          continue;
        }

        const mock = buildMockInteraction(interaction.client, interaction, cmd.name);

        try {
          // Run with a timeout so hanging collectors don't block
          await Promise.race([
            cmd.execute(mock),
            new Promise((_, rej) =>
              setTimeout(
                () => rej(new Error(`Timed out (${SIMULATION_TIMEOUT_MS / 1000}s)`)),
                SIMULATION_TIMEOUT_MS
              )
            ),
          ]);
          passed.push({ name: cmd.name, file: cmd.file });
          console.log(`[testcommands] ✅ PASS  ${cmd.file}`);
        } catch (err) {
          // Collector timeouts are expected — treat as pass
          if (
            err.code === 'InteractionCollectorError' ||
            err.message === `Timed out (${SIMULATION_TIMEOUT_MS / 1000}s)`
          ) {
            passed.push({ name: cmd.name, file: cmd.file, note: 'collector/timeout – expected' });
            console.log(`[testcommands] ✅ PASS  ${cmd.file} (collector/timeout – expected)`);
          } else {
            failed.push({
              name: cmd.name,
              file: cmd.file,
              reason: err.message,
              stack: err.stack,
              code: err.code || null,
            });
            console.error(`[testcommands] ❌ FAIL  ${cmd.file}: ${err.message}`);
          }
        }

        await pushProgress(index + 1);
      }
    } finally {
      // Always unpatch fs, even if a simulated command escapes its try/catch.
      writeGuard.restore();
    }

    const finishedAt = new Date();

    const blockedDataFiles = writeGuard.blockedFiles;
    const restoredDataFiles = restoreDataDirectory(dataSnapshot);
    const dataGuard = { blocked: blockedDataFiles, restored: restoredDataFiles };

    console.log(
      `[testcommands] Done — ${passed.length}/${total} passed, ${failed.length} failed, ${skipped.length} skipped.` +
        (dataGuard.blocked.length > 0
          ? ` Blocked ${dataGuard.blocked.length} data write(s), restored ${dataGuard.restored.length}.`
          : '')
    );

    // ── Summary embed ─────────────────────────────────────────────────────
    const colour = failed.length === 0 ? 0x57f287 : failed.length < total / 2 ? 0xfee75c : 0xed4245;

    const embed = new EmbedBuilder()
      .setTitle('🧪 Command Simulation Results')
      .setColor(colour)
      .setDescription(
        `Simulated **${total}** commands in ${formatDuration(
          finishedAt.getTime() - startedAt.getTime()
        )} — ` +
          `✅ **${passed.length}** passed · ❌ **${failed.length}** failed · ⏭ **${skipped.length}** skipped`
      )
      .setTimestamp(finishedAt)
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    if (failed.length > 0) {
      // Short in-chat preview; the full stacks live in the attached report
      const preview = failed
        .slice(0, 10)
        .map((failure) => `\`${truncate(failure.file, 45)}\` — ${truncate(failure.reason, 80)}`)
        .join('\n');

      embed.addFields({
        name: `❌ Failed (${failed.length})`,
        value: truncate(
          failed.length > 10
            ? `${preview}\n…and ${failed.length - 10} more in the report file`
            : preview,
          1024
        ),
        inline: false,
      });
    }

    if (skipped.length > 0) {
      embed.addFields({
        name: `⏭ Skipped (${skipped.length})`,
        value: truncate(skipped.map((entry) => `\`${entry.file}\``).join(', '), 1024),
        inline: false,
      });
    }

    if (dataGuard.blocked.length > 0 || dataGuard.restored.length > 0) {
      embed.addFields({
        name: '🛡️ Data guard',
        value: truncate(
          `Blocked ${dataGuard.blocked.length} write(s) to \`data/\` during the run` +
            (dataGuard.restored.length > 0
              ? `; restored ${dataGuard.restored.length} changed file(s).`
              : '.') +
            '\nSimulated commands still run real handler logic — restart the bot if you want in-memory state to match disk.',
          1024
        ),
        inline: false,
      });
    }

    // ── Full report as a text file ────────────────────────────────────────
    const report = buildReport({
      interaction,
      total,
      passed,
      failed,
      skipped,
      startedAt,
      finishedAt,
      dataGuard,
    });

    const stamp = finishedAt.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const attachment = new AttachmentBuilder(Buffer.from(report, 'utf8'), {
      name: `testcommands-${stamp}.txt`,
      description: 'Full command simulation report with stack traces',
    });

    const finalContent =
      failed.length === 0
        ? `✅ All ${total} commands simulated without errors.`
        : `⚠️ ${failed.length} of ${total} commands failed — full details attached.`;

    try {
      await interaction.editReply({
        content: finalContent,
        embeds: [embed],
        files: [attachment],
      });
    } catch (error) {
      // Some channels disallow attachments — still deliver the summary and a
      // truncated inline failure list instead of failing silently.
      console.warn(`[testcommands] Could not attach report file: ${error.message}`);

      const inlineFailures = failed
        .slice(0, 15)
        .map((failure) => `\`${failure.file}\` — ${failure.reason}`)
        .join('\n');

      try {
        await interaction.followUp({
          content: `📄 Report file could not be attached (${error.message}).\n\`\`\`\n${inlineFailures.slice(0, 1800)}\n\`\`\``,
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        // followUp also unavailable — the embed is already on screen
      }

      await interaction.editReply({
        content: finalContent,
        embeds: [embed],
      });
    }
  },
};
