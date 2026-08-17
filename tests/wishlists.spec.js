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
                const entry = Object.values(AppState.wishlists.entries).find(e => e.name === 'Kakera');
                return entry.characters.map(c => c.name);
            });

            assert.deepStrictEqual(names, [
                'Master Chief', 'Riza Hawkeye', 'Ryland Grace', 'N', 'Ginko', 'Jerma', 'Kaguya Shinomiya',
                'Royal Bodyguard Carl', 'Miku (Goku)', 'Princess Donut', 'Marcille Donato', 'Noodle', 'Tatsu',
                'Falin Touden', 'Cynthia', 'Kim Wexler', 'Yuru', 'Lugia', 'Ichika Nakano', 'Shouta Aizawa'
            ], `expected only plain names with kakera decoration stripped, got: ${JSON.stringify(names)}`);

            const flags = await page.evaluate(() => {
                const entry = Object.values(AppState.wishlists.entries).find(e => e.name === 'Kakera');
                const riza = entry.characters.find(c => c.name === 'Riza Hawkeye');
                const n = entry.characters.find(c => c.name === 'N');
                const kim = entry.characters.find(c => c.name === 'Kim Wexler');
                const lugia = entry.characters.find(c => c.name === 'Lugia');
                return { riza, n, kim, lugia };
            });
            const base = { boostPercent: null, isLocked: false, isBooster: false, boosterPercent: null, wantsKakeraBoost: false, includeInCommand: false, hasUnexplainedBoost: false, hasSelfBoostPortion: false, selfResidualPercent: null, boosterPercentEstimated: false };
            // A claimed character's own shown +N% is NOT their own
            // Ouroperk contribution - it's what they RECEIVE from
            // neighbors, so their own contribution can only be solved
            // indirectly via an adjacent unclaimed "anchor" elsewhere in
            // the chain. This list is almost entirely claimed characters
            // with no such anchor near any of the boosted entries, so none
            // of them can actually be solved - correctly left un-flagged
            // rather than guessed, same as an unclaimed character's own
            // (unrelated, never a booster) +N%.
            assert.deepStrictEqual(flags.riza, { name: 'Riza Hawkeye', isStarWish: true, isClaimed: true, ...base, boostPercent: 200 });
            assert.deepStrictEqual(flags.n, { name: 'N', isStarWish: true, isClaimed: true, ...base, boostPercent: 100 }, 'expected star+check to be recognized even when check comes before star and :kakera: follows');
            assert.deepStrictEqual(flags.kim, { name: 'Kim Wexler', isStarWish: false, isClaimed: true, ...base });
            assert.deepStrictEqual(flags.lugia, { name: 'Lugia', isStarWish: false, isClaimed: false, ...base });
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
        // is Wishlists, it used to render before the wishlist data had
        // actually been loaded (a separate load call ran after the render),
        // painting an empty list that never refreshed on its own - only an
        // unrelated action like saving a new wishlist would trigger a
        // re-render and make the real (already-loaded) contents suddenly
        // reappear, which looked like data loss / cross-collection bleeding.
        // Now that wishlists live in AppState itself, they're loaded as part
        // of the same call that renders the restored tab, so this can't
        // happen - kept as a guard against a similar ordering bug returning.
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
        name: 'wishlists survive parsing a fresh collection into the SAME collection (Parse Input doesn\'t touch them)',
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
    },
    {
        // Regression test for a real report: wishlists used to be stored
        // globally (one shared list for every collection), so a wishlist
        // saved while on one collection would show up - and be editable -
        // under a completely unrelated one, and switching back would make
        // it look like the original had lost its own wishlists. Wishlists
        // now live inside each collection's own saved state.
        name: 'a wishlist saved in one collection does not show up in a different collection, and each keeps its own',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');
            await addWishlist(page, 'CollectionA-Wish', 'Lightning');

            const firstId = await page.evaluate(() => ensureCollectionsMeta().activeId);

            // Create and switch to a second collection directly (bypassing
            // the native prompt() the real "+ New" button uses) - this is
            // exactly what switchCollection()/createNewCollection() do under
            // the hood: update the collections meta, then reload.
            await page.evaluate(() => {
                const meta = ensureCollectionsMeta();
                const newId = generateCollectionId();
                meta.collections[newId] = { id: newId, name: 'Second Collection' };
                meta.order.push(newId);
                meta.activeId = newId;
                saveCollectionsMeta(meta);
            });
            await page.reload();
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');

            const cardCountOnSecond = await page.locator('.wishlist-card').count();
            assert.strictEqual(cardCountOnSecond, 0, 'expected none of the first collection\'s wishlists to show up on the second collection');
            const emptyHint = await page.locator('#wishlistsList .sort-empty-hint').isVisible().catch(() => false);
            assert.ok(emptyHint, 'expected the brand new second collection to show the "no wishlists" empty state');

            await addWishlist(page, 'CollectionB-Wish', 'Jin Sakai');

            // Switch back to the first collection.
            await page.evaluate((idToRestore) => {
                const meta = ensureCollectionsMeta();
                meta.activeId = idToRestore;
                saveCollectionsMeta(meta);
            }, firstId);
            await page.reload();
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');

            const namesOnFirst = await page.locator('.wishlist-card-name').allTextContents();
            assert.deepStrictEqual(namesOnFirst, ['CollectionA-Wish'],
                `expected only the first collection's own wishlist back, got: ${JSON.stringify(namesOnFirst)}`);
        }
    },
    {
        // Regression coverage for the migration path itself: anyone with
        // wishlists saved under the old shared-across-all-collections
        // storage shouldn't have them vanish the moment this ships - each
        // pre-existing collection should get a one-time copy.
        name: 'legacy shared wishlists are migrated into every pre-existing collection once, then the old storage is cleaned up',
        async run(page) {
            await dismissChangelogIfPresent(page);

            const ids = await page.evaluate(() => {
                const idA = generateCollectionId();
                const idB = generateCollectionId();
                const meta = {
                    order: [idA, idB],
                    collections: { [idA]: { id: idA, name: 'Old A' }, [idB]: { id: idB, name: 'Old B' } },
                    activeId: idA
                };
                localStorage.setItem('mudaeCollectionsMeta', JSON.stringify(meta));
                localStorage.setItem('mudaeWishlists', JSON.stringify({
                    entries: { wl1: { id: 'wl1', name: 'Legacy', characters: [{ name: 'Lightning', isStarWish: false, isClaimed: false }], updatedAt: 1 } },
                    order: ['wl1']
                }));
                return { idA, idB };
            });

            await page.reload();
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');

            const namesOnA = await page.locator('.wishlist-card-name').allTextContents();
            assert.deepStrictEqual(namesOnA, ['Legacy'], `expected the legacy wishlist migrated onto the active collection, got: ${JSON.stringify(namesOnA)}`);

            // The OTHER pre-existing collection should also have gotten its
            // own copy - the migration covers every collection at once, not
            // just whichever happens to be active first.
            await page.evaluate((id) => {
                const meta = ensureCollectionsMeta();
                meta.activeId = id;
                saveCollectionsMeta(meta);
            }, ids.idB);
            await page.reload();
            await dismissChangelogIfPresent(page);
            await page.click('#tab-wishlists-btn');

            const namesOnB = await page.locator('.wishlist-card-name').allTextContents();
            assert.deepStrictEqual(namesOnB, ['Legacy'], `expected the other pre-existing collection to also get a copy, got: ${JSON.stringify(namesOnB)}`);

            const legacyStillThere = await page.evaluate(() => localStorage.getItem('mudaeWishlists'));
            assert.strictEqual(legacyStillThere, null, 'expected the legacy shared storage key to be removed once migrated');
        }
    }
];
