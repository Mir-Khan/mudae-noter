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

// Regression test for a real report: real $wishlist output can tack on a
// ":kakera:" emoji code and/or a "+N%" kakera boost percentage after the
// star/checkmark markers, in varying order - none of that is a real name.
const WISHLIST_WITH_KAKERA_DECORATION = `Master Chief ✅:kakera:
Riza Hawkeye ✅ ⭐ +200%
Ryland Grace ✅:kakera: +100%
N ✅ ⭐:kakera: +100%
Ginko ✅:kakera: +100%
Jerma ✅:kakera:
Kaguya Shinomiya ✅ ⭐ +100%
Royal Bodyguard Carl ✅:kakera:
Miku (Goku) ✅:kakera: +130%
Princess Donut ✅:kakera:
Marcille Donato ✅:kakera: +30%
Noodle ✅:kakera:
Tatsu ✅:kakera:
Falin Touden ✅:kakera:
Cynthia ✅:kakera:
Kim Wexler ✅
Yuru ✅:kakera:
Lugia
Ichika Nakano ✅:kakera:
Shouta Aizawa ✅:kakera:`;

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
        name: 'a ":kakera:" icon and "+N%" kakera boost after the markers are stripped, regardless of order, leaving just the name',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'Kakera', WISHLIST_WITH_KAKERA_DECORATION);

            const names = await page.evaluate(() => {
                const entry = Object.values(WishlistState.entries).find(e => e.name === 'Kakera');
                return entry.characters.map(c => c.name);
            });

            assert.deepStrictEqual(names, [
                'Master Chief', 'Riza Hawkeye', 'Ryland Grace', 'N', 'Ginko', 'Jerma', 'Kaguya Shinomiya',
                'Royal Bodyguard Carl', 'Miku (Goku)', 'Princess Donut', 'Marcille Donato', 'Noodle', 'Tatsu',
                'Falin Touden', 'Cynthia', 'Kim Wexler', 'Yuru', 'Lugia', 'Ichika Nakano', 'Shouta Aizawa'
            ], `expected only plain names with kakera decoration stripped, got: ${JSON.stringify(names)}`);

            const flags = await page.evaluate(() => {
                const entry = Object.values(WishlistState.entries).find(e => e.name === 'Kakera');
                const riza = entry.characters.find(c => c.name === 'Riza Hawkeye');
                const n = entry.characters.find(c => c.name === 'N');
                const kim = entry.characters.find(c => c.name === 'Kim Wexler');
                const lugia = entry.characters.find(c => c.name === 'Lugia');
                return { riza, n, kim, lugia };
            });
            assert.deepStrictEqual(flags.riza, { name: 'Riza Hawkeye', isStarWish: true, isClaimed: true });
            assert.deepStrictEqual(flags.n, { name: 'N', isStarWish: true, isClaimed: true }, 'expected star+check to be recognized even when check comes before star and :kakera: follows');
            assert.deepStrictEqual(flags.kim, { name: 'Kim Wexler', isStarWish: false, isClaimed: true });
            assert.deepStrictEqual(flags.lugia, { name: 'Lugia', isStarWish: false, isClaimed: false });
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
        // Regression test for a real report: switching collections reloads
        // the page and restores whichever tab was last active. If that tab
        // is Wishlists, it used to render before WishlistState had actually
        // been loaded from its storage key (loadFromLocalStorage ran before
        // loadWishlists), painting an empty list that never refreshed on its
        // own - only an unrelated action like saving a new wishlist would
        // trigger a re-render and make the real (already-loaded) contents
        // suddenly reappear, which looked like data loss / cross-collection
        // bleeding.
        name: 'the Wishlists tab shows its saved wishlists immediately on reload when it was the last-active tab, with no extra action needed',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'ReloadTest', 'Lightning\nJin Sakai');

            // addWishlist leaves the Wishlists tab active - reloading now
            // simulates switching collections (which does its own
            // location.reload()) while Wishlists was the open tab.
            await page.reload();
            const gotIt = page.locator('#changelogOverlay button:has-text("Got it")');
            if (await gotIt.isVisible().catch(() => false)) await gotIt.click();

            // Deliberately NOT clicking the Wishlists tab button here - it
            // should already be showing, restored as the active tab.
            await page.waitForSelector('.wishlist-card', { timeout: 3000 });
            const cardText = await page.locator('.wishlist-card').textContent();
            assert.ok(cardText.includes('ReloadTest'), `expected the wishlist to render immediately on reload without any extra action, got: "${cardText}"`);
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
