const assert = require('assert');
const path = require('path');
const { loadDemoCollection } = require('./helpers');

const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'test-image.png');

// Shared setup: open the per-character "Pick an Image" modal, where the
// ImgChest upload section now lives (tied to that specific character).
async function openUploadSectionForFirstCharacter(page) {
    await loadDemoCollection(page);
    const card = page.locator('.character-card').first();
    const name = (await card.locator('.character-name').textContent()).trim();
    await card.locator('[data-action="edit-image"]').click();
    await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
    return { card, name };
}

module.exports = [
    {
        name: 'opening the modal pre-fills a previously saved token, and saving persists it',
        async run(page) {
            const { card } = await openUploadSectionForFirstCharacter(page);
            const initialToken = await page.inputValue('#imgChestTokenInput');
            assert.strictEqual(initialToken, '', 'expected no token pre-filled on first use');

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.click('#imsImagePickerOverlay button:has-text("Cancel")');

            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            const reopenedToken = await page.inputValue('#imgChestTokenInput');
            assert.strictEqual(reopenedToken, 'my-test-token', 'expected the saved token to persist across closing/reopening the modal');
        }
    },
    {
        name: 'clicking Upload with no token saved shows an error and makes no network request',
        async run(page) {
            let requestMade = false;
            await page.route('https://api.imgchest.com/**', (route) => { requestMade = true; route.abort(); });

            await openUploadSectionForFirstCharacter(page);
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(requestMade, false, 'expected no request to ImgChest without a saved token');
        }
    },
    {
        name: 'clicking Upload with no file chosen shows an error and makes no network request',
        async run(page) {
            let requestMade = false;
            await page.route('https://api.imgchest.com/**', (route) => { requestMade = true; route.abort(); });

            await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.click('#imgChestUploadBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(requestMade, false, 'expected no request to ImgChest without a chosen file');
        }
    },
    {
        // Regression test for a real report: the upload feature needs to be
        // tied to a specific character, generating a $ai command with that
        // character's name so the user can run it in Discord, then confirm
        // it back to update the app's own copy of that character's image.
        name: 'a successful upload generates an $ai command naming the character, and confirming it applies the image',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { card, name } = await openUploadSectionForFirstCharacter(page);

            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            const commandText = await page.locator('#imgChestUploadStatus .command-text').textContent();
            assert.strictEqual(commandText, `$ai ${name}$https://cdn.imgchest.com/files/test123.png`, `expected the exact $ai command for "${name}", got: "${commandText}"`);

            await page.click('#imgChestUploadStatus button:has-text("Copy Command")');
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, commandText, 'expected the copy button to copy the exact $ai command');

            // The image shouldn't be applied yet - only the command was generated.
            const beforeConfirm = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.notStrictEqual(beforeConfirm, 'https://cdn.imgchest.com/files/test123.png', 'expected the image to NOT be applied before confirming');

            await page.click('#imgChestUploadStatus button:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://cdn.imgchest.com/files/test123.png', 'expected confirming to apply the uploaded image to the character');

            const cardImgSrc = await card.locator('img').getAttribute('src');
            assert.strictEqual(cardImgSrc, 'https://cdn.imgchest.com/files/test123.png', 'expected the rendered card image to update immediately');

            const confirmBtnState = await page.locator('#imgChestUploadStatus button:has-text("Applied")').evaluate(el => el.disabled);
            assert.strictEqual(confirmBtnState, true, 'expected the confirm button to disable itself after being applied');

            const uploadBtnState = await page.locator('#imgChestUploadBtn').evaluate(el => ({ disabled: el.disabled, text: el.textContent }));
            assert.strictEqual(uploadBtnState.disabled, false, 'expected the Upload button to be re-enabled after success');
            assert.strictEqual(uploadBtnState.text, 'Upload', 'expected the Upload button to restore its normal label');
        }
    },
    {
        name: 'a failed/blocked upload shows an error and restores the Upload button',
        async run(page) {
            // A non-OK response (e.g. a bad token). Chromium itself always
            // logs a "Failed to load resource" console error for any failed
            // fetch, regardless of cause - that's the browser's own network
            // logging, not a bug in this app's error handling, so it's
            // filtered out of the run's console-error check below rather
            // than left to fail every deliberately-simulated-failure test.
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
            });

            await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForTimeout(300);

            const statusText = await page.locator('#imgChestUploadStatus').textContent();
            assert.ok(/failed/i.test(statusText), `expected a failure message in the status area, got: "${statusText}"`);

            const uploadBtnState = await page.locator('#imgChestUploadBtn').evaluate(el => ({ disabled: el.disabled, text: el.textContent }));
            assert.strictEqual(uploadBtnState.disabled, false, 'expected the Upload button to be re-enabled after a failure');
            assert.strictEqual(uploadBtnState.text, 'Upload', 'expected the Upload button to restore its normal label after a failure');

            page._consoleErrors = page._consoleErrors.filter(e => !e.includes('Failed to load resource'));
        }
    }
];
