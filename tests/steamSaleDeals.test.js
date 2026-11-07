/**
 * Tests for utils/steam/steamSaleDeals.js
 * Covers: search-row parsing, featured-deal parsing, merging, filtering/ranking.
 *
 * Written against the project's own runner (node tests/run-all.js) — plain Node,
 * no Jest globals.
 */
'use strict';

const assert = require('assert');

const {
  DEFAULT_DEAL_SETTINGS,
  formatCents,
  mergeDealLists,
  parseFeaturedDeal,
  parseFeaturedDeals,
  parseCheapSharkDeal,
  parseCheapSharkDeals,
  parseSearchDealRow,
  parseSearchDealRows,
  scoreDeal,
  selectDeals,
} = require('../utils/steam/steamSaleDeals');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

const ROW_WITH_REVIEWS = `<a href="https://store.steampowered.com/app/252490/Rust/?snr=1_7_7_2300_150_2"
 data-ds-appid="252490" data-ds-itemkey="App_252490" data-ds-tagids="[1662,1702]" class="search_result_row ds_collapse_flag "
 data-search-page="1" data-gpnav="item">
 <div class="search_capsule"><img src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252490/abc/capsule_231x87.jpg?t=1" ></div>
 <div class="responsive_search_name_combined">
 <div class="search_name ellipsis">
 <span class="title">Rust</span>
 </div>
 <div class="search_released responsive_secondrow">
 8 Feb, 2018 </div>
 <div class="search_reviewscore responsive_secondrow">
 <span class="search_review_summary very_positive" data-tooltip-html="Very Positive&lt;br&gt;87% of the 1,088 user reviews for this game are positive."></span>
 </div>
 <div class="search_price_discount_combined responsive_secondrow" data-price-final="1999">
 <div class="search_discount_and_price responsive_secondrow">
 <div class="discount_block search_discount_block" data-price-final="1999" data-bundlediscount="0" data-discount="50"><div class="discount_pct" aria-hidden="true">-50%</div><div class="discount_prices" aria-hidden="true"><div class="discount_original_price">39,99€</div><div class="discount_final_price">19,99€</div></div></div>
 </div>
 </div>
 </div>
 </a>`;

const ROW_WITHOUT_DISCOUNT = `<a href="https://store.steampowered.com/app/999/Free_Thing/" data-ds-appid="999"
 class="search_result_row">
 <div class="search_name ellipsis"><span class="title">Free Thing</span></div>
 <div class="search_price_discount_combined responsive_secondrow" data-price-final="0"></div>
 </a>`;

// ── parseSearchDealRow ───────────────────────────────────────────────────────
console.log('\nparseSearchDealRow');

test('parses appId, title, discount and prices', () => {
  const deal = parseSearchDealRow(ROW_WITH_REVIEWS, { region: 'sk' });

  assert.strictEqual(deal.appId, '252490');
  assert.strictEqual(deal.title, 'Rust');
  assert.strictEqual(deal.discountPercent, 50);
  assert.strictEqual(deal.priceOriginal, '39,99€');
  assert.strictEqual(deal.priceFinal, '19,99€');
  assert.strictEqual(deal.url, 'https://store.steampowered.com/app/252490/');
});

test('parses review stats from the tooltip', () => {
  const deal = parseSearchDealRow(ROW_WITH_REVIEWS);

  assert.strictEqual(deal.reviewPercent, 87);
  assert.strictEqual(deal.reviewCount, 1088);
  assert.strictEqual(deal.reviewSummary, 'Very Positive');
});

test('builds a header image url and keeps the capsule', () => {
  const deal = parseSearchDealRow(ROW_WITH_REVIEWS);

  assert.ok(deal.imageUrl.includes('/steam/apps/252490/header.jpg'));
  assert.ok(deal.capsuleUrl.includes('capsule_231x87.jpg'));
});

test('skips rows without a discount', () => {
  assert.strictEqual(parseSearchDealRow(ROW_WITHOUT_DISCOUNT), null);
});

test('skips garbage input', () => {
  assert.strictEqual(parseSearchDealRow(''), null);
  assert.strictEqual(parseSearchDealRow(null), null);
  assert.strictEqual(parseSearchDealRow('<div>nope</div>'), null);
});

// ── parseSearchDealRows ──────────────────────────────────────────────────────
console.log('\nparseSearchDealRows');

test('parses all discount rows on a page', () => {
  const deals = parseSearchDealRows(
    ROW_WITH_REVIEWS + '\n' + ROW_WITHOUT_DISCOUNT + '\n' + ROW_WITH_REVIEWS
  );

  assert.strictEqual(deals.length, 2);
  assert.strictEqual(deals[0].appId, '252490');
  assert.ok(deals.every((deal) => deal.discountPercent === 50));
});

// ── featured deals ───────────────────────────────────────────────────────────
console.log('\nparseFeaturedDeal');

test('parses a featured special and its expiry', () => {
  const deal = parseFeaturedDeal({
    id: 252490,
    name: 'Rust',
    discount_percent: 50,
    original_price: 3999,
    final_price: 1999,
    currency: 'EUR',
    discount_expiration: 1794416439,
    header_image: 'https://cdn.example/header.jpg',
  });

  assert.strictEqual(deal.appId, '252490');
  assert.strictEqual(deal.priceOriginal, '39,99€');
  assert.strictEqual(deal.priceFinal, '19,99€');
  assert.strictEqual(deal.endsAt, new Date(1794416439 * 1000).toISOString());
  assert.strictEqual(deal.source, 'steam_featured');
});

test('rejects featured entries without a discount', () => {
  assert.strictEqual(parseFeaturedDeal({ id: 1, name: 'X', discount_percent: 0 }), null);
  assert.strictEqual(parseFeaturedDeal({ name: 'X', discount_percent: 20 }), null);
  assert.strictEqual(parseFeaturedDeal(null), null);
});

test('parses a featuredcategories payload', () => {
  const deals = parseFeaturedDeals({
    specials: {
      items: [
        {
          id: 1,
          name: 'A',
          discount_percent: 20,
          original_price: 1000,
          final_price: 800,
          currency: 'EUR',
        },
        { id: 2, name: 'B', discount_percent: 0 },
      ],
    },
  });

  assert.strictEqual(deals.length, 1);
  assert.strictEqual(deals[0].title, 'A');
});

test('formatCents renders EUR and USD', () => {
  assert.strictEqual(formatCents(1999, 'EUR'), '19,99€');
  assert.strictEqual(formatCents(1999, 'USD'), '$19.99');
  assert.strictEqual(formatCents(0, 'EUR'), null);
});

// ── CheapShark fallback deals ────────────────────────────────────────────────
console.log('\nparseCheapSharkDeals');

const CHEAPSHARK_ITEM = {
  title: 'Rust',
  steamAppID: '252490',
  salePrice: '19.99',
  normalPrice: '39.99',
  savings: '50.012',
  steamRatingText: 'Very Positive',
  steamRatingPercent: '87',
  steamRatingCount: '1088',
  thumb: 'https://cdn.example/thumb.jpg',
};

test('parses a CheapShark deal into the shared deal shape', () => {
  const deal = parseCheapSharkDeal(CHEAPSHARK_ITEM);

  assert.strictEqual(deal.appId, '252490');
  assert.strictEqual(deal.discountPercent, 50);
  assert.strictEqual(deal.priceOriginal, '$39.99');
  assert.strictEqual(deal.priceFinal, '$19.99');
  assert.strictEqual(deal.reviewPercent, 87);
  assert.strictEqual(deal.reviewCount, 1088);
  assert.strictEqual(deal.source, 'cheapshark');
  assert.ok(deal.url.endsWith('/app/252490/'));
});

test('skips CheapShark deals without a Steam app id or discount', () => {
  assert.strictEqual(parseCheapSharkDeal({ title: 'No App', savings: '50' }), null);
  assert.strictEqual(parseCheapSharkDeal({ title: 'Tiny', steamAppID: '1', savings: '2' }), null);
  assert.strictEqual(parseCheapSharkDeal(null), null);
});

test('parses a CheapShark payload array', () => {
  const deals = parseCheapSharkDeals([CHEAPSHARK_ITEM, { title: 'bad' }]);
  assert.strictEqual(deals.length, 1);
});

// ── mergeDealLists ───────────────────────────────────────────────────────────
console.log('\nmergeDealLists');
test('dedupes by appId and keeps the bigger discount', () => {
  const merged = mergeDealLists(
    [{ appId: '1', title: 'A', discountPercent: 20 }],
    [{ appId: '1', title: 'A', discountPercent: 70 }],
    [{ appId: '2', title: 'B', discountPercent: 50 }]
  );

  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged.find((deal) => deal.appId === '1').discountPercent, 70);
});

test('enriches an entry with review data from another source', () => {
  const merged = mergeDealLists(
    [{ appId: '1', title: 'A', discountPercent: 50, reviewCount: 0, priceOriginal: null }],
    [{ appId: '1', title: 'A', discountPercent: 50, reviewCount: 5000, priceOriginal: '9,99€' }]
  );

  assert.strictEqual(merged[0].reviewCount, 5000);
  assert.strictEqual(merged[0].priceOriginal, '9,99€');
});

// ── selectDeals ──────────────────────────────────────────────────────────────
console.log('\nselectDeals');

const DEALS = [
  {
    appId: '1',
    title: 'Junk Asset Flip',
    discountPercent: 95,
    reviewCount: 0,
    reviewPercent: null,
  },
  { appId: '2', title: 'Mixed Bag', discountPercent: 90, reviewCount: 5000, reviewPercent: 55 },
  {
    appId: '3',
    title: 'Beloved Classic',
    discountPercent: 80,
    reviewCount: 120000,
    reviewPercent: 96,
  },
  {
    appId: '4',
    title: 'Small Discount',
    discountPercent: 20,
    reviewCount: 9000,
    reviewPercent: 95,
  },
];

test('drops low-review, low-rated and shallow-discount games', () => {
  const selected = selectDeals(DEALS, { minDiscountPercent: 50, minReviewCount: 100 });
  const ids = selected.map((deal) => deal.appId);

  assert.deepStrictEqual(ids, ['3']);
});

test('respects minReviewPercent', () => {
  const selected = selectDeals(DEALS, {
    minDiscountPercent: 50,
    minReviewCount: 100,
    minReviewPercent: 0,
  });

  assert.ok(selected.some((deal) => deal.appId === '2'));
});

test('applies the limit', () => {
  const selected = selectDeals(DEALS, { minDiscountPercent: 0, minReviewCount: 0, limit: 2 });
  assert.strictEqual(selected.length, 2);
});

test('uses sensible defaults', () => {
  assert.strictEqual(DEFAULT_DEAL_SETTINGS.minDiscountPercent, 50);
  assert.ok(DEFAULT_DEAL_SETTINGS.dealPostIntervalHours >= 1);
});

test('score favours deeper discounts and ties break on reviews', () => {
  assert.ok(
    scoreDeal({ discountPercent: 90, reviewCount: 1000 }) >
      scoreDeal({ discountPercent: 20, reviewCount: 100000 })
  );
  assert.ok(
    scoreDeal({ discountPercent: 50, reviewCount: 100000 }) >
      scoreDeal({ discountPercent: 50, reviewCount: 100 })
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
