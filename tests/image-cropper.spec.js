const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadDemoCollection } = require('./helpers');

const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'test-image.png');

// The animated-GIF crop path (tests/fixtures/test-animated.gif) depends on
// two real external libraries (gif.js, gifuct-js) fetched from a CDN at
// crop time - deliberately not exercised here, since every other test in
// this suite runs fully offline against the local file:// page. That path
// was verified manually instead: cropping a 100x150, 5-frame test GIF
// produced a valid 225x350 image/gif Blob with all 5 frames intact
// (confirmed via ffprobe) and visually correct (non-garbled) content.
module.exports = [
    {
        name: 'the "Crop this image first" link opens the cropper, pre-loaded with the already-chosen file',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            const workspaceVisible = await page.locator('#imageCropperWorkspace').isVisible();
            assert.ok(workspaceVisible, 'expected the crop workspace to appear immediately since a file was already chosen');
            const useBtnEnabled = await page.locator('#imageCropperUseBtn').isEnabled();
            assert.ok(useBtnEnabled, 'expected "Use This Crop" to be enabled once an image is loaded');
        }
    },
    {
        name: '"Use This Crop" is disabled until an image is loaded, for both entry points',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            // No file chosen in the upload section yet - cropper opens empty.
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            const workspaceVisible = await page.locator('#imageCropperWorkspace').isVisible();
            assert.strictEqual(workspaceVisible, false, 'expected no workspace to show without a source image yet');
            const useBtnDisabled = await page.locator('#imageCropperUseBtn').isDisabled();
            assert.ok(useBtnDisabled, 'expected "Use This Crop" to stay disabled with no image loaded');

            await page.setInputFiles('#imageCropperFileInput', FIXTURE_IMAGE);
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });
            const useBtnNowEnabled = await page.locator('#imageCropperUseBtn').isEnabled();
            assert.ok(useBtnNowEnabled, 'expected "Use This Crop" to enable once a file is picked inside the cropper itself');
        }
    },
    {
        // Regression test for a real report: the "return to upload" flag was
        // being reset immediately after being set, so cropping never
        // actually made it back into the upload flow at all.
        name: 'cropping a static image and confirming feeds a cropped 225x350 PNG back into the upload file input and closes the cropper',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });
            await page.setInputFiles('#imageCropperFileInput', FIXTURE_IMAGE);
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });

            await page.click('#imageCropperUseBtn');
            await page.waitForSelector('#imageCropperOverlay', { state: 'hidden' });

            const uploadFile = await page.evaluate(() => {
                const f = document.getElementById('imgChestFileInput').files[0];
                return f ? { name: f.name, type: f.type, size: f.size } : null;
            });
            assert.ok(uploadFile, 'expected a cropped file to be placed into the upload file input');
            assert.strictEqual(uploadFile.type, 'image/png', 'expected a static-image crop to produce a PNG');
            assert.ok(uploadFile.size > 0, 'expected the cropped file to have real content');

            const dims = await page.evaluate(async () => {
                const f = document.getElementById('imgChestFileInput').files[0];
                const bmp = await createImageBitmap(f);
                return { w: bmp.width, h: bmp.height };
            });
            assert.deepStrictEqual(dims, { w: 225, h: 350 }, `expected the cropped output to be exactly 225x350, got ${JSON.stringify(dims)}`);
        }
    },
    {
        name: 'Cancel closes the cropper without touching the upload file input',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });
            await page.setInputFiles('#imageCropperFileInput', FIXTURE_IMAGE);
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });

            await page.click('#imageCropperOverlay button:has-text("Cancel")');
            const overlayHidden = await page.locator('#imageCropperOverlay').isHidden();
            assert.ok(overlayHidden, 'expected Cancel to close the cropper');

            const uploadFileCount = await page.evaluate(() => document.getElementById('imgChestFileInput').files.length);
            assert.strictEqual(uploadFileCount, 0, 'expected Cancel to leave the upload file input untouched');
        }
    },
    {
        name: 'reopening the cropper after a previous crop starts fresh, not showing the old image or a stale Download button',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });
            await page.setInputFiles('#imageCropperFileInput', FIXTURE_IMAGE);
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });
            await page.click('#imageCropperUseBtn');
            await page.waitForSelector('#imageCropperOverlay', { state: 'hidden' });

            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            const workspaceVisible = await page.locator('#imageCropperWorkspace').isVisible();
            assert.ok(workspaceVisible, 'expected the workspace to reload from the file now sitting in the upload input');
            const downloadBtnVisible = await page.locator('#imageCropperDownloadBtn').isVisible();
            assert.strictEqual(downloadBtnVisible, false, 'expected the Download button from the previous crop to be hidden again until a new crop is made');
        }
    },
    {
        // Regression test for a real report: cropping only ever worked from
        // a locally-chosen file - pasting an image link in the upload
        // section's URL field instead left "Crop this image first" with
        // nothing to crop. It now fetches that link first (the same fetch
        // the "upload from a link" path already does).
        name: 'the "Crop this image first" link fetches a pasted image URL first when no file is chosen',
        async run(page) {
            await page.route('https://i.imgur.com/removed.png', (route) => {
                route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(FIXTURE_IMAGE) });
            });

            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.fill('#imgChestUrlInput', 'https://i.imgur.com/removed.png');
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });

            const useBtnEnabled = await page.locator('#imageCropperUseBtn').isEnabled();
            assert.ok(useBtnEnabled, 'expected the fetched image to load into the cropper');

            await page.click('#imageCropperUseBtn');
            await page.waitForFunction(() => document.getElementById('imgChestFileInput').files.length > 0);

            const fileInfo = await page.evaluate(() => {
                const f = document.getElementById('imgChestFileInput').files[0];
                return f ? { name: f.name, type: f.type } : null;
            });
            assert.ok(fileInfo && /\.png$/i.test(fileInfo.name), `expected the cropped result to land in the file input as a PNG, got: ${JSON.stringify(fileInfo)}`);
            assert.strictEqual(fileInfo.type, 'image/png');

            const urlInputValue = await page.inputValue('#imgChestUrlInput');
            assert.strictEqual(urlInputValue, '', 'expected the pasted URL to be cleared once the cropped result replaces it in the file input');
        }
    },
    {
        name: '"Crop this image first" with neither a file nor a URL opens an empty cropper to pick one manually',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            const workspaceVisible = await page.locator('#imageCropperWorkspace').isVisible();
            assert.strictEqual(workspaceVisible, false, 'expected no workspace without a file or URL to work from');
        }
    },
    {
        // Regression test for a real report: the cropper only ever accepted
        // a locally-chosen file - there was no way to paste a link directly
        // into the cropper itself (only indirectly, via the upload
        // section's own URL field before opening it).
        name: 'the cropper has its own URL field, independent of the upload section\'s',
        async run(page) {
            await page.route('https://i.imgur.com/removed.png', (route) => {
                route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(FIXTURE_IMAGE) });
            });

            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            // Open the cropper with nothing chosen anywhere yet.
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });
            const workspaceVisibleBefore = await page.locator('#imageCropperWorkspace').isVisible();
            assert.strictEqual(workspaceVisibleBefore, false, 'expected nothing loaded yet');

            await page.fill('#imageCropperUrlInput', 'https://i.imgur.com/removed.png');
            await page.click('button:has-text("Load this link")');
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });

            const useBtnEnabled = await page.locator('#imageCropperUseBtn').isEnabled();
            assert.ok(useBtnEnabled, 'expected the fetched link to load into the cropper and enable cropping');
        }
    },
    {
        // Regression test for a real report: an ad blocker/privacy
        // extension can block a *direct* fetch to a third-party CDN (imgur
        // included, on some filter lists) even though the host itself
        // allows it fine - a plain <img> tag loading the same URL still
        // works, only the script-initiated fetch gets caught. The image
        // proxy Worker (image-proxy-worker/) fetches server-side instead,
        // immune to both that and true CORS blocks - this simulates the
        // "direct fetch fails, proxy recovers" path without depending on a
        // real extension or the live Worker being reachable.
        name: 'when a direct image fetch fails, it silently retries through the proxy Worker and still succeeds',
        async run(page) {
            const targetUrl = 'https://i.imgur.com/blocked-by-extension.jpg';
            await page.route(targetUrl, (route) => route.abort('failed'));
            await page.route(/mudae-noter-image-proxy.mirkhan1497-1b6.workers.dev/, (route) => {
                // The browser enforces real CORS rules on mocked responses
                // too - fulfilling a route doesn't bypass that, so the mock
                // needs the same access-control header a real proxy
                // response would send.
                route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(FIXTURE_IMAGE) });
            });

            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            await page.fill('#imageCropperUrlInput', targetUrl);
            await page.click('button:has-text("Load this link")');
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });

            const useBtnEnabled = await page.locator('#imageCropperUseBtn').isEnabled();
            assert.ok(useBtnEnabled, 'expected the proxy fallback to successfully load the image despite the direct fetch failing');

            page._consoleErrors = page._consoleErrors.filter(e => !e.includes('Failed to load resource'));
        }
    },
    {
        name: 'when both the direct fetch and the proxy fallback fail, the error explains both were tried',
        async run(page) {
            const targetUrl = 'https://i.pinimg.com/blocked.jpg';
            await page.route(targetUrl, (route) => route.abort('failed'));
            await page.route(/mudae-noter-image-proxy.mirkhan1497-1b6.workers.dev/, (route) => {
                route.fulfill({ status: 502, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Upstream responded with status 404' });
            });

            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            await page.fill('#imageCropperUrlInput', targetUrl);
            await page.click('button:has-text("Load this link")');
            await page.waitForTimeout(300);

            const messageText = await page.locator('#imageCropperMessage').textContent();
            assert.ok(/backup proxy/i.test(messageText), `expected the error to mention the proxy fallback was also tried, got: "${messageText}"`);
            assert.ok(/download.*upload/i.test(messageText), `expected a suggested fallback, got: "${messageText}"`);

            const workspaceVisible = await page.locator('#imageCropperWorkspace').isVisible();
            assert.strictEqual(workspaceVisible, false, 'expected no workspace to appear after both attempts fail');

            page._consoleErrors = page._consoleErrors.filter(e => !e.includes('Failed to load resource'));
        }
    },
    {
        name: 'clicking "Load this link" with nothing pasted shows an error instead of doing nothing',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.click('button:has-text("Crop this image first")');
            await page.waitForSelector('#imageCropperOverlay', { state: 'visible' });

            await page.click('button:has-text("Load this link")');
            await page.waitForTimeout(150);
            const messageText = await page.locator('#imageCropperMessage').textContent();
            assert.ok(/paste an image link first/i.test(messageText), `expected an error prompting for a link, got: "${messageText}"`);
        }
    }
];
