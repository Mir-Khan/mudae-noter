const assert = require('assert');
const path = require('path');
const { loadDemoCollection } = require('./helpers');

const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'test-image.png');

module.exports = [
    {
        // Regression test for a real report: no way to see, at a glance,
        // which characters currently have a custom (non-mudae.net) image
        // without scanning every card's URL by hand. This is a live view of
        // the actual collection, not a history of uploads.
        name: 'the Custom Images tab lists exactly the characters currently holding a non-mudae.net image',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                AppState.seriesData['Dungeon Meshi'].characters[0].image = 'https://cdn.imgchest.com/files/example.png';
                AppState.seriesData['One Piece'].characters[0].image = 'https://i.imgur.com/example.jpg';
            });

            await page.click('#tab-customimages-btn');
            await page.waitForSelector('.sort-character-item');

            const names = await page.locator('.sort-item-name').allTextContents();
            assert.deepStrictEqual(names.slice().sort(), ['Marcille Donato', 'Monkey D. Luffy'], `expected exactly the two custom-image characters, got: ${JSON.stringify(names)}`);
        }
    },
    {
        name: 'the tab updates live once a character\'s image changes, without needing to switch tabs',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-customimages-btn');
            await page.waitForTimeout(150);

            let count = await page.locator('.sort-character-item').count();
            assert.strictEqual(count, 0, 'expected no custom images in the fresh demo collection');

            const card = page.locator('.character-card').first();
            await page.click('#tab-notes-btn');
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.fill('#imsImagePasteArea', '1. https://cdn.imgchest.com/files/new-pick.png');
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            await page.click('#tab-customimages-btn');
            await page.waitForSelector('.sort-character-item');
            count = await page.locator('.sort-character-item').count();
            assert.strictEqual(count, 1, 'expected the newly custom-imaged character to appear');
        }
    },
    {
        name: 'search filters the grid by name or series',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                AppState.seriesData['Dungeon Meshi'].characters[0].image = 'https://cdn.imgchest.com/files/a.png';
                AppState.seriesData['One Piece'].characters[0].image = 'https://cdn.imgchest.com/files/b.png';
            });
            await page.click('#tab-customimages-btn');
            await page.waitForSelector('.sort-character-item');

            await page.fill('#customImagesSearchInput', 'Marcille');
            await page.waitForTimeout(150);
            const visibleCount = await page.locator('.sort-character-item').count();
            assert.strictEqual(visibleCount, 1, `expected the search to narrow to 1 match, got ${visibleCount}`);
        }
    },
    {
        name: 'clicking a card\'s image-edit badge opens the picker for that character',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                AppState.seriesData['Dungeon Meshi'].characters[0].image = 'https://cdn.imgchest.com/files/a.png';
            });
            await page.click('#tab-customimages-btn');
            await page.waitForSelector('.sort-item-thumb-edit-badge');
            await page.click('.sort-item-thumb-edit-badge');
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            const commandText = await page.locator('#imsImageCommandText').textContent();
            assert.strictEqual(commandText, '$imsi- Marcille Donato', `expected the picker to open for the right character, got: "${commandText}"`);
        }
    },
    {
        name: 'an empty collection shows a helpful hint instead of a blank grid',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-customimages-btn');
            await page.waitForTimeout(150);
            const text = await page.locator('#customImagesGrid').textContent();
            assert.ok(/no custom-hosted images yet/i.test(text), `expected an empty-state hint, got: "${text}"`);
        }
    },
    {
        // New feature: crop/upload an image before deciding which character
        // it belongs to, then search and assign it afterward.
        name: 'uploading a new image on the Custom Images tab shows a link and a character search',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/standalone.png' }] } })
                });
            });

            await loadDemoCollection(page);
            await page.click('#tab-customimages-btn');
            await page.fill('#customImageUploadTokenInput', 'my-test-token');
            await page.click('button:has-text("Save ImgChest Token")');
            await page.setInputFiles('#customImageUploadFileInput', FIXTURE_IMAGE);
            await page.click('#customImageUploadBtn');
            await page.waitForSelector('#customImageUploadStatus .command-text');

            const linkText = await page.locator('#customImageUploadStatus .command-text').textContent();
            assert.strictEqual(linkText, 'https://cdn.imgchest.com/files/standalone.png');

            const searchVisible = await page.locator('#customImageAssignSearchInput').isVisible();
            assert.ok(searchVisible, 'expected a character search box to appear after upload');

            const resultCount = await page.locator('#customImageAssignResults .link-sort-entry-result-item').count();
            assert.ok(resultCount > 0, 'expected the search results to list characters by default');
        }
    },
    {
        name: 'searching narrows the assign list, and picking + confirming assigns the image and resets the section',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/standalone.png' }] } })
                });
            });

            await loadDemoCollection(page);
            await page.click('#tab-customimages-btn');
            await page.fill('#customImageUploadTokenInput', 'my-test-token');
            await page.click('button:has-text("Save ImgChest Token")');
            await page.setInputFiles('#customImageUploadFileInput', FIXTURE_IMAGE);
            await page.click('#customImageUploadBtn');
            await page.waitForSelector('#customImageAssignSearchInput');

            await page.fill('#customImageAssignSearchInput', 'Marcille');
            await page.waitForTimeout(150);
            const namesShown = await page.locator('#customImageAssignResults .link-sort-entry-result-name').allTextContents();
            assert.deepStrictEqual(namesShown, ['Marcille Donato'], `expected the search to narrow to just Marcille Donato, got: ${JSON.stringify(namesShown)}`);

            await page.click('.link-sort-entry-result-item');
            await page.waitForSelector('#customImageAssignConfirmBox .command-text');
            const command = await page.locator('#customImageAssignConfirmBox .command-text').textContent();
            assert.strictEqual(command, '$ai Marcille Donato$https://cdn.imgchest.com/files/standalone.png');

            const imageBefore = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters[0].image);
            assert.notStrictEqual(imageBefore, 'https://cdn.imgchest.com/files/standalone.png', 'expected the image to NOT be applied before confirming');

            await page.click('#customImageAssignConfirmBox button:has-text("Ran this in Discord")');
            await page.waitForTimeout(150);

            const imageAfter = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters[0].image);
            assert.strictEqual(imageAfter, 'https://cdn.imgchest.com/files/standalone.png', 'expected confirming to apply the image to the picked character');

            const statusCleared = await page.locator('#customImageUploadStatus').innerHTML();
            assert.strictEqual(statusCleared.trim(), '', 'expected the upload section to reset after assigning');
        }
    },
    {
        name: 'cropping first still produces a 225x350 upload ready to assign',
        async run(page) {
            let uploadedBuffer = null;
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                uploadedBuffer = route.request().postDataBuffer();
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/cropped-standalone.png' }] } })
                });
            });

            await loadDemoCollection(page);
            await page.click('#tab-customimages-btn');
            await page.fill('#customImageUploadTokenInput', 'my-test-token');
            await page.click('button:has-text("Save ImgChest Token")');
            await page.setInputFiles('#customImageUploadFileInput', FIXTURE_IMAGE);
            await page.click('button:has-text("Crop before uploading")');
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });
            await page.click('#imageCropperUseBtn');
            await page.waitForSelector('#customImageUploadStatus .command-text');

            const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const idx = uploadedBuffer.indexOf(sig);
            const dims = { width: uploadedBuffer.readUInt32BE(idx + 16), height: uploadedBuffer.readUInt32BE(idx + 20) };
            assert.deepStrictEqual(dims, { width: 225, height: 350 }, `expected the cropped upload to be 225x350, got ${JSON.stringify(dims)}`);
        }
    }
];
