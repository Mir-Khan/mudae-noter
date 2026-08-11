const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

async function acceptNextDialog(page) {
    page.once('dialog', dialog => dialog.accept());
}

async function dismissNextDialog(page) {
    page.once('dialog', dialog => dialog.dismiss());
}

module.exports = [
    {
        // Regression check for the core interaction: a single click/tap
        // should never delete anything by itself - it only "arms" the
        // badge. This is what makes the badge safe on mobile, where a
        // native confirm() dialog is easy to reflex-tap through anyway.
        name: 'Notes tab: a single click on the delete badge arms it without deleting anything',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            await card.locator('[data-action="delete-character"]').click();
            await page.waitForTimeout(150);

            const badgeText = await card.locator('[data-action="delete-character"]').textContent();
            assert.ok(/confirm/i.test(badgeText), `expected the badge to show an armed/confirm state, got: "${badgeText}"`);

            const cardCount = await page.locator('.character-card').count();
            const before = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });
            assert.ok(cardCount > 0 && before > 0, 'expected nothing to have been deleted from a single click');
        }
    },
    {
        name: 'Notes tab: a second click on the armed badge deletes the character',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();
            const series = await card.getAttribute('data-original-series');

            const beforeCount = await page.evaluate((s) => AppState.seriesData[s].characters.length, series);

            const badge = card.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            await badge.click();
            await page.waitForTimeout(150);

            const afterCount = await page.evaluate((s) => (AppState.seriesData[s] ? AppState.seriesData[s].characters.length : 0), series);
            assert.strictEqual(afterCount, beforeCount - 1, 'expected exactly one character removed from that series');

            const stillThere = await page.evaluate((n) => {
                for (const s in AppState.seriesData) {
                    if (AppState.seriesData[s].characters.some(c => c.name === n)) return true;
                }
                return false;
            }, name);
            assert.strictEqual(stillThere, false, `expected "${name}" to be fully removed`);
        }
    },
    {
        name: 'Notes tab: letting the arm timeout elapse disarms the badge with nothing deleted',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            const series = await card.getAttribute('data-original-series');
            const beforeCount = await page.evaluate((s) => AppState.seriesData[s].characters.length, series);

            const badge = card.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            let badgeText = await badge.textContent();
            assert.ok(/confirm/i.test(badgeText), 'expected the badge to be armed right after the first click');

            await page.waitForTimeout(3200);
            badgeText = await badge.textContent();
            assert.ok(!/confirm/i.test(badgeText), `expected the badge to disarm itself after the timeout, got: "${badgeText}"`);

            const afterCount = await page.evaluate((s) => AppState.seriesData[s].characters.length, series);
            assert.strictEqual(afterCount, beforeCount, 'expected nothing to be deleted after the arm timeout elapsed');
        }
    },
    {
        name: 'deleting a series\' last character removes the whole series',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                // Trim Dungeon Meshi down to exactly one character.
                AppState.seriesData['Dungeon Meshi'].characters = [AppState.seriesData['Dungeon Meshi'].characters[0]];
            });
            await page.evaluate(() => { displaySeries(); });

            const card = page.locator('.character-card[data-original-series="Dungeon Meshi"]').first();
            const badge = card.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            await badge.click();
            await page.waitForTimeout(150);

            const seriesExists = await page.evaluate(() => Object.prototype.hasOwnProperty.call(AppState.seriesData, 'Dungeon Meshi'));
            assert.strictEqual(seriesExists, false, 'expected the series to be removed entirely once its last character is deleted');

            const groupCardCount = await page.locator('.series-card:has-text("Dungeon Meshi")').count();
            assert.strictEqual(groupCardCount, 0, 'expected no leftover empty series-card for Dungeon Meshi');
        }
    },
    {
        name: 'Notes tab bulk: Select Shown / Clear Selection toggle the bar, and Delete Selected removes exactly those characters',
        async run(page) {
            await loadDemoCollection(page);

            await page.click('button:has-text("Select Shown for Delete")');
            await page.waitForTimeout(150);
            let barVisible = await page.locator('#notesDeleteSelectionBar').isVisible();
            assert.ok(barVisible, 'expected the delete-selection bar to appear once characters are selected');

            const selectedCountBefore = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });

            await page.click('button:has-text("Clear Delete Selection")');
            await page.waitForTimeout(150);
            barVisible = await page.locator('#notesDeleteSelectionBar').isVisible();
            assert.strictEqual(barVisible, false, 'expected Clear Delete Selection to hide the bar again');

            // Re-select just one card via its own select box for a precise delete.
            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();
            await card.locator('[data-action="toggle-delete-select"]').click();
            await page.waitForTimeout(150);

            const countText = await page.locator('#notesDeleteSelectionCount').textContent();
            assert.strictEqual(countText, '1 selected', `expected exactly 1 selected, got: "${countText}"`);

            await acceptNextDialog(page);
            await page.click('#notesDeleteSelectionBar button:has-text("Delete Selected")');
            await page.waitForTimeout(150);

            const stillThere = await page.evaluate((n) => {
                for (const s in AppState.seriesData) {
                    if (AppState.seriesData[s].characters.some(c => c.name === n)) return true;
                }
                return false;
            }, name);
            assert.strictEqual(stillThere, false, `expected "${name}" to have been deleted via bulk delete`);

            assert.ok(selectedCountBefore > 0, 'sanity check that the demo collection had characters to begin with');
        }
    },
    {
        name: 'Sort tab: the same arm/confirm two-click behavior removes both the character and its sortData row for a matched entry',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-sort-btn');
            await page.fill('#sortInput', 'Marcille Donato - Dungeon Meshi 1,234 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const row = page.locator('#sortCharacterList .sort-character-item').first();
            const badge = row.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            await badge.click();
            await page.waitForTimeout(150);

            const sortDataLength = await page.evaluate(() => (AppState.sortData || []).length);
            assert.strictEqual(sortDataLength, 0, 'expected the sortData row to be removed too');

            const stillThere = await page.evaluate(() => {
                const chars = AppState.seriesData['Dungeon Meshi'] ? AppState.seriesData['Dungeon Meshi'].characters : [];
                return chars.some(c => c.name === 'Marcille Donato');
            });
            assert.strictEqual(stillThere, false, 'expected Marcille Donato to be deleted from seriesData');
        }
    },
    {
        name: 'Sort tab: deleting an unmatched entry only removes the sortData row, not any character',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-sort-btn');
            await page.fill('#sortInput', 'Totally Unmatched Person - Some Unknown Series 999 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const beforeTotal = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });

            const row = page.locator('#sortCharacterList .sort-character-item').first();
            const badge = row.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            await badge.click();
            await page.waitForTimeout(150);

            const sortDataLength = await page.evaluate(() => (AppState.sortData || []).length);
            assert.strictEqual(sortDataLength, 0, 'expected the unmatched sortData row to be removed');

            const afterTotal = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });
            assert.strictEqual(afterTotal, beforeTotal, 'expected no seriesData characters to be touched for an unmatched entry');
        }
    },
    {
        name: 'Sort tab bulk: Delete Selected removes a mix of matched and unmatched entries correctly',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-sort-btn');
            await page.fill('#sortInput', 'Marcille Donato - Dungeon Meshi 1,234 ka\nTotally Unmatched Person - Some Unknown Series 999 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const rows = page.locator('#sortCharacterList .sort-character-item');
            await rows.nth(0).click();
            await rows.nth(1).click();
            await page.waitForSelector('#sortSelectionBar', { state: 'visible' });

            await acceptNextDialog(page);
            await page.click('#sortSelectionBar button:has-text("Delete Selected")');
            await page.waitForTimeout(150);

            const sortDataLength = await page.evaluate(() => (AppState.sortData || []).length);
            assert.strictEqual(sortDataLength, 0, 'expected both entries to be removed from sortData');

            const marcilleGone = await page.evaluate(() => {
                const chars = AppState.seriesData['Dungeon Meshi'] ? AppState.seriesData['Dungeon Meshi'].characters : [];
                return !chars.some(c => c.name === 'Marcille Donato');
            });
            assert.ok(marcilleGone, 'expected Marcille Donato to be deleted from seriesData too');
        }
    },
    {
        name: 'bulk delete confirm() dialog: canceling leaves everything untouched',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('button:has-text("Select Shown for Delete")');
            await page.waitForSelector('#notesDeleteSelectionBar', { state: 'visible' });

            const beforeTotal = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });

            await dismissNextDialog(page);
            await page.click('#notesDeleteSelectionBar button:has-text("Delete Selected")');
            await page.waitForTimeout(150);

            const afterTotal = await page.evaluate(() => {
                let total = 0;
                for (const s in AppState.seriesData) total += AppState.seriesData[s].characters.length;
                return total;
            });
            assert.strictEqual(afterTotal, beforeTotal, 'expected nothing deleted when the confirm dialog is dismissed');
        }
    },
    {
        name: 'a deleted character can be restored with Undo',
        async run(page) {
            await loadDemoCollection(page);
            const card = page.locator('.character-card').first();
            const name = (await card.locator('.character-name').textContent()).trim();
            const series = await card.getAttribute('data-original-series');

            const badge = card.locator('[data-action="delete-character"]');
            await badge.click();
            await page.waitForTimeout(150);
            await badge.click();
            await page.waitForTimeout(150);

            let stillThere = await page.evaluate((n) => {
                for (const s in AppState.seriesData) {
                    if (AppState.seriesData[s].characters.some(c => c.name === n)) return true;
                }
                return false;
            }, name);
            assert.strictEqual(stillThere, false, 'expected the character to be gone before undoing');

            await page.evaluate(() => { undoLastAction(); });
            await page.waitForTimeout(150);

            stillThere = await page.evaluate((n) => {
                for (const s in AppState.seriesData) {
                    if (AppState.seriesData[s].characters.some(c => c.name === n)) return true;
                }
                return false;
            }, name);
            assert.strictEqual(stillThere, true, 'expected Undo to restore the deleted character');
        }
    }
];
