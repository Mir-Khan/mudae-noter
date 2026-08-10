const assert = require('assert');
const path = require('path');
const { dismissChangelogIfPresent } = require('./helpers');

const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'test-image.png');

module.exports = [
    {
        name: 'opening the modal pre-fills a previously saved token, and saving persists it',
        async run(page) {
            await dismissChangelogIfPresent(page);

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
            const initialToken = await page.inputValue('#imgChestTokenInput');
            assert.strictEqual(initialToken, '', 'expected no token pre-filled on first use');

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.click('#imgChestUploadOverlay button:has-text("Close")');

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
            const reopenedToken = await page.inputValue('#imgChestTokenInput');
            assert.strictEqual(reopenedToken, 'my-test-token', 'expected the saved token to persist across closing/reopening the modal');
        }
    },
    {
        name: 'clicking Upload with no token saved shows an error and makes no network request',
        async run(page) {
            await dismissChangelogIfPresent(page);

            let requestMade = false;
            await page.route('https://api.imgchest.com/**', (route) => { requestMade = true; route.abort(); });

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(requestMade, false, 'expected no request to ImgChest without a saved token');
        }
    },
    {
        name: 'clicking Upload with no file chosen shows an error and makes no network request',
        async run(page) {
            await dismissChangelogIfPresent(page);

            let requestMade = false;
            await page.route('https://api.imgchest.com/**', (route) => { requestMade = true; route.abort(); });

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.click('#imgChestUploadBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(requestMade, false, 'expected no request to ImgChest without a chosen file');
        }
    },
    {
        name: 'a successful upload shows the returned link with a working copy button',
        async run(page) {
            await dismissChangelogIfPresent(page);

            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });
            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            const linkText = await page.locator('#imgChestUploadStatus .command-text').textContent();
            assert.strictEqual(linkText, 'https://cdn.imgchest.com/files/test123.png', `expected the uploaded link to be shown, got: "${linkText}"`);

            await page.click('#imgChestUploadStatus button');
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, 'https://cdn.imgchest.com/files/test123.png', 'expected the copy button to copy the exact link');

            const uploadBtnState = await page.locator('#imgChestUploadBtn').evaluate(el => ({ disabled: el.disabled, text: el.textContent }));
            assert.strictEqual(uploadBtnState.disabled, false, 'expected the Upload button to be re-enabled after success');
            assert.strictEqual(uploadBtnState.text, 'Upload', 'expected the Upload button to restore its normal label');
        }
    },
    {
        name: 'a failed/blocked upload shows an error and restores the Upload button',
        async run(page) {
            await dismissChangelogIfPresent(page);

            // A non-OK response (e.g. a bad token). Chromium itself always
            // logs a "Failed to load resource" console error for any failed
            // fetch, regardless of cause - that's the browser's own network
            // logging, not a bug in this app's error handling, so it's
            // filtered out of the run's console-error check below rather
            // than left to fail every deliberately-simulated-failure test.
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
            });

            await page.click('#uploadImageBtn');
            await page.waitForSelector('#imgChestUploadOverlay', { state: 'visible' });
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
