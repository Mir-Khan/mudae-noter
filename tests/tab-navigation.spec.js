const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        name: 'switching tabs and back restores the scroll position each tab was left at',
        async run(page) {
            await loadDemoCollection(page);

            // Scroll the Notes tab down, then switch to Sort and scroll it
            // to a different position, then switch back and forth to make
            // sure each tab's own position is remembered independently.
            await page.evaluate(() => window.scrollTo(0, 400));
            await page.waitForTimeout(100);
            const notesScrollBefore = await page.evaluate(() => window.scrollY);
            assert.ok(notesScrollBefore > 0, 'expected the Notes tab to actually have scrolled');

            await page.click('#tab-sort-btn');
            await page.waitForTimeout(100);
            const sortScrollOnArrival = await page.evaluate(() => window.scrollY);
            assert.strictEqual(sortScrollOnArrival, 0, 'expected the Sort tab to start at the top the first time it\'s visited');

            await page.evaluate(() => window.scrollTo(0, 150));
            await page.waitForTimeout(100);

            await page.click('#tab-notes-btn');
            await page.waitForTimeout(100);
            const notesScrollRestored = await page.evaluate(() => window.scrollY);
            assert.strictEqual(notesScrollRestored, notesScrollBefore, `expected the Notes tab to restore its remembered scroll position, got ${notesScrollRestored} instead of ${notesScrollBefore}`);

            await page.click('#tab-sort-btn');
            await page.waitForTimeout(100);
            const sortScrollRestored = await page.evaluate(() => window.scrollY);
            assert.strictEqual(sortScrollRestored, 150, `expected the Sort tab to restore its own remembered scroll position, got ${sortScrollRestored}`);
        }
    }
];
