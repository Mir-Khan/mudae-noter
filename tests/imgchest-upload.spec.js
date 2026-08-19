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

            const commandText = await page.locator('#imgChestUploadStatus .command-text', { hasText: '$ai ' }).textContent();
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
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://cdn.imgchest.com/files/test123.png', 'expected confirming to apply the uploaded image to the character');

            const cardImgSrc = await card.locator('img').getAttribute('src');
            assert.strictEqual(cardImgSrc, 'https://cdn.imgchest.com/files/test123.png', 'expected the rendered card image to update immediately');
        }
    },
    {
        // Regression test for a real report: $ai only adds the upload to the
        // pool, it doesn't make it active - $c does that, by number. $ai
        // appends to the end, so the new image's number is the highest
        // number seen in the pasted $ims DM, plus one.
        name: 'a successful upload also shows a $c command using one past the highest number pasted from $ims',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { name } = await openUploadSectionForFirstCharacter(page);

            await page.fill('#imsImagePasteArea', '5. https://mudae.net/uploads/1/a.png\n3. https://mudae.net/uploads/1/b.png');
            await page.waitForSelector('.ims-image-thumb');

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text:has-text("$c")');

            const cCommandText = await page.locator('#imgChestUploadStatus .command-text', { hasText: '$c' }).textContent();
            assert.strictEqual(cCommandText, `$c ${name}$6`, `expected the $c command to use the highest pasted number (5) plus one, got: "${cCommandText}"`);
        }
    },
    {
        // Regression test for a real report: confirming the $ai command used
        // to close the modal immediately, even when there was also a $c
        // command still waiting to be run - easy to forget about it once the
        // modal's gone. Now the modal only closes once BOTH have been
        // confirmed (when there is a $c command to confirm).
        // Regression test for a real report: $ai only adds an image to
        // Mudae's pool, it doesn't make it active - $c does that. The app
        // used to sync its own local image the moment $ai was confirmed,
        // which didn't match reality whenever a $c command was still
        // pending - the local image now only updates once $c itself is
        // confirmed.
        name: 'with a $c command present, confirming $ai alone neither applies the image nor closes the modal - confirming $c does both',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);
            const originalImage = await card.locator('img').getAttribute('src');
            await page.fill('#imsImagePasteArea', '1. https://mudae.net/uploads/1/a.png');
            await page.waitForSelector('.ims-image-thumb');

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text:has-text("$c")');

            // The $ai button is a direct child of the status area; the $c
            // one lives nested inside its own command block - both share
            // the same "Ran this in Discord" label, so the DOM structure is
            // what disambiguates them here.
            const aiConfirmBtn = page.locator('#imgChestUploadStatus > button:has-text("Ran this in Discord")');
            const cConfirmBtn = page.locator('#imgChestUploadStatus div button:has-text("Ran this in Discord")');

            await aiConfirmBtn.click();
            await page.waitForTimeout(150);

            const stillOpenAfterAi = await page.locator('#imsImagePickerOverlay').isVisible();
            assert.ok(stillOpenAfterAi, 'expected the modal to stay open after confirming $ai, since a $c command is still pending');

            const imageAfterAi = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(imageAfterAi, originalImage, 'expected confirming $ai alone to NOT apply the image yet - $c is what actually activates it in Mudae');

            await cConfirmBtn.click();
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const imageAfterC = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(imageAfterC, 'https://cdn.imgchest.com/files/test123.png', 'expected confirming $c to be the point the image actually gets applied');
        }
    },
    {
        // Regression test for the same real report: confirming $c before
        // $ai doesn't make sense (the image has to actually be in Mudae's
        // pool first) - warn instead of silently closing.
        name: 'confirming $c before $ai warns instead of closing the modal',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);
            await page.fill('#imsImagePasteArea', '1. https://mudae.net/uploads/1/a.png');
            await page.waitForSelector('.ims-image-thumb');

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text:has-text("$c")');

            const cConfirmBtn = page.locator('#imgChestUploadStatus div button:has-text("Ran this in Discord")');
            await cConfirmBtn.click();
            await page.waitForTimeout(150);

            const stillOpen = await page.locator('#imsImagePickerOverlay').isVisible();
            assert.ok(stillOpen, 'expected the modal to stay open - $c was confirmed before $ai');

            const messageText = await page.locator('#imsImagePickerMessage').textContent();
            assert.ok(/run.*\$ai.*first/i.test(messageText), `expected a warning to run $ai first, got: "${messageText}"`);

            const imageStillUnset = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.notStrictEqual(imageStillUnset, 'https://cdn.imgchest.com/files/test123.png', 'expected the image to NOT be applied since $ai was never confirmed');
        }
    },
    {
        name: 'a successful upload with no $ims DM pasted first shows a hint instead of guessing a $c command',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            const cCommandCount = await page.locator('#imgChestUploadStatus .command-text', { hasText: '$c' }).count();
            assert.strictEqual(cCommandCount, 0, 'expected no $c command to be guessed at without a pasted $ims DM');
            const statusText = await page.locator('#imgChestUploadStatus').textContent();
            assert.ok(/paste this character's \$imsi- dm/i.test(statusText), `expected a hint pointing at pasting the $imsi- DM first, got: "${statusText}"`);
        }
    },
    {
        // Regression test for a real request: with no $c command possible
        // (the character's own image count is unknown), a plain $im
        // command is offered instead - a real numbered gallery with actual
        // image previews (unlike $imsi-'s text-only list), so the user can
        // see for themselves which number the new upload landed at and run
        // a manual $c if they want. No confirm button, since running $im
        // alone changes nothing that needs syncing back into the app.
        name: 'with no $c command, a plain $im command is offered too, with no confirm button of its own',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { name } = await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            const imCommandText = await page.locator('#imgChestUploadStatus .command-text', { hasText: '$im ' }).textContent();
            assert.strictEqual(imCommandText, `$im ${name}`, `expected a plain "$im <name>" command, got: "${imCommandText}"`);

            // Exactly one "Ran this in Discord" button (the $ai one) - the
            // $im command has no confirm button of its own.
            const confirmButtonCount = await page.locator('#imgChestUploadStatus').locator('button:has-text("Ran this in Discord")').count();
            assert.strictEqual(confirmButtonCount, 1, 'expected only the $ai command to have a confirm button, not $im');

            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });
            const imBlock = page.locator('#imgChestUploadStatus .command-item', { hasText: '$im ' });
            await imBlock.locator('button:has-text("Copy Command")').click();
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, `$im ${name}`, 'expected the $im command\'s own Copy button to copy exactly that command');
        }
    },
    {
        // Regression test for a real report: Mudae rejects $ai links hosted
        // on imgchest.com that end in .jpg/.jpeg outright ("The links of
        // the images hosted with imgchest can't end with '.jpg' or
        // '.jpeg'"). A JPEG file should be silently re-encoded as a real
        // PNG before it's ever sent to ImgChest, so the generated link
        // never hits that restriction.
        name: 'uploading a JPEG file converts it to a real PNG before sending it to ImgChest',
        async run(page) {
            let uploadedFilename = null;
            let uploadedContentType = null;
            await page.route('https://api.imgchest.com/v1/post', async (route) => {
                const request = route.request();
                const buffer = request.postDataBuffer();
                const text = buffer.toString('latin1');
                const filenameMatch = text.match(/filename="([^"]+)"/);
                const contentTypeMatch = text.match(/Content-Type:\s*([^\r\n]+)/);
                uploadedFilename = filenameMatch ? filenameMatch[1] : null;
                uploadedContentType = contentTypeMatch ? contentTypeMatch[1] : null;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/converted.png' }] } })
                });
            });

            await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');

            // A tiny but genuinely valid PNG, deliberately mislabeled as a
            // .jpg/image-jpeg upload - isJpegFile() goes off the declared
            // type/extension (exactly what a real browser file picker would
            // report for an actual JPEG), not the underlying bytes.
            await page.setInputFiles('#imgChestFileInput', {
                name: 'photo.jpg',
                mimeType: 'image/jpeg',
                buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
            });

            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            assert.ok(uploadedFilename && /\.png$/i.test(uploadedFilename), `expected the uploaded filename to end in .png, got: "${uploadedFilename}"`);
            assert.strictEqual(uploadedContentType, 'image/png', `expected the uploaded file's content type to be image/png, got: "${uploadedContentType}"`);

            const commandText = await page.locator('#imgChestUploadStatus .command-text', { hasText: '$ai ' }).textContent();
            assert.ok(commandText.endsWith('.png'), `expected the generated $ai command to reference a .png link, got: "${commandText}"`);
        }
    },
    {
        // Regression test for a real report: clicking the modal's main "Save
        // Image" button after uploading (instead of finding and clicking the
        // upload's own small "Ran this in Discord" button) used to show a
        // confusing "pick from the grid" error - there's no real reason Save
        // Image shouldn't just finish the upload off too, so now it does.
        name: 'clicking Save Image after an upload (before confirming it) applies the uploaded image, same as its own confirm button',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/test123.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            await page.click('button:has-text("Save Image")');
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://cdn.imgchest.com/files/test123.png', 'expected Save Image to apply the just-uploaded image, same as the dedicated confirm button');
        }
    },
    {
        // The $imsi- grid stays fully usable after an upload (you might
        // change your mind and want an existing image instead) - it just
        // shouldn't be the one that wins by DEFAULT, since uploading and
        // confirming in Discord is the more deliberate of the two actions.
        name: 'a pending upload wins by default if the grid is never touched afterward',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/fresh-upload.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            const pasteAreaEnabled = await page.locator('#imsImagePasteArea').isEnabled();
            assert.ok(pasteAreaEnabled, 'expected the $imsi- grid to stay usable even with a pending upload, in case of a change of mind');

            const noteVisible = await page.locator('#imsImageGridDisabledNote').isVisible();
            assert.ok(noteVisible, 'expected a note explaining the upload is what Save Image will use by default');

            await page.click('button:has-text("Save Image")');
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://cdn.imgchest.com/files/fresh-upload.png', 'expected the pending upload to win by default');
        }
    },
    {
        // Regression test for a real report's follow-up ask: after
        // uploading, the user should still be able to change their mind and
        // pick an existing image from the $imsi- grid instead - that pick
        // should win, overriding the upload default right back.
        name: 'picking a thumbnail after an upload overrides the upload (changed your mind)',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/unwanted-upload.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);

            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            // Changed my mind - pick an existing image from the grid instead.
            await page.fill('#imsImagePasteArea', '1. https://mudae.net/uploads/old/actually-wanted.png');
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');

            await page.click('button:has-text("Save Image")');
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://mudae.net/uploads/old/actually-wanted.png', 'expected the grid pick made after the upload to win, since it was the more recent action');
        }
    },
    {
        // Regression test for a real report: pick a thumbnail from the
        // $imsi- grid first, THEN separately crop/upload a new image and
        // confirm it - Save Image was still applying the earlier (now
        // stale) grid pick instead of the upload that was just actually run
        // in Discord, silently reverting to the wrong image.
        name: 'a pending upload wins over an earlier grid pick made before the upload happened',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/newer-upload.png' }] } })
                });
            });

            const { card } = await openUploadSectionForFirstCharacter(page);

            // Pick a thumbnail from the grid first, before touching upload at all.
            await page.fill('#imsImagePasteArea', '1. https://mudae.net/uploads/old/stale-pick.png');
            await page.waitForSelector('.ims-image-thumb');
            await page.click('.ims-image-thumb');

            // Now upload+confirm a different image entirely.
            await page.fill('#imgChestTokenInput', 'my-test-token');
            await page.click('button:has-text("Save Token")');
            await page.setInputFiles('#imgChestFileInput', FIXTURE_IMAGE);
            await page.click('#imgChestUploadBtn');
            await page.waitForSelector('#imgChestUploadStatus .command-text');

            await page.click('button:has-text("Save Image")');
            await page.waitForSelector('#imsImagePickerOverlay', { state: 'hidden' });

            const charImage = await card.evaluate(el => {
                const series = el.dataset.originalSeries;
                const index = parseInt(el.dataset.originalIndex, 10);
                return AppState.seriesData[series].characters[index].image;
            });
            assert.strictEqual(charImage, 'https://cdn.imgchest.com/files/newer-upload.png', `expected the pending upload to win over the earlier stale grid pick, got: "${charImage}"`);
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
