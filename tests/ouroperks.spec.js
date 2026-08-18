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
    }
];
