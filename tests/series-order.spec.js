const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for: $smseries has no confirmed append/insert/
        // continuation mode (confirmed against the real bot - see README),
        // so generating it used to silently split into multiple "$smseries "
        // commands that looked valid but actually overwrote each other.
        name: 'Generate $smseries Command produces exactly one command, not a broken multi-part chunk',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');

            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);

            const commandItems = await page.locator('#seriesOrderCommandOutput .command-item').count();
            assert.strictEqual(commandItems, 1, 'expected exactly one command, not multiple $smseries parts');

            const commandText = await page.locator('#seriesOrderCommandOutput .command-text').first().textContent();
            assert.ok(commandText.startsWith('$smseries '), `expected the one-word $smseries prefix, got: ${commandText.slice(0, 30)}`);
            assert.ok(!commandText.includes('$smseries', 10), 'expected only a single $smseries prefix in the whole command');
        }
    },
    {
        // Regression test for: the confirm button used to be hidden for
        // ANY command over 2,000 chars, even ones comfortably under
        // Discord's 4,000-char Nitro limit that a Nitro user could have
        // genuinely run successfully.
        name: 'over the 2,000 limit but under Nitro\'s 4,000: warns, but still offers a confirm button',
        async run(page) {
            await loadDemoCollection(page);

            // Synthesize enough long series names to land the combined
            // command between 2,000 and 4,000 chars.
            await page.evaluate(() => {
                for (let i = 0; i < 60; i++) {
                    const name = 'Some Very Long Synthetic Series Name Number ' + i;
                    AppState.seriesData[name] = { owned: 1, note: '', characters: [{ name: 'Char' + i, keys: 1, kakera: 100, note: '', color: '', excluded: false, rank: 0 }] };
                }
            });

            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);

            const commandLength = (await page.locator('#seriesOrderCommandOutput .command-text').textContent()).length;
            assert.ok(commandLength > 2000 && commandLength <= 4000, `expected this test's synthetic data to land between 2,000-4,000 chars, got ${commandLength}`);

            const warningText = await page.locator('#seriesOrderCommandOutput .sort-limit-warning').textContent().catch(() => '');
            assert.ok(warningText.includes('2,000'), `expected an over-the-limit warning mentioning Discord's 2,000 char limit, got: "${warningText}"`);
            assert.ok(/doesn.t support appending/.test(warningText), 'expected the warning to explain there is no append/insert/continuation workaround');

            const confirmBtn = page.locator('.confirm-applied-btn');
            assert.ok(await confirmBtn.isVisible(), 'expected a confirm button to still be offered since a Nitro user could plausibly have run this');
            const confirmLabel = await confirmBtn.textContent();
            assert.ok(/nitro/i.test(confirmLabel), `expected the confirm button to note that Nitro is needed, got: "${confirmLabel}"`);
        }
    },
    {
        // Regression test for: a full order too long even for Nitro used to
        // just get a "you'll need Nitro or fewer series" warning with no
        // usable command at all. It should instead cut the command off at
        // the last series that fits, clearly say how many were left out,
        // point at a way to sort the rest, and still offer to confirm the
        // partial order it *could* actually send.
        name: 'over the 4,000 Nitro limit too: truncates to what fits, explains what was left out, and still confirms the partial order',
        async run(page) {
            await loadDemoCollection(page);

            const totalSynthetic = 150;
            await page.evaluate((count) => {
                for (let i = 0; i < count; i++) {
                    const name = 'Some Very Long Synthetic Series Name Number ' + i;
                    AppState.seriesData[name] = { owned: 1, note: '', characters: [{ name: 'Char' + i, keys: 1, kakera: 100, note: '', color: '', excluded: false, rank: 0 }] };
                }
            }, totalSynthetic);

            await page.click('#tab-series-btn');
            await page.waitForSelector('#sortSeriesList');
            await page.click('button:has-text("Generate $smseries Command")');
            await page.waitForTimeout(150);

            const commandText = await page.locator('#seriesOrderCommandOutput .command-text').textContent();
            assert.ok(commandText.length <= 4000, `expected the generated command to be truncated to fit Discord's 4,000 char Nitro limit, got ${commandText.length}`);
            assert.ok(commandText.startsWith('$smseries '), 'expected the truncated command to still start with the right prefix');

            const warningText = await page.locator('#seriesOrderCommandOutput .sort-limit-warning').textContent();
            assert.ok(/too long even for Discord Nitro/i.test(warningText), `expected the warning to explain it's over even the Nitro limit, got: "${warningText}"`);
            assert.ok(/left in their current order/i.test(warningText), `expected the warning to explain the excluded series keep their current order, got: "${warningText}"`);
            assert.ok(/sort by notes|one at a time/i.test(warningText), `expected the warning to point at a manual way to sort the rest, got: "${warningText}"`);

            const headerText = await page.locator('#seriesOrderCommandOutput .command-series').textContent();
            const includedMatch = headerText.match(/^(\d+) of (\d+) series/);
            assert.ok(includedMatch, `expected a "N of M series" header, got: "${headerText}"`);
            const includedCount = parseInt(includedMatch[1], 10);
            const totalCount = parseInt(includedMatch[2], 10);
            assert.ok(includedCount > 0 && includedCount < totalCount, `expected some but not all series to be included, got ${includedCount} of ${totalCount}`);

            const confirmBtn = page.locator('.confirm-applied-btn');
            assert.ok(await confirmBtn.isVisible(), 'expected a confirm button for the partial order that actually fits');

            // Confirming should only reorder what the truncated command
            // covered - the excluded series should keep existing, not get
            // dropped or reshuffled.
            const seriesBeforeConfirm = await page.evaluate(() => Object.keys(AppState.seriesData).length);
            await confirmBtn.click();
            await page.waitForTimeout(150);
            const seriesAfterConfirm = await page.evaluate(() => Object.keys(AppState.seriesData).length);
            assert.strictEqual(seriesAfterConfirm, seriesBeforeConfirm, 'expected confirming a truncated order to keep every series, not drop the excluded ones');

            const firstSeriesName = await page.evaluate(() => Object.keys(AppState.seriesData)[0]);
            assert.ok(commandText.includes(firstSeriesName), 'expected the first series after confirming to be one that was actually included in the truncated command');
        }
    }
];
