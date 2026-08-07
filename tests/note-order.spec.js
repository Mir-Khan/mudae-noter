const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        name: 'notes applied to characters show up in the Sort by Notes list',
        async run(page) {
            await loadDemoCollection(page);

            const firstGroup = page.locator('.series-card').first();
            await firstGroup.locator('.note-input').first().fill('TestNoteA');
            await firstGroup.locator('[data-action="bulk-note"][data-target="all"]').click();
            await page.waitForTimeout(150);

            const noteOrderText = await page.locator('#noteOrderList').textContent();
            assert.ok(noteOrderText.includes('TestNoteA'), `expected "TestNoteA" to appear in the note order list, got: ${noteOrderText}`);
        }
    },
    {
        name: 'Generate $smnote Command produces a single command listing the notes in order',
        async run(page) {
            await loadDemoCollection(page);

            const groups = page.locator('.series-card');
            await groups.nth(0).locator('.note-input').first().fill('Alpha');
            await groups.nth(0).locator('[data-action="bulk-note"][data-target="all"]').click();
            await page.waitForTimeout(100);

            await page.click('button:has-text("Generate $smnote Command")');
            await page.waitForTimeout(150);

            const commandItems = await page.locator('#noteOrderCommandOutput .command-item').count();
            assert.strictEqual(commandItems, 1, 'expected exactly one note-order command');

            const commandText = await page.locator('#noteOrderCommandOutput .command-text').first().textContent();
            assert.ok(commandText.startsWith('$smnote '), `expected the $smnote prefix, got: ${commandText.slice(0, 20)}`);
            assert.ok(commandText.includes('Alpha'), `expected the command to include the "Alpha" note, got: ${commandText}`);
        }
    },
    {
        // Same truncate-and-explain behavior as $smseries when even Nitro's
        // limit can't fit the full order - see series-order.spec.js for the
        // fuller version of this test.
        name: 'a note order too long even for Nitro truncates to what fits and still offers a confirm button',
        async run(page) {
            await loadDemoCollection(page);

            const totalSynthetic = 150;
            await page.evaluate((count) => {
                for (let i = 0; i < count; i++) {
                    const seriesName = 'SyntheticSeries' + i;
                    AppState.seriesData[seriesName] = {
                        owned: 1, total: 1, note: '',
                        characters: [{
                            name: 'Char' + i, keys: 1, kakera: 100, color: '', excluded: false, rank: 0,
                            note: 'Some Very Long Synthetic Note Value Number ' + i
                        }]
                    };
                }
            }, totalSynthetic);

            await page.click('button:has-text("Generate $smnote Command")');
            await page.waitForTimeout(150);

            const commandText = await page.locator('#noteOrderCommandOutput .command-text').textContent();
            assert.ok(commandText.length <= 4000, `expected the generated command to be truncated to fit Discord's 4,000 char Nitro limit, got ${commandText.length}`);

            const warningText = await page.locator('#noteOrderCommandOutput .sort-limit-warning').textContent();
            assert.ok(/too long even for Discord Nitro/i.test(warningText), `expected the warning to explain it's over even the Nitro limit, got: "${warningText}"`);
            assert.ok(/left in their current order/i.test(warningText), `expected the warning to explain the excluded notes' characters keep their current order, got: "${warningText}"`);

            const confirmBtn = page.locator('.confirm-applied-btn');
            assert.ok(await confirmBtn.isVisible(), 'expected a confirm button for the partial order that actually fits');
        }
    },
    {
        name: 'dragging a note in the list updates AppState.noteOrder',
        async run(page) {
            await loadDemoCollection(page);

            const groups = page.locator('.series-card');
            await groups.nth(0).locator('.note-input').first().fill('First');
            await groups.nth(0).locator('[data-action="bulk-note"][data-target="all"]').click();
            await page.waitForTimeout(100);
            const secondGroupIndex = (await groups.count()) > 1 ? 1 : 0;
            await groups.nth(secondGroupIndex).locator('.note-input').first().fill('Second');
            await groups.nth(secondGroupIndex).locator('[data-action="bulk-note"][data-target="all"]').click();
            await page.waitForTimeout(100);

            const orderBefore = await page.evaluate(() => AppState.noteOrder.slice());
            assert.ok(orderBefore.includes('First') && orderBefore.includes('Second'), `expected both notes in noteOrder, got: ${JSON.stringify(orderBefore)}`);

            // Move the entry currently at index 1 to the front via the same
            // helper the drag handlers call, rather than simulating raw
            // HTML5 drag events (notoriously unreliable to automate).
            await page.evaluate(() => { moveNoteEntriesToIndex([AppState.noteOrder[1]], 0); });

            const orderAfter = await page.evaluate(() => AppState.noteOrder.slice());
            assert.strictEqual(orderAfter[0], orderBefore[1], `expected the moved note to now be first, got: ${JSON.stringify(orderAfter)}`);
        }
    }
];
