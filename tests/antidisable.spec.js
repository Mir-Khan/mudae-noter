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
