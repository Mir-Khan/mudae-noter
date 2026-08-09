const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for a real report: Mudae's $mmmka+s output can name
        // a character differently than the Notes tab does (e.g. a Pokedex
        // entry reported by its base-evolution name vs. the Notes tab's
        // evolved-form name), and the kakera-based fallback match is
        // deliberately skipped when that value isn't unique within the
        // series - leaving the Sort tab entry permanently unmatched (no
        // image/note/color) with no automatic fix available.
        name: 'an unmatched Sort tab entry can be manually linked to the correct character, pulling in its image/note/color',
        async run(page) {
            await loadDemoCollection(page);

            // "Totally Different Name" won't auto-match any Notes-tab
            // character by name, and has no kakera collision risk since it's
            // a value not used elsewhere in the demo collection.
            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', 'Totally Different Name - Dungeon Meshi 999999 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const unmatched = await page.evaluate(() => AppState.sortData[0].matched);
            assert.strictEqual(unmatched, false, 'expected the entry to start out unmatched, given the demo collection has no character with that name/kakera');

            await page.click('[data-action="link-character"]');
            await page.waitForSelector('#linkSortEntryOverlay', { state: 'visible' });

            await page.fill('#linkSortEntrySearchInput', 'Marcille');
            await page.click('.link-sort-entry-result-item:has-text("Marcille Donato")');
            await page.waitForTimeout(150);

            const overlayHidden = await page.locator('#linkSortEntryOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close after linking');

            const entry = await page.evaluate(() => AppState.sortData[0]);
            assert.strictEqual(entry.matched, true, 'expected the entry to be matched after linking');
            assert.strictEqual(entry.name, 'Totally Different Name', 'expected the entry to keep the name Mudae actually reported, not switch to the linked character\'s name');
            assert.strictEqual(entry.kakera, '999999', 'expected the entry to keep its own kakera value from the $mmmka+s paste');
            assert.ok(entry.image, 'expected the entry to now have an image pulled from the linked character');

            const thumbHasImage = await page.locator('.sort-character-item img').count();
            assert.strictEqual(thumbHasImage, 1, 'expected the Sort tab card to now render the linked character\'s image');
        }
    },
    {
        // Regression test for a real report: a full Parse Input replaces
        // AppState.seriesData wholesale, so a character's image/note/etc can
        // change (new art claimed, a correction, etc.) - but an
        // already-matched Sort tab entry's cached copy of those fields was
        // never refreshed afterward, so it could keep showing stale (even
        // wrong-looking) data indefinitely even though the Notes tab itself
        // was already showing the correct, current one.
        name: 're-parsing the Notes tab refreshes an already-matched Sort tab entry\'s stale image/note',
        async run(page) {
            await loadDemoCollection(page);

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', 'Marcille Donato - Dungeon Meshi 1304 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const before = await page.evaluate(() => AppState.sortData[0]);
            assert.strictEqual(before.matched, true, 'expected Marcille to auto-match on the initial parse');
            assert.ok(before.image, 'expected an initial image to be pulled in');

            await page.click('#tab-notes-btn');
            await page.fill('#input', 'Dungeon Meshi - 36/40\n#819 - Marcille Donato  💞 => arczeus | ✨ · ($wa) · :chaoskey:  (10) (#EAC57C) 1,304 ka - https://example.com/updated-art.png');
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            const notesImage = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters[0].image);
            assert.strictEqual(notesImage, 'https://example.com/updated-art.png', 'expected the Notes tab itself to have the fresh image after re-parsing');

            const after = await page.evaluate(() => AppState.sortData.find(e => e.name === 'Marcille Donato'));
            assert.strictEqual(after.image, 'https://example.com/updated-art.png', `expected the Sort tab's cached entry to be refreshed to match, got: "${after.image}"`);
        }
    },
    {
        name: 're-parsing the Notes tab leaves a manually-linked Sort tab entry untouched',
        async run(page) {
            await loadDemoCollection(page);

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', 'Totally Different Name - Dungeon Meshi 999999 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            await page.click('[data-action="link-character"]');
            await page.waitForSelector('#linkSortEntryOverlay', { state: 'visible' });
            await page.fill('#linkSortEntrySearchInput', 'Marcille');
            await page.click('.link-sort-entry-result-item:has-text("Marcille Donato")');
            await page.waitForTimeout(150);

            const linkedImage = await page.evaluate(() => AppState.sortData[0].image);
            assert.ok(linkedImage, 'expected the manual link to pull in an image');

            await page.click('#tab-notes-btn');
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            const afterReparse = await page.evaluate(() => AppState.sortData[0]);
            assert.strictEqual(afterReparse.matched, true, 'expected the manual link to survive a fresh Parse Input');
            assert.strictEqual(afterReparse.image, linkedImage, 'expected the manually-linked image to be untouched by the resync');
            assert.strictEqual(afterReparse.manuallyLinked, true, 'expected the manual-link flag itself to persist');
        }
    },
    {
        // Regression test for a real report: a Notes-tab character can be
        // entirely absent from the Sort tab's own data (claimed/renamed
        // after the last $mmmka+s paste there) - distinct from the
        // "unmatched" case, since there's no sortData line for them at all,
        // so nothing to click-to-link. The only fix is re-pasting a fresh
        // $mmmka+s output; this just makes that gap visible instead of
        // letting a character silently vanish from Sort tab search results.
        name: 'a Notes-tab character missing from the Sort tab data entirely is surfaced in the "missing from Sort tab" panel',
        async run(page) {
            await loadDemoCollection(page);

            // Sort tab data that covers every demo character EXCEPT Izutsumi.
            const sortInputText = await page.evaluate(() => {
                const lines = [];
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => {
                        if (c.name === 'Izutsumi') return;
                        lines.push(`${c.name} - ${seriesName} ${c.kakera || 1} ka`);
                    });
                }
                return lines.join('\n');
            });

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', sortInputText);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            const panelVisible = await page.locator('#missingFromSortPanel').isVisible();
            assert.ok(panelVisible, 'expected the missing-from-Sort-tab panel to appear');
            const panelText = await page.locator('#missingFromSortPanel').textContent();
            assert.ok(panelText.includes('1'), `expected the panel to report exactly 1 missing character, got: "${panelText}"`);

            await page.click('#missingFromSortToggleBtn');
            await page.waitForTimeout(100);
            const chipText = await page.locator('.missing-from-sort-chip').textContent();
            assert.ok(chipText.includes('Izutsumi'), `expected the expanded list to name the missing character, got: "${chipText}"`);

            // Search still shouldn't surface her, since she never had an
            // entry to begin with.
            await page.fill('#sortSearchInput', 'Izutsumi');
            await page.waitForTimeout(100);
            const searchResultCount = await page.locator('#sortCharacterList .sort-character-item').count();
            assert.strictEqual(searchResultCount, 0, 'expected the Sort tab search to find nothing for a character with no sortData entry at all');
        }
    },
    {
        name: 'the "missing from Sort tab" panel disappears once the missing character is included in a fresh paste',
        async run(page) {
            await loadDemoCollection(page);

            const allButIzutsumi = await page.evaluate(() => {
                const lines = [];
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => {
                        if (c.name === 'Izutsumi') return;
                        lines.push(`${c.name} - ${seriesName} ${c.kakera || 1} ka`);
                    });
                }
                return lines.join('\n');
            });
            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', allButIzutsumi);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');
            assert.ok(await page.locator('#missingFromSortPanel').isVisible(), 'expected the panel to show up before the fix');

            const everyone = await page.evaluate(() => {
                const lines = [];
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => {
                        lines.push(`${c.name} - ${seriesName} ${c.kakera || 1} ka`);
                    });
                }
                return lines.join('\n');
            });
            await page.fill('#sortInput', everyone);
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForTimeout(150);

            const panelVisibleAfter = await page.locator('#missingFromSortPanel').isVisible();
            assert.ok(!panelVisibleAfter, 'expected the panel to disappear once every character has a Sort tab entry');
        }
    }
];
