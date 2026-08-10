const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for a real report: there was no way to fix or
        // change a single character's image without a full re-parse. Mudae's
        // `$ims [name]` command DMs a numbered list of image links already
        // claimed for that character - this generates that command and lets
        // the chosen link be pasted straight back in.
        name: 'clicking the image-edit badge opens a modal with the $ims command for that character',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();

            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            const commandText = await page.locator('#imsImageCommandText').textContent();
            assert.strictEqual(commandText, `$ims ${name}`, `expected the exact $ims command for "${name}", got: "${commandText}"`);
        }
    },
    {
        name: 'Copy Command copies the exact $ims command',
        async run(page) {
            await loadDemoCollection(page);

            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });

            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.click('#imsImageCopyBtn');
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, `$ims ${name}`, `expected the copied text to be the exact $ims command, got: "${copied}"`);
        }
    },
    {
        name: 'pasting a URL and saving updates the character, the card, the raw input, and its Sort tab entry',
        async run(page) {
            await loadDemoCollection(page);

            // Give the character a Sort tab entry to verify the resync too.
            const name = await page.locator('.character-card').first().locator('.character-name').textContent();
            await page.click('#tab-sort-btn');
            await page.fill('#sortInput', `${name.trim()} - Dungeon Meshi 1 ka`);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');
            await page.click('#tab-notes-btn');

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            const newUrl = 'https://example.com/new-image.png';
            await page.fill('#imsImageUrlInput', newUrl);
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const overlayHidden = await page.locator('#imsImagePickerOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close after saving');

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, newUrl, 'expected AppState to have the new image');

            const cardImgSrc = await card.locator('img').getAttribute('src');
            assert.strictEqual(cardImgSrc, newUrl, 'expected the rendered card image to update immediately');

            const rawInputHasNewUrl = await page.evaluate(() => AppState.rawInput.includes('https://example.com/new-image.png'));
            assert.ok(rawInputHasNewUrl, 'expected AppState.rawInput to include the new image URL');
            const mainInputValue = await page.inputValue('#input');
            assert.ok(mainInputValue.includes(newUrl), 'expected the main input textarea to reflect the new image URL too');

            const sortEntryImage = await page.evaluate((n) => {
                const entry = AppState.sortData.find(e => e.name === n.trim());
                return entry ? entry.image : null;
            }, name);
            assert.strictEqual(sortEntryImage, newUrl, 'expected the matching Sort tab entry to be resynced with the new image');
        }
    },
    {
        name: 'saving with an empty URL shows an error and does not close the modal or change the character',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const before = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });

            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.fill('#imsImageUrlInput', '');
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const overlayVisible = await page.locator('#imsImagePickerOverlay').isVisible();
            assert.ok(overlayVisible, 'expected the modal to stay open on an empty URL');

            const after = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(after, before, 'expected the character\'s image to be untouched');
        }
    },
    {
        name: 'Cancel closes the modal without changing anything',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const before = await card.locator('img').getAttribute('src');

            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.fill('#imsImageUrlInput', 'https://example.com/should-not-be-saved.png');
            await page.click('#imsImagePickerOverlay button:has-text("Cancel")');

            const overlayHidden = await page.locator('#imsImagePickerOverlay').isHidden();
            assert.ok(overlayHidden, 'expected Cancel to close the modal');

            const after = await card.locator('img').getAttribute('src');
            assert.strictEqual(after, before, 'expected Cancel to leave the character\'s image untouched');
        }
    },
    {
        name: 'clicking the image-edit badge does not also toggle the card\'s selection',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const excludedBefore = await card.evaluate(el => el.classList.contains('excluded'));

            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.click('#imsImagePickerOverlay button:has-text("Cancel")');

            const excludedAfter = await card.evaluate(el => el.classList.contains('excluded'));
            assert.strictEqual(excludedAfter, excludedBefore, 'expected the image-edit badge to not also toggle card selection');
        }
    }
];
