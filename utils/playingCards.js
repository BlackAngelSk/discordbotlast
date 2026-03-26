const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_BASE = {
    '♠': 0x1F0A0,
    '♥': 0x1F0B0,
    '♦': 0x1F0C0,
    '♣': 0x1F0D0
};

// Unicode playing cards skip the Knight (C), so Queen=0xD and King=0xE.
const RANK_CODE = {
    A: 0x1,
    '2': 0x2,
    '3': 0x3,
    '4': 0x4,
    '5': 0x5,
    '6': 0x6,
    '7': 0x7,
    '8': 0x8,
    '9': 0x9,
    '10': 0xA,
    J: 0xB,
    Q: 0xD,
    K: 0xE
};

const ALL_CARDS = Object.freeze(
    SUITS.flatMap(suit =>
        RANKS.map(rank => ({
            rank,
            suit,
            code: `${rank}${suit}`,
            unicode: cardUnicode(rank, suit)
        }))
    )
);

function cardUnicode(rank, suit) {
    const base = SUIT_BASE[suit];
    const code = RANK_CODE[rank];
    if (!base || !code) return null;
    try {
        return String.fromCodePoint(base + code);
    } catch {
        return null;
    }
}

function formatCard(card) {
    if (!card) return '??';
    const text = `${card.rank}${card.suit}`;
    const uni = cardUnicode(card.rank, card.suit);
    return uni ? `${uni}${text}` : text;
}

function formatCards(cards) {
    if (!cards || cards.length === 0) return 'None';
    return cards.map(formatCard).join(' ');
}

function createShuffledDeck() {
    const deck = ALL_CARDS.map(c => ({ rank: c.rank, suit: c.suit }));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

module.exports = {
    SUITS,
    RANKS,
    ALL_CARDS,
    createShuffledDeck,
    formatCard,
    formatCards,
    cardUnicode
};
