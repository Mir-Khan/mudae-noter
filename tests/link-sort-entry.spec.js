const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for a real report: Mudae's $mmmka+s output can name
        // a character differently than the Notes tab does (e.g. a Pokedex
        // entry reported by its base-evolution name vs. the Notes tab's
        // evolved-form name), and the kakera-based fallback match is
        // deliberately skipped when that value isn't unique within the
        // series - leaving the Sort tab entry permanently unmatched (no
        // image/note/color) with no automatic fix available.
        name: 'an unmatched Sort tab entry can be manually linked to the correct character, pulling in its image/note/color',
        async run(page) {
            await loadDemoCollection(page);

            // "Totally Different Name" won't auto-match any Notes-tab
            // character by name, and has no kakera collision risk since it's
            // a value not used elsewhere in the demo collection.
            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', 'Totally Different Name - Dungeon Meshi 999999 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const unmatched = await page.evaluate(() => AppState.sortData[0].matched);
            assert.strictEqual(unmatched, false, 'expected the entry to start out unmatched, given the demo collection has no character with that name/kakera');

            await page.click('[data-action="link-character"]');
            await page.waitForSelector('#linkSortEntryOverlay', { state: 'visible' });

            await page.fill('#linkSortEntrySearchInput', 'Marcille');
            await page.click('.link-sort-entry-result-item:has-text("Marcille Donato")');
            await page.waitForTimeout(150);

            const overlayHidden = await page.locator('#linkSortEntryOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close after linking');

            const entry = await page.evaluate(() => AppState.sortData[0]);
            assert.strictEqual(entry.matched, true, 'expected the entry to be matched after linking');
            assert.strictEqual(entry.name, 'Totally Different Name', 'expected the entry to keep the name Mudae actually reported, not switch to the linked character\'s name');
            assert.strictEqual(entry.kakera, '999999', 'expected the entry to keep its own kakera value from the $mmmka+s paste');
            assert.ok(entry.image, 'expected the entry to now have an image pulled from the linked character');

            const thumbHasImage = await page.locator('.sort-character-item img').count();
            assert.strictEqual(thumbHasImage, 1, 'expected the Sort tab card to now render the linked character\'s image');
        }
    }
];
