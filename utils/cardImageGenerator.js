const fs = require('fs').promises;
const path = require('path');
const { SUITS, RANKS } = require('./playingCards');

const SUIT_META = {
    '♠': { code: 'S', name: 'spades', color: '#111827' },
    '♥': { code: 'H', name: 'hearts', color: '#dc2626' },
    '♦': { code: 'D', name: 'diamonds', color: '#dc2626' },
    '♣': { code: 'C', name: 'clubs', color: '#111827' }
};

function cardFileName(rank, suit) {
    const suitCode = SUIT_META[suit]?.code || 'X';
    return `${rank}${suitCode}.svg`;
}

function isFaceRank(rank) {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

function getPipLayout(rank) {
  const map = {
    A: [[50, 50, 0]],
    '2': [[50, 24, 0], [50, 76, 180]],
    '3': [[50, 24, 0], [50, 50, 0], [50, 76, 180]],
    '4': [[34, 24, 0], [66, 24, 0], [34, 76, 180], [66, 76, 180]],
    '5': [[34, 24, 0], [66, 24, 0], [50, 50, 0], [34, 76, 180], [66, 76, 180]],
    '6': [[34, 24, 0], [66, 24, 0], [34, 50, 0], [66, 50, 0], [34, 76, 180], [66, 76, 180]],
    '7': [[34, 22, 0], [66, 22, 0], [50, 36, 0], [34, 50, 0], [66, 50, 0], [34, 76, 180], [66, 76, 180]],
    '8': [[34, 22, 0], [66, 22, 0], [50, 36, 0], [34, 50, 0], [66, 50, 0], [50, 64, 180], [34, 78, 180], [66, 78, 180]],
    '9': [[34, 22, 0], [66, 22, 0], [50, 34, 0], [34, 46, 0], [66, 46, 0], [50, 58, 180], [34, 70, 180], [66, 70, 180], [50, 82, 180]],
    '10': [[34, 20, 0], [66, 20, 0], [50, 30, 0], [34, 42, 0], [66, 42, 0], [34, 58, 180], [66, 58, 180], [50, 70, 180], [34, 82, 180], [66, 82, 180]]
  };
  return map[rank] || [];
}

function renderPips(rank, suit, color, x, y, w, h) {
  const layout = getPipLayout(rank);
  const pipSize = rank === 'A' ? 110 : rank === '10' ? 44 : 50;

  return layout.map(([px, py, rot]) => {
    const cx = x + (px / 100) * w;
    const cy = y + (py / 100) * h;
    return `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${pipSize}" font-family="Arial, Helvetica, sans-serif" fill="${color}" transform="rotate(${rot}, ${cx.toFixed(2)}, ${cy.toFixed(2)})">${suit}</text>`;
  }).join('\n    ');
}

function renderFace(rank, suit, color, cx, cy) {
  const crown = rank === 'K' ? '♛' : rank === 'Q' ? '❀' : '✦';
  return `
  <circle cx="${cx}" cy="${cy}" r="86" fill="#f8fafc" stroke="#d1d5db" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="64" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
  <text x="${cx}" y="${cy - 22}" text-anchor="middle" font-size="70" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}</text>
  <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="44" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>
  <text x="${cx}" y="${cy + 52}" text-anchor="middle" font-size="22" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${crown}</text>`;
}

function cardSvg(rank, suit) {
    const meta = SUIT_META[suit] || SUIT_META['♠'];
    const color = meta.color;
    const centerMarkup = isFaceRank(rank)
        ? renderFace(rank, suit, color, 150, 210)
        : renderPips(rank, suit, color, 52, 88, 196, 244);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420" role="img" aria-label="${rank}${suit}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000000" flood-opacity="0.20"/>
    </filter>
  </defs>

  <rect x="14" y="14" width="272" height="392" rx="22" fill="url(#g)" stroke="#d1d5db" stroke-width="3.5" filter="url(#shadow)"/>
  <rect x="24" y="24" width="252" height="372" rx="16" fill="none" stroke="#e5e7eb" stroke-width="1.4"/>

  <text x="36" y="58" font-size="38" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}</text>
  <text x="36" y="91" font-size="31" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>

  <g transform="translate(300,420) rotate(180)">
    <text x="36" y="58" font-size="38" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}</text>
    <text x="36" y="91" font-size="31" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>
  </g>

  ${centerMarkup}
</svg>`;
}

function miniCardMarkup(rank, suit, x, y, w, h) {
    const meta = SUIT_META[suit] || SUIT_META['♠'];
    const color = meta.color;
    const center = isFaceRank(rank)
        ? `<text x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-size="24" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}${suit}</text>`
        : `<text x="${x + w / 2}" y="${y + h / 2 + 10}" text-anchor="middle" font-size="30" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>`;

    return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#ffffff" stroke="#d1d5db" stroke-width="1.8"/>
    <text x="${x + 9}" y="${y + 20}" font-size="16" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}</text>
    <text x="${x + 9}" y="${y + 36}" font-size="14" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>
    ${center}
  </g>`;
}

function backSvg() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420" role="img" aria-label="Card back">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M0 10 H20 M10 0 V20" stroke="#93c5fd" stroke-opacity="0.25" stroke-width="1"/>
    </pattern>
  </defs>

  <rect x="14" y="14" width="272" height="392" rx="22" fill="url(#bg)" stroke="#bfdbfe" stroke-width="4"/>
  <rect x="30" y="30" width="240" height="360" rx="16" fill="url(#p)" stroke="#bfdbfe" stroke-opacity="0.7" stroke-width="2"/>
  <circle cx="150" cy="210" r="52" fill="#e0e7ff" fill-opacity="0.2"/>
  <text x="150" y="224" text-anchor="middle" font-size="38" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#dbeafe">♠ ♥ ♦ ♣</text>
</svg>`;
}

function deckSheetSvg() {
    const cardW = 88;
    const cardH = 124;
    const pad = 14;
    const cols = RANKS.length;
    const rows = SUITS.length;
    const width = pad * 2 + cols * cardW + (cols - 1) * 8;
    const height = pad * 2 + rows * cardH + (rows - 1) * 10 + 34;

    let cardsMarkup = '';
    SUITS.forEach((suit, r) => {
        RANKS.forEach((rank, c) => {
            const x = pad + c * (cardW + 8);
            const y = pad + 34 + r * (cardH + 10);
            cardsMarkup += miniCardMarkup(rank, suit, x, y, cardW, cardH);
        });
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Deck sheet">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0b1020"/>
  <text x="${pad}" y="24" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#e5e7eb">Poker Deck Sheet (52 Cards)</text>
${cardsMarkup}
</svg>`;
}

async function generateCardImages(outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    const writes = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            writes.push(
                fs.writeFile(
                    path.join(outputDir, cardFileName(rank, suit)),
                    cardSvg(rank, suit),
                    'utf8'
                )
            );
        }
    }

    writes.push(fs.writeFile(path.join(outputDir, 'BACK.svg'), backSvg(), 'utf8'));
    writes.push(fs.writeFile(path.join(outputDir, 'DECK_SHEET.svg'), deckSheetSvg(), 'utf8'));
    await Promise.all(writes);

    return {
        count: SUITS.length * RANKS.length,
      totalWithBack: SUITS.length * RANKS.length + 1,
      totalWithExtras: SUITS.length * RANKS.length + 2,
        outputDir
    };
}

module.exports = {
    generateCardImages,
    cardFileName
};
