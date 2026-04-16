const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const heistManager = require('../../utils/heistManager');

const activeHeists = new Map();
const MAX_UPGRADE_LEVEL = 5;

const TARGETS = {
    small: {
        key: 'small',
        name: 'Neighborhood Bank',
        emoji: '🏦',
        hostLevel: 1,
        minPlayers: 2,
        maxPlayers: 4,
        buyIn: 2500,
        lootMin: 7000,
        lootMax: 12000,
        baseSuccess: 0.48,
        personalCooldownMs: 60 * 60 * 1000,
        guildCooldownMs: 10 * 60 * 1000,
        heatFine: 0,
        xp: { clean: 70, messy: 55, partial: 35, bust: 20 },
    },
    medium: {
        key: 'medium',
        name: 'Downtown Credit Union',
        emoji: '🏛️',
        hostLevel: 2,
        minPlayers: 2,
        maxPlayers: 5,
        buyIn: 7500,
        lootMin: 18000,
        lootMax: 32000,
        baseSuccess: 0.37,
        personalCooldownMs: 90 * 60 * 1000,
        guildCooldownMs: 20 * 60 * 1000,
        heatFine: 1500,
        xp: { clean: 130, messy: 100, partial: 65, bust: 35 },
    },
    large: {
        key: 'large',
        name: 'Central Reserve Vault',
        emoji: '🏰',
        hostLevel: 4,
        minPlayers: 3,
        maxPlayers: 6,
        buyIn: 20000,
        lootMin: 45000,
        lootMax: 75000,
        baseSuccess: 0.28,
        personalCooldownMs: 120 * 60 * 1000,
        guildCooldownMs: 30 * 60 * 1000,
        heatFine: 4000,
        xp: { clean: 220, messy: 170, partial: 100, bust: 60 },
    },
};

const UPGRADE_DEFS = {
    hacker: {
        label: 'Hacker',
        emoji: '💻',
        shortBonus: '+success, +loot quality',
        longBonus: 'Improves breach success and pushes more outcomes into clean wins.',
    },
    driver: {
        label: 'Driver',
        emoji: '🚗',
        shortBonus: '+escapes, -cooldown',
        longBonus: 'Improves getaway odds and reduces your personal heist cooldown.',
    },
    muscle: {
        label: 'Muscle',
        emoji: '💪',
        shortBonus: '+crew safety, +partial saves',
        longBonus: 'Reduces how hard failed jobs punish the crew and helps salvage partial runs.',
    },
    inside: {
        label: 'Inside Contact',
        emoji: '🕵️',
        shortBonus: '+intel, +loot routing',
        longBonus: 'Raises clean hit odds and improves the value of whatever gets out.',
    },
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function formatDuration(ms) {
    const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];

    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds && hours === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

function getTarget(targetKey) {
    return TARGETS[targetKey] || TARGETS.small;
}

function getProfile(userId) {
    return heistManager.getUser(userId);
}

function getCrewRole(profile) {
    const ranked = Object.entries(profile.upgrades)
        .sort((a, b) => b[1] - a[1]);
    const [type, level] = ranked[0] || ['hacker', 0];
    if (!level) {
        return 'Rookie';
    }

    return `${UPGRADE_DEFS[type].label} ${level}`;
}

function getUpgradeSummary(profile) {
    return Object.entries(UPGRADE_DEFS)
        .map(([key, def]) => `${def.emoji} ${def.label} ${profile.upgrades[key]}/${MAX_UPGRADE_LEVEL}`)
        .join('\n');
}

function buildCrewBonuses(profiles) {
    const totals = profiles.reduce((acc, profile) => {
        acc.hacker += profile.upgrades.hacker;
        acc.driver += profile.upgrades.driver;
        acc.muscle += profile.upgrades.muscle;
        acc.inside += profile.upgrades.inside;
        acc.levels += Math.max(0, profile.level - 1);
        return acc;
    }, { hacker: 0, driver: 0, muscle: 0, inside: 0, levels: 0 });

    const size = Math.max(1, profiles.length);
    return {
        successBonus: clamp((totals.hacker * 0.012) + (totals.driver * 0.01) + (totals.muscle * 0.008) + (totals.inside * 0.015), 0, 0.2),
        cleanBias: clamp(((totals.hacker * 0.008) + (totals.inside * 0.012)) / size, 0, 0.08),
        messyBias: clamp(((totals.driver * 0.015) + (totals.muscle * 0.007)) / size, 0, 0.08),
        partialBias: clamp(((totals.driver * 0.012) + (totals.muscle * 0.012)) / size, 0, 0.1),
        lootMultiplier: 1 + clamp(((totals.hacker * 0.014) + (totals.inside * 0.02) + (totals.levels * 0.004)) / size, 0, 0.22),
        cooldownReductionMs: (totals.driver * 2 * 60 * 1000) + (totals.levels * 15 * 1000),
        stakeProtection: clamp(((totals.driver * 0.04) + (totals.muscle * 0.03)) / size, 0, 0.35),
    };
}

function buildOdds(target, profiles) {
    const crewSize = profiles.length;
    const bonuses = buildCrewBonuses(profiles);
    const base = clamp(target.baseSuccess + ((crewSize - target.minPlayers) * 0.05) + bonuses.successBonus + ((profiles.reduce((sum, profile) => sum + profile.level, 0) / crewSize) - 1) * 0.01, 0.18, 0.78);

    let cleanChance = clamp(base * (0.56 + bonuses.cleanBias), 0.08, 0.62);
    let messyChance = clamp(base * (0.24 + bonuses.messyBias), 0.08, 0.25);
    let partialChance = clamp(0.12 + bonuses.partialBias + Math.max(0, 0.4 - base) * 0.2, 0.1, 0.28);

    const total = cleanChance + messyChance + partialChance;
    if (total > 0.92) {
        const scale = 0.92 / total;
        cleanChance *= scale;
        messyChance *= scale;
        partialChance *= scale;
    }

    const bustChance = clamp(1 - cleanChance - messyChance - partialChance, 0.08, 0.7);
    return {
        cleanChance,
        messyChance,
        partialChance,
        bustChance,
        bonuses,
    };
}

function splitWeightedInteger(total, ids, profilesById) {
    if (total <= 0 || ids.length === 0) {
        return {};
    }

    const weights = ids.map((id) => {
        const profile = profilesById.get(id);
        const upgradeLevels = Object.values(profile.upgrades).reduce((sum, value) => sum + value, 0);
        const weight = 100 + (upgradeLevels * 6) + ((profile.level - 1) * 3);
        return { id, weight };
    });
    const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);

    let distributed = 0;
    const payouts = {};
    const remainders = [];

    for (const entry of weights) {
        const exact = (total * entry.weight) / totalWeight;
        const floorValue = Math.floor(exact);
        payouts[entry.id] = floorValue;
        distributed += floorValue;
        remainders.push({ id: entry.id, remainder: exact - floorValue, weight: entry.weight });
    }

    remainders.sort((a, b) => b.remainder - a.remainder || b.weight - a.weight);
    let remaining = total - distributed;
    let index = 0;
    while (remaining > 0) {
        payouts[remainders[index % remainders.length].id] += 1;
        remaining -= 1;
        index += 1;
    }

    return payouts;
}

function mentionList(userIds, profilesById) {
    return userIds.map((userId) => `<@${userId}> - ${getCrewRole(profilesById.get(userId))}`).join('\n');
}

function buildPlanningEmbed(hostId, target, participantIds, profilesById) {
    const profiles = participantIds.map((id) => profilesById.get(id));
    const odds = buildOdds(target, profiles);
    const successPct = Math.round((odds.cleanChance + odds.messyChance + odds.partialChance) * 100);

    return new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`${target.emoji} Heist Planning: ${target.name}`)
        .setDescription(`<@${hostId}> is assembling a crew. Join within **30 seconds** if you can cover the buy-in.`)
        .addFields(
            { name: '💸 Buy-In', value: `${target.buyIn.toLocaleString()} coins each`, inline: true },
            { name: '👥 Crew Size', value: `${participantIds.length}/${target.maxPlayers} (${target.minPlayers}+ required)`, inline: true },
            { name: '📈 Est. Success', value: `${successPct}%`, inline: true },
            { name: '🎯 Possible Loot', value: `${target.lootMin.toLocaleString()}-${target.lootMax.toLocaleString()} coins`, inline: true },
            { name: '⏱ Cooldowns', value: `Personal ${formatDuration(target.personalCooldownMs)}\nGuild ${formatDuration(target.guildCooldownMs)}`, inline: true },
            { name: '🧠 Crew Bonuses', value: `Clean ${Math.round(odds.cleanChance * 100)}%\nMessy ${Math.round(odds.messyChance * 100)}%\nPartial ${Math.round(odds.partialChance * 100)}%`, inline: true },
            { name: '👤 Crew', value: mentionList(participantIds, profilesById) }
        )
        .setFooter({ text: 'Use !heist targets, !heist upgrades, !heist stats, or !heist upgrade <type> between runs.' })
        .setTimestamp();
}

async function chargeParticipants(guildId, participantIds, buyIn) {
    const charged = [];
    const removed = [];

    for (const userId of participantIds) {
        const success = await economyManager.removeMoney(guildId, userId, buyIn);
        if (success) {
            charged.push(userId);
        } else {
            removed.push(userId);
        }
    }

    return { charged, removed };
}

async function chargeCappedFine(guildId, userId, amount) {
    if (amount <= 0) {
        return 0;
    }

    const balance = economyManager.getUserData(guildId, userId).balance;
    const fine = Math.min(balance, amount);
    if (fine > 0) {
        await economyManager.removeMoney(guildId, userId, fine);
    }
    return fine;
}

function getTargetListEmbed(authorId) {
    const profile = getProfile(authorId);
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎯 Heist Targets')
        .setDescription('Higher targets pay more, but require stronger crews and larger buy-ins.')
        .addFields(
            ...Object.values(TARGETS).map((target) => ({
                name: `${target.emoji} ${target.name} (${target.key})`,
                value: `Unlock: Level ${target.hostLevel}\nCrew: ${target.minPlayers}-${target.maxPlayers}\nBuy-in: ${target.buyIn.toLocaleString()}\nLoot: ${target.lootMin.toLocaleString()}-${target.lootMax.toLocaleString()}\n${profile.level >= target.hostLevel ? 'Status: Ready' : `Status: Locked until level ${target.hostLevel}`}`,
                inline: true,
            }))
        )
        .setFooter({ text: `Your heist level: ${profile.level}` });
}

function getUpgradesEmbed(userId) {
    const profile = getProfile(userId);
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🛠️ Heist Upgrades')
        .setDescription('Upgrade a specialty with `!heist upgrade <hacker|driver|muscle|inside>`.')
        .addFields(
            ...Object.entries(UPGRADE_DEFS).map(([key, def]) => ({
                name: `${def.emoji} ${def.label} ${profile.upgrades[key]}/${MAX_UPGRADE_LEVEL}`,
                value: `${def.longBonus}\nNext cost: ${heistManager.getUpgradeCost(key, profile.upgrades[key])?.toLocaleString() || 'MAX'}`,
                inline: false,
            })),
            { name: '📘 Current Loadout', value: getUpgradeSummary(profile), inline: false }
        )
        .setFooter({ text: `Heist level ${profile.level} • XP ${profile.xp}` });
}

function getStatsEmbed(targetUser) {
    const profile = getProfile(targetUser.id);
    const stats = profile.stats;
    const completedRuns = stats.cleanWins + stats.messyWins + stats.partialWins + stats.busts;
    const successRate = completedRuns ? Math.round(((stats.cleanWins + stats.messyWins + stats.partialWins) / completedRuns) * 100) : 0;

    return new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`📊 Heist Stats: ${targetUser.username}`)
        .addFields(
            { name: '🎖 Progress', value: `Level ${profile.level}\nXP ${profile.xp}`, inline: true },
            { name: '📈 Record', value: `Attempts ${stats.attempts}\nSuccess ${successRate}%\nBest streak ${stats.bestWinStreak}`, inline: true },
            { name: '🧰 Specialties', value: getUpgradeSummary(profile), inline: true },
            { name: '🏆 Outcomes', value: `Clean wins: ${stats.cleanWins}\nMessy wins: ${stats.messyWins}\nPartial wins: ${stats.partialWins}\nBusts: ${stats.busts}`, inline: false },
            { name: '💰 Economy', value: `Biggest score: ${stats.biggestScore.toLocaleString()}\nTotal earned: ${stats.totalEarned.toLocaleString()}\nTotal lost: ${stats.totalLost.toLocaleString()}\nLoot extracted: ${stats.totalLoot.toLocaleString()}`, inline: false }
        )
        .setFooter({ text: `Current fail streak: ${stats.failStreak}` });
}

async function startHeist(message, args) {
    await heistManager.ensureReady();

    const guildId = message.guild.id;
    const hostId = message.author.id;
    const target = getTarget((args[0] || 'small').toLowerCase());
    const hostProfile = getProfile(hostId);

    if (activeHeists.has(guildId)) {
        return message.reply('❌ A heist is already being planned in this server.');
    }

    if (hostProfile.level < target.hostLevel) {
        return message.reply(`❌ ${target.name} unlocks at heist level **${target.hostLevel}**. Use \`!heist stats\` and \`!heist upgrade\` to grow your crew.`);
    }

    const guildCooldown = heistManager.getGuildCooldownRemaining(guildId);
    if (guildCooldown > 0) {
        return message.reply(`❌ This server is still cooling down from the last heist. Wait **${formatDuration(guildCooldown)}**.`);
    }

    const personalCooldown = heistManager.getPersonalCooldownRemaining(hostId);
    if (personalCooldown > 0) {
        return message.reply(`❌ You are still under heist heat. Wait **${formatDuration(personalCooldown)}**.`);
    }

    if (economyManager.getUserData(guildId, hostId).balance < target.buyIn) {
        return message.reply(`❌ You need **${target.buyIn.toLocaleString()} coins** to cover the buy-in for ${target.name}.`);
    }

    const joinWindow = 30_000;
    const participantIds = [hostId];
    const profilesById = new Map([[hostId, hostProfile]]);
    const customId = `heist_join_${guildId}_${Date.now()}`;

    activeHeists.set(guildId, {
        hostId,
        targetKey: target.key,
        participants: new Set(participantIds),
        customId,
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(`Join ${target.name}`)
            .setStyle(ButtonStyle.Danger)
    );

    const msg = await message.channel.send({
        embeds: [buildPlanningEmbed(hostId, target, participantIds, profilesById)],
        components: [row],
    });

    const collector = msg.createMessageComponentCollector({
        filter: (interaction) => interaction.customId === customId,
        time: joinWindow,
    });

    collector.on('collect', async (interaction) => {
        if (interaction.user.bot) {
            return interaction.reply({ content: '❌ Bots cannot join heists.', flags: 64 });
        }

        const current = activeHeists.get(guildId);
        if (!current) {
            return interaction.reply({ content: '❌ This heist is no longer active.', flags: 64 });
        }

        if (current.participants.has(interaction.user.id)) {
            return interaction.reply({ content: '❌ You are already in this crew.', flags: 64 });
        }

        if (current.participants.size >= target.maxPlayers) {
            return interaction.reply({ content: '❌ The crew is already full.', flags: 64 });
        }

        const cooldownRemaining = heistManager.getPersonalCooldownRemaining(interaction.user.id);
        if (cooldownRemaining > 0) {
            return interaction.reply({ content: `❌ You are still on heist cooldown for **${formatDuration(cooldownRemaining)}**.`, flags: 64 });
        }

        if (economyManager.getUserData(guildId, interaction.user.id).balance < target.buyIn) {
            return interaction.reply({ content: `❌ You need **${target.buyIn.toLocaleString()} coins** to join this heist.`, flags: 64 });
        }

        current.participants.add(interaction.user.id);
        profilesById.set(interaction.user.id, getProfile(interaction.user.id));

        await msg.edit({
            embeds: [buildPlanningEmbed(hostId, target, [...current.participants], profilesById)],
            components: [row],
        });
        await interaction.reply({ content: `✅ You joined the crew for **${target.name}**.`, flags: 64 });
    });

    collector.on('end', async () => {
        const current = activeHeists.get(guildId);
        activeHeists.delete(guildId);
        if (!current) {
            return;
        }

        const allParticipants = [...current.participants];
        if (allParticipants.length < target.minPlayers) {
            return msg.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle('❌ Heist Cancelled')
                        .setDescription(`Not enough crew members joined. ${target.name} needs **${target.minPlayers}** participants.`)
                        .setTimestamp(),
                ],
                components: [],
            });
        }

        const { charged, removed } = await chargeParticipants(guildId, allParticipants, target.buyIn);
        if (charged.length < target.minPlayers) {
            for (const userId of charged) {
                await economyManager.addMoney(guildId, userId, target.buyIn);
            }
            const removedText = removed.length ? `\nRemoved for insufficient funds: ${removed.map((id) => `<@${id}>`).join(', ')}` : '';
            return msg.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle('❌ Heist Cancelled')
                        .setDescription(`The crew could not cover the buy-ins for launch.${removedText}`)
                        .setTimestamp(),
                ],
                components: [],
            });
        }

        const profiles = charged.map((id) => profilesById.get(id) || getProfile(id));
        const profilesMap = new Map(charged.map((id) => [id, profilesById.get(id) || getProfile(id)]));
        const odds = buildOdds(target, profiles);
        const now = Date.now();
        const personalCooldownUntil = now + Math.max(20 * 60 * 1000, target.personalCooldownMs - odds.bonuses.cooldownReductionMs);
        const guildCooldownUntil = now + target.guildCooldownMs;

        await heistManager.setCooldowns({
            guildId,
            participantIds: charged,
            personalUntil: personalCooldownUntil,
            guildUntil: guildCooldownUntil,
            targetKey: target.key,
        });

        const roll = Math.random();
        let outcomeType = 'bust';
        if (roll < odds.cleanChance) {
            outcomeType = 'clean';
        } else if (roll < odds.cleanChance + odds.messyChance) {
            outcomeType = 'messy';
        } else if (roll < odds.cleanChance + odds.messyChance + odds.partialChance) {
            outcomeType = 'partial';
        }

        const baseLoot = Math.floor(randomInt(target.lootMin, target.lootMax) * odds.bonuses.lootMultiplier);
        const payoutLines = [];
        const lossLines = [];
        const stakeReturns = Object.fromEntries(charged.map((id) => [id, target.buyIn]));
        let lootPool = 0;
        let extraFineText = null;
        let caughtUserId = null;
        let lootRecipients = [...charged];

        if (outcomeType === 'clean') {
            lootPool = baseLoot;
        } else if (outcomeType === 'messy') {
            lootPool = Math.floor(baseLoot * 0.8);
            caughtUserId = charged[Math.floor(Math.random() * charged.length)];
            stakeReturns[caughtUserId] = 0;
            lootRecipients = charged.filter((id) => id !== caughtUserId);
        } else if (outcomeType === 'partial') {
            lootPool = Math.floor(baseLoot * 0.45);
            const returnRatio = clamp(0.45 + odds.bonuses.stakeProtection, 0.45, 0.8);
            for (const userId of charged) {
                stakeReturns[userId] = Math.floor(target.buyIn * returnRatio);
            }
        } else {
            lootPool = 0;
        }

        const lootShares = splitWeightedInteger(lootPool, lootRecipients, profilesMap);
        const userOutcomes = new Map();

        for (const userId of charged) {
            const lootShare = lootShares[userId] || 0;
            const payout = stakeReturns[userId] + lootShare;
            if (payout > 0) {
                await economyManager.addMoney(guildId, userId, payout);
            }

            let extraFine = 0;
            if (outcomeType === 'bust' && target.heatFine > 0) {
                extraFine = await chargeCappedFine(guildId, userId, target.heatFine);
            }

            const loss = (target.buyIn - stakeReturns[userId]) + extraFine;
            const netProfit = payout - target.buyIn - extraFine;
            const xp = target.xp[outcomeType];

            await heistManager.recordOutcome(userId, {
                type: outcomeType,
                payout,
                loss,
                lootShare,
                netProfit,
                xp,
            });

            userOutcomes.set(userId, { payout, loss, lootShare, netProfit, extraFine });

            if (payout > 0) {
                payoutLines.push(`<@${userId}> • payout **${payout.toLocaleString()}** (${lootShare.toLocaleString()} loot)`);
            }
            if (loss > 0) {
                lossLines.push(`<@${userId}> • lost **${loss.toLocaleString()}**`);
            }
        }

        if (outcomeType === 'bust' && target.heatFine > 0) {
            extraFineText = `Police heat added up to **${target.heatFine.toLocaleString()}** extra fine per member if they had cash left.`;
        }

        const removedText = removed.length ? `\nRemoved at launch for insufficient funds: ${removed.map((id) => `<@${id}>`).join(', ')}` : '';
        const titleByOutcome = {
            clean: '🎉 Clean Getaway',
            messy: '🚐 Messy Escape',
            partial: '🧯 Partial Score',
            bust: '🚔 Total Bust',
        };
        const descriptionByOutcome = {
            clean: `The crew cracked **${target.name}** and disappeared before the alarms mattered.`,
            messy: `The crew got out with the cash, but the exit went bad.${caughtUserId ? ` <@${caughtUserId}> was left behind and lost their stake.` : ''}`,
            partial: `The job turned chaotic, but the crew still dragged out part of the haul.`,
            bust: `The police collapsed on the crew before the vault run was completed. Everyone lost their buy-in.`,
        };

        const summaryEmbed = new EmbedBuilder()
            .setColor(outcomeType === 'bust' ? 0xed4245 : outcomeType === 'partial' ? 0xf1c40f : 0x57f287)
            .setTitle(titleByOutcome[outcomeType])
            .setDescription(`${descriptionByOutcome[outcomeType]}${removedText ? `\n${removedText}` : ''}`)
            .addFields(
                { name: '🎯 Target', value: `${target.emoji} ${target.name}`, inline: true },
                { name: '👥 Crew', value: `${charged.length} launched`, inline: true },
                { name: '💎 Loot Pool', value: `${lootPool.toLocaleString()} coins`, inline: true },
                { name: '📊 Odds', value: `Clean ${Math.round(odds.cleanChance * 100)}%\nMessy ${Math.round(odds.messyChance * 100)}%\nPartial ${Math.round(odds.partialChance * 100)}%`, inline: true },
                { name: '⏱ Cooldowns Applied', value: `Personal ${formatDuration(Math.max(20 * 60 * 1000, target.personalCooldownMs - odds.bonuses.cooldownReductionMs))}\nGuild ${formatDuration(target.guildCooldownMs)}`, inline: true },
                { name: '🧠 Crew Modifiers', value: `Loot x${odds.bonuses.lootMultiplier.toFixed(2)}\nSafety ${Math.round(odds.bonuses.stakeProtection * 100)}%\nDriver cut ${formatDuration(odds.bonuses.cooldownReductionMs)}`, inline: true }
            )
            .setTimestamp();

        if (payoutLines.length) {
            summaryEmbed.addFields({ name: '💰 Payouts', value: payoutLines.join('\n') });
        }
        if (lossLines.length) {
            summaryEmbed.addFields({ name: '🚨 Losses', value: lossLines.join('\n') });
        }
        if (extraFineText) {
            summaryEmbed.addFields({ name: '👮 Heat', value: extraFineText });
        }

        await msg.edit({ embeds: [summaryEmbed], components: [] });
    });
}

module.exports = {
    name: 'heist',
    description: 'Plan a cooperative heist with crew upgrades, cooldowns, and persistent stats',
    usage: '!heist [small|medium|large] | !heist targets | !heist stats [@user] | !heist upgrades | !heist upgrade <type>',
    aliases: [],
    category: 'fun',
    async execute(message, args) {
        await heistManager.ensureReady();

        const sub = (args[0] || 'small').toLowerCase();
        const targetUser = message.mentions.users.first() || message.author;

        if (sub === 'targets') {
            return message.reply({ embeds: [getTargetListEmbed(message.author.id)] });
        }

        if (sub === 'stats') {
            return message.reply({ embeds: [getStatsEmbed(targetUser)] });
        }

        if (sub === 'upgrades') {
            return message.reply({ embeds: [getUpgradesEmbed(message.author.id)] });
        }

        if (sub === 'upgrade') {
            const type = (args[1] || '').toLowerCase();
            if (!UPGRADE_DEFS[type]) {
                return message.reply('❌ Unknown upgrade. Use `!heist upgrade <hacker|driver|muscle|inside>` or `!heist upgrades`.');
            }

            const profile = getProfile(message.author.id);
            const cost = heistManager.getUpgradeCost(type, profile.upgrades[type]);
            if (!cost) {
                return message.reply(`❌ Your ${UPGRADE_DEFS[type].label} is already maxed.`);
            }

            const userData = economyManager.getUserData(message.guild.id, message.author.id);
            if (userData.balance < cost) {
                return message.reply(`❌ You need **${cost.toLocaleString()} coins** for the next ${UPGRADE_DEFS[type].label} upgrade.`);
            }

            const removed = await economyManager.removeMoney(message.guild.id, message.author.id, cost);
            if (!removed) {
                return message.reply('❌ Failed to reserve coins for that upgrade.');
            }

            const result = await heistManager.upgrade(message.author.id, type);
            return message.reply(`✅ ${UPGRADE_DEFS[type].emoji} ${UPGRADE_DEFS[type].label} upgraded to **${result.newLevel}/${MAX_UPGRADE_LEVEL}** for **${cost.toLocaleString()} coins**.`);
        }

        if (sub === 'help') {
            return message.reply('Usage: `!heist [small|medium|large]` | `!heist targets` | `!heist stats [@user]` | `!heist upgrades` | `!heist upgrade <type>`');
        }

        return startHeist(message, args);
    }
};
