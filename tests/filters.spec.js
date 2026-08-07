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
    }
];
