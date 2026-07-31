const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const economyManager = require('../../utils/economyManager');
const gameStatsManager = require('../../utils/gameStatsManager');
const { PokerTableManager } = require('../../utils/pokerTableManager');
const { pokerCommunityAttachment, pokerHandAttachment } = require('../../utils/cardBoardRenderer');

// Track which players have received rules this session
const rulesSent = new Set();

module.exports = {
  name: 'poker',
  description: "Play multiplayer Texas Hold'em Poker! Create tables with flexible buy-ins.",
  usage:
    '!poker create <maxPot> [players] - Create flexible table\n!poker host <blind> [buyin] [players] - Traditional table\n!poker join <blind> [buyin] - Join traditional table\n!poker list - View available tables\n!poker start|status|leave - Game commands\n!poker stats [user] - View poker stats\n!poker leaderboard - Server leaderboard\n!poker spectate - Watch an ongoing game',
  aliases: ['holdem', 'txpoker'],
  category: 'fun',
  async execute(message, args) {
    try {
      PokerTableManager.cleanupInactiveTables(10 * 60 * 1000);

      const subcommand = args[0]?.toLowerCase();
      if (!subcommand) {
        return message.reply(`📋 **Poker Command Help**

**Flexible Table (Recommended):**
\`!poker create <maxPot> [players]\` - Players choose buy-in up to maxPot
Example: \`!poker create 10000\` or \`!poker create 10000 4\` (4 max players)

**Traditional Table:**
\`!poker host <blind> [buyin] [players]\` - Fixed blind with custom buy-in
\`!poker join <blind> [buyin]\` - Join a traditional table

**Game Commands:**
\`!poker list\` - See available tables
\`!poker start\` - Start game (host only)
\`!poker status\` - View current game
\`!poker leave\` - Leave table
\`!poker spectate\` - Watch an ongoing game

**Stats & Leaderboards:**
\`!poker stats [user]\` - View poker stats
\`!poker leaderboard\` - Server leaderboard`);
      }

      if (subcommand === 'create') return createFlexiblePoker(message, args);
      if (subcommand === 'host') return hostPoker(message, args);
      if (subcommand === 'join') return joinPoker(message, args);
      if (subcommand === 'list') return listPokerTables(message);
      if (subcommand === 'start') return startHostedPoker(message);
      if (subcommand === 'status') return pokerStatus(message);
      if (subcommand === 'leave') return leavePoker(message);
      if (subcommand === 'stats') return pokerStats(message, args);
      if (subcommand === 'leaderboard') return pokerLeaderboard(message);
      if (subcommand === 'spectate') return spectatePoker(message);

      return message.reply('❌ Unknown subcommand. Use `!poker` to see help.');
    } catch (error) {
      console.error('Error in poker command:', error);
      return message.reply('❌ An error occurred in poker.');
    }
  },
};

// ────────────────────────────────────────────
// Table Creation & Joining
// ────────────────────────────────────────────

async function createFlexiblePoker(message, args) {
  const maxPot = parseInt(args[1], 10);
  if (!maxPot || maxPot < 100) {
    return message.reply(
      '❌ Please specify a valid max pot (minimum 100 coins)!\nUsage: `!poker create <maxPot> [players]`\nExample: `!poker create 10000`'
    );
  }

  // Cooldown check
  const cooldown = PokerTableManager.getCreateCooldown(message.author.id);
  if (cooldown > 0) {
    return message.reply(
      `⏳ Please wait ${Math.ceil(cooldown / 1000)} seconds before creating another table.`
    );
  }

  if (PokerTableManager.getUserTable(message.author.id)) {
    return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');
  }

  const userData = economyManager.getUserData(message.guild.id, message.author.id);

  // Parse max players (2-8)
  const maxPlayers = Math.max(2, Math.min(8, parseInt(args[2], 10) || 6));

  // Calculate blind from pot
  const suggestedBlind = Math.max(5, Math.floor(maxPot / 50));

  if (userData.balance < maxPot) {
    return message.reply(
      `❌ You don't have enough coins! Your balance: ${userData.balance}, max pot: ${maxPot}`
    );
  }

  const table = PokerTableManager.createTable(
    message.guild.id,
    message.channel.id,
    suggestedBlind,
    maxPlayers
  );
  table.hostId = message.author.id;
  table.isFlexible = true;
  table.maxPot = maxPot;
  table.minBet = suggestedBlind;

  const added = PokerTableManager.addPlayerToTable(
    table.tableId,
    message.author.id,
    message.author.username,
    maxPot
  );
  if (!added) return message.reply('❌ Failed to create poker table.');

  await economyManager.removeMoney(message.guild.id, message.author.id, maxPot);

  const hostPlayer = table.players?.get(message.author.id);
  if (hostPlayer) hostPlayer.originalBuyIn = maxPot;

  PokerTableManager.setCreateCooldown(message.author.id);

  const embed = buildLobbyEmbed(table, message.author, maxPot);
  const row = buildLobbyButtons(table.tableId, true);

  const tableMsg = await message.reply({ embeds: [embed], components: [row] });
  setupFlexibleTableLobby(message, table, tableMsg);
}

async function listPokerTables(message) {
  const tables = [];
  for (const [, t] of PokerTableManager.tables) {
    if (t.guildId === message.guild.id && t.channelId === message.channel.id && !t.gameStarted) {
      tables.push(t);
    }
  }

  if (tables.length === 0) {
    return message.reply(
      '❌ No available poker tables in this channel. Start one with `!poker create <maxPot>` or `!poker host <blind>`'
    );
  }

  const tableList = tables
    .map((t) => {
      const players = t.getTotalPlayers();
      const mode = t.isFlexible ? `Flexible (Max: ${t.maxPot})` : `Blind: ${t.minBet}`;
      const you = t.hostId === message.author.id ? ' 👈 (yours)' : '';
      return `• **${mode}** - ${players}/${t.maxPlayers} players${you}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x228b22)
    .setTitle('🎴 Available Poker Tables')
    .setDescription(tableList)
    .setFooter({ text: `Total: ${tables.length} table(s) in this channel` });

  return message.reply({ embeds: [embed] });
}

async function hostPoker(message, args) {
  const bet = parseInt(args[1], 10);
  if (!bet || bet < 10) {
    return message.reply(
      '❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!poker host <blind> [buyin] [players]`'
    );
  }

  const buyInArg = parseInt(args[2], 10);
  const defaultBuyIn = bet * 20;
  const buyIn = Number.isFinite(buyInArg) && buyInArg > 0 ? buyInArg : defaultBuyIn;
  if (buyIn < bet * 2) {
    return message.reply(`❌ Buy-in must be at least ${bet * 2} coins (2x blind).`);
  }

  const cooldown = PokerTableManager.getCreateCooldown(message.author.id);
  if (cooldown > 0) {
    return message.reply(
      `⏳ Please wait ${Math.ceil(cooldown / 1000)} seconds before creating another table.`
    );
  }

  if (PokerTableManager.getUserTable(message.author.id)) {
    return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');
  }

  const userData = economyManager.getUserData(message.guild.id, message.author.id);
  if (userData.balance < buyIn) {
    return message.reply(`❌ You don't have enough coins! Your balance: ${userData.balance} coins`);
  }

  const maxPlayers = Math.max(2, Math.min(8, parseInt(args[3], 10) || 6));

  const table = PokerTableManager.createTable(
    message.guild.id,
    message.channel.id,
    bet,
    maxPlayers
  );
  table.hostId = message.author.id;
  table.buyIn = buyIn;

  const added = PokerTableManager.addPlayerToTable(
    table.tableId,
    message.author.id,
    message.author.username,
    buyIn
  );
  if (!added) return message.reply('❌ Failed to create poker table.');

  await economyManager.removeMoney(message.guild.id, message.author.id, buyIn);

  const hostPlayer = table.players?.get(message.author.id);
  if (hostPlayer) hostPlayer.originalBuyIn = buyIn;

  PokerTableManager.setCreateCooldown(message.author.id);

  const embed = buildLobbyEmbed(table, message.author);
  const row = buildLobbyButtons(table.tableId, false);

  const tableMsg = await message.reply({ embeds: [embed], components: [row] });
  setupTableLobby(message, table, tableMsg);
}

async function joinPoker(message, args) {
  const bet = parseInt(args[1], 10);
  if (!bet || bet < 10) {
    return message.reply(
      '❌ Please specify a valid bet amount (minimum 10 coins)!\nUsage: `!poker join <blind> [buyin]`\nExample: `!poker join 50 5000`'
    );
  }

  if (PokerTableManager.getUserTable(message.author.id)) {
    return message.reply('❌ You are already in a poker game! Use `!poker leave` if stuck.');
  }

  const customBuyIn = parseInt(args[2], 10);
  const userData = economyManager.getUserData(message.guild.id, message.author.id);

  let table = null;
  for (const [, t] of PokerTableManager.tables) {
    if (
      t.guildId === message.guild.id &&
      t.channelId === message.channel.id &&
      t.minBet === bet &&
      !t.gameStarted &&
      t.getTotalPlayers() < t.maxPlayers
    ) {
      table = t;
      break;
    }
  }

  if (!table) {
    return message.reply(
      `❌ No waiting table with ${bet} coin blind in this channel. Use \`!poker host ${bet}\` or \`!poker list\`.`
    );
  }

  const buyIn = customBuyIn && customBuyIn > 0 ? customBuyIn : getTableBuyIn(table);

  if (buyIn < table.minBet * 2) {
    return message.reply(`❌ Buy-in must be at least ${table.minBet * 2} coins (2x blind).`);
  }

  if (userData.balance < buyIn) {
    return message.reply(
      `❌ You don't have enough coins! Need ${buyIn}, your balance: ${userData.balance}`
    );
  }

  const added = PokerTableManager.addPlayerToTable(
    table.tableId,
    message.author.id,
    message.author.username,
    buyIn
  );
  if (!added) return message.reply('❌ Could not join this table.');

  await economyManager.removeMoney(message.guild.id, message.author.id, buyIn);

  const player = table.players?.get(message.author.id);
  if (player) player.originalBuyIn = buyIn;

  return message.reply(
    `✅ Joined poker table with ${buyIn} coin buy-in! Waiting for host to start...`
  );
}

// ────────────────────────────────────────────
// Lobby Management
// ────────────────────────────────────────────

function buildLobbyEmbed(table, host, buyInOverride = null) {
  const modeText = table.isFlexible ? `Max Buy-in: ${table.maxPot}` : `Blind: ${table.minBet}`;
  const buyInText = table.isFlexible
    ? 'Flexible (per player)'
    : `Default: ${buyInOverride || getTableBuyIn(table)}`;

  const players =
    table
      .getAllPlayers()
      .map((p) => {
        const role = p.userId === table.hostId ? ' (Host)' : '';
        return `• ${p.username}${role} - ${p.chips || p.originalBuyIn || 0} coins`;
      })
      .join('\n') || 'Waiting for players...';

  return new EmbedBuilder()
    .setColor(0x228b22)
    .setTitle('🎴 Poker Table Lobby')
    .setDescription(`Hosted by **${host.username || host.displayName}**`)
    .addFields(
      { name: 'Mode', value: modeText, inline: true },
      { name: 'Buy-in', value: buyInText, inline: true },
      { name: 'Players', value: `${table.getTotalPlayers()}/${table.maxPlayers}`, inline: true },
      { name: 'Player List', value: players, inline: false }
    )
    .setFooter({ text: 'Click buttons to join or start the game.' });
}

function buildLobbyButtons(tableId, isFlexible) {
  const joinId = isFlexible ? `poker_flexjoin_${tableId}` : `poker_join_${tableId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(joinId).setLabel('Join Table').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`poker_start_${tableId}`)
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Primary)
  );
}

function setupTableLobby(message, table, tableMsg) {
  const collector = tableMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
  let startingGame = false;

  collector.on('collect', async (interaction) => {
    if (interaction.customId === `poker_join_${table.tableId}`) {
      const t = PokerTableManager.getTable(table.tableId);
      if (!t || t.gameStarted)
        return interaction.reply({
          content: '❌ Table not available.',
          flags: MessageFlags.Ephemeral,
        });

      if (PokerTableManager.getUserTable(interaction.user.id)) {
        return interaction.reply({
          content: '❌ You are already in a poker table.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userData = economyManager.getUserData(message.guild.id, interaction.user.id);
      const tableBuyIn = getTableBuyIn(t);

      if (userData.balance < tableBuyIn) {
        return interaction.reply({
          content: `❌ You don't have enough coins (${tableBuyIn} needed).`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const added = PokerTableManager.addPlayerToTable(
        t.tableId,
        interaction.user.id,
        interaction.user.username,
        tableBuyIn
      );
      if (!added) {
        return interaction.reply({
          content: '❌ Could not join table.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await economyManager.removeMoney(message.guild.id, interaction.user.id, tableBuyIn);

      const player = t.players?.get(interaction.user.id);
      if (player) player.originalBuyIn = tableBuyIn;

      await interaction.reply({ content: '✅ Joined poker table!', flags: MessageFlags.Ephemeral });
      await updateLobbyDisplay(tableMsg, t, message);
      return;
    }

    if (interaction.customId === `poker_start_${table.tableId}`) {
      const t = PokerTableManager.getTable(table.tableId);
      if (!t)
        return interaction.reply({ content: '❌ Table not found.', flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== t.hostId)
        return interaction.reply({
          content: '❌ Only host can start.',
          flags: MessageFlags.Ephemeral,
        });
      if (t.getTotalPlayers() < 2)
        return interaction.reply({
          content: '❌ Need at least 2 players to start.',
          flags: MessageFlags.Ephemeral,
        });

      await interaction.reply({ content: '🎴 Game starting...', flags: MessageFlags.Ephemeral });
      startingGame = true;
      collector.stop('game_start');
      return runGameLoop(message.channel, t, tableMsg);
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (startingGame || reason === 'game_start') return;

    const t = PokerTableManager.getTable(table.tableId);
    if (!t || t.gameStarted) return;

    // Refund all players
    for (const p of t.getAllPlayers()) {
      const playerBuyIn = p.originalBuyIn || getTableBuyIn(t);
      await economyManager.addMoney(t.guildId, p.userId, playerBuyIn);
    }
    PokerTableManager.closeTable(t.tableId);
    tableMsg.edit({ components: [] }).catch(() => {});
  });
}

function setupFlexibleTableLobby(message, table, tableMsg) {
  const collector = tableMsg.createMessageComponentCollector({ time: 8 * 60 * 1000 });
  let startingGame = false;

  collector.on('collect', async (interaction) => {
    if (interaction.customId === `poker_flexjoin_${table.tableId}`) {
      const t = PokerTableManager.getTable(table.tableId);
      if (!t || t.gameStarted)
        return interaction.reply({
          content: '❌ Table not available.',
          flags: MessageFlags.Ephemeral,
        });

      if (PokerTableManager.getUserTable(interaction.user.id)) {
        return interaction.reply({
          content: '❌ You are already in a poker table.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userData = economyManager.getUserData(message.guild.id, interaction.user.id);
      const maxBuyIn = t.maxPot;
      const minBuyIn = t.minBet * 2;

      if (userData.balance < 100) {
        return interaction.reply({
          content: `❌ You need at least 100 coins to join this table. Your balance: ${userData.balance}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const maxAllowed = Math.min(maxBuyIn, userData.balance);
      await showBuyInModal(interaction, t, minBuyIn, maxAllowed);
      return;
    }

    if (interaction.customId === `poker_start_${table.tableId}`) {
      const t = PokerTableManager.getTable(table.tableId);
      if (!t)
        return interaction.reply({ content: '❌ Table not found.', flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== t.hostId)
        return interaction.reply({
          content: '❌ Only host can start.',
          flags: MessageFlags.Ephemeral,
        });
      if (t.getTotalPlayers() < 2)
        return interaction.reply({
          content: '❌ Need at least 2 players to start.',
          flags: MessageFlags.Ephemeral,
        });

      await interaction.reply({ content: '🎴 Game starting...', flags: MessageFlags.Ephemeral });
      startingGame = true;
      collector.stop('game_start');
      return runGameLoop(message.channel, t, tableMsg);
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (startingGame || reason === 'game_start') return;

    const t = PokerTableManager.getTable(table.tableId);
    if (!t || t.gameStarted) return;

    for (const p of t.getAllPlayers()) {
      const playerBuyIn = p.originalBuyIn || getTableBuyIn(t);
      await economyManager.addMoney(t.guildId, p.userId, playerBuyIn);
    }
    PokerTableManager.closeTable(t.tableId);
    tableMsg.edit({ components: [] }).catch(() => {});
  });
}

async function showBuyInModal(interaction, table, minBuyIn, maxAllowed) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`poker_buyin_${table.tableId}`)
    .setTitle('Enter Your Buy-in Amount');

  const buyInInput = new TextInputBuilder()
    .setCustomId('buyin_amount')
    .setLabel(`Buy-in (${minBuyIn} - ${maxAllowed} coins)`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Min: ${minBuyIn}, Max: ${maxAllowed}`)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(buyInInput));
  await interaction.showModal(modal);
}

async function updateLobbyDisplay(tableMsg, table, message) {
  const players =
    table
      .getAllPlayers()
      .map((p) => {
        const role = p.userId === table.hostId ? ' (Host)' : '';
        return `• ${p.username}${role} - ${p.chips || p.originalBuyIn || 0} coins`;
      })
      .join('\n') || 'Waiting...';

  const modeText = table.isFlexible ? `Max Buy-in: ${table.maxPot}` : `Blind: ${table.minBet}`;

  const embed = new EmbedBuilder()
    .setColor(0x228b22)
    .setTitle('🎴 Poker Table Lobby')
    .addFields(
      { name: 'Mode', value: modeText, inline: true },
      {
        name: 'Buy-in Settings',
        value: table.isFlexible ? 'Flexible (per player)' : `Default: ${getTableBuyIn(table)}`,
        inline: true,
      },
      { name: 'Players', value: `${table.getTotalPlayers()}/${table.maxPlayers}`, inline: true },
      { name: 'Player List', value: players, inline: false }
    );

  await tableMsg.edit({ embeds: [embed] }).catch(() => {});
}

// ────────────────────────────────────────────
// Game Start, Leave, Status
// ────────────────────────────────────────────

async function startHostedPoker(message) {
  const table = PokerTableManager.getUserTable(message.author.id);
  if (!table) return message.reply('❌ You are not in a poker table.');
  if (table.gameStarted) return message.reply('❌ This game already started.');
  if (table.hostId !== message.author.id)
    return message.reply('❌ Only the host can start the game.');
  if (table.getTotalPlayers() < 2) return message.reply('❌ Need at least 2 players to start.');

  return runGameLoop(message.channel, table);
}

async function leavePoker(message) {
  const table = PokerTableManager.getUserTable(message.author.id);
  if (!table) return message.reply('❌ You are not in a poker table.');
  if (table.gameStarted) return message.reply('❌ You cannot leave while a hand is running.');

  const wasHost = table.hostId === message.author.id;
  const player = table.players?.get(message.author.id);
  const buyIn = player?.originalBuyIn || getTableBuyIn(table);

  PokerTableManager.removePlayerFromTable(message.author.id);
  await economyManager.addMoney(message.guild.id, message.author.id, buyIn);

  if (wasHost) {
    // Refund remaining players
    const remaining = table.getAllPlayers();
    for (const p of remaining) {
      const pBuyIn = p.originalBuyIn || getTableBuyIn(table);
      await economyManager.addMoney(message.guild.id, p.userId, pBuyIn);
    }
    PokerTableManager.closeTable(table.tableId);
    return message.reply('✅ You left and closed the hosted table. All buy-ins refunded.');
  }

  // Transfer host if needed
  if (table.hostId && !PokerTableManager.getUserTable(table.hostId)) {
    const remaining = table.getAllPlayers();
    if (remaining.length > 0) {
      table.hostId = remaining[0].userId;
    }
  }

  return message.reply('✅ You left the table. Buy-in refunded.');
}

async function pokerStatus(message) {
  const table = PokerTableManager.getUserTable(message.author.id);
  if (!table) return message.reply('❌ You are not in a poker game!');

  const turnAvatarUrl = await getTurnAvatarUrl(message.guild, table);
  const embed = buildStateEmbed(
    table,
    table.gameStarted
      ? `Current turn: **${table.getCurrentPlayer()?.username || 'None'}**`
      : 'Lobby - waiting for players',
    turnAvatarUrl
  );

  if (table.gameStarted) {
    return message.reply(withCommunityBoard(embed, table));
  }
  return message.reply({ embeds: [embed] });
}

async function spectatePoker(message) {
  // Find a game in this channel
  let table = null;
  for (const [, t] of PokerTableManager.tables) {
    if (t.guildId === message.guild.id && t.channelId === message.channel.id && t.gameStarted) {
      table = t;
      break;
    }
  }

  if (!table) {
    return message.reply('❌ No ongoing poker game in this channel to spectate.');
  }

  const embed = buildStateEmbed(table, '👁️ Spectating', null);
  return message.reply(withCommunityBoard(embed, table));
}

// ────────────────────────────────────────────
// Rules (sent only once per player per session)
// ────────────────────────────────────────────

async function sendPokerRules(member, table) {
  const key = `${member.id}_${table.guildId}`;
  if (rulesSent.has(key)) return;
  rulesSent.add(key);

  // Clean up old entries periodically (max 1000 entries)
  if (rulesSent.size > 1000) {
    const entries = [...rulesSent];
    rulesSent.clear();
    // Keep the most recent 500
    entries.slice(-500).forEach((e) => rulesSent.add(e));
  }

  const minBet = table.minBet || 1;
  const rulesEmbed = new EmbedBuilder()
    .setColor(0x228b22)
    .setTitle("🎴 Texas Hold'em Poker Rules")
    .setDescription("Welcome to Poker! Here's how the game works:")
    .addFields(
      {
        name: '📋 Hand Rankings',
        value:
          '🏆 Royal Flush\n🎴 Straight Flush\n4️⃣ Four of a Kind\n🏠 Full House\n🌊 Flush\n➡️ Straight\n3️⃣ Three of a Kind\n👥 Two Pair\n👤 One Pair\n🎯 High Card',
        inline: false,
      },
      {
        name: '💵 Betting',
        value: `**Small Blind:** ${Math.floor(minBet / 2)}\n**Big Blind:** ${minBet}\n\nBet/Raise strategically to win the pot!`,
        inline: false,
      },
      {
        name: '🎰 Game Flow',
        value:
          '**Preflop** → 2 hidden cards\n**Flop** → 3 community cards\n**Turn** → 4th community card\n**River** → 5th community card\n**Showdown** → Best 5-card hand wins!',
        inline: false,
      },
      {
        name: '⚙️ Actions',
        value:
          '**Check** - Pass (if no bet)\n**Bet/Call** - Place/match chips\n**Raise** - Increase the bet\n**Fold** - Give up hand\n**All-in** - Push all chips',
        inline: false,
      },
      {
        name: '✅ Tips',
        value:
          '• Keep your hole cards secret\n• Use "View My Cards" button anytime\n• Side pots handled automatically\n• Best hand after River wins the pot',
        inline: false,
      }
    )
    .setFooter({ text: 'Good luck! 🍀 (Rules sent only once)' });

  await member.send({ embeds: [rulesEmbed] }).catch(() => {});
}

// ────────────────────────────────────────────
// Game Loop
// ────────────────────────────────────────────

async function runGameLoop(channel, table, tableMsg = null) {
  if (!table.startGame())
    return channel.send('❌ Could not start poker game. Need at least 2 players.');

  // Send rules to all players (only once per player)
  for (const p of table.getAllPlayers()) {
    const member = await channel.guild.members.fetch(p.userId).catch(() => null);
    if (member) await sendPokerRules(member, table);
  }

  // Send hole cards via DM
  for (const p of table.getAllPlayers()) {
    const member = await channel.guild.members.fetch(p.userId).catch(() => null);
    if (!member) continue;
    const hand = p.hole.map((c) => `${c.rank}${c.suit}`).join(' ');
    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🃏 Your Poker Hand')
      .setDescription(
        `Your cards: **${hand}**\nStack: **${p.chips}**\nPosition: ${p.isButton ? '🔘 Button' : p.isSmallBlind ? '🟡 SB' : p.isBigBlind ? '🔵 BB' : ''}`
      )
      .setFooter({ text: 'Keep this private.' });
    member.send(withPrivateHand(dmEmbed, p.hole, p.username)).catch(() => {});
  }

  const gameMessage = tableMsg || (await channel.send('🎴 Poker game started!'));
  const privateHandCollector = setupPrivateHandCollector(gameMessage, table);

  await updateGameDisplay(gameMessage, table, 'PREFLOP');
  await conductBettingRound(channel, table, gameMessage, 'PREFLOP');
  if (table.getActivePlayers().length <= 1)
    return finishAndCleanup(channel, table, gameMessage, false, privateHandCollector);

  table.dealFlop();
  await updateGameDisplay(gameMessage, table, 'FLOP');
  await conductBettingRound(channel, table, gameMessage, 'FLOP');
  if (table.getActivePlayers().length <= 1)
    return finishAndCleanup(channel, table, gameMessage, false, privateHandCollector);

  table.dealTurn();
  await updateGameDisplay(gameMessage, table, 'TURN');
  await conductBettingRound(channel, table, gameMessage, 'TURN');
  if (table.getActivePlayers().length <= 1)
    return finishAndCleanup(channel, table, gameMessage, false, privateHandCollector);

  table.dealRiver();
  await updateGameDisplay(gameMessage, table, 'RIVER');
  await conductBettingRound(channel, table, gameMessage, 'RIVER');

  return finishAndCleanup(channel, table, gameMessage, true, privateHandCollector);
}

function setupPrivateHandCollector(gameMessage, table) {
  const collector = gameMessage.createMessageComponentCollector({
    filter: (i) => i.customId === `poker_viewhand_${table.tableId}`,
  });

  collector.on('collect', async (interaction) => {
    const player = table.getAllPlayers().find((p) => p.userId === interaction.user.id);
    if (!player) {
      // Check if spectator
      await interaction.reply({
        content: '❌ You are not seated at this poker table.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const handText = formatCards(player.hole);
    const handEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🃏 Your Poker Hand')
      .setDescription(
        `Your cards: **${handText}**\nStack: **${player.chips}**\nPosition: ${player.isButton ? '🔘 Button' : player.isSmallBlind ? '🟡 SB' : player.isBigBlind ? '🔵 BB' : ''}`
      )
      .setFooter({ text: 'Only you can see this.' });

    await interaction
      .reply({
        ...withPrivateHand(handEmbed, player.hole, player.username),
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  });

  return collector;
}

// ────────────────────────────────────────────
// Betting Round
// ────────────────────────────────────────────

async function conductBettingRound(channel, table, gameMessage, phase) {
  const actedThisRound = new Set();
  const actionablePlayers = () => table.getActionablePlayers();

  // Track the raise countdown: once we've gone around and everyone has called/checked, round ends
  let lastRaiserId = null;

  while (actionablePlayers().length > 1) {
    const current = table.getCurrentPlayer();
    if (!current) break;

    if (current.folded || current.allIn) {
      table.nextPlayer();
      continue;
    }

    const turnAvatarUrl = await getTurnAvatarUrl(channel.guild, table);
    const timerSeconds = 30;
    const actionEmbed = buildStateEmbed(
      table,
      `**${current.username}** to act (${phase})\n⏱️ ${timerSeconds}s remaining`,
      turnAvatarUrl
    );
    const actionPayload = withCommunityBoard(actionEmbed, table);
    await gameMessage
      .edit({
        ...actionPayload,
        components: [buildActionRow(table, current), buildUtilityRow(table)],
      })
      .catch(() => {});

    const result = await waitForTurnAction(gameMessage, table, current, timerSeconds * 1000);
    if (!result.acted) {
      // Auto-fold on timeout
      const isAllIn = current.chips <= 0;
      if (isAllIn || current.allIn) {
        // All-in players can't fold, they just check
        table.playerCheck(current.userId);
        actedThisRound.add(current.userId);
        await channel.send(`⏱️ ${current.username} is all-in and checks.`);
      } else {
        table.playerFold(current.userId);
        actedThisRound.add(current.userId);
        await channel.send(`⏱️ ${current.username} did not act in time and folded.`);
      }
    } else if (result.raised) {
      lastRaiserId = current.userId;
      actedThisRound.clear();
      actedThisRound.add(current.userId);
    } else {
      actedThisRound.add(current.userId);
    }

    const players = actionablePlayers();
    if (players.length <= 1) break;

    // Check if round is complete
    if (table.currentBet === 0) {
      // No open bet: everyone must act once
      if (players.every((p) => actedThisRound.has(p.userId))) break;
    } else {
      // Open bet: all actionable players must have matched the bet
      const allMatched = players.every(
        (p) => p.bet === table.currentBet || p.allIn || actedThisRound.has(p.userId)
      );
      if (allMatched && players.every((p) => actedThisRound.has(p.userId))) break;
    }

    table.nextPlayer();
  }

  await gameMessage.edit({ components: [buildUtilityRow(table)] }).catch(() => {});
}

function buildActionRow(table, currentPlayer) {
  const toCall = Math.max(0, table.currentBet - currentPlayer.bet);
  const minRaise = table.getMinRaise();
  const maxBet = currentPlayer.bet + currentPlayer.chips;

  const components = [];

  // Fold button
  components.push(
    new ButtonBuilder()
      .setCustomId(`poker_act_${table.tableId}_fold`)
      .setLabel('Fold')
      .setStyle(ButtonStyle.Danger)
  );

  // Check/Call button
  components.push(
    new ButtonBuilder()
      .setCustomId(`poker_act_${table.tableId}_${toCall > 0 ? 'call' : 'check'}`)
      .setLabel(toCall > 0 ? `Call ${toCall}` : 'Check')
      .setStyle(ButtonStyle.Primary)
  );

  // Raise buttons
  if (toCall > 0 || table.currentBet > 0) {
    // Min raise
    const minRaiseTarget = Math.min(minRaise, maxBet);
    if (minRaiseTarget > table.currentBet && minRaiseTarget <= maxBet) {
      components.push(
        new ButtonBuilder()
          .setCustomId(`poker_act_${table.tableId}_raise_${minRaiseTarget}`)
          .setLabel(`Raise ${minRaiseTarget}`)
          .setStyle(ButtonStyle.Success)
      );
    }

    // Pot-sized raise
    const potSize = table.pot + toCall;
    const potRaiseTarget = Math.min(table.currentBet + potSize, maxBet);
    if (
      potRaiseTarget > table.currentBet &&
      potRaiseTarget <= maxBet &&
      potRaiseTarget !== minRaiseTarget
    ) {
      components.push(
        new ButtonBuilder()
          .setCustomId(`poker_act_${table.tableId}_raise_${potRaiseTarget}`)
          .setLabel(`Pot ${potRaiseTarget}`)
          .setStyle(ButtonStyle.Success)
      );
    }
  } else {
    // No current bet: can bet
    const betTarget = Math.min(table.minBet, maxBet);
    if (betTarget > 0) {
      components.push(
        new ButtonBuilder()
          .setCustomId(`poker_act_${table.tableId}_raise_${betTarget}`)
          .setLabel(`Bet ${betTarget}`)
          .setStyle(ButtonStyle.Success)
      );
    }
  }

  // All-in button
  const allInAmount = currentPlayer.chips;
  if (allInAmount > 0 && maxBet > table.currentBet) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`poker_act_${table.tableId}_raise_${maxBet}`)
        .setLabel(`All-in ${allInAmount}`)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  // Custom raise button
  components.push(
    new ButtonBuilder()
      .setCustomId(`poker_raise_modal_${table.tableId}`)
      .setLabel('Custom Raise')
      .setStyle(ButtonStyle.Secondary)
  );

  // Discord allows max 5 components per row
  const row1 = new ActionRowBuilder().addComponents(components.slice(0, 5));
  const rows = [row1];

  if (components.length > 5) {
    const row2 = new ActionRowBuilder().addComponents(components.slice(5, 10));
    rows.push(row2);
  }

  return rows;
}

function buildUtilityRow(table) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`poker_viewhand_${table.tableId}`)
      .setLabel('View My Cards')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function waitForTurnAction(gameMessage, table, currentPlayer, timeoutMs) {
  return new Promise((resolve) => {
    const collector = gameMessage.createMessageComponentCollector({
      time: timeoutMs,
      filter: (i) =>
        i.customId.startsWith(`poker_act_${table.tableId}_`) ||
        i.customId === `poker_raise_modal_${table.tableId}`,
    });

    collector.on('collect', async (interaction) => {
      // Handle custom raise modal
      if (interaction.customId === `poker_raise_modal_${table.tableId}`) {
        if (interaction.user.id !== currentPlayer.userId) {
          await interaction.reply({
            content: `❌ It's ${currentPlayer.username}'s turn.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await showRaiseModal(interaction, table, currentPlayer);
        return;
      }

      if (interaction.user.id !== currentPlayer.userId) {
        await interaction.reply({
          content: `❌ It's ${currentPlayer.username}'s turn.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const actionPart = interaction.customId.replace(`poker_act_${table.tableId}_`, '');
      const beforeBet = table.currentBet;
      const result = applyTurnAction(table, currentPlayer, actionPart);

      if (!result.ok) {
        await interaction.reply({ content: `❌ ${result.error}`, flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferUpdate().catch(() => {});
      collector.stop('acted');

      const raised = table.currentBet > beforeBet;
      resolve({ acted: true, raised, action: actionPart });
    });

    collector.on('end', (_c, reason) => {
      if (reason !== 'acted') resolve({ acted: false, raised: false, action: null });
    });
  });
}

async function showRaiseModal(interaction, table, currentPlayer) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const toCall = Math.max(0, table.currentBet - currentPlayer.bet);
  const minRaise = table.getMinRaise();
  const maxBet = currentPlayer.bet + currentPlayer.chips;

  const modal = new ModalBuilder()
    .setCustomId(`poker_raise_input_${table.tableId}_${currentPlayer.userId}`)
    .setTitle('Custom Raise Amount');

  const raiseInput = new TextInputBuilder()
    .setCustomId('raise_amount')
    .setLabel(`Total bet (${minRaise} - ${maxBet})`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Min: ${minRaise}, Max: ${maxBet}`)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(raiseInput));
  await interaction.showModal(modal);
}

function applyTurnAction(table, currentPlayer, actionPart) {
  if (actionPart === 'fold') return { ok: table.playerFold(currentPlayer.userId) };

  if (actionPart === 'check') {
    if (!table.playerCheck(currentPlayer.userId))
      return { ok: false, error: 'Cannot check, there is an uncalled bet.' };
    return { ok: true };
  }

  if (actionPart === 'call') {
    const toCall = Math.max(0, table.currentBet - currentPlayer.bet);
    if (toCall <= 0) return { ok: false, error: 'Nothing to call.' };
    return { ok: table.playerCall(currentPlayer.userId) };
  }

  if (actionPart.startsWith('raise_')) {
    const target = parseInt(actionPart.split('_')[1], 10);
    if (!target || target <= table.currentBet)
      return { ok: false, error: `Raise must be above current bet (${table.currentBet}).` };

    // Enforce minimum raise
    const minRaise = table.getMinRaise();
    const toCall = Math.max(0, table.currentBet - currentPlayer.bet);
    const contribute = target - currentPlayer.bet;
    const raiseSize = target - table.currentBet;

    if (target > currentPlayer.bet + currentPlayer.chips) {
      return { ok: false, error: 'Not enough chips for this raise.' };
    }

    // If not going all-in, enforce minimum raise
    const isAllIn = target >= currentPlayer.bet + currentPlayer.chips;
    if (!isAllIn && raiseSize < table.lastRaiseAmount) {
      return {
        ok: false,
        error: `Minimum raise is ${table.lastRaiseAmount} (current: ${raiseSize}).`,
      };
    }

    return { ok: table.playerBet(currentPlayer.userId, contribute) };
  }

  return { ok: false, error: 'Unknown action.' };
}

// ────────────────────────────────────────────
// Hand Resolution & Cleanup
// ────────────────────────────────────────────

async function finishAndCleanup(
  channel,
  table,
  gameMessage,
  showdown = false,
  privateHandCollector = null
) {
  if (privateHandCollector) {
    privateHandCollector.stop('hand_complete');
  }

  const activePlayers = table.getActivePlayers();
  let winners = [];
  let winnerHand = null;

  if (activePlayers.length === 1) {
    winners = [activePlayers[0]];
  } else if (showdown && activePlayers.length > 1) {
    const scored = activePlayers
      .map((p) => ({ player: p, hand: evaluateHand([...p.hole, ...table.community]) }))
      .sort((a, b) => compareHands(b.hand, a.hand));

    winnerHand = scored[0].hand;
    // Find all players with the same best hand
    winners = scored.filter((s) => compareHands(s.hand, winnerHand) === 0).map((s) => s.player);
  }

  if (!winners.length) {
    await gameMessage
      .edit({ content: '⚠️ Poker hand ended without a winner.', embeds: [], components: [] })
      .catch(() => {});
    return offerNextHand(channel, table, gameMessage);
  }

  // Calculate side pots
  const pots = showdown
    ? table.calculatePots()
    : [{ amount: table.pot, eligiblePlayers: activePlayers.map((p) => p.userId) }];

  // Distribute winnings
  const winnerIds = new Set(winners.map((w) => w.userId));
  const payouts = new Map(); // userId -> amount won

  for (const pot of pots) {
    // Find the best hand among eligible players
    const eligible = pot.eligiblePlayers
      .map((uid) => {
        const player = table.getPlayer(uid);
        if (!player || player.folded) return null;
        return { player, hand: evaluateHand([...player.hole, ...table.community]) };
      })
      .filter(Boolean);

    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareHands(b.hand, a.hand));
    const bestHand = eligible[0].hand;
    const potWinners = eligible.filter((e) => compareHands(e.hand, bestHand) === 0);

    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount % potWinners.length;

    for (const pw of potWinners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      payouts.set(pw.player.userId, (payouts.get(pw.player.userId) || 0) + payout);
      pw.player.chips += payout;
    }
  }

  // Apply payouts to economy
  for (const [userId, amount] of payouts) {
    await economyManager.addMoney(table.guildId, userId, amount);
  }

  // Record stats
  for (const p of table.getAllPlayers()) {
    const amount = payouts.get(p.userId) || 0;
    if (winners.length > 1 && winnerIds.has(p.userId)) {
      await gameStatsManager.recordPoker(p.userId, 'tie');
    } else if (winnerIds.has(p.userId)) {
      await gameStatsManager.recordPoker(p.userId, 'win');
    } else {
      await gameStatsManager.recordPoker(p.userId, 'loss');
    }
  }

  // Build result embed
  const reveal = table
    .getAllPlayers()
    .map((p) => {
      const pos = p.isButton ? '🔘' : p.isSmallBlind ? '🟡' : p.isBigBlind ? '🔵' : '';
      const status = p.folded ? '❌' : '';
      return `${status} **${p.username}** ${pos}: ${formatCards(p.hole)}`;
    })
    .join('\n');

  const totalWon = [...payouts.values()].reduce((a, b) => a + b, 0);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(showdown ? '🎴 Showdown!' : '🎉 Hand Complete!')
    .setDescription(
      winners.length > 1
        ? `🤝 Tie between **${winners.map((w) => w.username).join(', ')}**`
        : `🏆 **${winners[0].username}** wins **${totalWon} coins**!`
    )
    .addFields(
      { name: 'Community Cards', value: formatCards(table.community), inline: false },
      { name: 'Player Cards', value: reveal || 'N/A', inline: false }
    );

  // Show pot breakdown if side pots were involved
  if (pots.length > 1) {
    const potBreakdown = pots.map((p, i) => `Pot ${i + 1}: **${p.amount}** coins`).join('\n');
    embed.addFields({ name: 'Pot Breakdown', value: potBreakdown, inline: false });
  }

  const winnerMember = await gameMessage.guild.members.fetch(winners[0].userId).catch(() => null);
  if (winnerMember) {
    embed.setThumbnail(winnerMember.displayAvatarURL({ extension: 'png', size: 256 }));
  }

  if (winnerHand && showdown) {
    embed.addFields({
      name: 'Winning Hand',
      value: `${winnerHand.rank} (${formatCards(winnerHand.cards)})`,
      inline: false,
    });
  }

  // Show remaining chips
  const chipStatus = table
    .getAllPlayers()
    .map((p) => `• ${p.username}: ${p.chips} chips`)
    .join('\n');
  embed.addFields({ name: 'Remaining Chips', value: chipStatus, inline: false });

  const payload = withCommunityBoard(embed, table);
  await gameMessage.edit({ ...payload, components: [] }).catch(() => {});

  // Offer next hand
  return offerNextHand(channel, table, gameMessage);
}

async function offerNextHand(channel, table, gameMessage) {
  const remainingPlayers = table.getAllPlayers().filter((p) => p.chips > 0);

  if (remainingPlayers.length < 2) {
    // Game over
    const embed = new EmbedBuilder()
      .setColor(0xfbbf24)
      .setTitle('🏁 Game Over!')
      .setDescription(
        remainingPlayers.length === 1
          ? `🏆 **${remainingPlayers[0].username}** is the last player standing with **${remainingPlayers[0].chips}** chips!`
          : 'All players are eliminated!'
      );

    await gameMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
    PokerTableManager.closeTable(table.tableId);
    return;
  }

  // Reset for next hand
  table.resetForNewHand();

  // Transfer host if needed
  if (!table.players.has(table.hostId)) {
    const firstPlayer = table.getAllPlayers()[0];
    if (firstPlayer) table.hostId = firstPlayer.userId;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎴 Next Hand?')
    .setDescription(
      `**${table.players.get(table.hostId)?.username || 'Host'}**, start the next hand!`
    )
    .addFields(
      {
        name: 'Players',
        value: table
          .getAllPlayers()
          .map((p) => `• ${p.username}: ${p.chips} chips`)
          .join('\n'),
        inline: false,
      },
      {
        name: 'Hand #',
        value: `${table.handsPlayed + 1}`,
        inline: true,
      }
    )
    .setFooter({ text: 'Host clicks Start for next hand, or players can leave.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`poker_next_${table.tableId}`)
      .setLabel('Start Next Hand')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`poker_leave_next_${table.tableId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Danger)
  );

  const nextMsg = await gameMessage.reply({ embeds: [embed], components: [row] }).catch(() => null);
  if (!nextMsg) {
    PokerTableManager.closeTable(table.tableId);
    return;
  }

  const collector = nextMsg.createMessageComponentCollector({ time: 2 * 60 * 1000 });
  let started = false;

  collector.on('collect', async (interaction) => {
    if (interaction.customId === `poker_next_${table.tableId}`) {
      if (interaction.user.id !== table.hostId) {
        return interaction.reply({
          content: '❌ Only the host can start.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const t = PokerTableManager.getTable(table.tableId);
      if (!t)
        return interaction.reply({
          content: '❌ Table no longer exists.',
          flags: MessageFlags.Ephemeral,
        });
      if (t.getTotalPlayers() < 2)
        return interaction.reply({
          content: '❌ Need at least 2 players.',
          flags: MessageFlags.Ephemeral,
        });

      await interaction.reply({
        content: '🎴 Dealing next hand...',
        flags: MessageFlags.Ephemeral,
      });
      started = true;
      collector.stop('start');
      return runGameLoop(channel, t, nextMsg);
    }

    if (interaction.customId === `poker_leave_next_${table.tableId}`) {
      const t = PokerTableManager.getTable(table.tableId);
      if (!t)
        return interaction.reply({
          content: '❌ Table no longer exists.',
          flags: MessageFlags.Ephemeral,
        });

      const player = t.players?.get(interaction.user.id);
      if (!player)
        return interaction.reply({
          content: '❌ You are not at this table.',
          flags: MessageFlags.Ephemeral,
        });

      PokerTableManager.removePlayerFromTable(interaction.user.id);
      await economyManager.addMoney(t.guildId, interaction.user.id, player.chips);

      await interaction.reply({
        content: `✅ Left the table. Refunded **${player.chips}** chips.`,
        flags: MessageFlags.Ephemeral,
      });

      // Check if host left
      if (t.hostId === interaction.user.id) {
        const remaining = t.getAllPlayers();
        if (remaining.length > 0) {
          t.hostId = remaining[0].userId;
        } else {
          PokerTableManager.closeTable(t.tableId);
          nextMsg
            .edit({ content: '🏁 Table closed (host left).', embeds: [], components: [] })
            .catch(() => {});
        }
      }
    }
  });

  collector.on('end', async (_c, reason) => {
    if (started || reason === 'start') return;
    // Timeout: refund and close
    const t = PokerTableManager.getTable(table.tableId);
    if (!t) return;
    for (const p of t.getAllPlayers()) {
      await economyManager.addMoney(t.guildId, p.userId, p.chips);
    }
    PokerTableManager.closeTable(t.tableId);
    nextMsg.edit({ components: [] }).catch(() => {});
  });
}

// ────────────────────────────────────────────
// Stats & Leaderboard
// ────────────────────────────────────────────

async function pokerStats(message, args) {
  const targetUser = args[1] ? message.mentions.users.first() || { id: args[1] } : message.author;

  const stats = gameStatsManager.getStats(targetUser.id);
  if (!stats || !stats.poker) {
    return message.reply('❌ No poker stats found for this user.');
  }

  const poker = stats.poker;
  const total = poker.wins + poker.losses + poker.ties;
  const winRate = total > 0 ? ((poker.wins / total) * 100).toFixed(1) : '0.0';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🃏 Poker Stats - ${targetUser.username || targetUser.id}`)
    .addFields(
      { name: '🏆 Wins', value: `${poker.wins}`, inline: true },
      { name: '❌ Losses', value: `${poker.losses}`, inline: true },
      { name: '🤝 Ties', value: `${poker.ties}`, inline: true },
      { name: '📊 Win Rate', value: `${winRate}%`, inline: true },
      { name: '🎮 Total Hands', value: `${total}`, inline: true }
    );

  return message.reply({ embeds: [embed] });
}

async function pokerLeaderboard(message) {
  const allStats = gameStatsManager.getAllStats();
  if (!allStats || Object.keys(allStats).length === 0) {
    return message.reply('❌ No poker stats recorded yet.');
  }

  const leaderboard = Object.entries(allStats)
    .filter(([, stats]) => stats.poker)
    .map(([userId, stats]) => {
      const p = stats.poker;
      const total = p.wins + p.losses + p.ties;
      return { userId, wins: p.wins, losses: p.losses, ties: p.ties, total };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.wins - a.wins || b.wins / b.total - a.wins / a.total)
    .slice(0, 10);

  if (leaderboard.length === 0) {
    return message.reply('❌ No poker hands played yet.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const list = leaderboard
    .map((e, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const winRate = ((e.wins / e.total) * 100).toFixed(1);
      return `${medal} <@${e.userId}> - ${e.wins}W/${e.losses}L/${e.ties}T (${winRate}% win rate)`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xfbbf24)
    .setTitle('🏆 Poker Leaderboard')
    .setDescription(list)
    .setFooter({ text: 'Top 10 players by wins' });

  return message.reply({ embeds: [embed] });
}

// ────────────────────────────────────────────
// Display Helpers
// ────────────────────────────────────────────

function withCommunityBoard(embed, table) {
  const board = pokerCommunityAttachment(table.community, 'poker-board.png', {
    useAssetImages: true,
  });

  if (board) {
    embed.setImage('attachment://poker-board.png');
    return { embeds: [embed], files: [board] };
  }

  const vectorBoard = pokerCommunityAttachment(table.community, 'poker-board.png', {
    useAssetImages: false,
  });
  if (vectorBoard) {
    embed.setImage('attachment://poker-board.png');
    return { embeds: [embed], files: [vectorBoard] };
  }

  return { embeds: [embed] };
}

function withPrivateHand(embed, cards, playerName) {
  const handFile = pokerHandAttachment(cards, playerName, 'poker-hand.png', {
    useAssetImages: true,
  });

  if (handFile) {
    embed.setImage('attachment://poker-hand.png');
    return { embeds: [embed], files: [handFile] };
  }

  const vectorHand = pokerHandAttachment(cards, playerName, 'poker-hand.png', {
    useAssetImages: false,
  });
  if (vectorHand) {
    embed.setImage('attachment://poker-hand.png');
    return { embeds: [embed], files: [vectorHand] };
  }

  return { embeds: [embed] };
}

async function updateGameDisplay(gameMessage, table, phase) {
  const turnAvatarUrl = await getTurnAvatarUrl(gameMessage.guild, table);
  const embed = buildStateEmbed(table, `Phase: **${phase}**`, turnAvatarUrl);
  const payload = withCommunityBoard(embed, table);
  await gameMessage.edit({ ...payload, components: [buildUtilityRow(table)] }).catch(() => {});
}

function buildStateEmbed(table, subtitle, turnAvatarUrl = null) {
  const embed = new EmbedBuilder()
    .setColor(0x228b22)
    .setTitle("🎴 Texas Hold'em")
    .setDescription(subtitle)
    .addFields(
      { name: 'Pot', value: `${table.pot} coins`, inline: true },
      { name: 'Current Bet', value: `${table.currentBet} coins`, inline: true },
      { name: 'Turn', value: table.getCurrentPlayer()?.username || 'None', inline: true },
      { name: 'Community', value: formatCards(table.community), inline: false },
      { name: 'Players', value: getPlayerStatus(table), inline: false }
    )
    .setFooter({ text: 'Hole cards sent via DM. Click "View My Cards" to see them.' });

  if (turnAvatarUrl) {
    embed.setThumbnail(turnAvatarUrl);
  }

  return embed;
}

async function getTurnAvatarUrl(guild, table) {
  const current = table.getCurrentPlayer();
  if (!guild || !current) return null;

  const member = await guild.members.fetch(current.userId).catch(() => null);
  if (!member) return null;

  return member.displayAvatarURL({ extension: 'png', size: 256 });
}

function getPlayerStatus(table) {
  return table
    .getAllPlayers()
    .map((p) => {
      const pos = p.isButton ? '🔘' : p.isSmallBlind ? '🟡' : p.isBigBlind ? '🔵' : '  ';
      const state = p.folded ? '❌' : p.allIn ? '🟡' : '✅';
      return `${pos} ${state} ${p.username} | bet: ${p.bet} | chips: ${p.chips}`;
    })
    .join('\n');
}

function formatCards(cards) {
  if (!cards || cards.length === 0) return 'None';
  return cards.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function getTableBuyIn(table) {
  return table?.buyIn && table.buyIn > 0 ? table.buyIn : table.minBet * 20;
}

// ────────────────────────────────────────────
// Hand Evaluation
// ────────────────────────────────────────────

function evaluateHand(cards) {
  if (cards.length < 5) return { rank: 'Unknown', value: 0, cards: [], tiebreak: [] };

  const cardValue = (rank) =>
    ({ 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 })[rank];
  const combinations = (arr, r) => {
    if (r === 0) return [[]];
    if (arr.length === 0) return [];
    const [head, ...tail] = arr;
    return [...combinations(tail, r - 1).map((c) => [head, ...c]), ...combinations(tail, r)];
  };

  const checkStraight = (sorted) => {
    if (new Set(sorted).size !== 5) return false;
    if (sorted[0] - sorted[4] === 4) return true;
    // Ace-low straight (A-2-3-4-5)
    if (
      sorted[0] === 14 &&
      sorted[1] === 5 &&
      sorted[2] === 4 &&
      sorted[3] === 3 &&
      sorted[4] === 2
    )
      return true;
    return false;
  };

  const rankHand = (hand) => {
    const ranks = hand.map((c) => cardValue(c.rank)).sort((a, b) => b - a);
    const suits = hand.map((c) => c.suit);
    const flush = new Set(suits).size === 1;
    const straight = checkStraight(ranks);
    const straightHigh =
      ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2
        ? 5
        : ranks[0];

    const counts = {};
    for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.entries(counts).sort(
      (a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0])
    );

    const four = Number(groups.find((g) => g[1] === 4)?.[0] || 0);
    const three = Number(groups.find((g) => g[1] === 3)?.[0] || 0);
    const pairs = groups.filter((g) => g[1] === 2).map((g) => Number(g[0]));
    const singles = groups
      .filter((g) => g[1] === 1)
      .map((g) => Number(g[0]))
      .sort((a, b) => b - a);

    if (flush && straight && straightHigh === 14 && ranks.includes(10))
      return { rank: '🏆 Royal Flush', value: 10000, tiebreak: [14] };
    if (flush && straight)
      return { rank: '🎴 Straight Flush', value: 9000, tiebreak: [straightHigh] };
    if (four) return { rank: '4️⃣ Four of a Kind', value: 8000, tiebreak: [four, singles[0] || 0] };
    if (three && pairs.length)
      return { rank: '🏠 Full House', value: 7000, tiebreak: [three, pairs[0]] };
    if (flush) return { rank: '🌊 Flush', value: 6000, tiebreak: [...ranks] };
    if (straight) return { rank: '➡️ Straight', value: 5000, tiebreak: [straightHigh] };
    if (three) return { rank: '3️⃣ Three of a Kind', value: 4000, tiebreak: [three, ...singles] };
    if (pairs.length >= 2) {
      const hi = Math.max(...pairs);
      const lo = Math.min(...pairs);
      return { rank: '👥 Two Pair', value: 3000, tiebreak: [hi, lo, singles[0] || 0] };
    }
    if (pairs.length === 1)
      return { rank: '👤 One Pair', value: 2000, tiebreak: [pairs[0], ...singles] };
    return { rank: '🎯 High Card', value: 1000, tiebreak: [...ranks] };
  };

  let best = null;
  let bestValue = -1;
  for (const combo of combinations(cards, 5)) {
    const r = rankHand(combo);
    if (r.value > bestValue) {
      bestValue = r.value;
      best = { ...r, cards: combo };
    }
  }

  return best || { rank: 'Unknown', value: 0, cards: [], tiebreak: [] };
}

function compareHands(a, b) {
  if (a.value !== b.value) return a.value - b.value;
  const at = a.tiebreak || [];
  const bt = b.tiebreak || [];
  const len = Math.max(at.length, bt.length);
  for (let i = 0; i < len; i++) {
    const av = at[i] ?? 0;
    const bv = bt[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
