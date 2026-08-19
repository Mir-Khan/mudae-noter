const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

// A small, fully-controlled fixture (not the demo collection) so every
// test can reason exactly about keys/kakera/color/note per character.
// The middle-dot (·) before the meta segment is required for
// color/keys to parse at all - a real quirk of the paste format.
const FIXTURE_TEXT = `TestSeries - 3/3
Alice | Base Note · (#ff0000) 1500 ka - https://example.com/a.png
Bob | Base Note · (#ff0000) 1500 ka - https://example.com/b.png
Carol · (#00ff00) 200 ka - https://example.com/c.png`;

async function loadFixture(page) {
    await dismissChangelogIfPresent(page);
    await page.fill('#input', FIXTURE_TEXT);
    await page.click('button:has-text("Parse Input")');
    await page.waitForSelector('.series-card');
}

async function addRule(page, rule) {
    return page.evaluate((r) => {
        const dn = currentDynamicNotes();
        const id = generateDynamicRuleId();
        dn.rules[id] = Object.assign({ id: id, enabled: true, appliesTo: [] }, r);
        dn.order.push(id);
        saveToLocalStorage();
        displaySeries();
        return id;
    }, rule);
}

async function optIn(page, ruleId, seriesName, charName) {
    await page.evaluate(({ ruleId, seriesName, charName }) => {
        const dn = currentDynamicNotes();
        const char = AppState.seriesData[seriesName].characters.find(c => c.name === charName);
        dn.rules[ruleId].appliesTo.push(dynamicNoteCharKey(seriesName, char));
        saveToLocalStorage();
        displaySeries();
    }, { ruleId, seriesName, charName });
}

module.exports = [
    {
        name: 'with no rules defined, the display note is byte-identical to the typed note everywhere',
        async run(page) {
            await loadFixture(page);
            const result = await page.evaluate(() => {
                const alice = AppState.seriesData['TestSeries'].characters[0];
                return { display: getDisplayNote(alice, 'TestSeries'), note: alice.note };
            });
            assert.strictEqual(result.display, result.note);

            const cardText = (await page.locator('.character-card', { hasText: 'Alice' }).locator('.character-note').textContent()).trim();
            assert.strictEqual(cardText, 'Base Note');
        }
    },
    {
        name: 'a "keys" repeat-mode rule renders the symbol N times and updates live when the key count changes, with no manual regenerate',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            await optIn(page, ruleId, 'TestSeries', 'Alice');

            let display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note', 'expected no suffix yet - Alice starts with 0 keys, below the min of 1');

            const aliceCard = page.locator('.character-card', { hasText: 'Alice' });
            await aliceCard.locator('[data-action="add-keys"]').click();
            await page.waitForTimeout(100);
            await page.keyboard.type('3');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);

            display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note  |  🔑🔑🔑');

            const cardText = (await aliceCard.locator('.character-note').textContent()).trim();
            assert.ok(cardText.includes('🔑🔑🔑'), `expected the card to show the live suffix, got: "${cardText}"`);

            // Regression: the indicator's tooltip must make clear the
            // suffix IS sent when generating $n, not just a display trick.
            // The suffix TEXT is included in $n commands, but the ✨
            // marker itself is only a UI badge and is never part of the
            // note or the generated command - the tooltip must be
            // unambiguous about which is which.
            const indicatorTitle = await aliceCard.locator('.dynamic-note-indicator').getAttribute('title');
            assert.ok(/\$n/.test(indicatorTitle) && /suffix.*IS included/i.test(indicatorTitle) && /marker is NOT/i.test(indicatorTitle),
                `expected the tooltip to clarify the suffix IS included in $n but the ✨ marker itself is NOT, got: "${indicatorTitle}"`);

            const bobDisplay = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[1], 'TestSeries'));
            assert.strictEqual(bobDisplay, 'Base Note', 'expected Bob (not opted in) to be untouched');
        }
    },
    {
        name: 'a "keys" count-mode rule renders the symbol + count text using the template',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'count', template: '{symbol}x{n}', min: 1, max: 20 } });
            await optIn(page, ruleId, 'TestSeries', 'Alice');
            await page.evaluate(() => { AppState.seriesData['TestSeries'].characters[0].keys = '10'; });

            const display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note  |  🔑x10');
        }
    },
    {
        name: 'a "kakera" rule picks the highest threshold the value clears, falling back below every threshold',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, {
                name: 'Kakera', type: 'kakera',
                config: { buckets: [{ min: 1000, text: '1K+' }, { min: 500, text: '500+' }], fallback: 'low' }
            });
            await optIn(page, ruleId, 'TestSeries', 'Alice'); // 1500 ka
            await optIn(page, ruleId, 'TestSeries', 'Carol'); // 200 ka

            const aliceDisplay = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(aliceDisplay, 'Base Note  |  1K+', 'expected the highest bucket Alice clears (1500 >= 1000)');

            const carolDisplay = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[2], 'TestSeries'));
            assert.strictEqual(carolDisplay, 'low', 'expected the fallback text since 200 is under every threshold, with no base note to prefix');
        }
    },
    {
        name: 'a "color" rule supports exact and nearest-with-tolerance matching',
        async run(page) {
            await loadFixture(page);
            const exactRuleId = await addRule(page, {
                name: 'Color exact', type: 'color',
                config: { entries: [{ hex: '#ff0000', text: '🔴' }], matchMode: 'exact', tolerance: 40, fallback: '' }
            });
            await optIn(page, exactRuleId, 'TestSeries', 'Alice'); // #ff0000 - exact match
            await optIn(page, exactRuleId, 'TestSeries', 'Carol'); // #00ff00 - no match, no fallback

            const aliceDisplay = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(aliceDisplay, 'Base Note  |  🔴');
            const carolDisplay = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[2], 'TestSeries'));
            assert.strictEqual(carolDisplay, '', 'expected no match and empty fallback to produce no suffix at all');

            // Nearest mode: #ff0000 is close to #fe0101 (within tolerance) but far from #00ff00.
            const nearRuleId = await addRule(page, {
                name: 'Color near', type: 'color',
                config: { entries: [{ hex: '#fe0101', text: 'near-red' }], matchMode: 'nearest', tolerance: 40, fallback: 'no-match' }
            });
            await optIn(page, nearRuleId, 'TestSeries', 'Alice');
            const aliceNear = await page.evaluate(() => {
                const rules = currentDynamicNotes().rules;
                const nearRule = Object.values(rules).find(r => r.name === 'Color near');
                return DYNAMIC_RULE_TYPES.color.render('#ff0000', nearRule.config);
            });
            assert.strictEqual(aliceNear, 'near-red');
        }
    },
    {
        name: 'multiple active rules combine in rule order, joined by the configured joiner',
        async run(page) {
            await loadFixture(page);
            const keysId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            const colorId = await addRule(page, { name: 'Color', type: 'color', config: { entries: [{ hex: '#ff0000', text: '🔴' }], matchMode: 'exact', tolerance: 40, fallback: '' } });
            await optIn(page, keysId, 'TestSeries', 'Alice');
            await optIn(page, colorId, 'TestSeries', 'Alice');
            await page.evaluate(() => { AppState.seriesData['TestSeries'].characters[0].keys = '2'; });

            let display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note  |  🔑🔑 🔴', 'expected rules joined in order with a single space by default');

            await page.evaluate(() => { currentDynamicNotes().joiner = ' + '; });
            display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note  |  🔑🔑 + 🔴');
        }
    },
    {
        // The key regression this whole feature exists to protect: two
        // characters sharing a base note but differing in suffix must
        // produce separate $n commands, while everything note-order
        // related stays keyed on the base note only.
        name: 'characters sharing a base note but differing in suffix land in separate $n commands, while $smnote order/counts/search stay base-note-only',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            await optIn(page, ruleId, 'TestSeries', 'Alice');
            await page.evaluate(() => { AppState.seriesData['TestSeries'].characters[0].keys = '3'; });
            // Bob keeps the same "Base Note" but is NOT opted into the rule.

            await page.evaluate(() => generateNoteCommands());
            const commandsHTML = await page.locator('#commands').innerHTML();
            // 3 total: Carol (no note), Bob ("Base Note"), Alice ("Base
            // Note" + suffix) - Alice and Bob must NOT collapse into one
            // command despite sharing the same base note.
            const commandCount = (commandsHTML.match(/class="command-item"/g) || []).length;
            assert.strictEqual(commandCount, 3, `expected 3 separate $n commands (Alice's suffix keeping her split from Bob), got: ${commandsHTML}`);
            assert.ok(commandsHTML.includes('$n Bob $ Base Note<'), 'expected Bob\'s command to carry only the base note');
            assert.ok(commandsHTML.includes('🔑🔑🔑'), 'expected Alice\'s command to carry the suffix');

            // $smnote order/counts/search: base-note-only, unaffected by the suffix.
            const noteOrderCount = await page.evaluate(() => {
                AppState.noteOrder = getSyncedNoteOrder();
                return AppState.noteOrder.length;
            });
            assert.strictEqual(noteOrderCount, 1, 'expected exactly one distinct note in the order list ("Base Note"), not split by suffix');
            const count = await page.evaluate(() => countCharactersWithNote('Base Note'));
            assert.strictEqual(count, 2, 'expected both Alice and Bob counted under the same base note');
        }
    },
    {
        name: 'the raw-text round trip (serializeSeriesDataToText / re-parsing) never bakes the suffix into the stored note',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            await optIn(page, ruleId, 'TestSeries', 'Alice');
            await page.evaluate(() => { AppState.seriesData['TestSeries'].characters[0].keys = '3'; });

            const serialized = await page.evaluate(() => serializeSeriesDataToText(AppState.seriesData));
            assert.ok(!serialized.includes('🔑'), `expected the serialized text to exclude the dynamic suffix entirely, got: ${serialized}`);
            assert.ok(serialized.includes('Base Note'), 'expected the base note to still be present');

            await page.click('button:has-text("Parse Input")');
            await page.waitForTimeout(150);
            const noteAfter = await page.evaluate(() => AppState.seriesData['TestSeries'].characters[0].note);
            assert.strictEqual(noteAfter, 'Base Note', 'expected the base note to survive a re-parse unsuffixed');
        }
    },
    {
        name: 'the bulk "All"/"Selected"/"Off" widget on a series group opts in exactly the intended characters',
        async run(page) {
            await loadFixture(page);
            await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            // addRule already calls displaySeries(), so the group's bulk
            // opt-in widget is already rendered - no reload needed.
            await page.evaluate(() => {
                AppState.seriesData['TestSeries'].characters.forEach(c => { c.keys = '2'; });
                saveToLocalStorage();
            });

            const group = page.locator('.series-card').filter({ hasText: 'TestSeries' });
            await group.locator('.dynamic-rule-select').selectOption({ label: 'Keys' });
            await group.locator('[data-action="bulk-dynamic-on"][data-target="all"]').click();
            await page.waitForTimeout(150);

            const afterAll = await page.evaluate(() => {
                const chars = AppState.seriesData['TestSeries'].characters;
                return chars.map(c => getDisplayNote(c, 'TestSeries'));
            });
            assert.ok(afterAll.every(d => d.includes('🔑🔑')), `expected every character to get the suffix after "All", got: ${JSON.stringify(afterAll)}`);

            await group.locator('[data-action="bulk-dynamic-off"][data-target="all"]').click();
            await page.waitForTimeout(150);
            const afterOff = await page.evaluate(() => {
                const chars = AppState.seriesData['TestSeries'].characters;
                return chars.map(c => getDisplayNote(c, 'TestSeries'));
            });
            assert.ok(afterOff.every(d => !d.includes('🔑')), `expected "Off" to clear every character's suffix, got: ${JSON.stringify(afterOff)}`);
        }
    },
    {
        name: 'the master enable toggle turns every suffix off without touching rule/opt-in configuration',
        async run(page) {
            await loadFixture(page);
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });
            await optIn(page, ruleId, 'TestSeries', 'Alice');
            await page.evaluate(() => { AppState.seriesData['TestSeries'].characters[0].keys = '3'; });

            let display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.ok(display.includes('🔑'));

            await page.evaluate(() => { currentDynamicNotes().enabled = false; });
            display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note', 'expected disabling the master toggle to suppress every suffix');

            const stillConfigured = await page.evaluate(() => {
                const dn = currentDynamicNotes();
                const rule = Object.values(dn.rules)[0];
                return rule.appliesTo.length;
            });
            assert.strictEqual(stillConfigured, 1, 'expected the rule/opt-in configuration to survive untouched, just suppressed');
        }
    },
    {
        name: 'a rule of an unrecognized future type is skipped (no-op) instead of throwing',
        async run(page) {
            await loadFixture(page);
            await page.evaluate(() => {
                const dn = currentDynamicNotes();
                const id = 'r_future';
                dn.rules[id] = { id: id, name: 'Future Thing', type: 'not-a-real-type-yet', enabled: true, appliesTo: [dynamicNoteCharKey('TestSeries', AppState.seriesData['TestSeries'].characters[0])], config: {} };
                dn.order.push(id);
            });
            const display = await page.evaluate(() => getDisplayNote(AppState.seriesData['TestSeries'].characters[0], 'TestSeries'));
            assert.strictEqual(display, 'Base Note', 'expected the unknown rule type to contribute nothing, not throw or crash');
        }
    },
    {
        // Regression test for a real report: sorting a series group (e.g.
        // by Keys), then clicking ANY bulk-apply widget - note, color, or
        // the new dynamic-rule one - used to silently snap the visible
        // order back to the group's original render order, since the
        // bulk handlers read character identifiers from a DOM attribute
        // the sort action never updated. Fixed at the shared root
        // (the 'sort' action now writes the new order back), so all
        // three widgets benefit, not just the new one.
        name: 'sorting a series group, then using a bulk-apply widget (note/color/dynamic rule), preserves the sorted order instead of reverting to original',
        async run(page) {
            await loadFixture(page);
            await page.evaluate(() => {
                const chars = AppState.seriesData['TestSeries'].characters;
                chars[0].keys = '10'; // Alice
                chars[1].keys = '1';  // Bob
                chars[2].keys = '5';  // Carol
            });
            const ruleId = await addRule(page, { name: 'Keys', type: 'keys', config: { symbol: '🔑', mode: 'repeat', min: 1, max: 20, template: '{symbol}x{n}' } });

            const group = page.locator('.series-card').filter({ hasText: 'TestSeries' });
            await group.locator('[data-action="sort"][data-sort-by="keys"]').click();
            await page.waitForTimeout(100);
            const sortedOrder = await group.locator('.character-name').allTextContents();
            assert.deepStrictEqual(sortedOrder, ['Alice', 'Carol', 'Bob'], 'expected descending key-count order (10, 5, 1)');

            await group.locator('.note-input').first().fill('BulkNoted');
            await group.locator('[data-action="bulk-note"][data-target="all"]').click();
            await page.waitForTimeout(150);
            assert.deepStrictEqual(await group.locator('.character-name').allTextContents(), sortedOrder, 'expected the sorted order to survive a bulk-note action');

            await group.locator('.dynamic-rule-select').selectOption({ label: 'Keys' });
            await group.locator('[data-action="bulk-dynamic-on"][data-target="all"]').click();
            await page.waitForTimeout(150);
            assert.deepStrictEqual(await group.locator('.character-name').allTextContents(), sortedOrder, 'expected the sorted order to survive the bulk dynamic-rule "All" action too');
        }
    }
];
