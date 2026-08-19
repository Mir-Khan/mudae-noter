const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

async function parseText(page, text) {
    await dismissChangelogIfPresent(page);
    await page.fill('#input', text);
    await page.click('button:has-text("Parse Input")');
    await page.waitForTimeout(200);
}

module.exports = [
    {
        // Regression test for a real report: Mudae appends "🚫 $xx DISABLED"
        // right after a character's own note (not just a bare 🚫), and the
        // parser was only stripping the emoji itself, leaving the rest of
        // that status text sitting in the note field verbatim.
        name: 'a disabled character\'s "🚫 $xx DISABLED" marker is stripped from the note, not left in it',
        async run(page) {
            const text = `Some Series - 2/2
#14,834 - Orin the Red  💞 => rykers | ✗ · ($wg) 55 ka - https://mudae.net/uploads/5133704/7pkcbJU~JOZxdDh.png
#37,479 - Zevlor  💞 => rykers | ✗  🚫  $hg  DISABLED · ($hg) 40 ka - https://mudae.net/uploads/4514635/My8jSfk~4dn0Qc4.png`;
            await parseText(page, text);

            const chars = await page.evaluate(() => AppState.seriesData['Some Series'].characters.map(c => ({ name: c.name, note: c.note, isDisabled: c.isDisabled })));

            assert.strictEqual(chars[0].name, 'Orin the Red');
            assert.strictEqual(chars[0].note, '✗');
            assert.strictEqual(chars[0].isDisabled, false);

            assert.strictEqual(chars[1].name, 'Zevlor');
            assert.strictEqual(chars[1].note, '✗', `expected just the note "✗" with the disabled marker stripped, got: "${chars[1].note}"`);
            assert.strictEqual(chars[1].isDisabled, true);
        }
    },
    {
        name: 'a character disabled across multiple roulettes at once still ends up with just its real note',
        async run(page) {
            const text = `Multi Series - 1/1
#1,234 - Relicanth  💞 => rykers | ★★★  🚫  $wa  DISABLED 🚫  $ha  DISABLED 🚫  $wg  DISABLED · 42 ka - https://mudae.net/uploads/1/x.png`;
            await parseText(page, text);

            const chars = await page.evaluate(() => AppState.seriesData['Multi Series'].characters.map(c => ({ name: c.name, note: c.note, isDisabled: c.isDisabled })));
            assert.strictEqual(chars[0].note, '★★★', `expected just the real note, got: "${chars[0].note}"`);
            assert.strictEqual(chars[0].isDisabled, true);
        }
    },
    {
        name: 'a character with no note at all and a disabled marker ends up with an empty note, not stray marker text',
        async run(page) {
            const text = `No Note Series - 1/1
#500 - Someone  💞 => rykers | 🚫  $wa  DISABLED · 10 ka - https://mudae.net/uploads/1/y.png`;
            await parseText(page, text);

            const chars = await page.evaluate(() => AppState.seriesData['No Note Series'].characters.map(c => ({ name: c.name, note: c.note, isDisabled: c.isDisabled })));
            assert.strictEqual(chars[0].note, '');
            assert.strictEqual(chars[0].isDisabled, true);
        }
    },
    {
        // Regression test for a real report: a very large series group used
        // to push the whole page to an unwieldy scroll length. The group's
        // own character list now caps its height and scrolls internally
        // instead, so the page itself stays a normal length regardless of
        // how many characters one series holds.
        name: 'a very large series group scrolls internally instead of stretching the whole page',
        async run(page) {
            const lines = ['BigSeries - 60/60'];
            for (let i = 1; i <= 60; i++) lines.push(`Character${i} 100 ka - https://example.com/${i}.png`);
            await parseText(page, lines.join('\n'));
            await page.waitForSelector('.series-card');

            const metrics = await page.locator('.characters-list').evaluate(el => ({
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight
            }));
            assert.ok(metrics.scrollHeight > metrics.clientHeight,
                `expected the character list to be internally scrollable for a large group, got scrollHeight ${metrics.scrollHeight} vs clientHeight ${metrics.clientHeight}`);

            const pageScrollHeight = await page.evaluate(() => document.body.scrollHeight);
            assert.ok(pageScrollHeight < metrics.scrollHeight,
                `expected the page itself to stay shorter than the group's full (unscrolled) content height, got page ${pageScrollHeight} vs group content ${metrics.scrollHeight}`);
        }
    }
];
