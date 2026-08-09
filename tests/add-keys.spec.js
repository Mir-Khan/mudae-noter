const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for a real report: bumping a character's key count
        // used to require pasting a whole fresh $ec-style command through
        // Discord just to reflect keys gained in-app. Clicking the Keys stat
        // badge now opens an inline "+N" field that adds onto the existing
        // count directly, and keeps the raw parse-input textarea in sync
        // like every other in-place character edit.
        name: 'clicking the Keys stat badge adds to a character\'s key count and updates the raw input text',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const before = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].keys;
            });
            const beforeKeys = parseInt(before) || 0;

            await card.locator('[data-action="add-keys"]').click();
            await page.waitForTimeout(100);

            const activeIsInput = await page.evaluate(() => document.activeElement.tagName === 'INPUT');
            assert.ok(activeIsInput, 'expected an inline input to appear and take focus after clicking the Keys badge');

            await page.keyboard.type('5');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);

            const after = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].keys;
            });
            assert.strictEqual(parseInt(after), beforeKeys + 5, `expected keys to increase by 5, got ${before} -> ${after}`);

            const badgeText = await card.locator('[data-action="add-keys"] .stat-badge-value').textContent();
            assert.strictEqual(badgeText, String(beforeKeys + 5), `expected the badge to show the updated key count, got "${badgeText}"`);

            const rawInputHasNewKeys = await page.evaluate((k) => AppState.rawInput.includes(`(${k})`), beforeKeys + 5);
            assert.ok(rawInputHasNewKeys, 'expected the raw parse-input text to include the updated key count');
            const mainInputValue = await page.inputValue('#input');
            assert.ok(mainInputValue.includes(`(${beforeKeys + 5})`), 'expected the main input textarea to reflect the updated key count too');
        }
    },
    {
        name: 'the Keys badge click does not toggle the character\'s selection',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const excludedBefore = await card.evaluate(el => el.classList.contains('excluded'));

            await card.locator('[data-action="add-keys"]').click();
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);

            const excludedAfter = await card.evaluate(el => el.classList.contains('excluded'));
            assert.strictEqual(excludedAfter, excludedBefore, 'expected clicking the Keys badge to not also toggle the character card selection');
        }
    }
];
