const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Order-of-operations regression test: sorting by note then
        // confirming a series order must NOT scramble the note ordering
        // that was already established within each series - series-order
        // confirm only reorders which series come first, not the
        // characters inside them.
        name: 'confirming a note order, then a series order, preserves the note ordering within each series',
        async run(page) {
            await loadDemoCollection(page);

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

            const orderAfterNoteConfirm = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters.map(c => c.name));
            assert.strictEqual(orderAfterNoteConfirm[0], secondCharName, 'expected the note-priority character to be first before touching series order at all');

            // Now confirm a (reversed) series order on top of that.
            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            await page.evaluate(() => { AppState.seriesOrder = getSyncedSeriesOrder().slice().reverse(); });
            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const orderAfterSeriesConfirm = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters.map(c => c.name));
            assert.deepStrictEqual(orderAfterSeriesConfirm, orderAfterNoteConfirm,
                `expected the within-series note ordering to survive a subsequent series-order confirm untouched, got: ${JSON.stringify(orderAfterSeriesConfirm)}`);
        }
    },
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
        // Regression test for a real report: confirming a series order (or
        // note order) updated AppState.seriesData but left AppState.sortData
        // - the separate flat list driving the Sort tab's own grid/list and
        // its $sm/$smpos generation - untouched, so the Sort tab kept
        // showing the old order until manually dragged.
        name: 'confirming a series order also reorders AppState.sortData to match',
        async run(page) {
            await loadDemoCollection(page);

            const sortInputText = await page.evaluate(() => {
                const lines = [];
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => {
                        lines.push(`${c.name} - ${seriesName} ${c.kakera || 1} ka`);
                    });
                }
                return lines.join('\n');
            });

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', sortInputText);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            const desiredOrder = await page.evaluate(() => {
                const order = getSyncedSeriesOrder().slice().reverse();
                AppState.seriesOrder = order;
                return order;
            });

            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            // The series each sortData entry belongs to, in first-seen
            // order, should now follow the confirmed (reversed) series order.
            const sortDataSeriesOrder = await page.evaluate(() => {
                const seen = [];
                AppState.sortData.forEach(e => { if (!seen.includes(e.series)) seen.push(e.series); });
                return seen;
            });
            assert.deepStrictEqual(sortDataSeriesOrder, desiredOrder,
                `expected AppState.sortData's series grouping to follow the confirmed series order, got: ${JSON.stringify(sortDataSeriesOrder)}`);
        }
    },
    {
        name: 'confirming a note order also reorders AppState.sortData to match',
        async run(page) {
            await loadDemoCollection(page);

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

            await page.click('#tab-notes-btn');
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

            const firstSortDataName = await page.evaluate(() => AppState.sortData.filter(e => e.series === 'Dungeon Meshi')[0].name);
            assert.strictEqual(firstSortDataName, secondCharName,
                `expected the top-priority-noted character to now be first in AppState.sortData too, got: ${firstSortDataName}`);
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
