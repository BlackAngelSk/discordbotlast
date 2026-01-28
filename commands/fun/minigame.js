const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const settingsManager = require('../utils/settingsManager');

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
    explanation: 'The DJ role gates the playback controls unless you are admin/alone with the bot.'
  },
  {
    question: 'What is the default command prefix for this bot?',
    options: ['?', '!', '.', '/'],
    answerIndex: 1,
    explanation: 'You can change it with the config prefix command per server.'
  },
  {
    question: 'How many songs can the playlist loader add at once by default?',
    options: ['10', '25', '50', 'Unlimited'],
    answerIndex: 2,
    explanation: 'Playlist handling is capped at 50 entries for speed and safety.'
  },
  {
    question: 'Which emoji reaction skips the current song?',
    options: ['⏸️', '▶️', '⏭️', '⏹️'],
    answerIndex: 2,
    explanation: '⏭️ is mapped to Skip in the reaction controls.'
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

module.exports = {
  name: 'minigames',
  aliases: ['minigame', 'minigames', 'game', 'games'],
  description: 'Play minigame (RPS, guess, trivia)',
  async execute(message, args) {
    const settings = settingsManager.get(message.guild.id);
    const prefix = settings.prefix;
    const sub = (args[0] || '').toLowerCase();

    if (!sub || !['rps', 'guess', 'trivia'].includes(sub)) {
      const usage = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Mini Games')
        .setDescription('Pick a game to start playing:')
        .addFields(
          { name: 'Rock Paper Scissors', value: `${prefix}minigame rps` },
          { name: 'Guess The Number', value: `${prefix}minigame guess` },
          { name: 'Quick Trivia', value: `${prefix}minigame trivia` }
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
    }
  }
};
