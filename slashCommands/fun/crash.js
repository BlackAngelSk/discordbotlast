const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const economyManager = require('../../utils/economyManager');

const MIN_BET = 10;
const MAX_BET = 1_000_000;
const GAME_TIMEOUT_MS = 120_000;
const TICK_MS = 1200;

const activeCrashSessions = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Risk your bet and cash out before the game crashes!')
        .setDMPermission(false)
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet (minimum 10)')
                .setRequired(true)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (!guildId) {
            return interaction.reply({
                content: '❌ This command can only be used in a server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sessionKey = `${guildId}_${userId}`;
        const bet = interaction.options.getInteger('bet');

        let betRemoved = false;

        try {
            if (activeCrashSessions.has(sessionKey)) {
                return interaction.reply({ content: '⏳ You already have an active crash game. Finish it first.', flags: MessageFlags.Ephemeral });
            }

            const userData = economyManager.getUserData(guildId, userId);
            if (userData.balance < bet) {
                return interaction.reply({
                    content: `❌ You don't have enough coins! Your balance: ${userData.balance.toLocaleString()} coins`,
                    flags: MessageFlags.Ephemeral
                });
            }

            activeCrashSessions.add(sessionKey);

            const removed = await economyManager.removeMoney(guildId, userId, bet);
            if (!removed) {
                return interaction.reply({ content: '❌ Could not place your bet. Please try again.', flags: MessageFlags.Ephemeral });
            }
            betRemoved = true;

            await playCrashWithBet(interaction, bet);
        } catch (error) {
            console.error('Error in slash crash command:', error);

            if (betRemoved) {
                await economyManager.addMoney(guildId, userId, bet);
            }

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while playing crash!', flags: MessageFlags.Ephemeral });
            }
        } finally {
            activeCrashSessions.delete(sessionKey);
        }
    }
};

function getCrashChance(multiplier) {
    const chance = 0.1 + ((multiplier - 1) * 0.12);
    return Math.max(0.1, Math.min(chance, 0.85));
}

function nextMultiplier(currentMultiplier) {
    const growth = 0.08 + (Math.random() * 0.22); // +0.08x to +0.30x per boost
    return Number((currentMultiplier + growth).toFixed(2));
}

function createControls(game, disableAll = false) {
    const cashoutAmount = Math.floor(game.bet * game.multiplier);

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('scrash_cashout')
                .setLabel(`Cash Out (${cashoutAmount.toLocaleString()})`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
                .setDisabled(disableAll)
        )
    ];
}

function createEmbed(interaction, game, title, description) {
    const cashoutAmount = Math.floor(game.bet * game.multiplier);
    const crashChance = getCrashChance(game.multiplier) * 100;

    return new EmbedBuilder()
        .setColor(game.finished ? (game.result === 'win' ? 0x57f287 : 0xed4245) : 0x5865f2)
        .setTitle(title)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(description)
        .addFields(
            { name: '💰 Bet', value: `${game.bet.toLocaleString()} coins`, inline: true },
            { name: '📈 Multiplier', value: `${game.multiplier.toFixed(2)}x`, inline: true },
            { name: '💵 Cashout Value', value: `${cashoutAmount.toLocaleString()} coins`, inline: true },
            { name: '⚠️ Crash Risk', value: `${crashChance.toFixed(1)}%`, inline: true },
            { name: '⏱️ Ticks Survived', value: `${game.ticks}`, inline: true },
            { name: '🧨 Status', value: game.finished ? (game.result === 'win' ? 'Cashed Out' : 'Crashed') : 'Flying', inline: true }
        )
        .setFooter({ text: 'The multiplier grows automatically. Cash out before it crashes.' });
}

async function playCrashWithBet(interaction, bet) {
    const game = {
        bet,
        multiplier: 1,
        ticks: 0,
        finished: false,
        result: 'loss'
    };

    const introEmbed = createEmbed(
        interaction,
        game,
        '💥 Crash',
        'Game started instantly! Multiplier is increasing automatically. Press **Cash Out** before it crashes.'
    );

    await interaction.reply({ embeds: [introEmbed], components: createControls(game) });
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: GAME_TIMEOUT_MS,
        filter: i => i.user.id === interaction.user.id
    });

    let loop = null;

    const stopLoop = () => {
        if (loop) {
            clearInterval(loop);
            loop = null;
        }
    };

    const finalizeWin = async (reasonText) => {
        game.finished = true;
        game.result = 'win';
        stopLoop();

        const payout = Math.floor(game.bet * game.multiplier);
        await economyManager.addMoney(interaction.guildId, interaction.user.id, payout);

        const embed = createEmbed(
            interaction,
            game,
            '💥 Crash - Cashed Out!',
            `${reasonText}\n🎉 You won **${payout.toLocaleString()} coins**.`
        );

        await interaction.editReply({ embeds: [embed], components: createControls(game, true) });
    };

    const finalizeCrash = async (reasonText) => {
        game.finished = true;
        game.result = 'loss';
        stopLoop();

        const embed = createEmbed(
            interaction,
            game,
            '💥 Crash - BOOM!',
            `${reasonText}\n💥 You lost **${game.bet.toLocaleString()} coins**.`
        );

        await interaction.editReply({ embeds: [embed], components: createControls(game, true) });
    };

    collector.on('collect', async i => {
        try {
            if (i.customId === 'scrash_cashout') {
                await i.deferUpdate();
                await finalizeWin('💰 Great timing.');
                collector.stop('cashout');
                return;
            }

            await i.deferUpdate();
        } catch (error) {
            console.error('Error handling slash crash interaction:', error);
            if (!i.replied && !i.deferred) {
                await i.reply({ content: '❌ Something went wrong. The game is ending.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            collector.stop('error');
        }
    });

    let updating = false;

    loop = setInterval(async () => {
        if (game.finished || updating) return;
        updating = true;

        try {
            const crashRoll = Math.random();
            const crashChance = getCrashChance(game.multiplier);

            if (crashRoll < crashChance) {
                await finalizeCrash(`🧨 The game crashed at **${game.multiplier.toFixed(2)}x**.`);
                collector.stop('crash');
                return;
            }

            game.multiplier = nextMultiplier(game.multiplier);
            game.ticks += 1;

            const updatedEmbed = createEmbed(
                interaction,
                game,
                '💥 Crash',
                'Still flying... cash out anytime.'
            );

            await interaction.editReply({ embeds: [updatedEmbed], components: createControls(game) });
        } catch (error) {
            console.error('Error updating slash crash game loop:', error);
            collector.stop('error');
        } finally {
            updating = false;
        }
    }, TICK_MS);

    collector.on('end', async (_collected, reason) => {
        if (game.finished) return;

        try {
            stopLoop();
            await finalizeCrash(reason === 'time'
                ? '⏰ Time ran out. The game crashed.'
                : 'The game ended unexpectedly and crashed.');
        } catch (error) {
            console.error('Error finalizing slash crash game:', error);
        }
    });
}
