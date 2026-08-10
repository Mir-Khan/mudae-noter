const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for: applyFilter() only ever set char.excluded = true
        // and never back to false, so re-applying a looser filter left
        // previously-hidden characters stuck hidden.
        name: 'loosening the Min/Max Keys filter un-hides characters again',
        async run(page) {
            await loadDemoCollection(page);

            await page.fill('#min-keys', '1');
            await page.fill('#max-keys', '1');
            await page.click('button:has-text("Apply Filter")');
            await page.waitForTimeout(150);
            const excludedAfterStrictFilter = await page.locator('.character-card.excluded').count();
            assert.ok(excludedAfterStrictFilter > 0, 'expected the strict keys=1 filter to exclude at least one demo character');

            await page.fill('#min-keys', '0');
            await page.fill('#max-keys', '');
            await page.click('button:has-text("Apply Filter")');
            await page.waitForTimeout(150);
            const excludedAfterLooseFilter = await page.locator('.character-card.excluded').count();
            assert.strictEqual(excludedAfterLooseFilter, 0, 'loosening the filter back to "any" should un-hide everything the filter itself had hidden');
        }
    },
    {
        name: 'Clear Filter (Revert) restores manual deselections made before filtering',
        async run(page) {
            await loadDemoCollection(page);

            // Manually deselect one character before touching the filter at all.
            await page.locator('.character-card').first().click();
            const manuallyExcludedBefore = await page.locator('.character-card.excluded').count();
            assert.strictEqual(manuallyExcludedBefore, 1, 'expected exactly the one manually-clicked card to be excluded');

            await page.fill('#min-keys', '1');
            await page.fill('#max-keys', '1');
            await page.click('button:has-text("Apply Filter")');
            await page.waitForTimeout(150);

            await page.click('button:has-text("Revert")');
            await page.waitForTimeout(150);
            const excludedAfterRevert = await page.locator('.character-card.excluded').count();
            assert.strictEqual(excludedAfterRevert, 1, 'Revert should restore exactly the pre-filter manual selection state, not clear it entirely');
        }
    },
    {
        name: '"Disabled Only" series filter shows only series where every character is disabled',
        async run(page) {
            await loadDemoCollection(page);

            // Make Monogatari (a single-character series in the demo data)
            // fully disabled, leaving the rest untouched.
            await page.evaluate(() => {
                AppState.seriesData['Monogatari'].characters.forEach(c => { c.isDisabled = true; });
                displaySeries();
            });
            await page.waitForTimeout(100);

            const totalSeriesBefore = await page.locator('.series-card').count();
            assert.ok(totalSeriesBefore > 1, 'expected more than one series in the demo collection for this test to be meaningful');

            await page.click('#disabled-series-only-btn');
            await page.waitForTimeout(150);

            const visibleSeriesNames = await page.locator('.series-card .series-title').allTextContents();
            assert.deepStrictEqual(visibleSeriesNames, ['Monogatari'], `expected only the fully-disabled series to show, got: ${JSON.stringify(visibleSeriesNames)}`);

            await page.click('#disabled-series-all-btn');
            await page.waitForTimeout(150);
            const visibleSeriesAfterReset = await page.locator('.series-card').count();
            assert.strictEqual(visibleSeriesAfterReset, totalSeriesBefore, 'expected switching back to "All" to restore every series');
        }
    },
    {
        // Regression test for a real report: grouping by color used to make
        // one group per exact hex value, fragmenting into many tiny groups
        // instead of anything useful to scan.
        name: 'grouping by color produces exactly two groups: Colored and No Color',
        async run(page) {
            await loadDemoCollection(page);

            // Give a couple of demo characters distinct colors, leave the
            // rest uncolored, so both buckets are populated.
            await page.evaluate(() => {
                AppState.seriesData['Dungeon Meshi'].characters[0].color = '#ff0000';
                AppState.seriesData['One Piece'].characters[0].color = '#00ff00';
                AppState.seriesData['Dungeon Meshi'].characters[1].color = '';
            });

            await page.click('#group-color-btn');
            await page.waitForTimeout(150);

            const groupTitles = await page.locator('.series-title').allTextContents();
            assert.deepStrictEqual(groupTitles.slice().sort(), ['Colored', 'No Color'], `expected exactly two color groups, got: ${JSON.stringify(groupTitles)}`);
        }
    },
    {
        // Regression test for a real report: no way to find characters with
        // a custom (non-mudae.net) image at a glance, e.g. after uploading
        // one via ImgChest, without scanning every card's URL by hand.
        name: 'grouping by "Custom Image" splits characters by whether their image is hosted on mudae.net or elsewhere',
        async run(page) {
            await loadDemoCollection(page);

            // Every demo character starts with a mudae.net image - give one
            // a custom host and clear another's entirely, so all three
            // buckets are populated.
            await page.evaluate(() => {
                AppState.seriesData['Dungeon Meshi'].characters[0].image = 'https://cdn.imgchest.com/files/example.png';
                AppState.seriesData['Dungeon Meshi'].characters[1].image = '';
            });

            await page.click('#group-customimage-btn');
            await page.waitForTimeout(150);

            const groupTitles = await page.locator('.series-title').allTextContents();
            assert.deepStrictEqual(groupTitles.slice().sort(), ['Custom Image', 'Mudae.net Image', 'No Image'], `expected exactly three groups, got: ${JSON.stringify(groupTitles)}`);

            const customGroupCount = await page.evaluate(() => {
                let n = 0;
                for (const s in AppState.seriesData) {
                    AppState.seriesData[s].characters.forEach(c => { if (c.image && !c.image.includes('mudae.net')) n++; });
                }
                return n;
            });
            assert.strictEqual(customGroupCount, 1, 'expected exactly one character with a custom-hosted image');
        }
    }
];
