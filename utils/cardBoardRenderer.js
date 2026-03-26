const { AttachmentBuilder } = require('discord.js');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUIT_COLOR = {
	'♠': '#111827',
	'♣': '#111827',
	'♥': '#dc2626',
	'♦': '#dc2626'
};

const SUIT_FILE = {
	'♠': 'S',
	'♥': 'H',
	'♦': 'D',
	'♣': 'C'
};

const CARD_ASSET_DIR = path.join(__dirname, '..', 'assets', 'cards');
const cardImageDataCache = new Map();
let converterSupportCache;

function isFaceRank(rank) {
	return rank === 'J' || rank === 'Q' || rank === 'K';
}

function getPipLayout(rank) {
	const map = {
		A: [[50, 50, 0]],
		'2': [[50, 26, 0], [50, 74, 180]],
		'3': [[50, 26, 0], [50, 50, 0], [50, 74, 180]],
		'4': [[35, 26, 0], [65, 26, 0], [35, 74, 180], [65, 74, 180]],
		'5': [[35, 26, 0], [65, 26, 0], [50, 50, 0], [35, 74, 180], [65, 74, 180]],
		'6': [[35, 24, 0], [65, 24, 0], [35, 50, 0], [65, 50, 0], [35, 76, 180], [65, 76, 180]],
		'7': [[35, 22, 0], [65, 22, 0], [50, 34, 0], [35, 50, 0], [65, 50, 0], [35, 78, 180], [65, 78, 180]],
		'8': [[35, 22, 0], [65, 22, 0], [50, 34, 0], [35, 50, 0], [65, 50, 0], [50, 66, 180], [35, 78, 180], [65, 78, 180]],
		'9': [[35, 20, 0], [65, 20, 0], [50, 32, 0], [35, 44, 0], [65, 44, 0], [50, 56, 180], [35, 68, 180], [65, 68, 180], [50, 80, 180]],
		'10': [[35, 18, 0], [65, 18, 0], [50, 30, 0], [35, 42, 0], [65, 42, 0], [35, 58, 180], [65, 58, 180], [50, 70, 180], [35, 82, 180], [65, 82, 180]]
	};
	return map[rank] || [];
}

function renderPips(rank, suit, color, x, y, w, h) {
	const layout = getPipLayout(rank);
	const pipSize = rank === 'A' ? Math.round(h * 0.34) : Math.round(h * 0.2);

	return layout.map(([px, py, rot]) => {
		const cx = x + (px / 100) * w;
		const cy = y + (py / 100) * h;
		return `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${pipSize}" font-family="Arial, Helvetica, sans-serif" fill="${color}" transform="rotate(${rot}, ${cx.toFixed(2)}, ${cy.toFixed(2)})">${suit}</text>`;
	}).join('\n      ');
}

function getCardImageDataUri(card) {
	if (!card?.rank || !card?.suit) return null;

	const suitCode = SUIT_FILE[card.suit];
	if (!suitCode) return null;

	const key = `${suitCode}${card.rank}`;
	if (cardImageDataCache.has(key)) {
		return cardImageDataCache.get(key);
	}

	const filePath = path.join(CARD_ASSET_DIR, `${key}.png`);
	if (!fs.existsSync(filePath)) {
		cardImageDataCache.set(key, null);
		return null;
	}

	try {
		const data = fs.readFileSync(filePath);
		const uri = `data:image/png;base64,${data.toString('base64')}`;
		cardImageDataCache.set(key, uri);
		return uri;
	} catch {
		cardImageDataCache.set(key, null);
		return null;
	}
}

function getCardAssetPath(card) {
	if (!card?.rank || !card?.suit) return null;
	const suitCode = SUIT_FILE[card.suit];
	if (!suitCode) return null;
	const p = path.join(CARD_ASSET_DIR, `${suitCode}${card.rank}.png`);
	return fs.existsSync(p) ? p : null;
}

function supportsBoardImageRendering() {
	if (typeof converterSupportCache === 'boolean') return converterSupportCache;

	const rsvg = spawnSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
	if (rsvg.status === 0) {
		converterSupportCache = true;
		return true;
	}

	const magick = spawnSync('magick', ['-version'], { stdio: 'ignore' });
	converterSupportCache = magick.status === 0;
	return converterSupportCache;
}

function blackjackCardAttachments(playerCards, dealerCards, options = {}) {
	const hideDealerHole = !!options.hideDealerHole;
	const files = [];
	let idx = 0;

	dealerCards.forEach((card, i) => {
		if (hideDealerHole && i === 1) return;
		const assetPath = getCardAssetPath(card);
		if (!assetPath) return;
		files.push(new AttachmentBuilder(assetPath, { name: `dealer-${idx++}.png` }));
	});

	playerCards.forEach((card) => {
		const assetPath = getCardAssetPath(card);
		if (!assetPath) return;
		files.push(new AttachmentBuilder(assetPath, { name: `player-${idx++}.png` }));
	});

	return files;
}

function pokerCommunityCardAttachments(communityCards) {
	const files = [];
	let idx = 0;
	for (const card of communityCards || []) {
		const assetPath = getCardAssetPath(card);
		if (!assetPath) continue;
		files.push(new AttachmentBuilder(assetPath, { name: `board-${idx++}.png` }));
	}
	return files;
}

function pokerHandCardAttachments(cards) {
	const files = [];
	let idx = 0;
	for (const card of cards || []) {
		const assetPath = getCardAssetPath(card);
		if (!assetPath) continue;
		files.push(new AttachmentBuilder(assetPath, { name: `hand-${idx++}.png` }));
	}
	return files;
}

function renderVectorCard(card, x, y, w, h) {
	const rank = card?.rank ?? '?';
	const suit = card?.suit ?? '?';
	const color = SUIT_COLOR[suit] || '#111827';

	const centerMarkup = isFaceRank(rank)
		? `<text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="28" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}${suit}</text>`
		: renderPips(rank, suit, color, x + 8, y + 14, w - 16, h - 26);

	return `
	<g>
	  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="#d1d5db" stroke-width="2"/>
	  <text x="${x + 10}" y="${y + 22}" font-size="18" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${color}">${rank}</text>
	  <text x="${x + 10}" y="${y + 40}" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>
	  <text x="${x + w - 10}" y="${y + h - 12}" text-anchor="end" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="${color}">${suit}</text>
	  ${centerMarkup}
	</g>`;
}

function renderCard(card, x, y, w, h, hidden = false) {
	if (hidden) {
		return `
	<g>
	  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#1e3a8a" stroke="#93c5fd" stroke-width="2"/>
	  <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="8" fill="none" stroke="#bfdbfe" stroke-opacity="0.7" stroke-width="1.5"/>
	  <text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="#dbeafe">🂠</text>
	</g>`;
	}

	const dataUri = getCardImageDataUri(card);
	if (dataUri) {
		const clipId = `clip_${x}_${y}_${w}_${h}`;
		return `
	<g>
	  <defs>
		<clipPath id="${clipId}">
		  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>
		</clipPath>
	  </defs>
	  <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${dataUri}" clip-path="url(#${clipId})"/>
	  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#d1d5db" stroke-width="1.5"/>
	</g>`;
	}

	return renderVectorCard(card, x, y, w, h);
}

function buildBlackjackBoardSvg(playerCards, dealerCards, options = {}) {
	const hideDealerHole = !!options.hideDealerHole;
	const playerName = options.playerName || 'Player';
	const cardW = 88;
	const cardH = 124;
	const gap = 10;

	const topCount = Math.max(2, dealerCards.length);
	const bottomCount = Math.max(2, playerCards.length);
	const cols = Math.max(topCount, bottomCount);
	const width = 40 + cols * cardW + (cols - 1) * gap;
	const height = 368;

	const dealerLabelY = 30;
	const dealerCardsY = 52;
	const dividerY = 186;
	const playerLabelY = 212;
	const playerCardsY = 228;

	let dealerMarkup = '';
	dealerCards.forEach((c, i) => {
		dealerMarkup += renderCard(c, 20 + i * (cardW + gap), dealerCardsY, cardW, cardH, hideDealerHole && i === 1);
	});

	let playerMarkup = '';
	playerCards.forEach((c, i) => {
		playerMarkup += renderCard(c, 20 + i * (cardW + gap), playerCardsY, cardW, cardH, false);
	});

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0b3d2e"/>
  <text x="20" y="${dealerLabelY}" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#e5e7eb">Dealer</text>
  <line x1="16" y1="${dividerY}" x2="${width - 16}" y2="${dividerY}" stroke="#86efac" stroke-opacity="0.35" stroke-width="1.5"/>
  <text x="20" y="${playerLabelY}" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#e5e7eb">${escapeXml(playerName)}</text>
  ${dealerMarkup}
  ${playerMarkup}
</svg>`;
}

function buildPokerCommunitySvg(communityCards) {
	const cardW = 100;
	const cardH = 140;
	const gap = 12;
	const slots = 5;
	const width = 36 + slots * cardW + (slots - 1) * gap;
	const height = 204;

	let cardsMarkup = '';
	for (let i = 0; i < slots; i++) {
		const card = communityCards[i];
		if (card) {
			cardsMarkup += renderCard(card, 18 + i * (cardW + gap), 44, cardW, cardH, false);
		} else {
			cardsMarkup += renderCard(null, 18 + i * (cardW + gap), 44, cardW, cardH, true);
		}
	}

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#14532d"/>
  <text x="18" y="28" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#e5e7eb">Community Cards</text>
  ${cardsMarkup}
</svg>`;
}

function buildPokerHandSvg(cards, playerName = 'Player') {
	const cardW = 100;
	const cardH = 140;
	const gap = 12;
	const width = 36 + cards.length * cardW + (cards.length - 1) * gap;
	const height = 206;

	let cardsMarkup = '';
	cards.forEach((card, i) => {
		cardsMarkup += renderCard(card, 18 + i * (cardW + gap), 44, cardW, cardH, false);
	});

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#1f2937"/>
  <text x="18" y="28" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#e5e7eb">${escapeXml(playerName)} Hand</text>
  ${cardsMarkup}
</svg>`;
}

function blackjackBoardAttachment(playerCards, dealerCards, options = {}, filename = 'blackjack-board.svg') {
	const svg = buildBlackjackBoardSvg(playerCards, dealerCards, options);
	return svgAsBestAttachment(svg, filename);
}

function pokerCommunityAttachment(communityCards, filename = 'poker-board.svg') {
	const svg = buildPokerCommunitySvg(communityCards);
	return svgAsBestAttachment(svg, filename);
}

function pokerHandAttachment(cards, playerName = 'Player', filename = 'poker-hand.svg') {
	const svg = buildPokerHandSvg(cards, playerName);
	return svgAsBestAttachment(svg, filename);
}

function svgAsBestAttachment(svg, filename) {
	const pngName = filename.replace(/\.svg$/i, '.png');

	const asPng = svgToPngBuffer(svg);
	if (asPng) {
		return new AttachmentBuilder(asPng, { name: pngName });
	}

	// Return null if conversion fails - will trigger fallback to individual card assets
	return null;
}

function svgToPngBuffer(svg) {
	const rsvg = spawnSync('rsvg-convert', ['-f', 'png'], {
		input: Buffer.from(svg, 'utf8'),
		maxBuffer: 10 * 1024 * 1024
	});

	if (rsvg.status === 0 && rsvg.stdout) {
		return Buffer.isBuffer(rsvg.stdout) ? rsvg.stdout : Buffer.from(rsvg.stdout);
	}

	const magick = spawnSync('magick', ['svg:-', 'png:-'], {
		input: Buffer.from(svg, 'utf8'),
		maxBuffer: 10 * 1024 * 1024
	});

	if (magick.status === 0 && magick.stdout) {
		return Buffer.isBuffer(magick.stdout) ? magick.stdout : Buffer.from(magick.stdout);
	}

	return null;
}

function escapeXml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

module.exports = {
	blackjackBoardAttachment,
	blackjackCardAttachments,
	pokerCommunityAttachment,
	pokerCommunityCardAttachments,
	pokerHandAttachment,
	pokerHandCardAttachments,
	supportsBoardImageRendering
};
