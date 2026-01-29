const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const settingsManager = require('../../utils/settingsManager');
const gameStatsManager = require('../../utils/gameStatsManager');

const rpsChoices = [
  { id: 'rock', label: 'Rock', emoji: '🪨' },
  { id: 'paper', label: 'Paper', emoji: '📄' },
  { id: 'scissors', label: 'Scissors', emoji: '✂️' }
];

const triviaQuestions = [
  {
    question: 'Which role controls most music commands by default?',
    options: ['Member', 'DJ', 'Moderator', 'Admin'],
    answerIndex: 1,
    explanation: 'The DJ role gates the playback controls unless you are admin/alone with the bot.',
    category: 'Bot'
  },
  {
    question: 'What is the default command prefix for this bot?',
    options: ['?', '!', '.', '/'],
    answerIndex: 1,
    explanation: 'You can change it with the config prefix command per server.',
    category: 'Bot'
  },
  {
    question: 'How many songs can the playlist loader add at once by default?',
    options: ['10', '25', '50', 'Unlimited'],
    answerIndex: 2,
    explanation: 'Playlist handling is capped at 50 entries for speed and safety.',
    category: 'Bot'
  },
  {
    question: 'Which emoji reaction skips the current song?',
    options: ['⏸️', '▶️', '⏭️', '⏹️'],
    answerIndex: 2,
    explanation: '⏭️ is mapped to Skip in the reaction controls.',
    category: 'Bot'
  },
  {
    question: 'What is the capital of France?',
    options: ['Berlin', 'Madrid', 'Paris', 'Rome'],
    answerIndex: 2,
    explanation: 'Paris has been the capital of France since the 12th century.',
    category: 'General'
  },
  {
    question: 'What is the largest planet in our solar system?',
    options: ['Earth', 'Mars', 'Jupiter', 'Saturn'],
    answerIndex: 2,
    explanation: 'Jupiter is more than twice as massive as all other planets combined.',
    category: 'General'
  },
  {
    question: 'Who painted the Mona Lisa?',
    options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'],
    answerIndex: 1,
    explanation: 'Leonardo da Vinci painted the Mona Lisa in the early 1500s.',
    category: 'General'
  },
  {
    question: 'In which year did World War II end?',
    options: ['1943', '1944', '1945', '1946'],
    answerIndex: 2,
    explanation: 'World War II ended in 1945 with the surrender of Japan.',
    category: 'General'
  },
  {
    question: 'Which video game franchise features Master Chief?',
    options: ['Halo', 'Call of Duty', 'Destiny', 'Gears of War'],
    answerIndex: 0,
    explanation: 'Master Chief is the iconic protagonist of the Halo series.',
    category: 'Gaming'
  },
  {
    question: 'What year was Minecraft officially released?',
    options: ['2009', '2010', '2011', '2012'],
    answerIndex: 2,
    explanation: 'Minecraft was officially released on November 18, 2011.',
    category: 'Gaming'
  },
  {
    question: 'Which company created the game Fortnite?',
    options: ['Riot Games', 'Epic Games', 'Activision', 'EA'],
    answerIndex: 1,
    explanation: 'Epic Games developed and published Fortnite in 2017.',
    category: 'Gaming'
  },
  {
    question: 'What is the best-selling video game of all time?',
    options: ['Tetris', 'Minecraft', 'GTA V', 'Wii Sports'],
    answerIndex: 1,
    explanation: 'Minecraft has sold over 300 million copies worldwide.',
    category: 'Gaming'
  },
  {
    question: 'Who is known as the "King of Pop"?',
    options: ['Elvis Presley', 'Michael Jackson', 'Prince', 'Freddie Mercury'],
    answerIndex: 1,
    explanation: 'Michael Jackson earned this title for his contributions to music and dance.',
    category: 'Music'
  },
  {
    question: 'Which band wrote "Bohemian Rhapsody"?',
    options: ['The Beatles', 'Led Zeppelin', 'Queen', 'Pink Floyd'],
    answerIndex: 2,
    explanation: 'Queen released this iconic song in 1975, written by Freddie Mercury.',
    category: 'Music'
  },
  {
    question: 'What instrument does a drummer play?',
    options: ['Guitar', 'Drums', 'Bass', 'Keyboard'],
    answerIndex: 1,
    explanation: 'Drummers play percussion instruments, primarily drums.',
    category: 'Music'
  },
  {
    question: 'Which artist released the album "Thriller"?',
    options: ['Prince', 'Madonna', 'Michael Jackson', 'Whitney Houston'],
    answerIndex: 2,
    explanation: 'Thriller (1982) is the best-selling album of all time.',
    category: 'Music'
  }
];

const disableRow = (row, styleMutator) => new ActionRowBuilder().addComponents(
  row.components.map((component, index) => {
    const cloned = ButtonBuilder.from(component).setDisabled(true);
    return styleMutator ? styleMutator(cloned, index) : cloned;
  })
);

const getRpsResult = (player, bot) => {
  if (player === bot) return 'tie';
  if (
    (player === 'rock' && bot === 'scissors') ||
    (player === 'paper' && bot === 'rock') ||
    (player === 'scissors' && bot === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
};

async function playRps(message) {
  const prompt = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Rock • Paper • Scissors')
    .setDescription('Pick a hand — bot will pick right after you.');

  const row = new ActionRowBuilder().addComponents(
    rpsChoices.map(choice =>
      new ButtonBuilder()
        .setCustomId(`rps_${choice.id}`)
        .setLabel(choice.label)
        .setEmoji(choice.emoji)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const msg = await message.reply({ embeds: [prompt], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: interaction => interaction.user.id === message.author.id
  });

  collector.on('collect', async interaction => {
    const userPick = interaction.customId.replace('rps_', '');
    const botPick = rpsChoices[Math.floor(Math.random() * rpsChoices.length)].id;
    const outcome = getRpsResult(userPick, botPick);

    const resultEmbed = new EmbedBuilder()
      .setColor(outcome === 'win' ? 0x57f287 : outcome === 'lose' ? 0xed4245 : 0xf1c40f)
      .setTitle('Rock • Paper • Scissors')
      .setDescription(
        `You chose **${userPick}** | Bot chose **${botPick}**\n` +
        (outcome === 'win' ? '🎉 You win!' : outcome === 'lose' ? '😅 Bot wins this round.' : "🤝 It's a tie!")
      );

    await interaction.update({ embeds: [resultEmbed], components: [disableRow(row)] });
    collector.stop('answered');
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await msg.edit({ content: '⏰ Timed out. Start again to play another round.', components: [disableRow(row)] });
    }
  });
}

async function playGuessNumber(message) {
  const target = Math.floor(Math.random() * 100) + 1;
  const maxAttempts = 6;
  let attemptsLeft = maxAttempts;

  const intro = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Guess The Number')
    .setDescription('I picked a number between **1** and **100**. You have **6** tries — reply with your guesses!');

  await message.reply({ embeds: [intro] });

  const collector = message.channel.createMessageCollector({
    filter: msg => msg.author.id === message.author.id,
    time: 60_000,
    max: maxAttempts
  });

  collector.on('collect', msg => {
    const guess = parseInt(msg.content.trim(), 10);
    if (Number.isNaN(guess) || guess < 1 || guess > 100) {
      msg.reply('❔ Send a whole number between 1 and 100.');
      return;
    }

    attemptsLeft -= 1;

    if (guess === target) {
      msg.react('✅').catch(() => {});
      collector.stop('win');
      return;
    }

    if (attemptsLeft <= 0) {
      msg.react('❌').catch(() => {});
      collector.stop('lose');
      return;
    }

    const hint = guess > target ? 'Too high' : 'Too low';
    msg.reply(`${hint}! ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`);
  });

  collector.on('end', (_msgs, reason) => {
    if (reason === 'win') {
      message.channel.send(`🎉 Nailed it! The number was **${target}**.`);
    } else if (reason === 'lose') {
      message.channel.send(`😢 Out of tries. The number was **${target}**.`);
    } else if (reason === 'time') {
      message.channel.send(`⏰ Time ran out. The number was **${target}**.`);
    }
  });
}

async function playTicTacToe(message) {
  const board = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
  let currentPlayer = 'X'; // User is X, Bot is O

  const checkWinner = (b) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];
    for (const [a, b, c] of lines) {
      if (board[a] !== ' ' && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return board.includes(' ') ? null : 'tie';
  };

  const botMove = () => {
    // Simple AI: check for win, then block, then pick random
    const findMove = (symbol) => {
      const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
      ];
      for (const [a, b, c] of lines) {
        const cells = [board[a], board[b], board[c]];
        if (cells.filter(x => x === symbol).length === 2 && cells.includes(' ')) {
          return [a, b, c].find(i => board[i] === ' ');
        }
      }
      return null;
    };

    // Try to win
    let move = findMove('O');
    if (move !== null) return move;
    
    // Try to block
    move = findMove('X');
    if (move !== null) return move;
    
    // Pick center or random
    if (board[4] === ' ') return 4;
    const available = board.map((v, i) => v === ' ' ? i : null).filter(x => x !== null);
    return available[Math.floor(Math.random() * available.length)];
  };

  const renderBoard = () => {
    const emojis = { 'X': '❌', 'O': '⭕', ' ': '⬜' };
    return board.map((cell, i) => {
      if (i % 3 === 0 && i !== 0) return '\n';
      return emojis[cell];
    }).join('');
  };

  const createButtons = (disabled = false) => {
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const row = new ActionRowBuilder().addComponents(
        [0, 1, 2].map(j => {
          const idx = i * 3 + j;
          return new ButtonBuilder()
            .setCustomId(`ttt_${idx}`)
            .setLabel(board[idx] === ' ' ? `${idx + 1}` : board[idx])
            .setStyle(board[idx] === ' ' ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(disabled || board[idx] !== ' ');
        })
      );
      rows.push(row);
    }
    return rows;
  };

  const prompt = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Tic-Tac-Toe')
    .setDescription(`You are ❌ | Bot is ⭕\nYour turn!`);

  const msg = await message.reply({ embeds: [prompt], components: createButtons() });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: interaction => interaction.user.id === message.author.id
  });

  collector.on('collect', async interaction => {
    const idx = Number(interaction.customId.replace('ttt_', ''));
    board[idx] = 'X';

    let winner = checkWinner(board);
    if (winner) {
      const result = new EmbedBuilder()
        .setColor(winner === 'X' ? 0x57f287 : winner === 'O' ? 0xed4245 : 0xf1c40f)
        .setTitle('Tic-Tac-Toe')
        .setDescription(
          renderBoard() + '\n\n' +
          (winner === 'X' ? '🎉 You win!' : winner === 'O' ? '🤖 Bot wins!' : "🤝 It's a tie!")
        );
      await interaction.update({ embeds: [result], components: createButtons(true) });
      collector.stop('finished');
      return;
    }

    // Bot's turn
    const botIdx = botMove();
    board[botIdx] = 'O';

    winner = checkWinner(board);
    const statusEmbed = new EmbedBuilder()
      .setColor(winner ? (winner === 'O' ? 0xed4245 : 0xf1c40f) : 0x5865f2)
      .setTitle('Tic-Tac-Toe')
      .setDescription(
        renderBoard() + '\n\n' +
        (winner === 'O' ? '🤖 Bot wins!' : winner === 'tie' ? "🤝 It's a tie!" : 'Your turn!')
      );

    await interaction.update({ embeds: [statusEmbed], components: createButtons(!!winner) });
    if (winner) collector.stop('finished');
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await msg.edit({ content: '⏰ Game timed out.', components: createButtons(true) });
    }
  });
}

async function playBlackjack(message) {
  const deck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  
  shuffle(deck);
  
  const cardValue = (card) => {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank);
  };
  
  const handValue = (hand) => {
    let value = hand.reduce((sum, card) => sum + cardValue(card), 0);
    let aces = hand.filter(c => c.rank === 'A').length;
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    return value;
  };
  
  const formatHand = (hand, hide = false) => {
    if (hide) {
      return `${hand[0].rank}${hand[0].suit} 🂠`;
    }
    return hand.map(c => `${c.rank}${c.suit}`).join(' ');
  };
  
  let playerHand = [deck.pop(), deck.pop()];
  let dealerHand = [deck.pop(), deck.pop()];
  
  // Check for dealer blackjack (if showing Ace or 10-value card)
  const dealerUpCard = dealerHand[0];
  const dealerShowsAceOr10 = dealerUpCard.rank === 'A' || ['10', 'J', 'Q', 'K'].includes(dealerUpCard.rank);
  const dealerHasBlackjack = handValue(dealerHand) === 21;
  const playerHasBlackjack = handValue(playerHand) === 21;
  
  // If dealer shows Ace/10 and has blackjack, reveal immediately
  if (dealerShowsAceOr10 && dealerHasBlackjack) {
    const playerVal = handValue(playerHand);
    let outcome;
    let color;
    
    if (playerHasBlackjack) {
      outcome = "🤝 Both blackjack! It's a push (tie)!";
      color = 0xf1c40f;
      await gameStatsManager.recordBlackjack(message.author.id, 'tie');
    } else {
      outcome = '🃏 Dealer has Blackjack! Dealer wins.';
      color = 0xed4245;
      await gameStatsManager.recordBlackjack(message.author.id, 'loss');
    }
    
    const instantResult = new EmbedBuilder()
      .setColor(color)
      .setTitle('🃏 Blackjack - Dealer Blackjack!')
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
        { name: `Dealer Hand (21)`, value: formatHand(dealerHand) }
      )
      .setDescription(outcome)
      .setFooter({ text: `Player ID: ${message.author.id}` });
    
    await message.reply({ embeds: [instantResult] });
    return;
  }
  
  // If player has blackjack but dealer doesn't
  if (playerHasBlackjack) {
    await gameStatsManager.recordBlackjack(message.author.id, 'win');
    
    const instantWin = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🃏 Blackjack!')
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: `${message.author.username}'s Hand (21)`, value: formatHand(playerHand) },
        { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) }
      )
      .setDescription('🎉 Blackjack! You win!')
      .setFooter({ text: `Player ID: ${message.author.id}` });
    
    await message.reply({ embeds: [instantWin] });
    return;
  }
  
  const createButtons = (disabled = false) => {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bj_hit')
        .setLabel('Hit')
        .setEmoji('🎴')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('bj_stand')
        .setLabel('Stand')
        .setEmoji('✋')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled)
    );
  };
  
  const prompt = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🃏 Blackjack')
    .setThumbnail(message.author.displayAvatarURL())
    .addFields(
      { name: `${message.author.username}'s Hand (${handValue(playerHand)})`, value: formatHand(playerHand) },
      { name: 'Dealer Hand', value: formatHand(dealerHand, true) }
    )
    .setDescription('Hit or Stand?')
    .setFooter({ text: `Player ID: ${message.author.id}` });
  
  const msg = await message.reply({ embeds: [prompt], components: [createButtons()] });
  
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: interaction => interaction.user.id === message.author.id
  });
  
  collector.on('collect', async interaction => {
    if (interaction.customId === 'bj_hit') {
      playerHand.push(deck.pop());
      const playerVal = handValue(playerHand);
      
      if (playerVal > 21) {
        await gameStatsManager.recordBlackjack(message.author.id, 'loss');
        
        const bust = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🃏 Blackjack - Bust!')
          .setThumbnail(message.author.displayAvatarURL())
          .addFields(
            { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
            { name: `Dealer Hand (${handValue(dealerHand)})`, value: formatHand(dealerHand) }
          )
          .setDescription('💥 You busted! Dealer wins.')
          .setFooter({ text: `Player ID: ${message.author.id}` });
        
        await interaction.update({ embeds: [bust], components: [createButtons(true)] });
        collector.stop('bust');
        return;
      }
      
      const updated = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🃏 Blackjack')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
          { name: 'Dealer Hand', value: formatHand(dealerHand, true) }
        )
        .setDescription('Hit or Stand?')
        .setFooter({ text: `Player ID: ${message.author.id}` });
      
      await interaction.update({ embeds: [updated], components: [createButtons()] });
      
    } else if (interaction.customId === 'bj_stand') {
      // Dealer reveals hole card and plays according to rules
      // Dealer must hit on 16 or less, must stand on 17 or more
      while (handValue(dealerHand) <= 16) {
        dealerHand.push(deck.pop());
      }
      
      const playerVal = handValue(playerHand);
      const dealerVal = handValue(dealerHand);
      
      let outcome;
      let color;
      let result;
      
      if (dealerVal > 21) {
        outcome = '💥 Dealer busted! You win!';
        color = 0x57f287;
        result = 'win';
      } else if (playerVal > dealerVal) {
        outcome = '🎉 You win!';
        color = 0x57f287;
        result = 'win';
      } else if (playerVal < dealerVal) {
        outcome = '😅 Dealer wins.';
        color = 0xed4245;
        result = 'loss';
      } else {
        outcome = "🤝 It's a push (tie)!";
        color = 0xf1c40f;
        result = 'tie';
      }
      
      await gameStatsManager.recordBlackjack(message.author.id, result);
      
      const final = new EmbedBuilder()
        .setColor(color)
        .setTitle('🃏 Blackjack - Final')
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
          { name: `${message.author.username}'s Hand (${playerVal})`, value: formatHand(playerHand) },
          { name: `Dealer Hand (${dealerVal})`, value: formatHand(dealerHand) }
        )
        .setDescription(outcome)
        .setFooter({ text: `Player ID: ${message.author.id}` });
      
      await interaction.update({ embeds: [final], components: [createButtons(true)] });
      collector.stop('finished');
    }
  });
  
  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await msg.edit({ content: '⏰ Game timed out.', components: [createButtons(true)] });
    }
  });
}

async function playTrivia(message) {
  const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
  const letters = ['A', 'B', 'C', 'D'];

  const prompt = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Quick Trivia')
    .setDescription(question.question)
    .addFields({
      name: 'Options',
      value: question.options.map((opt, idx) => `${letters[idx]}. ${opt}`).join('\n')
    });

  const row = new ActionRowBuilder().addComponents(
    question.options.map((opt, idx) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${idx}`)
        .setLabel(`${letters[idx]}. ${opt}`)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const msg = await message.reply({ embeds: [prompt], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 45_000,
    filter: interaction => interaction.user.id === message.author.id
  });

  collector.on('collect', async interaction => {
    const pick = Number(interaction.customId.replace('trivia_', ''));
    const correct = pick === question.answerIndex;

    const result = new EmbedBuilder()
      .setColor(correct ? 0x57f287 : 0xed4245)
      .setTitle('Quick Trivia')
      .setDescription(correct ? '✅ Correct!' : '❌ Not quite.')
      .addFields(
        { name: 'Your answer', value: `${letters[pick]}. ${question.options[pick]}` },
        { name: 'Correct answer', value: `${letters[question.answerIndex]}. ${question.options[question.answerIndex]}` },
        { name: 'Why?', value: question.explanation }
      );

    const styledRow = disableRow(row, (btn, idx) => {
      if (idx === question.answerIndex) return btn.setStyle(ButtonStyle.Success);
      if (idx === pick) return btn.setStyle(ButtonStyle.Danger);
      return btn.setStyle(ButtonStyle.Secondary);
    });

    await interaction.update({ embeds: [result], components: [styledRow] });
    collector.stop('answered');
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      const styledRow = disableRow(row, btn => btn.setStyle(ButtonStyle.Secondary));
      await msg.edit({ content: '⏰ Trivia timed out.', components: [styledRow] });
    }
  });
}

async function playRoulette(message) {
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
  
  const getNumberColor = (num) => {
    if (num === 0) return '🟢';
    return redNumbers.includes(num) ? '🔴' : '⚫';
  };
  
  const prompt = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎰 Roulette')
    .setDescription('Place your bet! Choose from the options below:')
    .addFields(
      { name: 'Number Bet', value: 'Pick 0-36 (pays 35:1)', inline: true },
      { name: 'Color Bet', value: 'Red, Black or Green (0)', inline: true },
      { name: 'Other Bets', value: 'Odd/Even, High/Low (pays 1:1)', inline: true }
    );
  
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('roulette_red')
      .setLabel('Red')
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('roulette_black')
      .setLabel('Black')
      .setEmoji('⚫')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('roulette_green')
      .setLabel('Green (0)')
      .setEmoji('🟢')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('roulette_odd')
      .setLabel('Odd')
      .setStyle(ButtonStyle.Primary)
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('roulette_even')
      .setLabel('Even')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('roulette_low')
      .setLabel('Low (1-18)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('roulette_high')
      .setLabel('High (19-36)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('roulette_number')
      .setLabel('Pick a Number')
      .setEmoji('🔢')
      .setStyle(ButtonStyle.Primary)
  );
  
  const msg = await message.reply({ embeds: [prompt], components: [row1, row2] });
  
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: interaction => interaction.user.id === message.author.id
  });
  
  collector.on('collect', async interaction => {
    const betType = interaction.customId.replace('roulette_', '');
    
    // If picking a number, ask for input
    if (betType === 'number') {
      await interaction.reply({ 
        content: '🔢 Reply with a number from **0 to 36**:', 
        ephemeral: true 
      });
      
      const numCollector = message.channel.createMessageCollector({
        filter: m => m.author.id === message.author.id,
        time: 30_000,
        max: 1
      });
      
      numCollector.on('collect', async m => {
        const chosenNum = parseInt(m.content.trim(), 10);
        if (Number.isNaN(chosenNum) || chosenNum < 0 || chosenNum > 36) {
          m.reply('❌ Invalid number! Must be 0-36.');
          return;
        }
        
        const result = Math.floor(Math.random() * 37);
        const won = result === chosenNum;
        const color = getNumberColor(result);
        
        await gameStatsManager.recordRoulette(message.author.id, won);
        
        const resultEmbed = new EmbedBuilder()
          .setColor(won ? 0x57f287 : 0xed4245)
          .setTitle('🎰 Roulette - Result')
          .setDescription(`The ball landed on: ${color} **${result}**`)
          .addFields(
            { name: 'Your Bet', value: `Number ${chosenNum}`, inline: true },
            { name: 'Payout', value: won ? '35:1 🎉' : 'Lost 😅', inline: true }
          );
        
        await msg.edit({ embeds: [resultEmbed], components: [] });
        collector.stop('finished');
      });
      
      return;
    }
    
    // Spin the wheel
    const result = Math.floor(Math.random() * 37);
    const color = getNumberColor(result);
    const isRed = redNumbers.includes(result);
    const isBlack = blackNumbers.includes(result);
    const isOdd = result !== 0 && result % 2 === 1;
    const isEven = result !== 0 && result % 2 === 0;
    const isLow = result >= 1 && result <= 18;
    const isHigh = result >= 19 && result <= 36;
    
    let won = false;
    let betDescription = '';
    
    let payout = '1:1';
    
    switch(betType) {
      case 'red':
        won = isRed;
        betDescription = '🔴 Red';
        break;
      case 'black':
        won = isBlack;
        betDescription = '⚫ Black';
        break;
      case 'green':
        won = result === 0;
        betDescription = '🟢 Green (0)';
        payout = '35:1';
        break;
      case 'odd':
        won = isOdd;
        betDescription = 'Odd';
        break;
      case 'even':
        won = isEven;
        betDescription = 'Even';
        break;
      case 'low':
        won = isLow;
        betDescription = 'Low (1-18)';
        break;
      case 'high':
        won = isHigh;
        betDescription = 'High (19-36)';
        break;
    }
    
    await gameStatsManager.recordRoulette(message.author.id, won);
    
    const resultEmbed = new EmbedBuilder()
      .setColor(won ? 0x57f287 : 0xed4245)
      .setTitle('🎰 Roulette - Result')
      .setDescription(`The ball landed on: ${color} **${result}**`)
      .addFields(
        { name: 'Your Bet', value: betDescription, inline: true },
        { name: 'Result', value: won ? `✅ Won! (${payout})` : '❌ Lost', inline: true }
      );
    
    await interaction.update({ embeds: [resultEmbed], components: [] });
    collector.stop('finished');
  });
  
  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await msg.edit({ content: '⏰ Roulette timed out.', components: [] });
    }
  });
}

module.exports = {
  name: 'minigames',
  aliases: ['minigame', 'game', 'games'],
  description: 'Play minigames (RPS, guess, trivia, tictactoe, blackjack, roulette)',
  async execute(message, args) {
    const settings = settingsManager.get(message.guild.id);
    const prefix = settings.prefix;
    const sub = (args[0] || '').toLowerCase();

    if (!sub || !['rps', 'guess', 'trivia', 'tictactoe', 'ttt', 'blackjack', 'bj', 'roulette', 'roul'].includes(sub)) {
      const usage = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Mini Games')
        .setDescription('Pick a game to start playing:')
        .addFields(
          { name: '🪨 Rock Paper Scissors', value: `${prefix}minigame rps` },
          { name: '🔢 Guess The Number', value: `${prefix}minigame guess` },
          { name: '❓ Quick Trivia', value: `${prefix}minigame trivia` },
          { name: '⭕ Tic-Tac-Toe', value: `${prefix}minigame tictactoe (or ttt)` },
          { name: '🃏 Blackjack', value: `${prefix}minigame blackjack (or bj)` },
          { name: '🎰 Roulette', value: `${prefix}minigame roulette (or roul)` }
        );

      await message.reply({ embeds: [usage] });
      return;
    }

    if (sub === 'rps') {
      await playRps(message);
    } else if (sub === 'guess') {
      await playGuessNumber(message);
    } else if (sub === 'trivia') {
      await playTrivia(message);
    } else if (sub === 'tictactoe' || sub === 'ttt') {
      await playTicTacToe(message);
    } else if (sub === 'blackjack' || sub === 'bj') {
      await playBlackjack(message);
    } else if (sub === 'roulette' || sub === 'roul') {
      await playRoulette(message);
    }
  }
};
