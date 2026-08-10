const assert = require('assert');
const path = require('path');
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
    }
];
