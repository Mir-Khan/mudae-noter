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
        name: 'Apply to All Characters sets every character\'s color across the whole collection',
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
            await page.waitForTimeout(150);

            const countText = await page.locator('#colorApplyCount').textContent();
            assert.ok(countText.includes(String(totalChars)), `expected the apply-count message to mention ${totalChars} characters, got: "${countText}"`);

            const allMatch = await page.evaluate((expectedHex) => {
                for (const s in AppState.seriesData) {
                    for (const c of AppState.seriesData[s].characters) {
                        if ((c.color || '').toLowerCase() !== expectedHex) return false;
                    }
                }
                return true;
            }, hex);
            assert.ok(allMatch, 'expected every character in AppState to have the applied color');
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
        name: 'Apply to Selected Only skips deselected characters',
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
            await page.waitForTimeout(150);

            const stillUnchanged = await page.evaluate((key) => {
                const c = AppState.seriesData[key.series].characters.find(ch => ch.name === key.name);
                return (c.color || '') === key.colorBefore;
            }, deselectedKey);
            assert.ok(stillUnchanged, 'expected the deselected character\'s color to be left alone by "Selected Only"');
        }
    }
];
