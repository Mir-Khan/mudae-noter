const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

// Same-shaped snippets as the demo data, but a distinct new series/character
// so merging is unambiguous to verify against a from-scratch parse.
const INITIAL_PASTE = `Dungeon Meshi - 36/40
#819 - Marcille Donato  💞 => arczeus | ✨ · ($wa) · :chaoskey:  (10) (#EAC57C) 1,304 ka - https://mudae.net/uploads/5107688/ASRKnT0~S2nXASL.gif`;

const INCREMENTAL_PASTE_NEW_CHAR = `Dungeon Meshi - 36/40
#1,683 - Izutsumi  💞 => arczeus | · ($wa) · :chaoskey:  (2) (#000000) 500 ka - https://mudae.net/uploads/3371494/ZiG_9A_~g4z9cdzar27.gif`;

const INCREMENTAL_PASTE_NEW_SERIES = `Monogatari - 35/35
#2,826 - Koyomi Araragi  💞 => arczeus | · ($ha) · :bronzekey:  (1) (#4B3E3B) 454 ka - https://mudae.net/uploads/5127825/niqiskC~HDpXTrY.gif`;

// Mirrors a real report: I-No (#6,151, a worse/higher rank) already in the
// collection, then Bridget (#964, a better/lower rank) added afterward -
// Bridget should end up listed first since a lower # is the better rank.
const GGXX_INITIAL = `Guilty Gear XX - 2/8
#6,151 - I-No  💞 => rykers · ($wg) · :key:  77 ka - https://mudae.net/uploads/7635880/ogT2Wox~LzWqgya.png`;

const GGXX_INCREMENTAL_BETTER_RANK = `Guilty Gear XX - 2/8
#964 - Bridget  💞 => rykers · ($wa, $wg) · :key:  180 ka - https://mudae.net/uploads/6528344/M5eWj1c~eXilG8H.png`;

async function addViaModal(page, text) {
    await page.click('button:has-text("Add New Characters")');
    await page.waitForSelector('#addCharactersOverlay', { state: 'visible' });
    await page.fill('#addCharsInput', text);
    await page.click('button:has-text("Add Characters")');
    await page.waitForTimeout(150);
}

module.exports = [
    {
        name: '"+ Add New Characters" opens a modal with a dedicated paste box and the command to run',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('button:has-text("Add New Characters")');
            await page.waitForSelector('#addCharactersOverlay', { state: 'visible' });

            const commandText = await page.locator('.add-chars-command').textContent();
            assert.strictEqual(commandText.trim(), '$mmsaty+ri-c+x+kon', `expected the modal to show the exact command to run, got: "${commandText}"`);

            const textareaVisible = await page.locator('#addCharsInput').isVisible();
            assert.ok(textareaVisible, 'expected a dedicated textarea for pasting the incremental output');
        }
    },
    {
        name: 'Cancel closes the modal without touching the collection',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await page.click('button:has-text("Add New Characters")');
            await page.waitForSelector('#addCharactersOverlay', { state: 'visible' });
            await page.fill('#addCharsInput', INCREMENTAL_PASTE_NEW_CHAR);
            await page.click('button:has-text("Cancel")');

            const overlayHidden = await page.locator('#addCharactersOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close on Cancel');

            const names = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters.map(c => c.name));
            assert.deepStrictEqual(names, ['Marcille Donato'], 'expected Cancel to discard the pasted text without merging it');
        }
    },
    {
        name: 'Add Characters merges a new character into an existing series without clearing what was there',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await addViaModal(page, INCREMENTAL_PASTE_NEW_CHAR);

            const names = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters.map(c => c.name));
            assert.deepStrictEqual(names.sort(), ['Izutsumi', 'Marcille Donato'], `expected both the original and the newly-added character, got: ${JSON.stringify(names)}`);

            const overlayHidden = await page.locator('#addCharactersOverlay').isHidden();
            assert.ok(overlayHidden, 'expected the modal to close automatically after a successful add');
        }
    },
    {
        name: 'Add Characters creates a brand new series when needed',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await addViaModal(page, INCREMENTAL_PASTE_NEW_SERIES);

            const seriesNames = await page.evaluate(() => Object.keys(AppState.seriesData));
            assert.ok(seriesNames.includes('Dungeon Meshi') && seriesNames.includes('Monogatari'),
                `expected both series to exist, got: ${JSON.stringify(seriesNames)}`);
        }
    },
    {
        name: 'Add Characters does not duplicate or overwrite a character that already exists',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            // Give the existing character a note locally, then "re-import"
            // the exact same character - a real "not noted" re-run could
            // plausibly resend it if the user hadn't noted it yet elsewhere.
            await page.evaluate(() => { AppState.seriesData['Dungeon Meshi'].characters[0].note = 'MyLocalNote'; });

            await addViaModal(page, INITIAL_PASTE);

            const chars = await page.evaluate(() => AppState.seriesData['Dungeon Meshi'].characters);
            assert.strictEqual(chars.length, 1, `expected no duplicate to be created, got ${chars.length} characters`);
            assert.strictEqual(chars[0].note, 'MyLocalNote', 'expected the existing character\'s local note to survive the re-import untouched');
        }
    },
    {
        name: 'pasting only already-known characters shows an error and leaves the modal open',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await page.click('button:has-text("Add New Characters")');
            await page.waitForSelector('#addCharactersOverlay', { state: 'visible' });
            await page.fill('#addCharsInput', INITIAL_PASTE);
            await page.click('button:has-text("Add Characters")');
            await page.waitForTimeout(150);

            const overlayVisible = await page.locator('#addCharactersOverlay').isVisible();
            assert.ok(overlayVisible, 'expected the modal to stay open so the user can see the error');
            const messageText = await page.locator('#addCharactersModalMessage').textContent();
            assert.ok(messageText.toLowerCase().includes('already'), `expected an "already in your collection" style message, got: "${messageText}"`);
        }
    },
    {
        name: 'the newly-merged data is reflected in the main input box afterward',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await addViaModal(page, INCREMENTAL_PASTE_NEW_CHAR);

            const inputValue = await page.inputValue('#input');
            assert.ok(inputValue.includes('Marcille Donato'), 'expected the original pasted text to still be present');
            assert.ok(inputValue.includes('Izutsumi'), 'expected the newly-added text to be appended in');
        }
    },
    {
        // Regression test for: a character added to a series that already
        // existed used to show up in the box as a second, duplicate
        // "Dungeon Meshi - X/Y" block tacked onto the very end, instead of
        // grouped together with the series it actually belongs to.
        name: 'a character added to an existing series is grouped into that series\' block in the input box, not a duplicate block at the end',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await addViaModal(page, INCREMENTAL_PASTE_NEW_CHAR);

            const inputValue = await page.inputValue('#input');
            const seriesHeaderMatches = inputValue.match(/^Dungeon Meshi - \d+\/\d+$/gm) || [];
            assert.strictEqual(seriesHeaderMatches.length, 1, `expected exactly one "Dungeon Meshi" series header, got ${seriesHeaderMatches.length}: ${JSON.stringify(seriesHeaderMatches)}`);

            const headerIndex = inputValue.indexOf(seriesHeaderMatches[0]);
            const marcilleIndex = inputValue.indexOf('Marcille Donato');
            const izutsumiIndex = inputValue.indexOf('Izutsumi');
            assert.ok(headerIndex < marcilleIndex && headerIndex < izutsumiIndex,
                'expected both characters to appear after their series\' header');

            // The box should still be a faithful, re-parseable representation
            // of the merged collection - not just visually grouped but
            // structurally correct too.
            const reparsed = await page.evaluate((text) => parseCollectionText(text), inputValue);
            assert.deepStrictEqual(reparsed['Dungeon Meshi'].characters.map(c => c.name).sort(), ['Izutsumi', 'Marcille Donato'],
                'expected the regenerated input box text to re-parse back into both characters under Dungeon Meshi');
        }
    },
    {
        // Regression test for a real report: a character with a better
        // (lower) global rank added after one with a worse (higher) rank
        // showed up listed second in the input box instead of first -
        // serialization was preserving raw array/insertion order instead of
        // sorting by rank.
        name: 'within a series, characters are listed by global rank (lower # first), not insertion order',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', GGXX_INITIAL);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await addViaModal(page, GGXX_INCREMENTAL_BETTER_RANK);

            const inputValue = await page.inputValue('#input');
            const bridgetIndex = inputValue.indexOf('Bridget');
            const inoIndex = inputValue.indexOf('I-No');
            assert.ok(bridgetIndex !== -1 && inoIndex !== -1, 'expected both characters to be present in the input box');
            assert.ok(bridgetIndex < inoIndex, `expected Bridget (#964, better rank) to be listed before I-No (#6,151, worse rank), got Bridget at ${bridgetIndex} and I-No at ${inoIndex}`);

            const order = await page.evaluate(() => AppState.seriesData['Guilty Gear XX'].characters.map(c => c.name));
            assert.ok(order.indexOf('Bridget') < order.indexOf('I-No'),
                `expected the underlying merge to also keep Bridget ranked ahead of I-No, got: ${JSON.stringify(order)}`);
        }
    },
    {
        // Regression test for a real report: AppState.sortData - the Sort
        // tab's own separate flat list, from a distinct $mmmka+s paste -
        // never got the newly-merged character, so it silently never showed
        // up there even though it was correctly added to the Notes tab.
        name: 'a character added via the Add Characters modal is also appended to AppState.sortData if the Sort tab already has data',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await page.click('#tab-sort-btn');
            await page.waitForSelector('#sortInput');
            await page.fill('#sortInput', 'Marcille Donato - Dungeon Meshi 1304 ka');
            await page.click('button:has-text("Parse Sort Input")');
            await page.waitForSelector('#sortCharacterList .sort-character-item');

            await page.click('#tab-notes-btn');
            await addViaModal(page, INCREMENTAL_PASTE_NEW_CHAR);

            const sortDataNames = await page.evaluate(() => AppState.sortData.map(e => e.name));
            assert.ok(sortDataNames.includes('Izutsumi'),
                `expected the newly-added character to also appear in AppState.sortData, got: ${JSON.stringify(sortDataNames)}`);

            const sortEntry = await page.evaluate(() => AppState.sortData.find(e => e.name === 'Izutsumi'));
            assert.strictEqual(sortEntry.series, 'Dungeon Meshi', 'expected the new sortData entry to carry the right series');
            assert.strictEqual(sortEntry.kakera, '500', 'expected the new sortData entry to carry the right kakera value');
        }
    },
    {
        // Regression test for the other half of the same report: a
        // brand-new series introduced via the modal should show up at the
        // end of the Series Order tab's list, not get lost.
        name: 'a brand new series added via the Add Characters modal appears at the end of the series order',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.fill('#input', INITIAL_PASTE);
            await page.click('button:has-text("Parse Input")');
            await page.waitForSelector('.series-card');

            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            await page.click('#tab-notes-btn');

            await addViaModal(page, INCREMENTAL_PASTE_NEW_SERIES);

            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            const order = await page.evaluate(() => AppState.seriesOrder.slice());
            assert.strictEqual(order[order.length - 1], 'Monogatari',
                `expected the newly-added series to be appended at the end of the series order, got: ${JSON.stringify(order)}`);
        }
    }
];
