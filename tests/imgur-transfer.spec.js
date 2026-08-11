const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadDemoCollection } = require('./helpers');

const FIXTURE_IMAGE = path.join(__dirname, 'fixtures', 'test-image.png');

async function setUpImgurCharacters(page) {
    await loadDemoCollection(page);
    await page.evaluate(() => {
        AppState.seriesData['Dungeon Meshi'].characters[0].image = 'https://i.imgur.com/removed.png';
        AppState.seriesData['One Piece'].characters[0].image = 'https://i.imgur.com/removed.png';
    });
}

// Finds a PNG's width/height straight out of a raw multipart upload body -
// the IHDR chunk's dimensions sit 16/20 bytes after the PNG signature,
// regardless of anything else surrounding it in the multipart body.
function findPngDimsInBuffer(buffer) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const idx = buffer.indexOf(sig);
    if (idx === -1) return null;
    return { width: buffer.readUInt32BE(idx + 16), height: buffer.readUInt32BE(idx + 20) };
}

module.exports = [
    {
        // Regression test for a real report: Imgur no longer accepts new
        // API app registrations, so the old "Generate Imgur Links" button
        // (which just regenerated $ai commands for imgur links that were
        // already there) is superseded by an actual migration tool.
        name: 'the deprecated "Generate Imgur Links" button now opens the bulk transfer modal listing every imgur-hosted character',
        async run(page) {
            await setUpImgurCharacters(page);

            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });

            const rowCount = await page.locator('.imgur-transfer-row').count();
            assert.strictEqual(rowCount, 2, `expected exactly the 2 imgur-hosted characters listed, got ${rowCount}`);

            const allChecked = await page.locator('.imgur-transfer-check').evaluateAll(boxes => boxes.every(b => b.checked));
            assert.ok(allChecked, 'expected every character to be checked by default');
        }
    },
    {
        name: 'unchecking a character excludes it from the transfer',
        async run(page) {
            let uploadCount = 0;
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                uploadCount++;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/x.png' }] } })
                });
            });

            await setUpImgurCharacters(page);
            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });

            await page.click('button:has-text("Select None")');
            await page.click('.imgur-transfer-row:nth-child(1) .imgur-transfer-check');

            await page.fill('#imgurTransferTokenInput', 'test-token');
            await page.click('#imgurTransferOverlay button:has-text("Save Token")');
            await page.click('#imgurTransferStartBtn');
            await page.waitForSelector('.imgur-transfer-status .command-text');
            await page.waitForTimeout(200);

            assert.strictEqual(uploadCount, 1, `expected only the checked character to be uploaded, got ${uploadCount} uploads`);
        }
    },
    {
        // Regression test for a real report: each transferred character
        // needs its own $ai command (with its own confirm button) since
        // each has to be run in Discord separately - not one bulk confirm
        // for everything.
        name: 'a successful transfer generates a per-character $ai command, and confirming one applies only that character\'s image',
        async run(page) {
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/transferred.png' }] } })
                });
            });

            await setUpImgurCharacters(page);
            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });
            await page.fill('#imgurTransferTokenInput', 'test-token');
            await page.click('#imgurTransferOverlay button:has-text("Save Token")');
            await page.click('#imgurTransferStartBtn');
            await page.waitForSelector('.imgur-transfer-status .command-text');
            await page.waitForTimeout(300);

            const commandTexts = await page.locator('.imgur-transfer-status .command-text').allTextContents();
            assert.strictEqual(commandTexts.length, 2, 'expected a command for each transferred character');
            assert.ok(commandTexts[0].startsWith('$ai Marcille Donato$'), `expected the first command to name Marcille Donato, got: "${commandTexts[0]}"`);
            assert.ok(commandTexts[1].startsWith('$ai Monkey D. Luffy$'), `expected the second command to name Monkey D. Luffy, got: "${commandTexts[1]}"`);

            // Only confirm the first row.
            await page.click('.imgur-transfer-row:nth-child(1) button:has-text("Ran this in Discord")');
            await page.waitForTimeout(200);

            const images = await page.evaluate(() => ({
                marcille: AppState.seriesData['Dungeon Meshi'].characters[0].image,
                luffy: AppState.seriesData['One Piece'].characters[0].image
            }));
            assert.strictEqual(images.marcille, 'https://cdn.imgchest.com/files/transferred.png', 'expected the confirmed character\'s image to be applied');
            assert.strictEqual(images.luffy, 'https://i.imgur.com/removed.png', 'expected the unconfirmed character\'s image to be untouched');
        }
    },
    {
        name: 'a per-character failure is reported inline without stopping the rest of the batch',
        async run(page) {
            let callCount = 0;
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                callCount++;
                if (callCount === 1) {
                    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) });
                } else {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/ok.png' }] } })
                    });
                }
            });

            await setUpImgurCharacters(page);
            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });
            await page.fill('#imgurTransferTokenInput', 'test-token');
            await page.click('#imgurTransferOverlay button:has-text("Save Token")');
            await page.click('#imgurTransferStartBtn');
            await page.waitForSelector('.imgur-transfer-status .command-text', { timeout: 20000 });
            await page.waitForTimeout(300);

            const firstStatus = await page.locator('.imgur-transfer-row').nth(0).locator('.imgur-transfer-status').textContent();
            assert.ok(/failed/i.test(firstStatus), `expected the first row to show a failure, got: "${firstStatus}"`);
            const secondCommandCount = await page.locator('.imgur-transfer-row').nth(1).locator('.command-text').count();
            assert.strictEqual(secondCommandCount, 1, 'expected the second character to still succeed despite the first one failing');

            page._consoleErrors = page._consoleErrors.filter(e => !e.includes('Failed to load resource'));
        }
    },
    {
        name: 'no imgur-hosted characters shows an empty state and disables the transfer button',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });

            const emptyMessage = await page.locator('#imgurTransferList').textContent();
            assert.ok(/no characters currently have an imgur/i.test(emptyMessage), `expected an empty-state message, got: "${emptyMessage}"`);
            const disabled = await page.locator('#imgurTransferStartBtn').isDisabled();
            assert.ok(disabled, 'expected the Transfer Selected button to be disabled with nothing to transfer');
        }
    },
    {
        // New feature: cropping is optional per row - cropping one row
        // shouldn't affect any other row's transfer.
        name: 'cropping one row uploads the cropped 225x350 version for that row only, others stay untouched',
        async run(page) {
            await page.route('https://i.imgur.com/removed.png', (route) => {
                route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(FIXTURE_IMAGE) });
            });

            const uploadedDims = [];
            await page.route('https://api.imgchest.com/v1/post', (route) => {
                const dims = findPngDimsInBuffer(route.request().postDataBuffer());
                uploadedDims.push(dims);
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: { images: [{ link: 'https://cdn.imgchest.com/files/x' + uploadedDims.length + '.png' }] } })
                });
            });

            await setUpImgurCharacters(page);
            await page.click('#generateImgurBtn');
            await page.waitForSelector('#imgurTransferOverlay', { state: 'visible' });

            // Crop only the first row (Marcille).
            await page.click('.imgur-transfer-row:nth-child(1) button:has-text("Crop first")');
            await page.waitForSelector('#imageCropperWorkspace', { state: 'visible' });
            await page.click('#imageCropperUseBtn');
            await page.waitForSelector('#imageCropperOverlay', { state: 'hidden' });

            const rowStatus = await page.locator('.imgur-transfer-row:nth-child(1) .imgur-transfer-status').textContent();
            assert.ok(/cropped/i.test(rowStatus), `expected the row to show it was cropped, got: "${rowStatus}"`);

            await page.fill('#imgurTransferTokenInput', 'test-token');
            await page.click('#imgurTransferOverlay button:has-text("Save Token")');
            await page.click('#imgurTransferStartBtn');
            await page.waitForSelector('.imgur-transfer-status .command-text');
            await page.waitForTimeout(300);

            assert.strictEqual(uploadedDims.length, 2, 'expected both rows to upload');
            assert.deepStrictEqual(uploadedDims[0], { width: 225, height: 350 }, `expected the cropped row's upload to be 225x350, got ${JSON.stringify(uploadedDims[0])}`);
            assert.deepStrictEqual(uploadedDims[1], { width: 1, height: 1 }, `expected the un-cropped row's upload to stay the original 1x1 fixture, got ${JSON.stringify(uploadedDims[1])}`);
        }
    }
];
