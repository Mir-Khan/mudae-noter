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
        name: 'generating and confirming a $ec command sets every character\'s color, updates the raw input text, and refreshes the card outline',
        async run(page) {
            await loadDemoCollection(page);
            const totalChars = await page.evaluate(() => {
                let n = 0;
                for (const s in AppState.seriesData) n += AppState.seriesData[s].characters.length;
                return n;
            });

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorWheelCanvas');
            await page.click('#colorWheelCanvas', { position: { x: 170, y: 60 } });
            const hex = (await page.inputValue('#colorHexInput')).toLowerCase();

            await page.click('button:has-text("All Characters")');
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
        // Regression test for: there was previously no way to tell which
        // characters "Selected Only" would affect before clicking it.
        name: '"Show Selected" lists exactly the currently-selected (non-excluded) characters',
        async run(page) {
            await loadDemoCollection(page);

            // Deselect one character on the Notes tab first.
            const deselectedName = await page.locator('.character-card').first().locator('.character-name').textContent();
            await page.locator('.character-card').first().click();

            const expectedSelectedCount = await page.evaluate(() => {
                let n = 0;
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) if (!c.excluded) n++;
                }
                return n;
            });

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorWheelCanvas');

            const summaryText = await page.locator('#colorSelectedSummary').textContent();
            assert.ok(summaryText.includes(String(expectedSelectedCount)),
                `expected the summary to mention ${expectedSelectedCount} selected characters, got: "${summaryText}"`);

            await page.click('#colorSelectedToggleBtn');
            await page.waitForTimeout(100);
            const listVisible = await page.locator('#colorSelectedList').isVisible();
            assert.ok(listVisible, 'expected the selected-characters list to become visible after clicking Show Selected');

            const listText = await page.locator('#colorSelectedList').textContent();
            assert.ok(!listText.includes(deselectedName) || deselectedName.length === 0,
                `expected the deselected character ("${deselectedName}") to be absent from the selected list`);
        }
    },
    {
        name: 'confirming a "Selected Only" $ec command skips deselected characters',
        async run(page) {
            await loadDemoCollection(page);
            await page.locator('.character-card').first().click(); // deselect one

            const deselectedKey = await page.evaluate(() => {
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) {
                        if (c.excluded) return { series: s, name: c.name, colorBefore: c.color || '' };
                    }
                }
                return null;
            });
            assert.ok(deselectedKey, 'expected exactly one deselected character to exist');

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorWheelCanvas');
            await page.click('#colorWheelCanvas', { position: { x: 170, y: 60 } });
            await page.click('button:has-text("Selected Only")');
            await page.waitForSelector('.command-text');
            await page.click('.confirm-applied-btn:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const stillUnchanged = await page.evaluate((key) => {
                const c = AppState.seriesData[key.series].characters.find(ch => ch.name === key.name);
                return (c.color || '') === key.colorBefore;
            }, deselectedKey);
            assert.ok(stillUnchanged, 'expected the deselected character\'s color to be left alone by "Selected Only"');
        }
    }
];
