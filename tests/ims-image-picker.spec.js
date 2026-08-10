const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

// A realistic $ims DM dump: numbered links interleaved with Discord's
// "Image" embed-preview placeholder lines (which have no URL of their own).
const SAMPLE_DM = `3. https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif
2. https://mudae.net/uploads/3341897/9IdP3Ys~QcpkGJn.gif
1. https://mudae.net/uploads/3341897/Uujtplc~m8Jz2n8.gif
Image
Image
Image`;

module.exports = [
    {
        // Regression test for a real report: there was no way to fix or
        // change a single character's image without a full re-parse. Mudae's
        // `$ims [name]` command DMs every image link already claimed for
        // that character - this generates that command and lets the whole
        // DM be pasted back in, picking visually from a thumbnail grid
        // rather than having to identify and copy one link out by hand.
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
        name: 'pasting a $ims DM shows one thumbnail per link, ignoring the interleaved "Image" placeholder lines',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            const thumbCount = await page.locator('.ims-image-thumb').count();
            assert.strictEqual(thumbCount, 3, `expected exactly 3 thumbnails for 3 links, got ${thumbCount}`);

            const thumbUrls = await page.locator('.ims-image-thumb').evaluateAll(els => els.map(el => el.dataset.url));
            assert.deepStrictEqual(thumbUrls, [
                'https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif',
                'https://mudae.net/uploads/3341897/9IdP3Ys~QcpkGJn.gif',
                'https://mudae.net/uploads/3341897/Uujtplc~m8Jz2n8.gif'
            ], `expected the links in the order they appeared, got: ${JSON.stringify(thumbUrls)}`);
        }
    },
    {
        // Regression test for a real report: the grid thumbnails are too
        // small to actually see what's being picked - selecting one now
        // also shows a much bigger preview.
        name: 'clicking a thumbnail shows a bigger preview of it, and switching thumbnails updates that preview',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            const previewWrapHiddenBefore = await page.locator('#imsImageSelectedPreviewWrap').isHidden();
            assert.ok(previewWrapHiddenBefore, 'expected no preview before anything is selected');

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb:nth-child(1)');
            await page.waitForTimeout(300);

            const previewVisible = await page.locator('#imsImageSelectedPreviewWrap').isVisible();
            assert.ok(previewVisible, 'expected the preview to appear once a thumbnail is selected');
            const previewSrc1 = await page.locator('#imsImageSelectedPreview').getAttribute('src');
            assert.strictEqual(previewSrc1, 'https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif', 'expected the preview to show the selected thumbnail\'s image');

            await page.click('.ims-image-thumb:nth-child(2)');
            await page.waitForTimeout(300);
            const previewSrc2 = await page.locator('#imsImageSelectedPreview').getAttribute('src');
            assert.strictEqual(previewSrc2, 'https://mudae.net/uploads/3341897/9IdP3Ys~QcpkGJn.gif', 'expected switching thumbnails to update the preview to the new selection');

            // These are fake URLs that never actually resolve, so this also
            // exercises the shared handleImageError() path, which
            // permanently hides an <img> and inserts a placeholder sibling
            // on failure - the fix ensures that placeholder gets cleaned up
            // on the next selection instead of accumulating or getting
            // permanently stuck showing "No Image Available".
            const placeholderCount = await page.locator('#imsImageSelectedPreviewWrap > div').count();
            assert.ok(placeholderCount <= 1, `expected at most one error placeholder to accumulate across selections, got ${placeholderCount}`);
        }
    },
    {
        // Regression test for a real report: picking a thumbnail for one
        // character, closing the modal, then opening it again for a
        // *different* character left the big preview still showing the
        // previous character's picked image - renderImsImageThumbs()'s
        // early-return path (hit every time the modal opens fresh, since
        // the paste box starts empty) skipped resetting the preview.
        name: 'opening the picker for a different character does not carry over the previous character\'s preview',
        async run(page) {
            await loadDemoCollection(page);

            const cards = page.locator('.character-card');
            await cards.nth(0).locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');
            await page.waitForTimeout(150);
            const previewVisibleForFirst = await page.locator('#imsImageSelectedPreviewWrap').isVisible();
            assert.ok(previewVisibleForFirst, 'expected the preview to show for the first character\'s pick');
            await page.click('#imsImagePickerOverlay button:has-text("Cancel")');

            await cards.nth(1).locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            await page.waitForTimeout(150);

            const previewVisibleForSecond = await page.locator('#imsImageSelectedPreviewWrap').isVisible();
            assert.strictEqual(previewVisibleForSecond, false, 'expected the preview to be hidden/reset when opening the picker for a new character');
        }
    },
    {
        // Regression test for a real report: running $ims on a character
        // with lots of claimed images can come back as several separate
        // DMs - pasting only one of them leaves gaps in the numbering
        // (Mudae numbers 1..N with none skipped), which this catches and
        // flags instead of silently showing an incomplete grid.
        name: 'a gap in the pasted image numbering warns that a DM might be missing',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            const warningBefore = await page.locator('#imsImageGapWarning').textContent();
            assert.strictEqual(warningBefore.trim(), '', 'expected no warning before anything is pasted');

            // Only 2 of 32 numbered entries present - a real gap.
            await page.fill('#imsImagePasteArea', '32. https://mudae.net/uploads/1/a.png\n10. https://mudae.net/uploads/1/b.png');
            await page.waitForTimeout(150);
            const gapWarning = await page.locator('#imsImageGapWarning').textContent();
            assert.ok(/only 2 of 32/i.test(gapWarning), `expected a warning naming the missing count, got: "${gapWarning}"`);

            // A complete, gap-free sequence shouldn't warn.
            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForTimeout(150);
            const noWarning = await page.locator('#imsImageGapWarning').textContent();
            assert.strictEqual(noWarning.trim(), '', `expected no warning for a complete 1..3 sequence, got: "${noWarning}"`);
        }
    },
    {
        // Regression test for a real report: $ai only adds an image to
        // Mudae's pool, it doesn't make it active - $c does that, by the
        // number shown next to each image in the $ims DM.
        name: 'clicking a thumbnail shows the matching $c command using that image\'s number',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');

            const numberBadge = await page.locator('.ims-image-thumb').first().locator('.ims-image-thumb-number').textContent();
            assert.strictEqual(numberBadge, '#3', `expected the first thumbnail (highest-numbered in the DM) to show "#3", got: "${numberBadge}"`);

            const pickedUrl = 'https://mudae.net/uploads/3341897/9IdP3Ys~QcpkGJn.gif';
            await page.click(`.ims-image-thumb[data-url="${pickedUrl}"]`);

            const cCommandText = await page.locator('#imsImageCCommandBox .command-text').textContent();
            assert.strictEqual(cCommandText, `$c ${name}$2`, `expected the $c command to use that thumbnail's own number (2), got: "${cCommandText}"`);
        }
    },
    {
        name: 'clicking a thumbnail and saving updates the character, the card, the raw input, and its Sort tab entry',
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

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            const pickedUrl = 'https://mudae.net/uploads/3341897/9IdP3Ys~QcpkGJn.gif';
            await page.click(`.ims-image-thumb[data-url="${pickedUrl}"]`);

            const selectedClass = await page.locator(`.ims-image-thumb[data-url="${pickedUrl}"]`).getAttribute('class');
            assert.ok(selectedClass.includes('selected'), 'expected the clicked thumbnail to show as selected');

            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const overlayHidden = await page.locator('#imsImagePickerOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close after saving');

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, pickedUrl, 'expected AppState to have the picked image');

            const cardImgSrc = await card.locator('img').getAttribute('src');
            assert.strictEqual(cardImgSrc, pickedUrl, 'expected the rendered card image to update immediately');

            const rawInputHasNewUrl = await page.evaluate((u) => AppState.rawInput.includes(u), pickedUrl);
            assert.ok(rawInputHasNewUrl, 'expected AppState.rawInput to include the picked image URL');
            const mainInputValue = await page.inputValue('#input');
            assert.ok(mainInputValue.includes(pickedUrl), 'expected the main input textarea to reflect the picked image URL too');

            const sortEntryImage = await page.evaluate((n) => {
                const entry = AppState.sortData.find(e => e.name === n.trim());
                return entry ? entry.image : null;
            }, name);
            assert.strictEqual(sortEntryImage, pickedUrl, 'expected the matching Sort tab entry to be resynced with the picked image');
        }
    },
    {
        name: 'saving without picking a thumbnail shows an error and does not close the modal or change the character',
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
            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const overlayVisible = await page.locator('#imsImagePickerOverlay').isVisible();
            assert.ok(overlayVisible, 'expected the modal to stay open when nothing was picked');

            // Regression test for a real report: this error used to go
            // through the global showMessage(), whose target lives in the
            // underlying tab panel - if the background page was scrolled
            // (e.g. from scrolling down to find this character), the
            // message rendered entirely off-screen and looked like the
            // button silently did nothing. It now has its own message slot
            // inside the modal itself, always visible regardless of the
            // page behind it.
            const messageEl = page.locator('#imsImagePickerMessage');
            const messageVisible = await messageEl.isVisible();
            assert.ok(messageVisible, 'expected the error message to be visible inside the modal');
            const messageText = await messageEl.textContent();
            assert.ok(/pick an image from the grid/i.test(messageText), `expected a clear error message, got: "${messageText}"`);
            const insideModal = await messageEl.evaluate(el => !!el.closest('#imsImagePickerOverlay'));
            assert.ok(insideModal, 'expected the message element to live inside the modal, not the underlying page');

            const after = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(after, before, 'expected the character\'s image to be untouched');
        }
    },
    {
        // The number prefix is required (not just any URL) since it's what
        // the generated $c command relies on - a stray link with no number
        // attached (e.g. someone pasting a single link instead of the DM)
        // can't be turned into a working $c command, so it's not offered.
        name: 'a link with no leading "N." number is not picked up as a thumbnail',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.fill('#imsImagePasteArea', 'https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif');
            const thumbCount = await page.locator('.ims-image-thumb').count();
            assert.strictEqual(thumbCount, 0, 'expected an un-numbered link to be ignored');
        }
    },
    {
        name: 'pasting text with no links shows an empty-state message instead of a broken grid',
        async run(page) {
            await loadDemoCollection(page);

            const card = page.locator('.character-card').first();
            await card.locator('[data-action="edit-image"]').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });

            await page.fill('#imsImagePasteArea', 'Image\nImage\nnothing here but placeholders');
            const thumbCount = await page.locator('.ims-image-thumb').count();
            assert.strictEqual(thumbCount, 0, 'expected no thumbnails for text with no links');
            const emptyMessage = await page.locator('.ims-image-thumb-empty').isVisible();
            assert.ok(emptyMessage, 'expected an empty-state message when text has no links');
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
            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');
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
    },
    {
        // Regression test for a real report: the image-edit badge was only
        // reachable from the Notes tab - this locks in the same badge also
        // showing on the Sort tab's list, opening the picker for the right
        // underlying character without also selecting the row.
        name: 'the Sort tab list also has an image-edit badge on each thumbnail, opening the picker without toggling row selection',
        async run(page) {
            await loadDemoCollection(page);

            const name = await page.locator('.character-card').first().locator('.character-name').textContent();
            await page.click('#tab-sort-btn');
            await page.fill('#sortInput', `${name.trim()} - Dungeon Meshi 1 ka`);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const row = page.locator('#sortCharacterList .sort-character-item').first();
            const selectedBefore = await row.evaluate(el => el.classList.contains('selected'));

            await row.locator('.sort-item-thumb-edit-badge').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            const commandText = await page.locator('#imsImageCommandText').textContent();
            assert.strictEqual(commandText, `$ims ${name.trim()}`, `expected the picker to open for the right character, got: "${commandText}"`);

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const newImage = await row.locator('.sort-item-thumb img').getAttribute('src');
            assert.strictEqual(newImage, 'https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif', 'expected the Sort tab row\'s own thumbnail to update immediately');

            const selectedAfter = await row.evaluate(el => el.classList.contains('selected'));
            assert.strictEqual(selectedAfter, selectedBefore, 'expected the badge click to not also select/move the row');
        }
    },
    {
        name: 'the Colors tab grid also has an image-edit badge on each thumbnail, opening the picker without toggling character selection',
        async run(page) {
            await loadDemoCollection(page);

            await page.click('#tab-colors-btn');
            await page.waitForSelector('#colorCharacterGrid .sort-character-item');

            const card = page.locator('#colorCharacterGrid .sort-character-item').first();
            const name = await card.locator('.sort-item-name').textContent();
            const selectedBefore = await card.evaluate(el => el.classList.contains('selected'));

            await card.locator('.sort-item-thumb-edit-badge').click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'visible' });
            const commandText = await page.locator('#imsImageCommandText').textContent();
            assert.strictEqual(commandText, `$ims ${name.trim()}`, `expected the picker to open for the right character, got: "${commandText}"`);

            await page.fill('#imsImagePasteArea', SAMPLE_DM);
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');
            await page.click('button:has-text("Save Image")');
            await page.waitForTimeout(150);

            const newImage = await card.locator('.sort-item-thumb img').getAttribute('src');
            assert.strictEqual(newImage, 'https://mudae.net/uploads/3341897/Tp1LMe1~oI9kqRz.gif', 'expected the Colors tab card\'s own thumbnail to update immediately');

            const selectedAfter = await card.evaluate(el => el.classList.contains('selected'));
            assert.strictEqual(selectedAfter, selectedBefore, 'expected the badge click to not also toggle the Colors tab selection');
        }
    }
];
