const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        name: 'clicking the wheel picks a color and updates the hex input',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorWheelCanvas');

            const hexBefore = await page.inputValue('#colorHexInput');
            await page.click('#colorWheelCanvas', { position: { x: 170, y: 60 } });
            await page.waitForTimeout(100);
            const hexAfter = await page.inputValue('#colorHexInput');

            assert.match(hexAfter, /^#[0-9A-F]{6}$/i, `expected a valid hex color, got: ${hexAfter}`);
            assert.notStrictEqual(hexAfter, hexBefore, 'expected clicking a different point on the wheel to change the picked color');
        }
    },
    {
        // Regression test for a real report: applying a color used to write
        // straight into AppState without a Discord round-trip, and the
        // Notes-tab card outline (which reads char.color) only refreshed
        // when grouped by color, so it could look completely unchanged
        // after "applying" a new color.
        name: 'generating and confirming a $ec command sets every keyed character\'s color, updates the raw input text, and refreshes the card outline',
        async run(page) {
            await loadDemoCollection(page);
            // Every demo character holds at least one key, so "All Keyed
            // Characters" should still cover the whole collection here.
            const totalChars = await page.evaluate(() => {
                let n = 0;
                for (const s in AppState.seriesData) n += AppState.seriesData[s].characters.length;
                return n;
            });

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorWheelCanvas');
            await page.click('#colorWheelCanvas', { position: { x: 170, y: 60 } });
            const hex = (await page.inputValue('#colorHexInput')).toLowerCase();

            await page.click('button:has-text("All Keyed Characters")');
            await page.waitForSelector('.command-text');

            const commandText = await page.locator('.command-text').first().textContent();
            assert.ok(commandText.startsWith('$ec '), `expected a $ec command, got: "${commandText}"`);
            assert.ok(commandText.includes(hex), `expected the command to include the picked color ${hex}, got: "${commandText}"`);
            const namesInCommand = commandText.slice('$ec '.length).split(' $ ')[0].split('$').length;
            assert.strictEqual(namesInCommand, totalChars, `expected the command to list all ${totalChars} characters, got ${namesInCommand}`);

            // Nothing should be applied yet - only generated.
            const beforeConfirm = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters[0].color || '');
            assert.notStrictEqual(beforeConfirm.toLowerCase(), hex, 'expected the color to NOT be applied before confirming');

            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const allMatch = await page.evaluate((expectedHex) => {
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) {
                        if ((c.color || '').toLowerCase() !== expectedHex) return false;
                    }
                }
                return true;
            }, hex);
            assert.ok(allMatch, 'expected every character in AppState to have the applied color after confirming');

            const rawInputHasColor = await page.evaluate(() => AppState.rawInput.toLowerCase());
            assert.ok(rawInputHasColor.includes(hex), 'expected the raw parse-input text to include the new color after confirming');
            const mainInputValue = (await page.inputValue('#input')).toLowerCase();
            assert.ok(mainInputValue.includes(hex), 'expected the main input textarea to reflect the new color after confirming');

            await page.click('#tab-notes-btn');
            const outlineColor = await page.locator('.character-card').first().evaluate(el => getComputedStyle(el).borderColor);
            const expectedRgb = await page.evaluate((h) => {
                const div = document.createElement('div');
                div.style.color = h;
                document.body.appendChild(div);
                const rgb = getComputedStyle(div).color;
                document.body.removeChild(div);
                return rgb;
            }, hex);
            assert.strictEqual(outlineColor, expectedRgb, `expected the character card's outline to reflect the newly-confirmed color, got "${outlineColor}" vs expected "${expectedRgb}"`);
        }
    },
    {
        // Regression test for a real report: the Colors tab used to target
        // whatever was selected/deselected on the Notes tab, which was
        // confusing to work across two tabs for. It now has its own grid and
        // selection, scoped to characters holding a key.
        name: 'the Colors tab has its own character grid (scoped to keyed characters) with its own selection, independent of the Notes tab',
        async run(page) {
            await loadDemoCollection(page);

            const keyedCount = await page.evaluate(() => {
                let n = 0;
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) if ((parseInt(c.keys) || 0) > 0) n++;
                }
                return n;
            });
            assert.ok(keyedCount > 0, 'expected the demo collection to have at least one keyed character for this test to be meaningful');

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorCharacterGrid .sort-character-item');

            const gridCardCount = await page.locator('#colorCharacterGrid .sort-character-item').count();
            assert.strictEqual(gridCardCount, keyedCount, `expected the Colors tab grid to list exactly the keyed characters, got ${gridCardCount} cards for ${keyedCount} keyed characters`);

            const summaryBefore = await page.locator('#colorSelectedSummary').textContent();
            assert.ok(summaryBefore.includes(`0 of ${keyedCount}`), `expected nothing selected initially, got: "${summaryBefore}"`);

            await page.locator('#colorCharacterGrid .sort-character-item').first().click();
            await page.waitForTimeout(100);
            const summaryAfter = await page.locator('#colorSelectedSummary').textContent();
            assert.ok(summaryAfter.includes(`1 of ${keyedCount}`), `expected the summary to reflect the click, got: "${summaryAfter}"`);

            await page.click('#colorsTabPanel button:has-text("Clear Selection")');
            await page.waitForTimeout(100);
            const summaryCleared = await page.locator('#colorSelectedSummary').textContent();
            assert.ok(summaryCleared.includes(`0 of ${keyedCount}`), `expected Clear Selection to reset the count, got: "${summaryCleared}"`);

            await page.click('#colorsTabPanel button:has-text("Select Shown")');
            await page.waitForTimeout(100);
            const summarySelectAll = await page.locator('#colorSelectedSummary').textContent();
            assert.ok(summarySelectAll.includes(`${keyedCount} of ${keyedCount}`), `expected Select Shown to select every visible card, got: "${summarySelectAll}"`);
        }
    },
    {
        name: 'searching the Colors tab grid filters to matching keyed characters',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorCharacterGrid .sort-character-item');

            const targetName = await page.locator('#colorCharacterGrid .sort-item-name').first().textContent();
            await page.fill('#colorGridSearchInput', targetName.trim());
            await page.waitForTimeout(100);

            const visibleCount = await page.locator('#colorCharacterGrid .sort-character-item').count();
            assert.strictEqual(visibleCount, 1, `expected exactly one keyed character to match "${targetName.trim()}", got ${visibleCount}`);

            await page.click('#colorsTabPanel button:has-text("Reset Filter")');
            await page.waitForTimeout(100);
            const searchValue = await page.inputValue('#colorGridSearchInput');
            assert.strictEqual(searchValue, '', 'expected Reset Filter to clear the search box');
        }
    },
    {
        name: '"No Color Only" filters the Colors tab grid to keyed characters that don\'t have a color yet',
        async run(page) {
            await loadDemoCollection(page);

            // The demo data gives every character a color already - clear
            // exactly one so there's a real, controlled mix to filter.
            const uncoloredCount = 1;
            await page.evaluate(() => {
                const s = Object.keys(AppState.seriesData)[0];
                AppState.seriesData[s].characters[0].color = '';
            });

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorCharacterGrid .sort-character-item');
            const totalKeyed = await page.locator('#colorCharacterGrid .sort-character-item').count();

            await page.click('#colorGridNoColorOnlyBtn');
            await page.waitForTimeout(100);

            const visibleAfter = await page.locator('#colorCharacterGrid .sort-character-item').count();
            assert.strictEqual(visibleAfter, uncoloredCount, `expected only the one uncolored keyed character to remain visible, got ${visibleAfter}`);

            const anyColorDots = await page.locator('#colorCharacterGrid .sort-color-dot').count();
            assert.strictEqual(anyColorDots, 0, 'expected none of the remaining visible cards to already have a color');

            const btnActive = await page.locator('#colorGridNoColorOnlyBtn').evaluate(el => el.classList.contains('active'));
            assert.ok(btnActive, 'expected the toggle button to show as active while the filter is on');

            await page.click('#colorGridNoColorOnlyBtn');
            await page.waitForTimeout(100);
            const visibleAfterToggleOff = await page.locator('#colorCharacterGrid .sort-character-item').count();
            assert.strictEqual(visibleAfterToggleOff, totalKeyed, 'expected toggling the filter back off to restore every keyed character');
        }
    },
    {
        // Regression test for a real report: "Selected Only" used to target
        // whatever was selected/deselected on the Notes tab - it now only
        // targets characters checked in the Colors tab's own grid, so a
        // Notes-tab deselection should have zero effect here.
        name: 'confirming a "Selected Only" $ec command only covers characters selected in the Colors tab grid, ignoring Notes tab selection',
        async run(page) {
            await loadDemoCollection(page);

            // Deselect a character on the Notes tab - this should be
            // completely irrelevant to the Colors tab now.
            await page.locator('.character-card').first().click();

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorCharacterGrid .sort-character-item');

            const pickedName = await page.locator('#colorCharacterGrid .sort-item-name').first().textContent();
            await page.locator('#colorCharacterGrid .sort-character-item').first().click();
            await page.waitForTimeout(100);

            await page.click('#colorWheelCanvas', { position: { x: 170, y: 60 } });
            const hex = (await page.inputValue('#colorHexInput')).toLowerCase();
            await page.click('button:has-text("Selected Only")');
            await page.waitForSelector('.command-text');
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const colors = await page.evaluate(() => {
                const result = {};
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) result[c.name] = (c.color || '').toLowerCase();
                }
                return result;
            });

            const pickedTrimmed = pickedName.trim();
            assert.strictEqual(colors[pickedTrimmed], hex, `expected the character checked in the Colors tab grid to get the new color, got: ${JSON.stringify(colors)}`);

            const othersUnchanged = Object.keys(colors).filter(function (n) { return n !== pickedTrimmed; }).every(function (n) { return colors[n] !== hex; });
            assert.ok(othersUnchanged, `expected characters NOT checked in the Colors tab grid to be untouched regardless of Notes-tab selection, got: ${JSON.stringify(colors)}`);
        }
    },
    {
        // Regression test for a real report: the series-card group's bulk
        // "apply color" widget (on the Notes tab) wrote directly into
        // AppState.seriesData but skipped the raw parse-input text resync
        // that every other character-editing flow (Add Characters, the
        // Colors tab's own confirm flow) does.
        name: 'applying a color via a series group\'s bulk color widget updates the raw parse-input text too',
        async run(page) {
            await loadDemoCollection(page);

            const group = page.locator('.series-card').filter({ hasText: 'Dungeon Meshi' });
            await group.locator('.color-hex-input').fill('#123abc');
            await group.locator('[data-action="bulk-color"][data-target="all"]').click();
            await page.waitForTimeout(150);

            const rawInput = await page.evaluate(() => AppState.rawInput.toLowerCase());
            assert.ok(rawInput.includes('#123abc'), `expected AppState.rawInput to include the newly-applied color, got a snippet: ${rawInput.slice(0, 200)}`);

            const mainInputValue = (await page.inputValue('#input')).toLowerCase();
            assert.ok(mainInputValue.includes('#123abc'), 'expected the main input textarea to reflect the newly-applied color too');
        }
    }
];
