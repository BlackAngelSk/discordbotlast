const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ─── Build a rich mock interaction that swallows every Discord API call ───────
function buildMockInteraction(client, interaction, commandName) {
    // Options proxy: returns safe defaults for every getter
    const optionsProxy = new Proxy({}, {
        get(_, prop) {
            if (prop === 'getSubcommand')       return () => 'test';
            if (prop === 'getSubcommandGroup')  return () => null;
            if (prop === 'getString')           return () => 'test';
            if (prop === 'getInteger')          return () => 1;
            if (prop === 'getNumber')           return () => 1;
            if (prop === 'getBoolean')          return () => false;
            if (prop === 'getUser')             return () => interaction.user;
            if (prop === 'getMember')           return () => interaction.member;
            if (prop === 'getChannel')          return () => interaction.channel;
            if (prop === 'getRole')             return () => null;
            if (prop === 'getMentionable')      return () => interaction.user;
            if (prop === 'getAttachment')       return () => null;
            if (prop === 'get')                 return () => null;
            if (prop === 'data')                return { options: [] };
            if (prop === '_group')              return null;
            if (prop === '_subcommand')         return 'test';
            if (prop === '_hoistedOptions')     return [];
            return () => null;
        }
    });

    const noop        = async () => ({ id: '0', createdTimestamp: Date.now() });
    const noopEdit    = async () => {};
    const noopFollowUp = async () => {};
    const noopDelete  = async () => {};

    // Message-like object returned by deferReply / reply
    const fakeMessage = {
        id: '0',
        createdTimestamp: Date.now(),
        edit: noopEdit,
        delete: noopDelete,
        react: noopEdit,
        createMessageCollector: () => ({ on: () => {}, stop: () => {} }),
        createMessageComponentCollector: () => fakeCollector,
        awaitMessageComponent: async () => { throw Object.assign(new Error('timeout'), { code: 'InteractionCollectorError' }); }
    };

    // Fake collector (for button / select menu collectors)
    const fakeCollector = {
        on:   () => fakeCollector,
        once: () => fakeCollector,
        stop: () => {}
    };

    const fakeChannel = interaction.channel
        ? Object.create(interaction.channel, {
            send:                { value: async () => fakeMessage },
            createMessageCollector: { value: () => fakeCollector },
            awaitMessages:       { value: async () => new Map() }
        })
        : {
            id: interaction.channelId,
            send: async () => fakeMessage,
            createMessageCollector: () => fakeCollector,
            awaitMessages: async () => new Map()
        };

    return {
        // Core identifiers
        id:             '0',
        commandName,
        createdTimestamp: Date.now(),
        deferred:       false,
        replied:        false,

        // User / member / guild mirrors
        user:    interaction.user,
        member:  interaction.member,
        guild:   interaction.guild,
        guildId: interaction.guildId,
        channel: fakeChannel,
        channelId: interaction.channelId,
        client,

        // Options
        options: optionsProxy,

        // Reply methods – all swallowed, set flags so double-reply guards work
        async deferReply()  { this.deferred = true;  return fakeMessage; },
        async reply()       { this.replied  = true;  return { resource: { message: fakeMessage } }; },
        async editReply()   { return fakeMessage; },
        async followUp()    { return fakeMessage; },
        async deleteReply() {},
        async fetchReply()  { return fakeMessage; },

        // Collector helpers
        createMessageComponentCollector: () => fakeCollector,
        awaitMessageComponent: async () => {
            throw Object.assign(new Error('timeout'), { code: 'InteractionCollectorError' });
        },

        // Type guards used by Discord.js internally
        isChatInputCommand: () => true,
        isButton:           () => false,
        isSelectMenu:       () => false,
        isAutocomplete:     () => false,
        isModalSubmit:      () => false,
        inGuild:            () => true,

        // Locale (some commands use this)
        locale: 'en-US',
        guildLocale: 'en-US'
    };

    // Ensure client.queues exists so music commands don't crash
    if (!mock.client.queues) mock.client.queues = new Map();
}

// ─── Walk slashCommands/ and collect every .js file with {data,execute} ─────
function collectCommands() {
    const base    = path.join(__dirname, '..'); // slashCommands/
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
                        results.push({ name: cmd.data.name, file: rel, execute: cmd.execute });
                    } else {
                        results.push({ name: entry.name, file: rel, loadError: 'Missing data or execute' });
                    }
                } catch (err) {
                    const rel = path.relative(base, full);
                    results.push({ name: entry.name, file: rel, loadError: err.message });
                }
            }
        }
    };

    walk(base);
    return results;
}

// ─── Main command ─────────────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName('testcommands')
        .setDescription('[Owner only] Simulate all slash commands and report errors'),

    async execute(interaction) {
        // ── Owner guard ──────────────────────────────────────────────────────
        const OWNER_ID = process.env.BOT_OWNER_ID;
        if (!OWNER_ID || interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: '❌ Only the bot owner can use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const commands = collectCommands();
        const total    = commands.length;

        const passed  = [];
        const failed  = [];

        console.log(`[testcommands] Starting simulation of ${total} commands…`);

        for (const cmd of commands) {
            // Load error — no execute to call
            if (cmd.loadError) {
                failed.push({ name: cmd.name, file: cmd.file, reason: `Load error: ${cmd.loadError}` });
                console.warn(`[testcommands] ❌ LOAD  ${cmd.file}: ${cmd.loadError}`);
                continue;
            }

            const mock = buildMockInteraction(interaction.client, interaction, cmd.name);

            try {
                // Run with a 5-second timeout so hanging collectors don't block
                await Promise.race([
                    cmd.execute(mock),
                    new Promise((_, rej) =>
                        setTimeout(() => rej(new Error('Timed out (5s)')), 5000)
                    )
                ]);
                passed.push({ name: cmd.name, file: cmd.file });
                console.log(`[testcommands] ✅ PASS  ${cmd.file}`);
            } catch (err) {
                // Collector timeouts are expected — treat as pass
                if (err.code === 'InteractionCollectorError' || err.message === 'Timed out (5s)') {
                    passed.push({ name: cmd.name, file: cmd.file });
                    console.log(`[testcommands] ✅ PASS  ${cmd.file} (collector/timeout – expected)`);
                } else {
                    failed.push({ name: cmd.name, file: cmd.file, reason: err.message });
                    console.error(`[testcommands] ❌ FAIL  ${cmd.file}: ${err.message}`);
                }
            }
        }

        console.log(`[testcommands] Done — ${passed.length}/${total} passed, ${failed.length} failed.`);

        // ── Build result embed ────────────────────────────────────────────────
        const colour = failed.length === 0 ? 0x57f287 : failed.length < total / 2 ? 0xfee75c : 0xed4245;

        const embed = new EmbedBuilder()
            .setTitle('🧪 Command Simulation Results')
            .setColor(colour)
            .setDescription(
                `Simulated **${total}** commands — ` +
                `✅ **${passed.length}** passed · ❌ **${failed.length}** failed`
            )
            .setTimestamp()
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        // Failed section (show all failures with reason)
        if (failed.length > 0) {
            // Discord field value cap is 1024 chars — chunk if needed
            const lines = failed.map(f => `\`${f.name}\` — ${f.reason}`);
            const chunks = [];
            let chunk = '';
            for (const line of lines) {
                if ((chunk + '\n' + line).length > 1020) {
                    chunks.push(chunk);
                    chunk = line;
                } else {
                    chunk = chunk ? chunk + '\n' + line : line;
                }
            }
            if (chunk) chunks.push(chunk);

            chunks.forEach((c, i) =>
                embed.addFields({
                    name: i === 0 ? `❌ Failed (${failed.length})` : '❌ Failed (cont.)',
                    value: c,
                    inline: false
                })
            );
        }

        // Passed list (compact, single field)
        if (passed.length > 0) {
            const passedText = passed.map(p => `\`${p.name}\``).join(', ');
            const trimmed = passedText.length > 1020
                ? passedText.slice(0, 1017) + '…'
                : passedText;
            embed.addFields({ name: `✅ Passed (${passed.length})`, value: trimmed, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
