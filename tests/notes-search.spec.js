const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for a real report: with a large harem, the only
        // search box was buried in the Options panel, far from the actual
        // character grid it filters - this adds a second one right above
        // the grid that stays in sync with the original.
        name: 'the search box above the character grid filters characters and stays in sync with the Options panel search',
        async run(page) {
            await loadDemoCollection(page);

            const targetName = await page.locator('.character-card').first().locator('.character-name').textContent();
            const totalCards = await page.locator('.character-card').count();
            assert.ok(totalCards > 1, 'expected more than one character in the demo collection for this test to be meaningful');

            await page.fill('#notesSearchInputTop', targetName.trim());
            await page.waitForTimeout(150);

            const visibleCards = await page.locator('.character-card:not(.hidden-char)').count();
            assert.strictEqual(visibleCards, 1, `expected exactly one visible character card after searching for "${targetName.trim()}", got ${visibleCards}`);

            const optionsFieldValue = await page.inputValue('#notesSearchInput');
            assert.strictEqual(optionsFieldValue, targetName.trim(), 'expected the Options panel search box to mirror the top search box\'s value');

            await page.click('.notes-top-search-bar button:has-text("Reset")');
            await page.waitForTimeout(150);

            const visibleAfterReset = await page.locator('.character-card:not(.hidden-char)').count();
            assert.strictEqual(visibleAfterReset, totalCards, 'expected Reset to clear both search boxes and show all characters again');
            const optionsFieldAfterReset = await page.inputValue('#notesSearchInput');
            assert.strictEqual(optionsFieldAfterReset, '', 'expected the Options panel search box to also clear on Reset');
        }
    }
];
