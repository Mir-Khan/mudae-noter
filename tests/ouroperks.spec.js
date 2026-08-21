const assert = require('assert');
const { dismissChangelogIfPresent, loadDemoCollection } = require('./helpers');

async function openOurosphereTab(page) {
    await dismissChangelogIfPresent(page);
    await page.click('#tab-ourosphere-btn');
    await page.waitForSelector('#ouroPerksCharacterList');
}

// Trimmed but real slice of the user's own $mmz= paste - covers the header,
// a note-marker'd name, a plain name with no markers, and the stray "Image"
// placeholder line a message with an inline character image can copy as.
const REAL_INVESTMENT_TEXT = `Total invested: 75,000 :sp:

Nico Robin | ’‘♡♥|⚚⚚⚚ 11,000 sp
Snow (Rykers) | ṋat♥ 1,000 sp
Sung Jin-Woo 1,000 sp
Image`;

const REAL_OPP_TEXT = `[LVL 6]  Spawn chance increased for character(s) next to this one in your $wishlist: 100%
[LVL 0]  Base kakera value increased: 0 > 20
[LVL 0]  Chance to get +1 kakera button under this character: 0 > 7%
[LVL 6]  Chance to get +1 key for this character: 25%
[LVL 0]  Spheres earned per kakera button (except purple) clicked by you when you roll this character: 0 > 3
[LVL 0]  A random character from your wishlist might automatically appear after you roll this character (2% chance). If unclaimed, this character is wishprotected. If already claimed by you, you get 3 Omega keys (see $ok)
[LVL 0]  Kakera buttons can turn into chaos kakera when you roll this character (1% chance per kakera except for red, light, dark and rainbow)
[LVL 0]  Spawn with 4 kakera buttons (no purple) costing half the power when you roll them for the first time that day, only you can click. Discount applied to the first 40 clicks of the day. After 40 clicks, spheres earned from perk 5 are doubled on these buttons.
[LVL 0]  A sphere button appears when you roll this character for the first time that day. 1/7 to get 1 $oq per click. Up to 10 spheres clicked per day, only you can click.
[MAX]  The first $oh of the day generates +20 spheres and has +1% chance to give 1 $oq`;

// The exact real paste from the user's $ouroshop, missing bracket, embedded
// zero-width-space "blank" lines, and shop 6/9's unbracketed continuation
// line all reproduced faithfully.
const REAL_OSHOP_TEXT = `LVL 0]  A part of the spawn chance bonus applied by perk 1 is also applied to the character upgraded. Part: 0% > 10%
​
[LVL 0]  A megasphere has 1/50 to appear when you roll any of your claimed characters. 1 megasphere per day (increased with perk 2, see $s megasphere). Number of rewards per megasphere: 0 > 3
​
[LVL 0]  The additional kakera button spawned by perk 3 has a chance to never include blue kakera (or yellow if Sapphire IV): 0% > 10%
​
[LVL 0]  When you get a key thanks to perk 4, there is a chance to get an Omega key. These keys can be added to any character of your collection (see $ok). Chance: 0% > 5%
​
[LVL 0]  When a kakera button gives spheres thanks to perk 5, there is a slight chance to get +1 $ot. Chance for each sphere earned (multiplied by the number of spheres given by the perk 5 level, the value displayed with $op): 0% > 0.014%
[LVL 0]  The wish spawned from perk 6 has a chance to be an unclaimed wish from your wishlist if there is any. This claim is free and indicated with a green background (limited to one time per day). Chance: 0% > 1%
Claimed wishes that you own spawned from perk 6 have a chance to give +1 Omega key: 0% > 50%
​
[LVL 0]  All chaos kakera spawned by perk 7 have a chance to give double rewards (except for special character spawns and discount), indicated with a blue background: 0% > 2%
​
[LVL 0]  On characters fully upgraded, the kakera buttons of perk 8 give more kakera. Boost (additive with $bk): 0% > 5%
​
[LVL 0]  More sphere buttons spawned by perk 9 can be clicked per day: +0 > +1
Spheres clicked from perk 9 give more spheres: 0% > 10%
​
[LVL 0]  The first $oh of the day has a chance to give 1 $ot for each character you have fully upgraded (120 characters max): +0% > +0.25%`;

module.exports = [
    {
        name: 'importing $mmz= investment totals shows a character per line, strips note markers, ignores the stray "Image" line, and captures the account total',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', REAL_INVESTMENT_TEXT);
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            const names = await page.locator('#ouroPerksCharacterList .ouro-card-name').allTextContents();
            assert.deepStrictEqual(names, ['Nico Robin', 'Snow (Rykers)', 'Sung Jin-Woo']);

            const store = await page.evaluate(() => currentOuroperks());
            const robin = Object.values(store.entries).find(e => e.name === 'Nico Robin');
            assert.strictEqual(robin.totalInvestedSp, 11000);
            assert.strictEqual(store.totalAccountInvestedSp, 75000);
        }
    },
    {
        name: 'a character with a matching name in the loaded collection shows its real thumbnail/series; an unmatched name is flagged "not in this collection"',
        async run(page) {
            await loadDemoCollection(page);
            const firstChar = await page.evaluate(() => {
                const seriesName = Object.keys(AppState.seriesData)[0];
                return { name: AppState.seriesData[seriesName].characters[0].name, series: seriesName };
            });

            await page.click('#tab-ourosphere-btn');
            await page.fill('#ouroInvestmentInput', `Total invested: 1,000 :sp:\n\n${firstChar.name} 1,000 sp\nSome Totally Unmatched Name 500 sp`);
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            const items = await page.locator('#ouroPerksCharacterList .ouro-character-card').all();
            const seriesTexts = await Promise.all(items.map(async (item) => (await item.locator('.ouro-card-series').textContent())));
            assert.ok(seriesTexts.includes(firstChar.series), `expected the matched character's real series (${firstChar.series}) to show, got: ${JSON.stringify(seriesTexts)}`);
            assert.ok(seriesTexts.some(t => /not in collection/i.test(t)), `expected the unmatched name to be flagged, got: ${JSON.stringify(seriesTexts)}`);
        }
    },
    {
        // Regression test for a real report: "my sphere data isn't being
        // saved." Root cause was that a character tracked BEFORE their
        // name could match anyone in the loaded collection (no collection
        // loaded yet, or the collection hadn't been (re)parsed) gets an
        // entry key with no series in it. The moment a match later
        // becomes available, the key changes (it's derived from the
        // series name) - without a migration, the next import call would
        // silently create a second, empty entry under the new key instead
        // of reusing the one with the real data, orphaning it.
        name: 'a character tracked before the collection could match them keeps their perk data once a match becomes available, instead of it being silently orphaned under a duplicate entry',
        async run(page) {
            await openOurosphereTab(page);
            // Track perks + investment while nothing can match ("Saber" is
            // not yet anywhere in AppState.seriesData).
            await page.fill('#ouroInvestmentInput', 'Saber 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            const beforeMatch = await page.evaluate(() => {
                const store = currentOuroperks();
                return { count: store.order.length, entry: store.entries[store.order[0]] };
            });
            assert.strictEqual(beforeMatch.count, 1);
            assert.strictEqual(beforeMatch.entry.series, null);
            assert.strictEqual(beforeMatch.entry.perks[0].level, 6);

            // A collection now resolves "Saber" to a real series - same
            // effect as loading/parsing a collection that has her.
            await page.evaluate(() => {
                AppState.seriesData['Fate/stay night'] = { characters: [{ name: 'Saber', image: '', kakera: 0 }] };
                saveToLocalStorage();
            });

            // Any later import call re-resolves the match and must not
            // create a second entry.
            await page.fill('#ouroInvestmentInput', 'Saber 6,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            const afterMatch = await page.evaluate(() => {
                const store = currentOuroperks();
                return { count: store.order.length, entry: store.entries[store.order[0]] };
            });
            assert.strictEqual(afterMatch.count, 1, `expected still exactly one tracked entry for Saber, not a duplicate - got ${afterMatch.count}`);
            assert.strictEqual(afterMatch.entry.series, 'Fate/stay night', 'expected the entry to pick up the resolved series');
            assert.strictEqual(afterMatch.entry.perks[0].level, 6, 'expected the previously-pasted perk data to survive the match, not be orphaned under a stale key');
            assert.strictEqual(afterMatch.entry.totalInvestedSp, 6000, 'expected the fresh investment total to land on the same (migrated) entry');

            const cards = await page.locator('#ouroPerksCharacterList .ouro-character-card').count();
            assert.strictEqual(cards, 1, `expected exactly one character card for Saber, not a duplicate - got ${cards}`);
        }
    },
    {
        name: 'pasting a real $opp result for a tracked character fills in all 10 perk levels, correctly distinguishing [LVL 6] from [MAX]',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Nico Robin 11,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT);
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            const statuses = await page.locator('#ouroPerksDetailList .ouro-perk-status').allTextContents();
            // Perk 1 and Perk 4 are at level 6 but NOT yet at the bonus "Max"
            // tier (the paste showed "[LVL 6]", not "[MAX]"); perk 10 (the
            // last of the single-purchase perks) is genuinely maxed.
            assert.strictEqual(statuses[0], 'LVL 6');
            assert.strictEqual(statuses[3], 'LVL 6');
            assert.strictEqual(statuses[9], 'MAX');
            assert.strictEqual(statuses[1], 'LVL 0');

            const store = await page.evaluate(() => currentOuroperks());
            const robin = Object.values(store.entries).find(e => e.name === 'Nico Robin');
            assert.strictEqual(robin.perks[0].level, 6);
            assert.strictEqual(robin.perks[0].maxed, false);
            assert.strictEqual(robin.perks[9].maxed, true);
        }
    },
    {
        name: 'the perk detail list shows the actual bonus magnitude at the current level, not just the level number',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Nico Robin 11,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT);
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            const values = await page.locator('#ouroPerksDetailList .ouro-perk-value').allTextContents();
            // Perk 4 ("Chance to get +1 key") at LVL 6 (not the Max bonus
            // tier) is 25% per the real $opp screenshot (the wiki table
            // itself listed 26, contradicted by two separate real
            // accounts), not the 30% Max value and not just "LVL 6" repeated.
            assert.strictEqual(values[3], '25%');
            // Perk 2 (LVL 0, never invested) has no magnitude yet.
            assert.strictEqual(values[1], '-');
            // Perk 10 is a single-purchase perk with no numeric wiki
            // value of its own - "Active" once bought.
            assert.strictEqual(values[9], 'Active');
        }
    },
    {
        name: 'the Ouroshop list also shows the actual bonus magnitude per level, including the two paired values on Shop 6/9',
        async run(page) {
            await openOurosphereTab(page);
            await page.click('#ouro-tab-shop-btn');
            await page.fill('#ouroShopPasteInput', REAL_OSHOP_TEXT.replace('LVL 0]  A part', '[LVL 3]  A part')
                .replace('[LVL 0]  The wish spawned', '[LVL 2]  The wish spawned'));
            await page.click('button:has-text("Import Shop Levels")');
            await page.waitForTimeout(100);

            const values = await page.locator('#ouroShopList .ouro-perk-value').allTextContents();
            assert.strictEqual(values[0], '30%');
            assert.strictEqual(values[5], '2% / 100%');
            assert.strictEqual(values[1], '-');
        }
    },
    {
        // Regression test for a real report: a character at "[LVL 6]" on
        // a leveled perk (nothing left to individually buy, matching the
        // "fully maxed" text already shown in the cost column) didn't
        // show up under a "Maxed" filter, because the filter wrongly also
        // required perk.maxed - the separate, rarer flag for the free
        // completion bonus (only earned once ALL 10 of a character's
        // perks are done, which this character's other perks weren't).
        name: 'filtering by a perk and "Maxed" shows characters at that perk\'s level cap, even before the separate all-perks-completed bonus is confirmed',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'MaxedPerk1Char 5,000 sp\nInProgressChar 2,000 sp\nUnstartedChar 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            await page.evaluate(() => {
                const store = currentOuroperks();
                // level 6, maxed:false - exactly the real Nico Robin case
                // (bracket showed "[LVL 6]", not "[MAX]").
                Object.values(store.entries).find(e => e.name === 'MaxedPerk1Char').perks[0] = { level: 6, maxed: false };
                Object.values(store.entries).find(e => e.name === 'InProgressChar').perks[0] = { level: 3, maxed: false };
                renderOuroperksCharacterList();
            });

            await page.selectOption('#ouroPerksFilterPerk', '0');
            await page.selectOption('#ouroPerksFilterState', 'maxed');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('#ouroPerksCharacterList .ouro-card-name').allTextContents(), ['MaxedPerk1Char']);

            await page.selectOption('#ouroPerksFilterState', 'inprogress');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('#ouroPerksCharacterList .ouro-card-name').allTextContents(), ['InProgressChar']);

            await page.selectOption('#ouroPerksFilterState', 'notstarted');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('#ouroPerksCharacterList .ouro-card-name').allTextContents(), ['UnstartedChar']);
        }
    },
    {
        name: 'pasting the real $ouroshop output parses all 10 shop perks despite the missing leading bracket, zero-width-space blank lines, and unbracketed continuation lines for perks 6 and 9',
        async run(page) {
            await openOurosphereTab(page);
            await page.click('#ouro-tab-shop-btn');
            await page.fill('#ouroShopPasteInput', REAL_OSHOP_TEXT);
            await page.click('button:has-text("Import Shop Levels")');
            await page.waitForTimeout(100);

            const rows = await page.locator('#ouroShopList .ouro-perk-row').count();
            assert.strictEqual(rows, 10, 'expected exactly 10 shop perk rows, not a stray extra/missing one from a continuation line');

            const statuses = await page.locator('#ouroShopList .ouro-perk-status').allTextContents();
            assert.deepStrictEqual(statuses, new Array(10).fill('LVL 0'));

            const store = await page.evaluate(() => currentOuroshop());
            assert.strictEqual(store.levels.length, 10);
            assert.ok(store.levels.every(l => l.level === 0));
        }
    },
    {
        name: 'tracked Ourosphere data (perks, investment, shop) persists across a page reload',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Persisted Character 2,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            await page.click('#ouro-tab-shop-btn');
            await page.fill('#ouroShopPasteInput', REAL_OSHOP_TEXT.replace('LVL 0]  A part', '[LVL 3]  A part'));
            await page.click('button:has-text("Import Shop Levels")');
            await page.waitForTimeout(100);

            await page.reload();
            await dismissChangelogIfPresent(page);
            await page.click('#tab-ourosphere-btn');
            await page.waitForSelector('#ouroPerksCharacterList');

            const names = await page.locator('#ouroPerksCharacterList .ouro-card-name').allTextContents();
            assert.ok(names.includes('Persisted Character'));

            const shop1Level = await page.evaluate(() => currentOuroshop().levels[0].level);
            assert.strictEqual(shop1Level, 3);
        }
    },
    {
        name: 'the Wishlist tab\'s self-boost-rate field gets a "Prefill from Ouroshop tracker" button once Shop 1 is tracked, and it fills in level x 10',
        async run(page) {
            await openOurosphereTab(page);
            await page.click('#ouro-tab-shop-btn');
            await page.fill('#ouroShopPasteInput', REAL_OSHOP_TEXT.replace('LVL 0]  A part', '[LVL 4]  A part'));
            await page.click('button:has-text("Import Shop Levels")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.check('#wishlistIsOwnCheckbox');

            const prefillBtn = page.locator('#wishlistPrefillFromOuroshopBtn');
            assert.strictEqual(await prefillBtn.isVisible(), true);
            await prefillBtn.click();

            const value = await page.inputValue('#wishlistCapacitySelfBoostRate');
            assert.strictEqual(value, '40');
        }
    },
    {
        name: 'the self-boost-rate field now accepts up to 100 (Shop 1 is 10% per level across 10 levels, not capped at 10%)',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            const max = await page.getAttribute('#wishlistCapacitySelfBoostRate', 'max');
            assert.strictEqual(max, '100');
        }
    },
    {
        name: 'a tracked Perk 1 level supplies the exact (not inferred) neighbor-boost contribution when importing a matching wishlist',
        async run(page) {
            await openOurosphereTab(page);
            // Level 3 -> confirmed contribution of 45% per the wiki's bonus
            // table, matched by name against the wishlist paste below.
            await page.fill('#ouroInvestmentInput', 'Saber 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT.replace('[LVL 6]  Spawn chance', '[LVL 3]  Spawn chance'));
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'BoosterFromTracker');
            // Yoru is unclaimed (no ✅), sits next to Saber, and shows a
            // +45% that pure neighbor-math couldn't otherwise attribute to
            // anyone without knowing Saber's real Perk 1 level.
            await page.fill('#wishlistTextInput', 'Saber ✅\nYoru +45%');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const saber = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saber.isBooster, true);
            assert.strictEqual(saber.boosterPercent, 45);
            assert.strictEqual(saber.boosterPercentEstimated, false);
        }
    },
    {
        // Regression test for a real report: a tracked Perk 1 level was
        // being pre-seeded into every equation up front, so a stale/wrong
        // tracked value for ONE character could silently override (and,
        // since one contribution feeds into two shared equations, cascade
        // corruption into) a completely different character whose own
        // contribution pure neighbor-math could already solve cleanly
        // from the paste alone. Pure math must always get first priority -
        // the tracker only fills in a character neighbor-math genuinely
        // couldn't resolve on its own.
        name: 'pure neighbor-math wins over a tracked Perk 1 level when it can already solve a character cleanly, instead of a wrong/stale tracked value cascading into neighbors',
        async run(page) {
            await openOurosphereTab(page);
            // Deliberately WRONG tracked value for Makima (45%) - her real
            // contribution, fully solvable from the paste's own numbers
            // alone, is 100%.
            await page.fill('#ouroInvestmentInput', 'Makima 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT.replace('[LVL 6]  Spawn chance', '[LVL 3]  Spawn chance'));
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'PureMathWins');
            // The same real, previously-verified chain: Saber and Makima
            // both solve to 100% from the paste's own math alone - a
            // wrong Makima=45 tracked value must not corrupt Saber's
            // otherwise-clean solve.
            await page.fill('#wishlistTextInput', `Saber ✅
Yoru +200%
Makima ✅ +100%`);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const chars = await page.evaluate(() => wishlistModalCharacters.map(c => ({ name: c.name, boosterPercent: c.boosterPercent })));
            const saber = chars.find(c => c.name === 'Saber');
            const makima = chars.find(c => c.name === 'Makima');
            assert.strictEqual(saber.boosterPercent, 100, `expected Saber's cleanly-solvable contribution to stay 100 despite Makima's wrong tracked value, got: ${JSON.stringify(chars)}`);
            assert.strictEqual(makima.boosterPercent, 100, 'expected Makima\'s own contribution to be the correctly chain-solved 100, not the wrong tracked 45');
        }
    },
    {
        name: 'a tracked Perk 1 level fills in a character neighbor-math genuinely cannot solve on its own (no unclaimed anchor anywhere in the chain)',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Isolated 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'GenuineGap');
            // All three claimed, all shown - no unclaimed anchor anywhere,
            // so pure neighbor-math alone can never resolve any single
            // one of these three contributions.
            await page.fill('#wishlistTextInput', `NeighborA ✅ +100%
Isolated ✅ +100%
NeighborB ✅ +100%`);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const isolated = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Isolated'));
            assert.strictEqual(isolated.isBooster, true);
            assert.strictEqual(isolated.boosterPercent, 100);
        }
    },
    {
        // Regression test for a real report: two boosters can end up
        // sharing ONE equation with genuinely no way to split it (e.g. a
        // neighbor's shown 200% = BoosterA + BoosterB, both completely
        // unknown - any split is mathematically possible), so neither
        // half is confirmed via pure math, and neither is tracked in the
        // Ourosphere tab either. Rather than leave both silently
        // unflagged, each one's own shown boost is assumed as a rough,
        // clearly-unconfirmed stand-in for their own contribution too.
        name: 'two boosters sharing one unsolvable equation each get their own shown boost assumed as an unconfirmed stand-in, flagged distinctly',
        async run(page) {
            await openOurosphereTab(page);
            // Only "Nico Robin" is tracked - Saber and Makima are not.
            await page.fill('#ouroInvestmentInput', 'Nico Robin 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'SharedEquation');
            // Every character claimed, no unclaimed anchor anywhere - Nico
            // Robin's own equation (200 = Saber + Makima) has 2 unknowns
            // and can never be split by pure math alone. A handful of
            // no-shown-value buffer characters (Power/2B/Aqua and Rin
            // Tohsaka/Erza Scarlet) sit on either side so the circular
            // wraparound can't be used to solve it indirectly either -
            // those buffer characters have no shown boost, so their own
            // equations never run and can't relay information around.
            await page.fill('#wishlistTextInput', `Power ✅
2B ✅
Aqua ✅
Esdeath ✅ +100%
Saber ✅ +100%
Nico Robin ✅ +200%
Makima ✅ +100%
Reze ✅ +100%
Rin Tohsaka ✅
Erza Scarlet ✅`);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const chars = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isBooster: c.isBooster, boosterPercent: c.boosterPercent, boosterWarning: c.boosterWarning
            })));
            const saber = chars.find(c => c.name === 'Saber');
            const nicoRobin = chars.find(c => c.name === 'Nico Robin');
            const makima = chars.find(c => c.name === 'Makima');

            assert.deepStrictEqual(saber, { name: 'Saber', isBooster: true, boosterPercent: 100, boosterWarning: 'unconfirmed' });
            assert.deepStrictEqual(makima, { name: 'Makima', isBooster: true, boosterPercent: 100, boosterWarning: 'unconfirmed' });
            // Nico Robin is confirmed via the Ourosphere tracker, and her
            // solved value agrees with it - no warning.
            assert.deepStrictEqual(nicoRobin, { name: 'Nico Robin', isBooster: true, boosterPercent: 100, boosterWarning: null });

            const saberRowText = await page.locator('.wishlist-row', { hasText: 'Saber' }).textContent();
            assert.ok(/unconfirmed/i.test(saberRowText), `expected Saber's row to show the "unconfirmed" warning, got: "${saberRowText}"`);
            const nicoRowText = await page.locator('.wishlist-row', { hasText: 'Nico Robin' }).textContent();
            assert.ok(!/unconfirmed/i.test(nicoRowText), `expected Nico Robin's row (confirmed via the tracker) to show no "unconfirmed" warning, got: "${nicoRowText}"`);

            // Manually editing an unconfirmed value doesn't clear the
            // warning by itself - Saber still has no tracked Ourosphere
            // Perk 1 level at all, so ANY value on her row is still just
            // as unsubstantiated as the one it replaced.
            const saberInput = page.locator('.wishlist-row', { hasText: 'Saber' }).locator('[data-action="boosterPercent"]');
            await saberInput.fill('80');
            await page.waitForTimeout(100);
            const saberAfterEdit = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saberAfterEdit.boosterWarning, 'unconfirmed', 'expected the warning to persist since Ourosphere still has nothing to check the value against');
            const saberRowTextAfter = await page.locator('.wishlist-row', { hasText: 'Saber' }).textContent();
            assert.ok(/unconfirmed/i.test(saberRowTextAfter), 'expected the "unconfirmed" warning to still show after a manual edit with no tracked data to confirm it');
        }
    },
    {
        // Regression test for a real report: typing 0 into an unconfirmed
        // Booster % field, then typing a different number, silently
        // dropped the "unconfirmed" warning - since 0 isn't a meaningful
        // real booster value, it should reset the row (like unchecking
        // Booster) rather than being treated as a real confirmation, so
        // the next guess typed in is still flagged unconfirmed too.
        name: 'typing 0 into an unconfirmed booster % resets it instead of confirming it, so retyping a new guess stays flagged unconfirmed',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Nico Robin 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'ZeroReset');
            await page.fill('#wishlistTextInput', `Power ✅
2B ✅
Aqua ✅
Esdeath ✅ +100%
Saber ✅ +100%
Nico Robin ✅ +200%
Makima ✅ +100%
Reze ✅ +100%
Rin Tohsaka ✅
Erza Scarlet ✅`);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            let saber = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saber.boosterWarning, 'unconfirmed', 'expected Saber to start unconfirmed - no tracked Ourosphere Perk 1 level for her');

            // Typing 0 resets the row like unchecking Booster, clearing the warning.
            await saberRow.locator('[data-action="boosterPercent"]').fill('0');
            await page.waitForTimeout(100);
            saber = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saber.isBooster, false, 'expected typing 0 to uncheck Booster, same as clicking it off');
            assert.strictEqual(saber.boosterPercent, null);
            assert.strictEqual(saber.boosterWarning, null, 'expected no warning once Booster is unset');
            assert.strictEqual(await saberRow.locator('[data-action="booster"]').isChecked(), false);
            const rowTextAfterReset = await saberRow.textContent();
            assert.ok(!/unconfirmed/i.test(rowTextAfterReset), `expected the "unconfirmed" warning hidden while Booster is unchecked, got: "${rowTextAfterReset}"`);

            // Re-checking Booster and typing a fresh guess is still checked
            // against Ourosphere from scratch - still nothing tracked for
            // Saber, so it's still flagged unconfirmed, not silently
            // treated as a real value.
            await saberRow.locator('[data-action="booster"]').check();
            await page.waitForTimeout(100);
            await saberRow.locator('[data-action="boosterPercent"]').type('75');
            await page.waitForTimeout(100);
            saber = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saber.boosterPercent, 75);
            assert.strictEqual(saber.boosterWarning, 'unconfirmed', 'expected the retyped guess to still show the "unconfirmed" warning');
            const rowTextAfterRetype = await saberRow.textContent();
            assert.ok(/unconfirmed/i.test(rowTextAfterRetype), `expected the "unconfirmed" warning to still show, got: "${rowTextAfterRetype}"`);
        }
    },
    {
        // Regression test for a real report/screenshot: unchecking Booster
        // directly (not via typing 0) still left the "unconfirmed" badge
        // showing next to the now-unchecked toggle.
        name: 'unchecking Booster directly also hides the "unconfirmed" warning, and it reappears if a fresh guess is retyped',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'Nico Robin 5,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'UncheckReset');
            await page.fill('#wishlistTextInput', `Power ✅
2B ✅
Aqua ✅
Esdeath ✅ +100%
Saber ✅ +100%
Nico Robin ✅ +200%
Makima ✅ +100%
Reze ✅ +100%
Rin Tohsaka ✅
Erza Scarlet ✅`);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            let rowText = await saberRow.textContent();
            assert.ok(/unconfirmed/i.test(rowText), `expected the "unconfirmed" warning to show initially, got: "${rowText}"`);

            await saberRow.locator('[data-action="booster"]').uncheck();
            await page.waitForTimeout(100);
            rowText = await saberRow.textContent();
            assert.ok(!/unconfirmed/i.test(rowText), `expected the "unconfirmed" warning hidden once Booster is unchecked, got: "${rowText}"`);
            let saber = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Saber'));
            assert.strictEqual(saber.boosterWarning, null, 'expected no warning once Booster is unset');

            await saberRow.locator('[data-action="booster"]').check();
            await page.waitForTimeout(100);
            await saberRow.locator('[data-action="boosterPercent"]').type('60');
            await page.waitForTimeout(100);
            rowText = await saberRow.textContent();
            assert.ok(/unconfirmed/i.test(rowText), `expected the "unconfirmed" warning to pop back up after a fresh guess, got: "${rowText}"`);
        }
    },
    {
        // Regression test for the full spec: a Booster % checked against a
        // character's ACTUALLY tracked Ourosphere Perk 1 level (not just
        // "is anything tracked at all") - disagreeing gets a distinct
        // "doesn't match" warning, agreeing gets no warning at all.
        name: 'a Booster % that disagrees with a tracked Ourosphere Perk 1 level shows a distinct "doesn\'t match" warning, and clears once it agrees',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'TestBooster 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'MismatchTest');
            await page.fill('#wishlistTextInput', 'TestBooster ✅');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const row = page.locator('.wishlist-row', { hasText: 'TestBooster' });
            let tb = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'TestBooster'));
            // Filled straight from the Ourosphere tracker - matches by construction.
            assert.strictEqual(tb.isBooster, true);
            assert.strictEqual(tb.boosterPercent, 100);
            assert.strictEqual(tb.boosterWarning, null);
            let rowText = await row.textContent();
            assert.ok(!/unconfirmed/i.test(rowText) && !/doesn't match/i.test(rowText), `expected no warning while matching, got: "${rowText}"`);

            // Manually override to a DIFFERENT number than the tracked 100%.
            await row.locator('[data-action="boosterPercent"]').fill('80');
            await page.waitForTimeout(100);
            tb = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'TestBooster'));
            assert.strictEqual(tb.boosterWarning, 'mismatch');
            assert.strictEqual(tb.boosterConfirmedPercent, 100);
            rowText = await row.textContent();
            assert.ok(/doesn't match/i.test(rowText), `expected a "doesn't match" warning, got: "${rowText}"`);
            assert.ok(!/unconfirmed/i.test(rowText), 'expected the mismatch warning, not the unconfirmed one - Ourosphere DOES have data for this character');

            // Correcting it back to the tracked value clears the warning.
            await row.locator('[data-action="boosterPercent"]').fill('100');
            await page.waitForTimeout(100);
            tb = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'TestBooster'));
            assert.strictEqual(tb.boosterWarning, null);
            rowText = await row.textContent();
            assert.ok(!/doesn't match/i.test(rowText) && !/unconfirmed/i.test(rowText), `expected no warning once it matches again, got: "${rowText}"`);
        }
    },
    {
        // Regression test for a real gap: the wishlist editor is an inline
        // panel, not a blocking modal, so a real workflow is opening it,
        // noticing an "unconfirmed" row, switching to the Ourosphere tab
        // to paste $opp for that character, then switching back - without
        // a refresh hook, the warning stayed frozen at whatever it was
        // computed as on import, since nothing else re-renders the row
        // list on a tab switch alone.
        name: 'switching to the Ourosphere tab to track a character, then back, clears a now-stale "unconfirmed" warning without needing to re-import',
        async run(page) {
            await openOurosphereTab(page);
            await page.click('#tab-wishlists-btn');
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'StaleWarningTest');
            await page.fill('#wishlistTextInput', 'Makima ✅ +100%\nOther ✅');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const makimaRow = page.locator('.wishlist-row', { hasText: 'Makima' });
            let rowText = await makimaRow.textContent();
            assert.ok(/unconfirmed/i.test(rowText), `expected the "unconfirmed" warning before tracking Makima, got: "${rowText}"`);

            // Track Makima's Perk 1 WITHOUT closing/re-importing the still-open editor.
            await page.click('#tab-ourosphere-btn');
            await page.fill('#ouroInvestmentInput', 'Makima 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');
            await page.fill('#ouroPerksPasteInput', REAL_OPP_TEXT); // LVL 6 -> 100%
            await page.click('button:has-text("Import Perks")');
            await page.waitForTimeout(100);

            await page.click('#tab-wishlists-btn');
            await page.waitForTimeout(100);
            rowText = await makimaRow.textContent();
            assert.ok(!/unconfirmed/i.test(rowText), `expected the "unconfirmed" warning gone after tracking Makima and switching back, got: "${rowText}"`);
            const makima = await page.evaluate(() => wishlistModalCharacters.find(c => c.name === 'Makima'));
            assert.strictEqual(makima.boosterWarning, null);
        }
    },
    {
        name: 'setting a planned target level on a perk shows its cost, and rolls up into the per-character and grand-total summaries',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'PlannerChar 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');

            const rows = page.locator('#ouroPerksDetailList .ouro-perk-row');

            // Perk 1 (leveled) starts at LVL 0 - target LVL 3 costs
            // 200+400+600 = 1200 spheres per the confirmed cost table.
            await rows.nth(0).locator('.ouro-perk-target-select').selectOption('3');
            await page.waitForTimeout(100);

            const planCosts = await page.locator('#ouroPerksDetailList .ouro-perk-plan-cost').allTextContents();
            assert.strictEqual(planCosts[0], '+1,200 sp');

            const perCharSummary = await page.locator('#ouroPerksDetailPlanSummary').textContent();
            assert.ok(/1,200 spheres/.test(perCharSummary), `expected the per-character plan summary to mention 1,200 spheres, got: "${perCharSummary}"`);

            const grandTotal = await page.locator('#ouroPerksPlanSummary').textContent();
            assert.ok(/1,200 spheres/.test(grandTotal), `expected the grand total to mention 1,200 spheres, got: "${grandTotal}"`);

            // A single-purchase perk (6-10) is a checkbox, not a level
            // select - checking it plans the flat 1,000 sp purchase.
            await rows.nth(5).locator('.ouro-perk-target-checkbox input').check();
            await page.waitForTimeout(100);
            const grandTotalAfter = await page.locator('#ouroPerksPlanSummary').textContent();
            assert.ok(/2,200 spheres/.test(grandTotalAfter), `expected the grand total to include the extra 1,000 sp purchase, got: "${grandTotalAfter}"`);

            await page.click('button:has-text("Reset This Character\'s Plan")');
            await page.waitForTimeout(100);
            assert.ok(/no plan set yet/i.test(await page.locator('#ouroPerksPlanSummary').textContent()));
        }
    },
    {
        name: 'a plan spanning multiple characters sums into one grand total, and "Clear All Plans" wipes every character\'s plan',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'PlanCharA 1,000 sp\nPlanCharB 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            const cards = page.locator('#ouroPerksCharacterList .ouro-character-card');
            const rows = page.locator('#ouroPerksDetailList .ouro-perk-row');
            await cards.nth(0).click();
            await rows.nth(0).locator('.ouro-perk-target-select').selectOption('1'); // 200 sp
            await page.waitForTimeout(100);
            await cards.nth(1).click();
            await rows.nth(1).locator('.ouro-perk-target-select').selectOption('1'); // 200 sp
            await page.waitForTimeout(100);

            const grandTotal = await page.locator('#ouroPerksPlanSummary').textContent();
            assert.ok(/400 spheres/.test(grandTotal), `expected both characters' plans to sum to 400 spheres, got: "${grandTotal}"`);

            const breakdown = await page.locator('#ouroPerksPlanBreakdown .ouro-plan-breakdown-item').allTextContents();
            assert.deepStrictEqual(breakdown.sort(), ['PlanCharA: 200 sp', 'PlanCharB: 200 sp'].sort());

            await page.click('button:has-text("Clear All Plans")');
            await page.waitForTimeout(100);
            assert.ok(/no plan set yet/i.test(await page.locator('#ouroPerksPlanSummary').textContent()));
        }
    },
    {
        name: 'a character\'s perk levels can be entered/corrected by hand, without ever pasting $opp',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'ManualChar 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');

            const rows = page.locator('#ouroPerksDetailList .ouro-perk-row');
            // Perk 1 (leveled) - set straight to LVL 4 by hand.
            await rows.nth(0).locator('.ouro-perk-current-select').selectOption('4');
            await page.waitForTimeout(100);
            // Perk 6 (single-purchase) - mark as owned by hand.
            await rows.nth(5).locator('.ouro-perk-current-checkbox input').check();
            await page.waitForTimeout(100);

            const store = await page.evaluate(() => currentOuroperks());
            const entry = Object.values(store.entries).find(e => e.name === 'ManualChar');
            assert.strictEqual(entry.perks[0].level, 4);
            assert.strictEqual(entry.perks[0].maxed, false);
            assert.strictEqual(entry.perks[5].maxed, true);

            const values = await page.locator('#ouroPerksDetailList .ouro-perk-value').allTextContents();
            assert.strictEqual(values[0], '60%'); // perk 1, level 4, per the confirmed bonus table

            // The character grid's maxed-count badge reflects the manual
            // edits too, not just paste-derived ones.
            const badge = await page.locator('#ouroPerksCharacterList .ouro-card-badge').first().textContent();
            assert.ok(/1\/10/.test(badge), `expected 1 of 10 perks (perk 6) to count as maxed, got: "${badge}"`);
        }
    },
    {
        name: 'manually setting a current level above an existing planned target clears the now-stale target',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'StaleTargetChar 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);
            await page.click('#ouroPerksCharacterList .ouro-character-card');

            const rows = page.locator('#ouroPerksDetailList .ouro-perk-row');
            await rows.nth(0).locator('.ouro-perk-target-select').selectOption('3');
            await page.waitForTimeout(100);
            let planCosts = await page.locator('#ouroPerksDetailList .ouro-perk-plan-cost').allTextContents();
            assert.strictEqual(planCosts[0], '+1,200 sp');

            // Manually jumping straight to LVL 5 (past the planned target
            // of 3) should clear that now-meaningless target.
            await rows.nth(0).locator('.ouro-perk-current-select').selectOption('5');
            await page.waitForTimeout(100);
            planCosts = await page.locator('#ouroPerksDetailList .ouro-perk-plan-cost').allTextContents();
            assert.deepStrictEqual(planCosts, []);
        }
    },
    {
        name: 'the Ouroshop account levels can be entered/corrected by hand, without ever pasting $ouroshop',
        async run(page) {
            await openOurosphereTab(page);
            await page.click('#ouro-tab-shop-btn');
            await page.waitForSelector('#ouroShopList .ouro-perk-row');

            const rows = page.locator('#ouroShopList .ouro-perk-row');
            await rows.nth(0).locator('.ouro-perk-current-select').selectOption('3');
            await page.waitForTimeout(100);

            const level = await page.evaluate(() => currentOuroshop().levels[0].level);
            assert.strictEqual(level, 3);
            const statuses = await page.locator('#ouroShopList .ouro-perk-status').allTextContents();
            assert.strictEqual(statuses[0], 'LVL 3');
        }
    },
    {
        // Regression test for a real report: a since-fixed bug could leave
        // the same character tracked under two entries (one an orphaned
        // copy with no collection match/thumbnail) after a collection
        // re-import - "Clean Up Duplicates" merges them back into one,
        // keeping whichever side's data is actually more recent per field
        // rather than always trusting the collection-matched copy.
        name: '"Clean Up Duplicates" merges a character tracked twice, keeping the newer data per field and the collection-matched thumbnail link',
        async run(page) {
            await loadDemoCollection(page);
            const realSeriesName = await page.evaluate(() => Object.keys(AppState.seriesData)[0]);
            const realCharName = await page.evaluate((s) => AppState.seriesData[s].characters[0].name, realSeriesName);
            await openOurosphereTab(page);

            await page.evaluate(({ series, name }) => {
                const store = currentOuroperks();
                const oldKey = ouroperksEntryKey('', name);
                store.entries[oldKey] = {
                    key: oldKey, name: name, series: null,
                    perks: OUROPERK_DEFS.map(() => null), plannedLevels: OUROPERK_DEFS.map(() => null),
                    totalInvestedSp: 8400, perksUpdatedAt: 1000, investmentUpdatedAt: 1000
                };
                store.order.push(oldKey);

                const newKey = ouroperksEntryKey(series, name);
                const perks = OUROPERK_DEFS.map(() => null);
                perks[0] = { level: 6, maxed: false };
                store.entries[newKey] = {
                    key: newKey, name: name, series: series,
                    perks: perks, plannedLevels: OUROPERK_DEFS.map(() => null),
                    totalInvestedSp: 8400, perksUpdatedAt: 2000, investmentUpdatedAt: 500
                };
                store.order.push(newKey);
                saveToLocalStorage();
                renderOuroperksCharacterList();
            }, { series: realSeriesName, name: realCharName });

            const cardsBefore = await page.locator('.ouro-character-card').count();
            assert.strictEqual(cardsBefore, 2, 'expected the duplicate pair to show as two separate cards before cleanup');

            await page.click('button:has-text("Clean Up Duplicates")');
            await page.waitForTimeout(150);

            const cardsAfter = await page.locator('.ouro-character-card').count();
            assert.strictEqual(cardsAfter, 1, 'expected the duplicate pair to merge into a single card');

            const merged = await page.evaluate(() => {
                const store = currentOuroperks();
                const e = store.entries[store.order[0]];
                return { series: e.series, perksUpdatedAt: e.perksUpdatedAt, investmentUpdatedAt: e.investmentUpdatedAt, perk1Level: e.perks[0].level };
            });
            assert.strictEqual(merged.series, realSeriesName, 'expected the collection-matched entry (with the thumbnail link) to be the one kept');
            assert.strictEqual(merged.perksUpdatedAt, 2000, 'expected the newer perks data (2000) to win over the older copy (1000)');
            assert.strictEqual(merged.perk1Level, 6, 'expected the newer side\'s actual perk levels to be what won');
            assert.strictEqual(merged.investmentUpdatedAt, 1000, 'expected the newer investment data (1000) to win over the older copy (500), regardless of which entry it came from');

            // Running it again with nothing left to merge should be a no-op, not an error.
            await page.click('button:has-text("Clean Up Duplicates")');
            await page.waitForTimeout(150);
            const cardsStillOne = await page.locator('.ouro-character-card').count();
            assert.strictEqual(cardsStillOne, 1);
        }
    },
    {
        name: 'a tracked character can be removed from the Ourosphere tab via its delete badge (arm/confirm), without touching the collection itself',
        async run(page) {
            await openOurosphereTab(page);
            await page.fill('#ouroInvestmentInput', 'SoloTracked 1,000 sp');
            await page.click('button:has-text("Import Investment Totals")');
            await page.waitForTimeout(100);

            assert.strictEqual(await page.locator('.ouro-character-card').count(), 1);
            const badge = page.locator('#ouroPerksCharacterList .character-delete-badge');

            await badge.click();
            await page.waitForTimeout(100);
            const stillPresentAfterFirstClick = await page.evaluate(() => currentOuroperks().order.length);
            assert.strictEqual(stillPresentAfterFirstClick, 1, 'expected the first click to only arm the badge, not delete yet');

            await badge.click();
            await page.waitForTimeout(100);
            const orderAfterDelete = await page.evaluate(() => currentOuroperks().order.length);
            assert.strictEqual(orderAfterDelete, 0, 'expected the second click to actually delete the tracked entry');
            assert.strictEqual(await page.locator('.ouro-character-card').count(), 0);
        }
    },
    {
        name: 'the "Any level" filter shows both maxed and in-progress characters together for a chosen perk, unlike "Maxed" alone',
        async run(page) {
            await openOurosphereTab(page);
            await page.evaluate(() => {
                const store = currentOuroperks();
                const inProgressKey = ouroperksEntryKey('S1', 'InProgressChar');
                const p1 = OUROPERK_DEFS.map(() => null); p1[0] = { level: 3, maxed: false };
                store.entries[inProgressKey] = { key: inProgressKey, name: 'InProgressChar', series: null, perks: p1, plannedLevels: OUROPERK_DEFS.map(() => null), totalInvestedSp: null, perksUpdatedAt: 1, investmentUpdatedAt: null };
                store.order.push(inProgressKey);

                const maxedKey = ouroperksEntryKey('S2', 'MaxedChar');
                const p2 = OUROPERK_DEFS.map(() => null); p2[0] = { level: 6, maxed: true };
                store.entries[maxedKey] = { key: maxedKey, name: 'MaxedChar', series: null, perks: p2, plannedLevels: OUROPERK_DEFS.map(() => null), totalInvestedSp: null, perksUpdatedAt: 1, investmentUpdatedAt: null };
                store.order.push(maxedKey);

                const untouchedKey = ouroperksEntryKey('S3', 'UntouchedChar');
                store.entries[untouchedKey] = { key: untouchedKey, name: 'UntouchedChar', series: null, perks: OUROPERK_DEFS.map(() => null), plannedLevels: OUROPERK_DEFS.map(() => null), totalInvestedSp: null, perksUpdatedAt: 1, investmentUpdatedAt: null };
                store.order.push(untouchedKey);

                saveToLocalStorage();
                renderOuroperksCharacterList();
            });

            await page.selectOption('#ouroPerksFilterPerk', '0');
            await page.selectOption('#ouroPerksFilterState', 'anylevel');
            await page.waitForTimeout(100);
            const anyLevelNames = await page.locator('.ouro-card-name').allTextContents();
            assert.deepStrictEqual(anyLevelNames.sort(), ['InProgressChar', 'MaxedChar'], `expected both maxed and in-progress, excluding untouched, got: ${JSON.stringify(anyLevelNames)}`);

            await page.selectOption('#ouroPerksFilterState', 'maxed');
            await page.waitForTimeout(100);
            const maxedNames = await page.locator('.ouro-card-name').allTextContents();
            assert.deepStrictEqual(maxedNames, ['MaxedChar']);

            await page.selectOption('#ouroPerksFilterState', 'inprogress');
            await page.waitForTimeout(100);
            const inProgressNames = await page.locator('.ouro-card-name').allTextContents();
            assert.deepStrictEqual(inProgressNames, ['InProgressChar']);
        }
    },
    {
        // Regression test for a real request: Perk 9's discount only
        // applies once per day, per character - a checklist tracks who's
        // already been rolled today, with both a manual reset and an
        // automatic one once the calendar actually turns over.
        name: 'the Perk 9 Daily Tracker lists only characters who have Perk 9, supports checking off/resetting, and auto-resets once the date changes',
        async run(page) {
            await openOurosphereTab(page);
            await page.evaluate(() => {
                const store = currentOuroperks();
                const withPerk9 = ouroperksEntryKey('S1', 'HasPerk9');
                const p1 = OUROPERK_DEFS.map(() => null); p1[8] = { level: 1, maxed: true };
                store.entries[withPerk9] = { key: withPerk9, name: 'HasPerk9', series: null, perks: p1, plannedLevels: OUROPERK_DEFS.map(() => null), totalInvestedSp: null, perksUpdatedAt: 1, investmentUpdatedAt: null };
                store.order.push(withPerk9);

                const withoutPerk9 = ouroperksEntryKey('S2', 'NoPerk9');
                store.entries[withoutPerk9] = { key: withoutPerk9, name: 'NoPerk9', series: null, perks: OUROPERK_DEFS.map(() => null), plannedLevels: OUROPERK_DEFS.map(() => null), totalInvestedSp: null, perksUpdatedAt: 1, investmentUpdatedAt: null };
                store.order.push(withoutPerk9);

                saveToLocalStorage();
                renderOuroperksCharacterList();
            });

            const trackerText = await page.locator('#ouroPerk9Tracker').textContent();
            assert.ok(trackerText.includes('HasPerk9'), `expected the tracker to list a character with Perk 9, got: "${trackerText}"`);
            assert.ok(!trackerText.includes('NoPerk9'), `expected a character without Perk 9 to be excluded, got: "${trackerText}"`);

            const checkbox = page.locator('#ouroPerk9Tracker input[type="checkbox"]');
            await checkbox.check();
            await page.waitForTimeout(100);
            let activated = await page.evaluate(() => currentOuroperks().perk9Daily.activated.length);
            assert.strictEqual(activated, 1);

            await page.click('button:has-text("Reset All")');
            await page.waitForTimeout(100);
            activated = await page.evaluate(() => currentOuroperks().perk9Daily.activated.length);
            assert.strictEqual(activated, 0, 'expected Reset All to clear the checklist');
            assert.strictEqual(await checkbox.isChecked(), false);

            // Simulate the day having turned over since the tracker was
            // last touched - the very next read should auto-clear it.
            await page.evaluate(() => {
                const store = currentOuroperks();
                store.perk9Daily.date = '2000-01-01';
                store.perk9Daily.activated = ['some-stale-key'];
                saveToLocalStorage();
            });
            const afterAutoReset = await page.evaluate(() => currentOuroperks().perk9Daily);
            const todayStr = new Date().toISOString().slice(0, 10);
            assert.strictEqual(afterAutoReset.date, todayStr, 'expected the stored date to auto-advance to today');
            assert.deepStrictEqual(afterAutoReset.activated, [], 'expected the stale checklist to be cleared automatically once the date no longer matches');
        }
    }
];
