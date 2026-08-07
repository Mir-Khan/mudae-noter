const assert = require('assert');
const { APP_URL } = require('./helpers');

// This spec intentionally does NOT use helpers.newPage(), since that helper
// auto-dismisses the changelog popup for every other test's convenience -
// here we need to observe it before dismissal.
module.exports = [
    {
        name: 'the "What\'s New" popup appears on a fresh visit and lists an item',
        async run(page) {
            await page.goto(APP_URL);
            const overlay = page.locator('#changelogOverlay');
            await overlay.waitFor({ state: 'visible', timeout: 5000 });

            const bodyText = await page.locator('#changelogBody').textContent();
            assert.ok(bodyText.trim().length > 0, 'expected the changelog body to list at least one item');
        }
    },
    {
        // Regression test for: bug fixes used to be listed right alongside
        // new features, which is noise most users don't need - they should
        // only see them if they go looking.
        name: 'bug fixes are collapsed behind a toggle, not shown by default',
        async run(page) {
            await page.goto(APP_URL);
            await page.locator('#changelogOverlay').waitFor({ state: 'visible', timeout: 5000 });

            const fixesList = page.locator('#changelogBody .changelog-fixes-list');
            await assert.doesNotReject(fixesList.waitFor({ state: 'attached', timeout: 2000 }), 'expected a fixes list to exist in this release');
            assert.strictEqual(await fixesList.isVisible(), false, 'expected the fixes list to be collapsed by default');

            const toggle = page.locator('#changelogBody .changelog-fixes-toggle');
            const toggleTextBefore = await toggle.textContent();
            assert.match(toggleTextBefore, /^Show \d+ bug fix/, `expected a "Show N bug fixes" toggle, got: "${toggleTextBefore}"`);

            await toggle.click();
            assert.strictEqual(await fixesList.isVisible(), true, 'expected the fixes list to become visible after clicking the toggle');
            const toggleTextAfter = await toggle.textContent();
            assert.match(toggleTextAfter, /^Hide bug fix/, `expected the toggle to flip to "Hide bug fixes", got: "${toggleTextAfter}"`);
        }
    },
    {
        name: 'dismissing the popup hides it and it does not reappear on the next visit',
        async run(page) {
            await page.goto(APP_URL);
            await page.locator('#changelogOverlay').waitFor({ state: 'visible', timeout: 5000 });

            await page.click('#changelogOverlay button:has-text("Got it")');
            const hiddenNow = await page.locator('#changelogOverlay').isHidden();
            assert.ok(hiddenNow, 'expected the popup to hide immediately after clicking Got it');

            await page.reload();
            await page.waitForSelector('#tab-notes-btn');
            const overlayDisplay = await page.locator('#changelogOverlay').evaluate(el => getComputedStyle(el).display);
            assert.strictEqual(overlayDisplay, 'none', 'expected the popup to stay dismissed on a later visit in the same browser');
        }
    }
];
