const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        name: 'confirming a series order reorders AppState.seriesData to match',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');

            // Force a specific, non-default series order via the same helper
            // the drag handlers call.
            const desiredOrder = await page.evaluate(() => {
                const order = getSyncedSeriesOrder().slice().reverse();
                AppState.seriesOrder = order;
                return order;
            });

            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const actualOrder = await page.evaluate(() => Object.keys(AppState.seriesData));
            assert.deepStrictEqual(actualOrder, desiredOrder, 'expected AppState.seriesData key order to match the confirmed series order');

            const btnState = await page.locator('.confirm-applied-btn').first();
            assert.ok(await btnState.isDisabled(), 'expected the confirm button to disable itself after use');
        }
    },
    {
        name: 'confirming a note order sorts each series by note priority, leaving un-noted characters after matched ones',
        async run(page) {
            await loadDemoCollection(page);

            // Give two characters in the same series distinct notes so their
            // relative order after confirming is unambiguous to check.
            const groups = page.locator('.series-card');
            const dungeonMeshi = groups.filter({ hasText: 'Dungeon Meshi' });
            const cards = dungeonMeshi.locator('.character-card');
            const secondCharName = await cards.nth(1).locator('.character-name').textContent();
            await cards.nth(1).locator('[data-action="edit-note"]').click();
            await page.keyboard.type('PriorityNote');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(150);

            await page.evaluate(() => { moveNoteEntriesToIndex(['PriorityNote'], 0); });

            await page.click('button:has-text("Generate $smnote Command")');
            await page.waitForTimeout(150);
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const firstCharName = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters[0].name);
            assert.strictEqual(firstCharName, secondCharName, `expected the character with the top-priority note to now be first in its series, got: ${firstCharName}`);
        }
    },
    {
        name: 'confirming a character order reorders each series to match AppState.sortData',
        async run(page) {
            await loadDemoCollection(page);

            // The Sort tab's data comes from a separate $mmmka+s paste, not
            // automatically from the Notes tab - build one from the demo
            // collection's own Dungeon Meshi characters so names/matching
            // are guaranteed to line up.
            const sortInputText = await page.evaluate(() => {
                return AppState.seriesData['Dungeon Meshi'].characters
                    .map(c => `${c.name} - Dungeon Meshi ${c.kakera || 1} ka`)
                    .join('\n');
            });

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', sortInputText);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            // Reverse the sortData order for that series so a real reorder
            // is unambiguous to check.
            const before = await page.evaluate(() => AppState.sortData.filter(e => e.series === 'Dungeon Meshi').map(e => e.name));
            assert.ok(before.length >= 2, 'expected the demo Dungeon Meshi series to have at least 2 characters for this test to be meaningful');

            await page.evaluate(() => {
                const indices = [];
                AppState.sortData.forEach((e, i) => { if (e.series === 'Dungeon Meshi') indices.push(i); });
                const reversedEntries = indices.map(i => AppState.sortData[i]).reverse();
                indices.forEach((idx, k) => { AppState.sortData[idx] = reversedEntries[k]; });
            });

            await page.click('button:has-text("Generate Full $sm Order Command")');
            await page.waitForTimeout(150);
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const after = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters.map(c => c.name));
            assert.deepStrictEqual(after, before.slice().reverse(), `expected Dungeon Meshi's character order to be reversed to match sortData, got: ${JSON.stringify(after)}`);
        }
    }
];
