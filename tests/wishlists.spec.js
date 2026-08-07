const assert = require('assert');
const { dismissChangelogIfPresent, loadDemoCollection } = require('./helpers');

const WISHLIST_A = `Portgas D. Ace ⭐
Lightning
Aerith Gainsborough
Jin Sakai
Red (Transistor)
Satoru Gojo
Reze
Killua Zoldyck`;

const WISHLIST_B = `Lightning
Jin Sakai ✅
Satoru Gojo ⭐
Someone Else Entirely`;

async function addWishlist(page, name, text) {
    await page.click('button:has-text("+ Add Wishlist")');
    await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
    await page.fill('#wishlistNameInput', name);
    await page.fill('#wishlistTextInput', text);
    await page.click('button:has-text("Save Wishlist")');
    await page.waitForTimeout(150);
}

module.exports = [
    {
        name: 'saving a wishlist parses one character per line, including the star/checkmark markers',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Me', WISHLIST_A);

            const card = page.locator('.wishlist-card', { hasText: 'Me' });
            await assert.doesNotReject(card.waitFor({ state: 'visible' }));
            const cardText = await card.textContent();
            assert.ok(cardText.includes('8 characters'), `expected 8 characters counted, got: "${cardText}"`);
            assert.ok(cardText.includes('1 starwish'), `expected 1 starwish counted, got: "${cardText}"`);
        }
    },
    {
        name: 'comparing two wishlists shows exactly the overlapping characters, with markers preserved',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Me', WISHLIST_A);
            await addWishlist(page, 'Friend', WISHLIST_B);

            await page.selectOption('#wishlistCompareA', { label: 'Me' });
            await page.selectOption('#wishlistCompareB', { label: 'Friend' });
            await page.click('button:has-text("Compare Wishlists")');
            await page.waitForTimeout(150);

            const resultText = await page.locator('#wishlistCompareResult').textContent();
            assert.ok(resultText.includes('3 characters'), `expected 3 overlapping characters, got: "${resultText}"`);

            const overlapNames = await page.locator('.wishlist-overlap-name').allTextContents();
            assert.deepStrictEqual(overlapNames.slice().sort(), ['Jin Sakai', 'Lightning', 'Satoru Gojo'],
                `expected exactly the shared characters, got: ${JSON.stringify(overlapNames)}`);
            assert.ok(!overlapNames.includes('Someone Else Entirely'), 'expected a name unique to one side to be excluded');
            assert.ok(!overlapNames.includes('Portgas D. Ace'), 'expected a name unique to the other side to be excluded');

            const markerCount = await page.locator('.wishlist-marker').count();
            assert.ok(markerCount >= 2, `expected the starwish/claimed markers to render in the overlap results, got ${markerCount}`);
        }
    },
    {
        name: 'comparing a wishlist against itself and against nothing selected both show a clear message, not a crash',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Solo', 'Lightning');

            await page.click('button:has-text("Compare Wishlists")');
            await page.waitForTimeout(100);
            const noneSelectedMsg = await page.locator('#wishlistCompareResult').textContent();
            assert.ok(noneSelectedMsg.trim().length > 0, 'expected a message when nothing is selected');

            await page.selectOption('#wishlistCompareA', { label: 'Solo' });
            await page.selectOption('#wishlistCompareB', { label: 'Solo' });
            await page.click('button:has-text("Compare Wishlists")');
            await page.waitForTimeout(100);
            const sameSelectedMsg = await page.locator('#wishlistCompareResult').textContent();
            assert.ok(sameSelectedMsg.trim().length > 0, 'expected a message when the same wishlist is picked twice');
        }
    },
    {
        name: 'editing a wishlist pre-fills the raw text (including markers) and updates it in place',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Me', 'Portgas D. Ace ⭐\nJin Sakai ✅');

            await page.locator('.wishlist-card').locator('button:has-text("Edit")').click();
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            const prefilled = await page.inputValue('#wishlistTextInput');
            assert.strictEqual(prefilled, 'Portgas D. Ace ⭐\nJin Sakai ✅', `expected the markers to round-trip into the edit box, got: "${prefilled}"`);

            await page.fill('#wishlistTextInput', 'Portgas D. Ace ⭐\nJin Sakai ✅\nNew Character');
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            const cardCount = await page.locator('.wishlist-card').count();
            assert.strictEqual(cardCount, 1, 'expected editing to update the existing wishlist, not create a second one');
            const cardText = await page.locator('.wishlist-card').textContent();
            assert.ok(cardText.includes('3 characters'), `expected the edited count to be 3, got: "${cardText}"`);
        }
    },
    {
        name: 'deleting a wishlist removes it from the list and the compare dropdowns',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'ToDelete', 'Lightning');

            await page.locator('.wishlist-card').locator('button:has-text("Delete")').click();
            await page.waitForTimeout(150);

            const cardCount = await page.locator('.wishlist-card').count();
            assert.strictEqual(cardCount, 0, 'expected the wishlist card to be gone after deleting');
            const options = await page.locator('#wishlistCompareA option').allTextContents();
            assert.ok(!options.includes('ToDelete'), 'expected the deleted wishlist to be gone from the compare dropdown too');
        }
    },
    {
        name: 'saved wishlists persist across a page reload',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Persistent', 'Lightning\nJin Sakai');

            await page.reload();
            const gotIt = page.locator('#changelogOverlay button:has-text("Got it")');
            if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
            await page.click('#tab-wishlists-btn');
            await page.waitForSelector('#wishlistsTabPanel');

            const cardText = await page.locator('.wishlist-card').textContent();
            assert.ok(cardText.includes('Persistent'), `expected the wishlist to survive a reload, got: "${cardText}"`);
            assert.ok(cardText.includes('2 characters'), `expected both characters to survive a reload, got: "${cardText}"`);
        }
    },
    {
        name: 'wishlists tab is unaffected by which collection is loaded (Parse Input doesn\'t touch it)',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Independent', 'Lightning');

            await page.click('#tab-notes-btn');
            await loadDemoCollection(page);

            await page.click('#tab-wishlists-btn');
            const cardText = await page.locator('.wishlist-card').textContent();
            assert.ok(cardText.includes('Independent'), 'expected the wishlist to survive parsing an unrelated collection');
        }
    }
];
