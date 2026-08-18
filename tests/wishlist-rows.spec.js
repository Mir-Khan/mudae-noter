const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

async function openAddWishlistModal(page) {
    await dismissChangelogIfPresent(page);
    await page.click('#tab-wishlists-btn');
    await page.click('button:has-text("+ Add Wishlist")');
    await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
}

async function markAsOwnWishlist(page) {
    await page.check('#wishlistIsOwnCheckbox');
}

module.exports = [
    {
        name: 'importing pasted text with a "+N%" boost keeps the boost percent, and rows render for each character',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'Rows');
            await page.fill('#wishlistTextInput', 'Yoru ⭐+200%\nSaber');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const rowNames = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(rowNames, ['Yoru', 'Saber']);

            const boostText = await page.locator('.wishlist-row').first().textContent();
            assert.ok(boostText.includes('+200%'), `expected the boost percent marker on the row, got: "${boostText}"`);
        }
    },
    {
        name: 'dragging a row reorders the wishlist, and the order is what gets saved',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'DragOrder');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Simulate the drag by driving the same array mutation the
            // drop handler performs (jsdom-less Playwright drag events for
            // HTML5 dnd are unreliable) - functionally equivalent proof
            // that the working array (and thus what gets saved) reorders.
            await page.evaluate(() => {
                const [moved] = wishlistModalCharacters.splice(0, 1);
                wishlistModalCharacters.splice(2, 0, moved);
                renderWishlistModalRows();
            });

            const rowNames = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(rowNames, ['Beta', 'Gamma', 'Alpha']);

            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            const savedNames = await page.evaluate(() => {
                const entry = Object.values(AppState.wishlists.entries).find(e => e.name === 'DragOrder');
                return entry.characters.map(c => c.name);
            });
            assert.deepStrictEqual(savedNames, ['Beta', 'Gamma', 'Alpha']);
        }
    },
    {
        name: 'manually flagging a character as locked/booster survives re-importing an updated paste',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'Flags');
            // Saber is claimed (✅) so the Booster toggle stays interactive -
            // Ouroperks only exist on claimed characters.
            await page.fill('#wishlistTextInput', 'Yoru\nSaber ✅\nArtoria');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Flag Saber (row index 1) as locked and a booster with 100%.
            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            await saberRow.locator('[data-action="lock"]').check();
            await saberRow.locator('[data-action="booster"]').check();
            await page.waitForTimeout(50);
            await saberRow.locator('[data-action="boosterPercent"]').fill('100');
            await page.waitForTimeout(50);

            // Adjacent rows (Yoru, Artoria) should show the neighbor boost.
            const yoruText = await page.locator('.wishlist-row', { hasText: 'Yoru' }).textContent();
            assert.ok(yoruText.includes('100% neighbor'), `expected Yoru to show the neighbor boost, got: "${yoruText}"`);

            // Re-import the same text (simulating a re-paste of an updated $wishlist).
            await page.fill('#wishlistTextInput', 'Yoru\nSaber\nArtoria\nNew Guy');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const saberFlags = await page.evaluate(() => {
                const c = wishlistModalCharacters.find(c => c.name === 'Saber');
                return { isLocked: c.isLocked, isBooster: c.isBooster, boosterPercent: c.boosterPercent };
            });
            assert.deepStrictEqual(saberFlags, { isLocked: true, isBooster: true, boosterPercent: 100 },
                'expected the manual lock/booster flags to survive a re-import');

            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);
            const cardText = await page.locator('.wishlist-card', { hasText: 'Flags' }).textContent();
            assert.ok(cardText.includes('4 characters'), `expected the newly-imported character included, got: "${cardText}"`);
            assert.ok(cardText.includes('1 locked'), `expected the locked count shown, got: "${cardText}"`);
        }
    },
    {
        name: 'the command builder generates the correct flag-letter command and $-joins multiple names',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistCommandNames', 'Yoru\nSaber');
            await page.check('#wishlistFlagStar');
            await page.check('#wishlistFlagLock');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const command = await page.locator('#wishlistCommandOutput .command-text').textContent();
            assert.strictEqual(command, '$swl Yoru$Saber', `expected a combined $swl command joined with $, got: "${command}"`);
        }
    },
    {
        name: 'the command builder without Star splits Lock+Kakera into two separate commands with a caveat note',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistCommandNames', 'Yoru');
            await page.check('#wishlistFlagLock');
            await page.check('#wishlistFlagKakera');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const commands = await page.locator('#wishlistCommandOutput .command-text').allTextContents();
            assert.deepStrictEqual(commands.sort(), ['$wishk Yoru', '$wishl Yoru'].sort());

            const noteText = await page.locator('#wishlistCommandOutput').textContent();
            assert.ok(/confirmed single command/i.test(noteText), 'expected the unconfirmed-combination caveat note');
        }
    },
    {
        name: '"Also Add to This Wishlist" appends the command builder\'s names into the row list',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'BuilderAdd');
            await page.fill('#wishlistCommandNames', 'Brand New Character');
            await page.check('#wishlistFlagStar');
            await page.click('button:has-text("Also Add to This Wishlist")');
            await page.waitForTimeout(100);

            const rowNames = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(rowNames, ['Brand New Character']);

            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);
            const cardText = await page.locator('.wishlist-card', { hasText: 'BuilderAdd' }).textContent();
            assert.ok(cardText.includes('1 character'), `expected the added character to be saved, got: "${cardText}"`);
            assert.ok(cardText.includes('1 starwish'), `expected the star flag from the builder to carry over, got: "${cardText}"`);
        }
    },
    {
        // Regression test for real feedback: capacity is a property of the
        // account actually running commands, not of the collection/tab as
        // a whole - it now lives in the per-wishlist modal, gated behind a
        // "this is my own wishlist" checkbox (hidden for a friend's
        // wishlist you're only tracking to compare against).
        name: 'the capacity section is hidden until "This is my own wishlist" is checked, and only "own" wishlists show capacity on their card',
        async run(page) {
            await openAddWishlistModal(page);
            const hiddenBefore = await page.locator('#wishlistCapacitySection').isVisible();
            assert.strictEqual(hiddenBefore, false, 'expected the capacity section hidden by default');

            await markAsOwnWishlist(page);
            const visibleAfter = await page.locator('#wishlistCapacitySection').isVisible();
            assert.strictEqual(visibleAfter, true, 'expected the capacity section to appear once "This is my own wishlist" is checked');

            await page.fill('#wishlistNameInput', 'MyOwn');
            await page.fill('#wishlistTextInput', 'Yoru ⭐\nSaber');
            await page.fill('#wishlistBonusInput', 'Wishlist slots: 54\nStarwish slots: 4\nWishseries slots: 10');
            await page.click('button:has-text("Prefill from $bonus")');
            await page.waitForTimeout(100);
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            // Mudae's free base (7 wishlist / 1 starwish slot with zero
            // bonuses) is added automatically on top of the parsed bonus.
            const ownCardText = await page.locator('.wishlist-card', { hasText: 'MyOwn' }).textContent();
            assert.ok(ownCardText.includes('2/61 $wl'), `expected wishlist capacity (54 bonus + 7 base) shown, got: "${ownCardText}"`);
            assert.ok(ownCardText.includes('1/5 $sw'), `expected starwish capacity (4 bonus + 1 base) shown, got: "${ownCardText}"`);

            const summaryText = await page.locator('#wishlistBonusSummary').textContent();
            assert.ok(/61 wishlist slots/.test(summaryText), `expected the summary line to reflect the base-adjusted total, got: "${summaryText}"`);

            // A friend's wishlist (not flagged "own") never shows capacity,
            // even if characters happen to be starred/etc.
            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await page.fill('#wishlistNameInput', 'FriendsWishlist');
            await page.fill('#wishlistTextInput', 'Someone ⭐');
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            const friendCardText = await page.locator('.wishlist-card', { hasText: 'FriendsWishlist' }).textContent();
            assert.ok(!friendCardText.includes('$wl'), `expected no capacity shown on a non-"own" wishlist, got: "${friendCardText}"`);
        }
    },
    {
        // Regression test for real feedback: capacity is the user's own
        // account info, not something private to a single wishlist entry -
        // it should never need re-entering. Save Capacity persists
        // immediately (independent of ever clicking Save Wishlist on that
        // particular entry), and any other wishlist flagged "mine" - even
        // one created afterward - picks it up automatically.
        name: 'saved capacity persists on its own (even if the wishlist itself is never saved) and is shared automatically with every "own" wishlist',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistCapacityWishlist', '40');
            await page.fill('#wishlistCapacityStarwish', '5');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);

            // Abandon this wishlist entirely - capacity should still stick.
            await page.click('#wishlistModalOverlay button:has-text("Cancel")');
            await page.waitForTimeout(100);

            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await markAsOwnWishlist(page);
            const wishlistFieldValue = await page.inputValue('#wishlistCapacityWishlist');
            const starwishFieldValue = await page.inputValue('#wishlistCapacityStarwish');
            assert.strictEqual(wishlistFieldValue, '40', 'expected the previously-saved capacity prefilled with no re-entry needed');
            assert.strictEqual(starwishFieldValue, '5', 'expected the previously-saved capacity prefilled with no re-entry needed');

            // Save this second wishlist for real, then a third - both should
            // show the SAME shared capacity without setting it again.
            await page.fill('#wishlistNameInput', 'SecondOwn');
            await page.fill('#wishlistTextInput', 'A\nB');
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            await page.click('button:has-text("+ Add Wishlist")');
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'ThirdOwn');
            await page.fill('#wishlistTextInput', 'C');
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            const secondCardText = await page.locator('.wishlist-card', { hasText: 'SecondOwn' }).textContent();
            const thirdCardText = await page.locator('.wishlist-card', { hasText: 'ThirdOwn' }).textContent();
            assert.ok(secondCardText.includes('2/40 $wl') && secondCardText.includes('0/5 $sw'), `expected shared capacity on the second wishlist, got: "${secondCardText}"`);
            assert.ok(thirdCardText.includes('1/40 $wl') && thirdCardText.includes('0/5 $sw'), `expected the SAME shared capacity on a third, independently-created wishlist, got: "${thirdCardText}"`);

            // A page reload (fresh in-page state, same localStorage) should
            // still have it - it's real persisted data, not a session var.
            await page.reload();
            const gotIt = page.locator('#changelogOverlay button:has-text("Got it")');
            if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
            await page.click('#tab-wishlists-btn');
            await page.locator('.wishlist-card', { hasText: 'SecondOwn' }).locator('button:has-text("Edit")').click();
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            const wishlistFieldAfterReload = await page.inputValue('#wishlistCapacityWishlist');
            assert.strictEqual(wishlistFieldAfterReload, '40', 'expected the saved capacity to survive a page reload');
        }
    },
    {
        // Regression test for a real report: real $bonus output can show a
        // slot line with a trailing deduction on the SAME line - e.g.
        // "Wishlist slots: +47 (...) -20 ($sw)" after sacrificing 20
        // wishlist slots to raise the $starwish cap (confirmed via a real
        // Discord screenshot: "$swl ... You reached your limit of 5
        // $starwish! Would you like to sacrifice 10 wishlist slots..."). The
        // parser used to only grab the leading "+47" and ignore the "-20",
        // wildly overstating real capacity. Tests parseWishlistBonusText's
        // raw math directly (net of the deduction, before any base is
        // added), independent of the base-adding UI flow covered elsewhere.
        name: 'a $bonus slot line with a trailing "-N" deduction nets it against the leading total, not just the leading number',
        async run(page) {
            const REAL_BONUS_TEXT = `:addroll: · Rolls per hour: +23 (6 $k + 0 $kl + 2 $kt + 15 premium) -14 ($bw)
:wlslot: · Wishlist slots: +47 (6 $k + 0 $kl + 4 $kt + 30 premium + 7 server premium 3) -20 ($sw)
:wlslot: · Wishseries slots: 10 (premium)
:sw: · Starwish slots:  +4 (0 $kl + 4 $sw)
:wishprotect: · Wishprotect spawn chance: 1/10,000 ($kl)`;

            await dismissChangelogIfPresent(page);
            const parsed = await page.evaluate((text) => parseWishlistBonusText(text), REAL_BONUS_TEXT);
            assert.strictEqual(parsed.wishlistSlots, 27, `expected 47 - 20 = 27 net wishlist slots, got ${parsed.wishlistSlots}`);
            assert.strictEqual(parsed.starwishSlots, 4, `expected starwish slots unaffected by the wishlist deduction, got ${parsed.starwishSlots}`);
            assert.strictEqual(parsed.wishseriesSlots, 10, `expected wishseries slots (no sign, no deduction) parsed as-is, got ${parsed.wishseriesSlots}`);
        }
    },
    {
        // Regression test for a real report: real $wishlist output can carry
        // a 🔐 marker for a character already locked, in any position
        // relative to the other markers/boost - the parser didn't recognize
        // it at all, so it blocked the trailing-marker strip loop and left
        // raw "✅ ⭐:kakera: 🔐" text sitting in the name field, with
        // isLocked never set to true either.
        name: 'a real $wishlist paste with 🔐 lock markers parses clean names and auto-checks the Lock flag, leaving unlocked/plain names untouched',
        async run(page) {
            const REAL_WISHLIST_TEXT = `Saber ✅ ⭐:kakera: 🔐
Yoru ⭐ 🔐 +200%
Makima ✅ ⭐:kakera: 🔐 +100%
Captain Marvel (Carol Danvers) +60%
Orpheus (Hades)
21O
Bullseye +100%`;

            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'RealPaste');
            await page.fill('#wishlistTextInput', REAL_WISHLIST_TEXT);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const rowNames = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(rowNames, [
                'Saber', 'Yoru', 'Makima', 'Captain Marvel (Carol Danvers)', 'Orpheus (Hades)', '21O', 'Bullseye'
            ], `expected clean names with every marker stripped regardless of position, got: ${JSON.stringify(rowNames)}`);

            const parsed = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isLocked: c.isLocked, isStarWish: c.isStarWish, isClaimed: c.isClaimed, boostPercent: c.boostPercent
            })));
            assert.deepStrictEqual(parsed, [
                { name: 'Saber', isLocked: true, isStarWish: true, isClaimed: true, boostPercent: null },
                { name: 'Yoru', isLocked: true, isStarWish: true, isClaimed: false, boostPercent: 200 },
                { name: 'Makima', isLocked: true, isStarWish: true, isClaimed: true, boostPercent: 100 },
                { name: 'Captain Marvel (Carol Danvers)', isLocked: false, isStarWish: false, isClaimed: false, boostPercent: 60 },
                { name: 'Orpheus (Hades)', isLocked: false, isStarWish: false, isClaimed: false, boostPercent: null },
                { name: '21O', isLocked: false, isStarWish: false, isClaimed: false, boostPercent: null },
                { name: 'Bullseye', isLocked: false, isStarWish: false, isClaimed: false, boostPercent: 100 }
            ]);

            // The Lock checkbox on a locked row should be auto-checked.
            const saberLockChecked = await page.locator('.wishlist-row', { hasText: 'Saber' }).locator('[data-action="lock"]').isChecked();
            assert.strictEqual(saberLockChecked, true, 'expected the Lock checkbox to be auto-checked from the parsed 🔐 marker');
            const orpheusLockChecked = await page.locator('.wishlist-row', { hasText: 'Orpheus' }).locator('[data-action="lock"]').isChecked();
            assert.strictEqual(orpheusLockChecked, false, 'expected an unlocked character to leave the Lock checkbox unchecked');
        }
    },
    {
        // Regression test for a real report: real $wishlist output can tack
        // on "· (roulette, ...)" and "· N ka" (the character's raw kakera
        // value) AFTER the emoji markers - e.g. "Saber ✅⭐🔐 · ($wa, $wg) ·
        // 1,624 ka". Left unstripped, this trailing text blocked every
        // other marker from matching at all (none of those patterns can
        // see past unrecognized text at the true end of the line), so the
        // entire raw suffix - including the star/claimed/lock markers -
        // ended up stuck in the displayed name, with none of the
        // corresponding checkboxes auto-checked either.
        name: 'a real $wishlist paste with roulette tags and a raw kakera amount after the markers parses down to just the clean name',
        async run(page) {
            const REAL_WISHLIST_TEXT = `Saber ✅⭐🔐 · ($wa, $wg) · 1,624 ka
Makima ✅⭐🔐 · ($ha) · 890 ka
Captain Marvel (Carol Danvers) +60% · ($wa, $wg) · 524 ka
Orpheus (Hades) · ($ha) · 12 ka`;

            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'RouletteKakera');
            await page.fill('#wishlistTextInput', REAL_WISHLIST_TEXT);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const rowNames = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(rowNames, [
                'Saber', 'Makima', 'Captain Marvel (Carol Danvers)', 'Orpheus (Hades)'
            ], `expected the roulette tags and kakera amount stripped, leaving parenthetical name suffixes (like "(Carol Danvers)") intact, got: ${JSON.stringify(rowNames)}`);

            const parsed = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isClaimed: c.isClaimed, isStarWish: c.isStarWish, isLocked: c.isLocked, boostPercent: c.boostPercent
            })));
            assert.deepStrictEqual(parsed, [
                { name: 'Saber', isClaimed: true, isStarWish: true, isLocked: true, boostPercent: null },
                { name: 'Makima', isClaimed: true, isStarWish: true, isLocked: true, boostPercent: null },
                { name: 'Captain Marvel (Carol Danvers)', isClaimed: false, isStarWish: false, isLocked: false, boostPercent: 60 },
                { name: 'Orpheus (Hades)', isClaimed: false, isStarWish: false, isLocked: false, boostPercent: null }
            ], 'expected every marker correctly recovered once the trailing roulette/kakera text no longer blocks the strip loop');

            // The Star/Lock checkboxes should already be auto-checked from
            // the recovered markers, matching the parsed data above.
            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            assert.strictEqual(await saberRow.locator('[data-action="star"]').isChecked(), true);
            assert.strictEqual(await saberRow.locator('[data-action="lock"]').isChecked(), true);
        }
    },
    {
        name: 'a manually-planned lock/star survives a re-import even when the fresh paste shows neither marker for that character',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'PlannedFlags');
            await page.fill('#wishlistTextInput', 'Yoru\nSaber');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            await yoruRow.locator('[data-action="lock"]').check();
            await yoruRow.locator('[data-action="star"]').check();

            // Re-paste the SAME plain text (as if re-running $wishlist before
            // actually locking/starring Yoru in Discord) - the manual plan
            // shouldn't be wiped just because the fresh paste has no markers.
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const yoruFlags = await page.evaluate(() => {
                const c = wishlistModalCharacters.find(c => c.name === 'Yoru');
                return { isLocked: c.isLocked, isStarWish: c.isStarWish };
            });
            assert.deepStrictEqual(yoruFlags, { isLocked: true, isStarWish: true },
                'expected the manually-planned lock/star to survive a re-import with no matching marker in the fresh text');
        }
    },
    {
        name: 'checking "Include" on existing rows folds them into Generate Command(s) alongside freshly-typed names, each using its own flags',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'Combined');
            await page.fill('#wishlistTextInput', 'Yoru\nSaber');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Yoru: flag as Star+Lock via its own row checkboxes, then Include it.
            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            await yoruRow.locator('[data-action="star"]').check();
            await yoruRow.locator('[data-action="lock"]').check();
            await yoruRow.locator('[data-action="include"]').check();
            // Saber stays un-included - shouldn't show up in the output at all.

            // Also type a brand new name in the command builder, no flags.
            await page.fill('#wishlistCommandNames', 'Brand New Guy');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const commands = await page.locator('#wishlistCommandOutput .command-text').allTextContents();
            assert.deepStrictEqual(commands.sort(), ['$swl Yoru', '$wish Brand New Guy'].sort(),
                `expected the included row (its own Star+Lock flags) and the typed name (no flags) as separate commands, got: ${JSON.stringify(commands)}`);
            assert.ok(!commands.some(c => c.includes('Saber')), 'expected the un-included row to be excluded entirely');
        }
    },
    {
        name: 'the per-row Copy button uses that row\'s own current Star/Lock/Kakera flags',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'RowCopy');
            await page.fill('#wishlistTextInput', 'Yoru');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            await yoruRow.locator('[data-action="kakera"]').check();

            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });
            await yoruRow.locator('[data-action="copy"]').click();
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, '$wishk Yoru', `expected the row's own Kakera flag reflected in the copied command, got: "${copied}"`);
        }
    },
    {
        name: '"Include All Rows"/"Include None" toggle every row\'s Include checkbox at once',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'IncludeAll');
            await page.fill('#wishlistTextInput', 'Yoru\nSaber\nMakima');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            await page.click('button:has-text("Include All Rows")');
            const allChecked = await page.locator('.wishlist-row [data-action="include"]').evaluateAll(boxes => boxes.every(b => b.checked));
            assert.ok(allChecked, 'expected every row\'s Include checkbox checked after "Include All Rows"');

            await page.click('button:has-text("Include None")');
            const noneChecked = await page.locator('.wishlist-row [data-action="include"]').evaluateAll(boxes => boxes.every(b => !b.checked));
            assert.ok(noneChecked, 'expected every row\'s Include checkbox unchecked after "Include None"');
        }
    },
    {
        // Regression test for a real report: $bonus only reports the BONUS
        // slots on top of an account base Mudae never shows anywhere in
        // $bonus - a real player with a computed net bonus of 27 wishlist
        // slots actually had 34 real total in Mudae's own UI, and 5 real
        // starwish slots against a computed bonus of 4. Researched and
        // confirmed: every Mudae account starts with a free base of 7
        // wishlist / 1 starwish slot with zero bonuses (27+7=34, 4+1=5,
        // matching the real report exactly) - "Prefill from $bonus" now
        // adds that base automatically so it lands on the real total
        // without manual correction, but doesn't save by itself (Save
        // Capacity is still a separate step, since an account could have
        // some other unlisted modifier the fields stay editable for).
        name: 'Prefill from $bonus adds Mudae\'s free base allowance automatically, landing on the real total, but still requires a separate Save',
        async run(page) {
            const REAL_BONUS_TEXT = `:wlslot: · Wishlist slots: +47 (6 $k + 0 $kl + 4 $kt + 30 premium + 7 server premium 3) -20 ($sw)
:wlslot: · Wishseries slots: 10 (premium)
:sw: · Starwish slots:  +4 (0 $kl + 4 $sw)`;

            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'BaseGap');
            await page.fill('#wishlistTextInput', 'Yoru ⭐');

            await page.fill('#wishlistBonusInput', REAL_BONUS_TEXT);
            await page.click('button:has-text("Prefill from $bonus")');
            await page.waitForTimeout(100);

            // Prefilled with base + bonus (7+27=34, 1+4=5) - the real
            // totals - but NOT saved yet.
            const wishlistFieldValue = await page.inputValue('#wishlistCapacityWishlist');
            assert.strictEqual(wishlistFieldValue, '34', `expected the base-adjusted total (7 base + 27 net bonus) prefilled, got: "${wishlistFieldValue}"`);
            const starwishFieldValue = await page.inputValue('#wishlistCapacityStarwish');
            assert.strictEqual(starwishFieldValue, '5', `expected the base-adjusted total (1 base + 4 net bonus) prefilled, got: "${starwishFieldValue}"`);

            const bonusBeforeSave = await page.evaluate(() => wishlistModalBonusSnapshot);
            assert.strictEqual(bonusBeforeSave.updatedAt, null, 'expected Prefill alone to NOT save a capacity snapshot');

            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            const cardText = await page.locator('.wishlist-card', { hasText: 'BaseGap' }).textContent();
            assert.ok(cardText.includes('1/34 $wl'), `expected the real total (matching the reported 34) saved and shown, got: "${cardText}"`);
            assert.ok(cardText.includes('1/5 $sw'), `expected the real starwish total (matching the reported 5) shown, got: "${cardText}"`);
        }
    },
    {
        name: 'editing a row\'s Star/Lock/Kakera flags auto-checks Include and shows a "changed" marker, without touching Booster',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'AutoInclude');
            // Yoru is claimed (✅) so the Booster toggle used below stays
            // interactive - Ouroperks only exist on claimed characters.
            await page.fill('#wishlistTextInput', 'Yoru ✅\nSaber');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            const includeBox = yoruRow.locator('[data-action="include"]');
            assert.strictEqual(await includeBox.isChecked(), false, 'expected Include unchecked before any edit');

            await yoruRow.locator('[data-action="star"]').check();
            assert.strictEqual(await includeBox.isChecked(), true, 'expected Star toggle to auto-check Include');
            const rowText = await yoruRow.textContent();
            assert.ok(rowText.includes('changed'), `expected a "changed" marker on the edited row, got: "${rowText}"`);

            // Unchecking back to the original state removes the marker and
            // Include again - nothing has actually changed anymore.
            await yoruRow.locator('[data-action="star"]').uncheck();
            assert.strictEqual(await includeBox.isChecked(), false, 'expected Include to un-check once the row matches its baseline again');
            const rowTextAfter = await yoruRow.textContent();
            assert.ok(!rowTextAfter.includes('changed'), 'expected the "changed" marker gone once back to baseline');

            // Booster is not command-relevant and shouldn't touch Include.
            await yoruRow.locator('[data-action="booster"]').check();
            assert.strictEqual(await includeBox.isChecked(), false, 'expected the Booster toggle to leave Include untouched');
        }
    },
    {
        // Regression test for real feedback: Ouroperks (the "Booster"
        // toggle) only exist on characters you've already claimed - an
        // unclaimed row shouldn't even be able to have one set.
        name: 'the Booster toggle is disabled for an unclaimed character and enabled for a claimed one',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'BoosterGate');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta ✅');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const unclaimedBooster = page.locator('.wishlist-row', { hasText: 'Alpha' }).locator('[data-action="booster"]');
            const claimedBooster = page.locator('.wishlist-row', { hasText: 'Beta' }).locator('[data-action="booster"]');
            assert.strictEqual(await unclaimedBooster.isDisabled(), true, 'expected the Booster toggle disabled for an unclaimed character');
            assert.strictEqual(await claimedBooster.isDisabled(), false, 'expected the Booster toggle enabled for a claimed character');

            // A disabled checkbox can't actually be checked - confirms the
            // restriction is real, not just visual.
            await assert.rejects(unclaimedBooster.check({ timeout: 1500 }));

            await claimedBooster.check();
            assert.strictEqual(await claimedBooster.isChecked(), true, 'expected the claimed character\'s Booster toggle to work normally');
        }
    },
    {
        // Regression test for a real report: a claimed character's own
        // shown +N% is NOT their own Ouroperk contribution - it's the
        // boost they RECEIVE from adjacent neighbors (same meaning as an
        // unclaimed character's +N%). A character's own contribution can
        // only be inferred indirectly, by solving the chain of "shown %"
        // equations across the whole list. Verified against this exact
        // real paste: Captain Marvel (unclaimed, +60%, only one claimed
        // neighbor - Luffy) proves Luffy contributes 60%; Nico Robin's
        // shown +160% = Makima + Luffy(60) proves Makima contributes 100%;
        // Yoru's shown +200% = Saber + Makima(100) proves Saber
        // contributes 100% too - even though Saber shows no % at all on
        // her own line, and Nico Robin's OWN contribution is actually
        // 100%, not the 160% shown (that 160% is 100% own + 60% received
        // from Luffy, conflated in the one displayed number). Bullseye's
        // +100% can't be explained by neighbor math at all (both her
        // neighbors are unclaimed) - correctly left unflagged rather than
        // guessed, since it's most likely an unrelated mechanic (e.g.
        // Boostwish) the paste can't distinguish from a real booster.
        name: 'a claimed character\'s own Ouroperk contribution is correctly solved from the whole chain, not read directly off their own shown %',
        async run(page) {
            const REAL_WISHLIST_TEXT = `Saber ✅ ⭐:kakera: 🔐 · ($wa, $wg)
Yoru ⭐ 🔐 +200% · ($wa)
Makima ✅ ⭐:kakera: 🔐 +100% · ($wa)
Nico Robin ✅ ⭐:kakera: 🔐 +160% · ($wa)
Monkey D. Luffy ✅ ⭐:kakera: 🔐 +100% · ($ha)
Captain Marvel (Carol Danvers) +60% · ($wa, $wg)
Orpheus (Hades) · ($hg)
Bullseye +100% · ($ha)`;

            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ChainSolve');
            await page.fill('#wishlistTextInput', REAL_WISHLIST_TEXT);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const flags = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isBooster: c.isBooster, boosterPercent: c.boosterPercent
            })));
            assert.deepStrictEqual(flags, [
                { name: 'Saber', isBooster: true, boosterPercent: 100 },
                { name: 'Yoru', isBooster: false, boosterPercent: null },
                { name: 'Makima', isBooster: true, boosterPercent: 100 },
                { name: 'Nico Robin', isBooster: true, boosterPercent: 100 },
                { name: 'Monkey D. Luffy', isBooster: true, boosterPercent: 60 },
                { name: 'Captain Marvel (Carol Danvers)', isBooster: false, boosterPercent: null },
                { name: 'Orpheus (Hades)', isBooster: false, boosterPercent: null },
                { name: 'Bullseye', isBooster: false, boosterPercent: null }
            ], 'expected each claimed character\'s own contribution solved from the chain, matching the real report exactly');

            // Checkboxes/inputs reflect the solved values with no manual entry.
            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            assert.strictEqual(await saberRow.locator('[data-action="booster"]').isChecked(), true);
            assert.strictEqual(await saberRow.locator('[data-action="boosterPercent"]').inputValue(), '100');
            const luffyRow = page.locator('.wishlist-row', { hasText: 'Monkey D. Luffy' });
            assert.strictEqual(await luffyRow.locator('[data-action="boosterPercent"]').inputValue(), '60');

            // Yoru (unclaimed) never gets its own Booster checkbox checked -
            // it only ever shows what it RECEIVES, never contributes. It
            // sits between two boosters (Saber=100 + Makima=100), so the
            // neighbor indicator should show +200% - matching its own
            // shown +200% from the paste exactly.
            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            assert.strictEqual(await yoruRow.locator('[data-action="booster"]').isChecked(), false);
            const yoruText = await yoruRow.textContent();
            assert.ok(yoruText.includes('200% neighbor'), `expected Yoru to show the combined 100%+100% it receives from both neighbors, got: "${yoruText}"`);
        }
    },
    {
        // Regression test for a real, much more complex report, later
        // resolved with a key discovery: Mudae's own $ouroshop docs read
        // "A part of the spawn chance bonus applied by perk 1 is also
        // applied to the character upgraded" - perk 1 being the Ouroperk
        // that boosts neighbors. So a booster reflects a small, non-fixed
        // part of their OWN investment back onto their own line too (not
        // a fixed fraction of the total - confirmed against this exact
        // paste: 25/28/30/35-contribution characters all show the same
        // +3% self-reflection, while a 33-contribution one shows +6% -
        // not proportional at all), on top of whatever they receive from
        // real neighbors. That residual can't be solved to an exact
        // number, but its mere presence still PROVES a claimed character
        // is a booster - even one whose exact neighbor-facing % never
        // gets solved by any neighbor equation. Only an UNCLAIMED
        // character's line that still doesn't add up (impossible to be a
        // self-part, since Ouroperks require claiming) is genuinely
        // unexplained.
        name: 'a real, more complex paste attributes residuals on a claimed character\'s own line to their own Ouroperk self-reflection, not a mystery, while an unclaimed one stays genuinely unexplained',
        async run(page) {
            const COMPLEX_WISHLIST_TEXT = `Chihiro Ogino ✅ ⭐:kakera: 🔐 +3% · ($wa)
Sokka +60% · ($ha)
Azula ✅:kakera: +3% · ($wa)
Amber +60% · ($wg)
Zuko ✅ ⭐:kakera: +48% · ($ha)
Kirby ✅ ⭐:kakera: 🔐 +35% · ($wa, $ha, $wg, $hg)
Link (Unified Timeline) +75% · ($hg)
Zero Two ✅:kakera: 🔐 +33% · ($wa)
Nezuko Kamado ✅ ⭐:kakera: 🔐 +33% · ($wa)
Tropius +30% · ($wa, $ha, $wg, $hg)`;

            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ComplexReal');
            await page.fill('#wishlistTextInput', COMPLEX_WISHLIST_TEXT);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const flags = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isBooster: c.isBooster, boosterPercent: c.boosterPercent,
                hasSelfBoostPortion: c.hasSelfBoostPortion, hasUnexplainedBoost: c.hasUnexplainedBoost
            })));
            assert.deepStrictEqual(flags, [
                { name: 'Chihiro Ogino', isBooster: true, boosterPercent: 35, hasSelfBoostPortion: true, hasUnexplainedBoost: false },
                { name: 'Sokka', isBooster: false, boosterPercent: null, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Azula', isBooster: true, boosterPercent: 25, hasSelfBoostPortion: true, hasUnexplainedBoost: false },
                { name: 'Amber', isBooster: false, boosterPercent: null, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Zuko', isBooster: true, boosterPercent: 35, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Kirby', isBooster: true, boosterPercent: 48, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Link (Unified Timeline)', isBooster: false, boosterPercent: null, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Zero Two', isBooster: true, boosterPercent: 27, hasSelfBoostPortion: false, hasUnexplainedBoost: false },
                { name: 'Nezuko Kamado', isBooster: true, boosterPercent: 33, hasSelfBoostPortion: true, hasUnexplainedBoost: false },
                { name: 'Tropius', isBooster: false, boosterPercent: null, hasSelfBoostPortion: false, hasUnexplainedBoost: true }
            ], 'expected the exact solve/self-boost/unexplained split derived by hand for this real paste');

            // A cleanly-solved, self-consistent character (Zuko) shows the
            // plain boost marker - no self-boost, no "unexplained".
            // "Zuko" (not "Nezuko") specifically - .nth(4) since hasText
            // would match both, "Zuko" being a substring of "Nezuko".
            const zukoText = await page.locator('.wishlist-row').nth(4).textContent();
            assert.ok(!zukoText.includes('unexplained') && !zukoText.includes('incl. self'), `expected a clean, consistent value to show neither marker, got: "${zukoText}"`);

            // A claimed character whose own line reflects part of her own
            // Ouroperk investment - even though her neighbor-facing amount
            // was still solvable via a different equation elsewhere in the
            // chain - shows the "incl. self" marker AND a checked Booster
            // box with the separately-solved value, never "unexplained".
            const azulaRow = page.locator('.wishlist-row', { hasText: 'Azula' });
            const azulaText = await azulaRow.textContent();
            assert.ok(azulaText.includes('incl. self'), `expected Azula's own +3% attributed to her own Ouroperk self-reflection, got: "${azulaText}"`);
            assert.ok(!azulaText.includes('unexplained'), `expected Azula to NOT be marked unexplained now that the self-reflection mechanic is understood, got: "${azulaText}"`);
            assert.strictEqual(await azulaRow.locator('[data-action="booster"]').isChecked(), true);
            assert.strictEqual(await azulaRow.locator('[data-action="boosterPercent"]').inputValue(), '25');

            // Tropius (unclaimed, both neighbors unclaimed/out-of-bounds)
            // can't have invested in perk 1 at all (Ouroperks require
            // claiming), so her +30% stays genuinely unexplained, and she's
            // never flagged as a booster.
            const tropiusRow = page.locator('.wishlist-row', { hasText: 'Tropius' });
            const tropiusText = await tropiusRow.textContent();
            assert.ok(tropiusText.includes('unexplained'), `expected Tropius's inexplicable +30% marked unexplained, got: "${tropiusText}"`);
            assert.strictEqual(await tropiusRow.locator('[data-action="booster"]').isDisabled(), true);
        }
    },
    {
        // Regression test for the new case this same discovery unlocks: a
        // claimed character sandwiched between two unclaimed neighbors
        // that never show a % themselves has no equation anywhere able to
        // solve her neighbor-facing contribution - previously that meant
        // she'd be invisible to the algorithm entirely. Now, her own
        // line's residual (impossible to explain any other way once
        // claimed) still proves she's a booster, even though the exact %
        // she gives to neighbors can't be determined from this paste.
        name: 'a claimed character with no solvable neighbor equation at all is still confirmed as a booster from her own residual, with the % correctly left unknown',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'IsolatedBooster');
            await page.fill('#wishlistTextInput', 'Filler One\nIsolated ✅:kakera: +5%\nFiller Two');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const isolated = await page.evaluate(() => {
                const c = wishlistModalCharacters.find(c => c.name === 'Isolated');
                return { isBooster: c.isBooster, boosterPercent: c.boosterPercent, hasSelfBoostPortion: c.hasSelfBoostPortion, hasUnexplainedBoost: c.hasUnexplainedBoost };
            });
            assert.deepStrictEqual(isolated, { isBooster: true, boosterPercent: null, hasSelfBoostPortion: true, hasUnexplainedBoost: false },
                'expected booster status confirmed from the self-reflection alone, with no % guessed');

            const isolatedRow = page.locator('.wishlist-row', { hasText: 'Isolated' });
            assert.strictEqual(await isolatedRow.locator('[data-action="booster"]').isChecked(), true);
            // No % could be solved - the input should be empty, not a guess.
            assert.strictEqual(await isolatedRow.locator('[data-action="boosterPercent"]').inputValue(), '');
        }
    },
    {
        // Regression test for a real follow-up: Mudae's own $ouroshop docs
        // confirm perk 1's self-reflection is itself an upgradeable,
        // account-wide rate (0-10%). If the user tells us theirs, an
        // otherwise-unsolvable booster's residual can be back-solved into
        // an estimated neighbor-facing % (residual = % x rate) instead of
        // staying blank - always visibly marked as an estimate, and
        // applied live the moment the rate is saved (no re-import needed),
        // without touching any row that already has a real value.
        name: 'saving a self-boost rate retroactively estimates a previously-unknown booster %, visibly marked as an estimate',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'RateEstimate');
            await page.fill('#wishlistTextInput', 'Filler One\nIsolated ✅:kakera: +5%\nFiller Two');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const isolatedRow = page.locator('.wishlist-row', { hasText: 'Isolated' });
            assert.strictEqual(await isolatedRow.locator('[data-action="boosterPercent"]').inputValue(), '',
                'expected no estimate yet, since no rate has been saved');

            // Residual of 5%, at a 10% self-boost rate, implies a
            // neighbor-facing contribution of 5 / 0.10 = 50%.
            await page.fill('#wishlistCapacitySelfBoostRate', '10');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(150);

            const isolatedAfter = await page.evaluate(() => {
                const c = wishlistModalCharacters.find(c => c.name === 'Isolated');
                return { boosterPercent: c.boosterPercent, boosterPercentEstimated: c.boosterPercentEstimated };
            });
            assert.deepStrictEqual(isolatedAfter, { boosterPercent: 50, boosterPercentEstimated: true },
                'expected the residual back-solved into an estimated neighbor-facing %');
            assert.strictEqual(await isolatedRow.locator('[data-action="boosterPercent"]').inputValue(), '50');

            // Manually correcting the estimate clears the "estimated" flag -
            // it's now a real, user-confirmed value.
            await isolatedRow.locator('[data-action="boosterPercent"]').fill('42');
            const isolatedManual = await page.evaluate(() => {
                const c = wishlistModalCharacters.find(c => c.name === 'Isolated');
                return { boosterPercent: c.boosterPercent, boosterPercentEstimated: c.boosterPercentEstimated };
            });
            assert.deepStrictEqual(isolatedManual, { boosterPercent: 42, boosterPercentEstimated: false });
        }
    },
    {
        // Regression test for a real report: the wishlist wraps around -
        // the first character's "previous" neighbor is the last character
        // in the list, and the last character's "next" is the first. A
        // real mismatch was traced exactly this way: the very last
        // character showed a boost that only made sense as coming from the
        // very first character's own Ouroperk contribution, with nothing
        // else able to explain it - previously treated as an unexplained
        // dead end at the list's boundary, since "out of bounds" used to
        // mean "no neighbor there" instead of "wraps to the other end".
        name: 'a booster at the start of the list correctly boosts the last character too, wrapping around instead of stopping at the boundary',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'Wraparound');
            await page.fill('#wishlistTextInput', 'Saber ✅:kakera: 🔐\nYoru\nMakima\nBullseye');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Manually flag Saber as a 100% booster (as if solved/confirmed
            // elsewhere) - her neighbors are Bullseye (wrapping around,
            // since she's first in the list) and Yoru (next).
            const saberRow = page.locator('.wishlist-row', { hasText: 'Saber' });
            await saberRow.locator('[data-action="booster"]').check();
            await page.waitForTimeout(50);
            await saberRow.locator('[data-action="boosterPercent"]').fill('100');
            await page.waitForTimeout(50);

            const yoruText = await page.locator('.wishlist-row', { hasText: 'Yoru' }).textContent();
            assert.ok(yoruText.includes('100% neighbor'), `expected Yoru (Saber's real "next") to show the boost, got: "${yoruText}"`);

            const bullseyeText = await page.locator('.wishlist-row', { hasText: 'Bullseye' }).textContent();
            assert.ok(bullseyeText.includes('100% neighbor'), `expected Bullseye (Saber's wrapped-around "previous", since Saber is first in the list) to also show the boost, got: "${bullseyeText}"`);

            // Makima, in the middle, is nobody's neighbor here at all.
            const makimaText = await page.locator('.wishlist-row', { hasText: 'Makima' }).textContent();
            assert.ok(!makimaText.includes('neighbor'), `expected Makima (not adjacent to Saber even with wraparound) to show no neighbor boost, got: "${makimaText}"`);
        }
    },
    {
        // Same wraparound fix, but verified through the actual parsed
        // inference (not a manual toggle) - the wishlist ends with a
        // character whose shown % can only be explained by the first
        // character's own contribution, once "boundary" correctly means
        // "wraps to the other end" instead of "no neighbor there".
        name: 'the boost-inference chain also wraps around, explaining a residual on the very last character via the very first',
        async run(page) {
            const WRAPAROUND_TEXT = `Saber ✅ ⭐:kakera: 🔐
Yoru ⭐ 🔐 +200%
Makima ✅ ⭐:kakera: 🔐 +100%
Orpheus (Hades)
Bullseye +100%`;

            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'WrapInference');
            await page.fill('#wishlistTextInput', WRAPAROUND_TEXT);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const flags = await page.evaluate(() => wishlistModalCharacters.map(c => ({
                name: c.name, isBooster: c.isBooster, boosterPercent: c.boosterPercent, hasUnexplainedBoost: c.hasUnexplainedBoost
            })));
            // Saber = 100 (from Yoru's +200% = Saber + Makima's 100).
            // Bullseye's +100%, wrapping around to Saber (her real "next"
            // since Saber is first), now matches exactly (100 = 0 +
            // Saber's 100) - no longer an unexplained dead end.
            assert.deepStrictEqual(flags, [
                { name: 'Saber', isBooster: true, boosterPercent: 100, hasUnexplainedBoost: false },
                { name: 'Yoru', isBooster: false, boosterPercent: null, hasUnexplainedBoost: false },
                { name: 'Makima', isBooster: true, boosterPercent: 100, hasUnexplainedBoost: false },
                { name: 'Orpheus (Hades)', isBooster: false, boosterPercent: null, hasUnexplainedBoost: false },
                { name: 'Bullseye', isBooster: false, boosterPercent: null, hasUnexplainedBoost: false }
            ], 'expected Bullseye\'s boost fully explained by wrapping around to Saber, no longer flagged unexplained');
        }
    },
    {
        // Regression test for a real report: re-importing pasted text used
        // to rebuild the row list in the PASTE's own order every time,
        // silently discarding any manual drag-reordering already done -
        // the real symptom was a dragged character ending up back near its
        // original paste position, which also threw off command
        // generation (grouped-by-flag output only reflects the row order
        // actually in the array). Re-importing must preserve the existing
        // (possibly reordered) array order for already-tracked characters,
        // only appending genuinely new ones.
        name: 'dragging a row to a new position survives a subsequent re-import of the same (or updated) paste, instead of resetting to paste order',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ReimportOrder');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma\nDelta\nEpsilon');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Drag Epsilon (last) up to just after Alpha (index 1).
            await page.evaluate(() => {
                const [moved] = wishlistModalCharacters.splice(4, 1);
                wishlistModalCharacters.splice(1, 0, moved);
                renderWishlistModalRows();
            });
            const namesAfterDrag = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(namesAfterDrag, ['Alpha', 'Epsilon', 'Beta', 'Gamma', 'Delta']);

            // Re-import the exact same paste (e.g. refreshing boost %s) -
            // the dragged order must survive, not reset to paste order.
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            const namesAfterReimport = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(namesAfterReimport, ['Alpha', 'Epsilon', 'Beta', 'Gamma', 'Delta'],
                'expected the dragged order to survive a re-import, not reset to the paste\'s own order');

            // A genuinely NEW name in an updated paste is appended at the
            // end, not inserted at its paste position.
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma\nDelta\nEpsilon\nZeta');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            const namesAfterNewChar = await page.locator('.wishlist-row-name').allTextContents();
            assert.deepStrictEqual(namesAfterNewChar, ['Alpha', 'Epsilon', 'Beta', 'Gamma', 'Delta', 'Zeta'],
                'expected the still-dragged order preserved, with the new character appended at the end');

            // Saving reflects this same preserved order, which is what
            // command generation groups from too.
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);
            const savedOrder = await page.evaluate(() => {
                const entry = Object.values(AppState.wishlists.entries).find(e => e.name === 'ReimportOrder');
                return entry.characters.map(c => c.name);
            });
            assert.deepStrictEqual(savedOrder, ['Alpha', 'Epsilon', 'Beta', 'Gamma', 'Delta', 'Zeta']);
        }
    },
    {
        // Regression test for a real report: pasting an updated $wishlist
        // that no longer included a couple of previously-real characters
        // (removed via $wr/$wp/claiming in Discord) left them stuck in the
        // row list forever, since the merge only ever preserves/appends
        // and was never told anything had actually left Discord's real
        // list. A fresh $wishlist paste is Discord's own current/complete
        // listing, so a previously-confirmed-real name missing from it
        // means it's genuinely gone now.
        name: 're-importing a $wishlist paste that dropped a previously-real character removes it from the row list too',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'DroppedOnReimport');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma\nDelta');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('.wishlist-row-name').allTextContents(), ['Alpha', 'Beta', 'Gamma', 'Delta']);

            // Gamma and Delta are gone from this fresh paste (removed in
            // Discord), Epsilon is a genuinely new addition.
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nEpsilon');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            assert.deepStrictEqual(await page.locator('.wishlist-row-name').allTextContents(), ['Alpha', 'Beta', 'Epsilon'],
                'expected Gamma and Delta to be dropped since they are no longer in the real $wishlist paste');

            const message = await page.locator('#wishlistModalMessage').innerHTML();
            assert.ok(/2 characters no longer in this paste were removed/i.test(message), `expected the drop to be mentioned in the message, got: ${message}`);
        }
    },
    {
        name: 'a row only ever planned locally (never confirmed real) survives a re-import even when it is not in the fresh paste',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'PlannedSurvives');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Planned locally via the command builder's "Also Add" - never
            // actually run in Discord, so it's not in wishlistConfirmedRealNames.
            await page.fill('#wishlistCommandNames', 'PlannedOnly');
            await page.click('button:has-text("Also Add to This Wishlist")');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('.wishlist-row-name').allTextContents(), ['Alpha', 'Beta', 'PlannedOnly']);

            // Re-importing the same real paste (PlannedOnly was never part
            // of it) must not remove the still-pending planned row.
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            assert.deepStrictEqual(await page.locator('.wishlist-row-name').allTextContents(), ['Alpha', 'Beta', 'PlannedOnly'],
                'expected the purely-planned row to survive, since its absence from a real paste is expected, not evidence it was removed');
        }
    },
    {
        name: 'the Reorder Commands section is hidden until the row order actually diverges from the last known-real order',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ReorderHidden');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            assert.strictEqual(await page.locator('#wishlistReorderGroup').isVisible(), false,
                'expected no reorder section right after import, since nothing has moved yet');
        }
    },
    {
        name: 'dragging a row to a new position generates a $wishi command, since $wish/$sw never reposition an already-wished character',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ReorderCommand');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma\nDelta\nEpsilon');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Move Epsilon (last) up to just after Alpha - mirrors the
            // real report: only the moved character needs a command, and
            // it should reference the nearest still-correctly-placed
            // character it now sits after.
            await page.evaluate(() => {
                const [moved] = wishlistModalCharacters.splice(4, 1);
                wishlistModalCharacters.splice(1, 0, moved);
                renderWishlistModalRows();
            });

            assert.strictEqual(await page.locator('#wishlistReorderGroup').isVisible(), true);
            const commandTexts = await page.locator('#wishlistReorderOutput .command-text').allTextContents();
            assert.deepStrictEqual(commandTexts, ['$wishi Alpha $ Epsilon'],
                `expected exactly one $wishi command moving only Epsilon, got: ${JSON.stringify(commandTexts)}`);
        }
    },
    {
        name: 'a $wishi command targets position 1 when the moved run lands at the very top, with nothing kept before it',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ReorderToTop');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma\nDelta');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Move Delta (last) to the very top.
            await page.evaluate(() => {
                const [moved] = wishlistModalCharacters.splice(3, 1);
                wishlistModalCharacters.splice(0, 0, moved);
                renderWishlistModalRows();
            });

            const commandTexts = await page.locator('#wishlistReorderOutput .command-text').allTextContents();
            assert.deepStrictEqual(commandTexts, ['$wishi 1 $ Delta']);
        }
    },
    {
        name: 're-importing a paste that already reflects a completed move clears the now-stale $wishi command',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'ReorderRebaseline');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Drag Gamma to the front in-app (not yet reflected in Discord).
            await page.evaluate(() => {
                const [moved] = wishlistModalCharacters.splice(2, 1);
                wishlistModalCharacters.splice(0, 0, moved);
                renderWishlistModalRows();
            });
            assert.strictEqual(await page.locator('#wishlistReorderGroup').isVisible(), true);

            // Now paste a fresh $wishlist that already shows the move as
            // done (as if $wishi was actually run in Discord) - that
            // paste's order becomes the new ground truth, matching what's
            // already in the row list, so nothing is left pending.
            await page.fill('#wishlistTextInput', 'Gamma\nAlpha\nBeta');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.locator('#wishlistReorderGroup').isVisible(), false,
                'expected the reorder baseline to reset to the freshly-imported order, clearing the now-completed move');
        }
    },
    {
        name: 'the Kakera-boost row toggle uses the real kakera icon image, not a placeholder emoji',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'KakeraIcon');
            await page.fill('#wishlistTextInput', 'Yoru');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const yoruRow = page.locator('.wishlist-row', { hasText: 'Yoru' });
            const kakeraToggle = yoruRow.locator('[data-action="kakera"]').locator('xpath=..');
            const iconSrc = await kakeraToggle.locator('img').getAttribute('src');
            assert.ok(iconSrc && iconSrc.includes('kakera-symbol.webp'), `expected the real kakera icon image, got src: "${iconSrc}"`);
        }
    },
    {
        // Research-backed regression test: Mudae's own community docs give
        // the $starwish upgrade ramp as 2, 4, 6... wishlist slots per
        // additional slot beyond the current limit - cross-verified against
        // a real $bonus report showing a -20 wishlist-slot deduction for
        // exactly 4 slots bought via $sw (2+4+6+8=20). Generating a command
        // that would starwish past the saved capacity should warn with the
        // estimated cost and require a second confirm click before actually
        // producing the command.
        name: 'generating a command that stars past your saved starwish capacity warns with the estimated wishlist-slot cost, requiring confirmation',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'RampWarning');
            // Starwish capacity of 1 (matching Mudae's own free-base default) -
            // no wishlist slots needed since only starwish capacity matters here.
            await page.fill('#wishlistCapacityStarwish', '1');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);

            await page.fill('#wishlistCommandNames', 'Yoru\nSaber');
            await page.check('#wishlistFlagStar');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            // 2 characters starred against a capacity of 1 needs 1 more slot -
            // the 2nd ramped slot (already-ramped count = 1-1=0, so the next
            // slot is the 1st ramped one) costs 2*(0+1) = 2 wishlist slots.
            const warningText = await page.locator('#wishlistCommandOutput').textContent();
            assert.ok(/1 more.*starwish slot/i.test(warningText), `expected a slots-needed warning, got: "${warningText}"`);
            assert.ok(/2 wishlist slots/.test(warningText), `expected the estimated ramp cost (2 wl for the 1st extra slot), got: "${warningText}"`);
            const commandsBeforeConfirm = await page.locator('#wishlistCommandOutput .command-text').count();
            assert.strictEqual(commandsBeforeConfirm, 0, 'expected no command shown until the warning is confirmed');

            await page.click('button:has-text("Generate Anyway")');
            await page.waitForTimeout(100);
            const command = await page.locator('#wishlistCommandOutput .command-text').textContent();
            assert.strictEqual(command, '$sw Yoru$Saber', `expected the command to generate after confirming, got: "${command}"`);
        }
    },
    {
        // Regression test for real feedback: a bare "this might sacrifice
        // some wishlist slots" warning still left the user to work out the
        // exact resulting numbers and whether any currently-wished
        // characters would actually fall outside the shrunken wishlist
        // capacity themselves. The warning now names exactly which
        // characters (by their current position in the list) would be
        // pushed out.
        name: 'the starwish-cost warning names the exact currently-wished characters that would fall outside the shrunken wishlist capacity',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'LostCharacters');

            const names = Array.from({ length: 20 }, (_, i) => `C${i + 1}`).join('\n');
            await page.fill('#wishlistTextInput', names);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            // Fully occupying a 20-slot wishlist, 1 starwish slot.
            await page.fill('#wishlistCapacityWishlist', '20');
            await page.fill('#wishlistCapacityStarwish', '1');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);

            // Star the two lowest-priority (last) characters - pushes
            // starwish usage to 2 against a capacity of 1, needing 1 more
            // slot at a cost of 2 wishlist slots (20 -> 18).
            await page.locator('.wishlist-row', { hasText: 'C19' }).locator('[data-action="star"]').check();
            await page.locator('.wishlist-row', { hasText: 'C20' }).locator('[data-action="star"]').check();

            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const warningText = await page.locator('#wishlistCommandOutput').textContent();
            assert.ok(/from.*20.*down to.*18/i.test(warningText), `expected the exact before/after wishlist capacity numbers, got: "${warningText}"`);
            assert.ok(/using 20 of your 20 wishlist slots/i.test(warningText), `expected the current usage stated, got: "${warningText}"`);
            assert.ok(/lowest-priority 2 characters/i.test(warningText), `expected the count of characters at risk, got: "${warningText}"`);
            assert.ok(warningText.includes('C19') && warningText.includes('C20'), `expected the specific at-risk characters named, got: "${warningText}"`);
            assert.ok(!warningText.includes('C18'), `expected a character comfortably within the new capacity to NOT be listed as lost, got: "${warningText}"`);
        }
    },
    {
        // Regression test for a real report: names typed into the command
        // builder's textarea (not yet added to the actual row list below)
        // were being listed as if they'd be pushed out of the wishlist too -
        // they aren't part of the tracked wishlist at all until "Also Add"
        // is used, so they must never appear in the "would be lost" naming,
        // even though they still count toward how many extra starwish slots
        // are needed in the first place.
        name: 'names only typed into the command builder (not added to the row list) never appear in the "would be lost" naming',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'TypedNotLost');

            const names = Array.from({ length: 10 }, (_, i) => `C${i + 1}`).join('\n');
            await page.fill('#wishlistTextInput', names);
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            await page.fill('#wishlistCapacityWishlist', '10');
            await page.fill('#wishlistCapacityStarwish', '1');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);

            // Star two brand new names only in the command builder textarea -
            // never added to the row list - which alone is enough to trigger
            // the starwish-capacity warning (2 stars against a capacity of 1).
            await page.fill('#wishlistCommandNames', 'Rex\nSage');
            await page.check('#wishlistFlagStar');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const warningText = await page.locator('#wishlistCommandOutput').textContent();
            assert.ok(/needs 1 more.*starwish slot/i.test(warningText), `expected the typed names to still count toward the slots-needed math, got: "${warningText}"`);
            assert.ok(!warningText.includes('Rex') && !warningText.includes('Sage'),
                `expected the typed-only names to never be named as "lost" since they aren't in the row list, got: "${warningText}"`);
            // The two lowest-priority ACTUAL rows are the ones really at risk.
            assert.ok(warningText.includes('C9') && warningText.includes('C10'),
                `expected the real lowest-priority rows named instead, got: "${warningText}"`);
        }
    },
    {
        name: 'a command that stays within saved starwish capacity generates immediately with no warning',
        async run(page) {
            await openAddWishlistModal(page);
            await markAsOwnWishlist(page);
            await page.fill('#wishlistNameInput', 'WithinCapacity');
            await page.fill('#wishlistCapacityStarwish', '5');
            await page.click('button:has-text("Save Capacity")');
            await page.waitForTimeout(100);

            await page.fill('#wishlistCommandNames', 'Yoru');
            await page.check('#wishlistFlagStar');
            await page.click('button:has-text("Generate Command(s)")');
            await page.waitForTimeout(100);

            const command = await page.locator('#wishlistCommandOutput .command-text').textContent();
            assert.strictEqual(command, '$sw Yoru');
            const confirmBtnCount = await page.locator('button:has-text("Generate Anyway")').count();
            assert.strictEqual(confirmBtnCount, 0, 'expected no confirmation needed when within capacity');
        }
    },
    {
        // Regression test for real feedback: $wish/$sw/etc. are purely
        // additive (confirmed via research - they never overwrite or
        // remove anything from an existing Discord wishlist), so deleting
        // a row here doesn't touch the real wishlist at all. Removing a
        // character that was actually part of the last known real state
        // (present when opened/imported) should surface a ready-made
        // $wr (wishremove) command - but a row that was only ever planned
        // in this app and never really wished shouldn't, since Mudae never
        // had it to begin with.
        name: 'removing a row that was part of the real wishlist surfaces a $wr command; removing a purely-planned row does not',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'Removals');
            await page.fill('#wishlistTextInput', 'RealOne\nRealTwo');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            const removalsHiddenBefore = await page.locator('#wishlistRemovalsGroup').isVisible();
            assert.strictEqual(removalsHiddenBefore, false, 'expected the Removed Characters section hidden with nothing removed yet');

            // A purely-planned character (never actually imported/confirmed) -
            // removing it shouldn't need a $wr, since Discord never had it.
            await page.fill('#wishlistCommandNames', 'OnlyPlanned');
            await page.click('button:has-text("Also Add to This Wishlist")');
            await page.waitForTimeout(100);
            await page.locator('.wishlist-row', { hasText: 'OnlyPlanned' }).locator('[data-action="remove"]').click();
            await page.waitForTimeout(100);
            const removalsHiddenAfterPlanned = await page.locator('#wishlistRemovalsGroup').isVisible();
            assert.strictEqual(removalsHiddenAfterPlanned, false, 'expected no $wr prompt for a row that was only ever planned, never real');

            // A real, previously-imported character - removing it SHOULD
            // surface a $wr command.
            await page.locator('.wishlist-row', { hasText: 'RealOne' }).locator('[data-action="remove"]').click();
            await page.waitForTimeout(100);

            const removalsVisible = await page.locator('#wishlistRemovalsGroup').isVisible();
            assert.strictEqual(removalsVisible, true, 'expected the Removed Characters section to appear');
            const removalCommand = await page.locator('#wishlistRemovalsOutput .command-text').textContent();
            assert.strictEqual(removalCommand, '$wr RealOne', `expected a $wr command for the removed real character, got: "${removalCommand}"`);

            // Re-adding the same name back (re-importing it) cancels out
            // the pending removal - it's back, nothing left to remove.
            await page.fill('#wishlistTextInput', 'RealOne\nRealTwo');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);
            const removalsHiddenAfterReadd = await page.locator('#wishlistRemovalsGroup').isVisible();
            assert.strictEqual(removalsHiddenAfterReadd, false, 'expected the $wr prompt to clear once the removed character is re-added');
        }
    },
    {
        name: 'multiple removed real characters join into one $wr command, separately from an unrelated purely-planned removal',
        async run(page) {
            await openAddWishlistModal(page);
            await page.fill('#wishlistNameInput', 'MultiRemovals');
            await page.fill('#wishlistTextInput', 'Alpha\nBeta\nGamma');
            await page.click('button:has-text("Import/Update from Pasted Text")');
            await page.waitForTimeout(100);

            await page.locator('.wishlist-row', { hasText: 'Alpha' }).locator('[data-action="remove"]').click();
            await page.locator('.wishlist-row', { hasText: 'Gamma' }).locator('[data-action="remove"]').click();
            await page.waitForTimeout(100);

            const removalCommand = await page.locator('#wishlistRemovalsOutput .command-text').textContent();
            assert.strictEqual(removalCommand, '$wr Alpha$Gamma', `expected both removed characters $-joined into one command, got: "${removalCommand}"`);
        }
    },
    {
        // Regression test for real feedback: since $wish-family commands
        // only ever add and never overwrite, a brand new wishlist built
        // here needs an explicit $wra (wishremoveall) run first if the
        // user wants their real Discord wishlist to end up matching
        // exactly - the warning should only show for a NEW wishlist, not
        // one already being edited (which is presumably already tracking
        // real state, not being built from scratch).
        name: 'a "run $wra first" warning shows only when adding a brand new wishlist, not when editing an existing one',
        async run(page) {
            await openAddWishlistModal(page);
            const warningVisibleOnAdd = await page.locator('#wishlistNewListWarning').isVisible();
            assert.strictEqual(warningVisibleOnAdd, true, 'expected the $wra warning visible when adding a brand new wishlist');
            const warningText = await page.locator('#wishlistNewListWarning').textContent();
            assert.ok(/\$wra/.test(warningText) && /wishremoveall/i.test(warningText), `expected the warning to mention $wra/wishremoveall, got: "${warningText}"`);

            await page.fill('#wishlistNameInput', 'ExistingOne');
            await page.fill('#wishlistTextInput', 'Someone');
            await page.click('button:has-text("Save Wishlist")');
            await page.waitForTimeout(150);

            await page.locator('.wishlist-card', { hasText: 'ExistingOne' }).locator('button:has-text("Edit")').click();
            await page.waitForSelector('#wishlistModalOverlay', { state: 'visible' });
            const warningVisibleOnEdit = await page.locator('#wishlistNewListWarning').isVisible();
            assert.strictEqual(warningVisibleOnEdit, false, 'expected the $wra warning hidden when editing an already-saved wishlist');
        }
    }
];
