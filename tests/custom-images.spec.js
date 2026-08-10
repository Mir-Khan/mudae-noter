const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

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
            assert.strictEqual(commandText, '$ims Marcille Donato', `expected the picker to open for the right character, got: "${commandText}"`);
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
    }
];
