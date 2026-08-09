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

            // The freshest release isn't guaranteed to have fix items itself
            // (some are feature-only) - the full history always does, so use
            // that (via the "What's New" link's handler) to exercise the
            // collapse behavior regardless of which release is newest.
            await page.click('#changelogOverlay button:has-text("Got it")');
            await page.evaluate(() => showChangelog());
            await page.locator('#changelogOverlay').waitFor({ state: 'visible', timeout: 5000 });

            const fixesList = page.locator('#changelogBody .changelog-fixes-list').first();
            await assert.doesNotReject(fixesList.waitFor({ state: 'attached', timeout: 2000 }), 'expected a fixes list to exist in this release');
            assert.strictEqual(await fixesList.isVisible(), false, 'expected the fixes list to be collapsed by default');

            const toggle = page.locator('#changelogBody .changelog-fixes-toggle').first();
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
    },
    {
        // Regression test for a real report: once the auto-popup has been
        // dismissed, there was no way to bring it back up to double-check
        // what had actually shipped - the "What's New" link fixes that.
        name: 'the "What\'s New" link reopens the changelog with the full history, even after it was already dismissed',
        async run(page) {
            await page.goto(APP_URL);
            await page.locator('#changelogOverlay').waitFor({ state: 'visible', timeout: 5000 });
            await page.click('#changelogOverlay button:has-text("Got it")');
            assert.ok(await page.locator('#changelogOverlay').isHidden(), 'expected the popup to be dismissed before testing the link');

            await page.click('button:has-text("What\'s New")');
            await page.locator('#changelogOverlay').waitFor({ state: 'visible', timeout: 5000 });

            const entryCount = await page.locator('#changelogBody .changelog-entry').count();
            assert.ok(entryCount > 1, `expected the manually-opened changelog to show its full history (more than just the latest release), got ${entryCount} entries`);
        }
    }
];
