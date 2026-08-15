const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

async function disableAllCharactersInSeries(page, seriesName) {
    await page.evaluate((name) => {
        AppState.seriesData[name].characters.forEach(c => { c.isDisabled = true; });
    }, seriesName);
}

module.exports = [
    {
        name: 'the Generate $antidisable button is disabled with no collection loaded',
        async run(page) {
            const disabled = await page.locator('#generateAntidisableBtn').isDisabled();
            assert.ok(disabled, 'expected the button to be disabled before any collection is parsed');
        }
    },
    {
        name: 'opening the modal lists only series where every character is disabled',
        async run(page) {
            await loadDemoCollection(page);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');
            // One Piece stays only partially disabled.
            await page.evaluate(() => {
                AppState.seriesData['One Piece'].characters[0].isDisabled = true;
            });

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });

            const rows = await page.locator('#antidisableList label').allTextContents();
            assert.deepStrictEqual(rows.map(r => r.trim()), ['Dungeon Meshi'], `expected only the fully-disabled series listed, got: ${JSON.stringify(rows)}`);

            const allChecked = await page.locator('.antidisable-check').evaluateAll(boxes => boxes.every(b => b.checked));
            assert.ok(allChecked, 'expected every listed series to be checked by default');
        }
    },
    {
        name: 'unchecking a series excludes it from the generated command',
        async run(page) {
            await loadDemoCollection(page);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');
            await disableAllCharactersInSeries(page, 'One Piece');

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });

            await page.click('label:has-text("One Piece") input');
            await page.click('#antidisableGenerateBtn');
            await page.waitForSelector('#antidisableOutput .command-text');

            const command = await page.locator('#antidisableOutput .command-text').textContent();
            assert.strictEqual(command, '$antidisable Dungeon Meshi', `expected only the checked series in the command, got: "${command}"`);
        }
    },
    {
        name: 'the command syntax joins multiple series with $',
        async run(page) {
            await loadDemoCollection(page);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');
            await disableAllCharactersInSeries(page, 'One Piece');

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });
            await page.click('#antidisableGenerateBtn');
            await page.waitForSelector('#antidisableOutput .command-text');

            const command = await page.locator('#antidisableOutput .command-text').textContent();
            assert.strictEqual(command, '$antidisable Dungeon Meshi$One Piece', `expected both series joined with $, got: "${command}"`);

            await page.evaluate(() => {
                window.__copiedText = null;
                navigator.clipboard.writeText = (text) => { window.__copiedText = text; return Promise.resolve(); };
            });
            await page.click('#antidisableOutput button:has-text("Copy Command")');
            const copied = await page.evaluate(() => window.__copiedText);
            assert.strictEqual(copied, command);
        }
    },
    {
        name: 'no disabled series shows an empty state and disables the generate button',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });

            const emptyMessage = await page.locator('#antidisableList').textContent();
            assert.ok(/no fully-disabled series/i.test(emptyMessage), `expected an empty-state message, got: "${emptyMessage}"`);
            const disabled = await page.locator('#antidisableGenerateBtn').isDisabled();
            assert.ok(disabled, 'expected Generate Command to be disabled with nothing to generate');
        }
    },
    {
        name: 'Game Mode defaults to 1, hides the granularity toggle, and persists across a reload',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });

            assert.strictEqual(await page.locator('#antidisableMode1Btn').evaluate(el => el.classList.contains('active')), true, 'expected Mode 1 active by default');
            assert.strictEqual(await page.locator('#antidisableGranularityToggle').isVisible(), false, 'expected the granularity toggle hidden in Mode 1');

            await page.click('#antidisableMode2Btn');
            assert.strictEqual(await page.locator('#antidisableGranularityToggle').isVisible(), true, 'expected the granularity toggle to appear in Mode 2');

            const gameMode = await page.evaluate(() => AppState.ui.gameMode);
            assert.strictEqual(gameMode, 2, 'expected the choice written to AppState.ui.gameMode');

            await page.reload();
            await page.waitForSelector('#generateAntidisableBtn');
            const gameModeAfterReload = await page.evaluate(() => AppState.ui.gameMode);
            assert.strictEqual(gameModeAfterReload, 2, 'expected the game mode to persist across a reload');
        }
    },
    {
        name: 'Mode 2 "By Character" lists individual disabled characters with their series, filterable by search',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                AppState.seriesData['One Piece'].characters[0].isDisabled = true;
            });
            const firstOnePieceName = await page.evaluate(() => AppState.seriesData['One Piece'].characters[0].displayName || AppState.seriesData['One Piece'].characters[0].name);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });
            await page.click('#antidisableMode2Btn');
            await page.click('#antidisableGranCharacterBtn');
            await page.waitForTimeout(100);

            assert.strictEqual(await page.locator('#antidisableSearchInput').isVisible(), true, 'expected the search box to appear for character mode');
            const labels = await page.locator('#antidisableList label').allTextContents();
            assert.ok(labels.some(l => l.includes(firstOnePieceName) && l.includes('One Piece')), `expected the single disabled One Piece character listed with its series, got: ${JSON.stringify(labels)}`);
            assert.ok(labels.length > 1, 'expected more than just the fully-disabled series worth of characters (partial series should show individually too)');

            await page.fill('#antidisableSearchInput', 'One Piece');
            await page.waitForTimeout(100);
            const filteredLabels = await page.locator('#antidisableList label').allTextContents();
            assert.ok(filteredLabels.every(l => l.includes('One Piece')), `expected the search to filter to only One Piece entries, got: ${JSON.stringify(filteredLabels)}`);
        }
    },
    {
        name: 'generating a command in "By Character" mode joins character names and adds the $adc/$aec disambiguation note',
        async run(page) {
            await loadDemoCollection(page);
            await page.evaluate(() => {
                AppState.seriesData['One Piece'].characters[0].isDisabled = true;
            });

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });
            await page.click('#antidisableMode2Btn');
            await page.click('#antidisableGranCharacterBtn');
            await page.waitForTimeout(100);

            await page.click('#antidisableGenerateBtn');
            await page.waitForSelector('#antidisableOutput .command-text');
            const command = await page.locator('#antidisableOutput .command-text').textContent();
            assert.ok(command.startsWith('$antidisable '), `expected a valid $antidisable command, got: "${command}"`);
            assert.ok(!command.includes('One Piece)'), 'expected only the character name in the command, not the "(Series)" label');

            const noteVisible = await page.locator('#antidisableOutput').textContent();
            assert.ok(/\$adc.*\$aec|\$aec.*\$adc/.test(noteVisible), 'expected the $adc/$aec disambiguation note in character mode');
        }
    },
    {
        name: 'switching back to Mode 1 hides the granularity toggle and reverts to the series list, even if "By Character" was active',
        async run(page) {
            await loadDemoCollection(page);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });
            await page.click('#antidisableMode2Btn');
            await page.click('#antidisableGranCharacterBtn');
            await page.waitForTimeout(100);

            await page.click('#antidisableMode1Btn');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.locator('#antidisableGranularityToggle').isVisible(), false);
            assert.strictEqual(await page.locator('#antidisableSearchInput').isVisible(), false);
            const rows = await page.locator('#antidisableList label').allTextContents();
            assert.deepStrictEqual(rows.map(r => r.trim()), ['Dungeon Meshi']);
        }
    },
    {
        name: 'unchecking everything shows an error instead of generating an empty command',
        async run(page) {
            await loadDemoCollection(page);
            await disableAllCharactersInSeries(page, 'Dungeon Meshi');

            await page.click('#generateAntidisableBtn');
            await page.waitForSelector('#antidisableOverlay', { state: 'visible' });
            await page.click('button:has-text("Check None")');
            await page.click('#antidisableGenerateBtn');
            await page.waitForTimeout(150);

            const messageText = await page.locator('#antidisableMessage').textContent();
            assert.ok(/select at least one series/i.test(messageText), `expected a "select at least one" error, got: "${messageText}"`);
            const outputEmpty = await page.locator('#antidisableOutput').innerHTML();
            assert.strictEqual(outputEmpty.trim(), '', 'expected no command to be generated');
        }
    }
];
