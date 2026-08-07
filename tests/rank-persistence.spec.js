const assert = require('assert');
const { loadDemoCollection } = require('./helpers');

module.exports = [
    {
        // Regression test for: the auto-assigned rank (1..N) shown when
        // Ranking is on used to be written only onto throwaway per-render
        // copies, not the real character objects, so it silently reverted to
        // raw parse order on the next re-render (e.g. after editing a note).
        name: 'auto-assigned rank persists onto the real character objects, not just the render copies',
        async run(page) {
            await loadDemoCollection(page);

            await page.click('#ranking-on-btn');
            await page.click('#group-note-btn');
            await page.waitForTimeout(150);

            const state = await page.evaluate(() => {
                const ranks = [];
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => ranks.push(c.rank));
                }
                return ranks;
            });

            assert.ok(state.length > 0, 'expected demo characters to exist');
            assert.ok(state.every(r => typeof r === 'number' && r > 0),
                `expected every character to have a persisted rank > 0 after the auto-fill, got: ${JSON.stringify(state)}`);
        }
    },
    {
        // Before the fix, a second render would re-run the "every rank is 0"
        // auto-fill and hand out fresh 1..N ranks by array order every time
        // it ran (since the previous pass never actually saved anything) -
        // harmless if nothing else changes group membership in between, but
        // exactly the mechanism that reset order once a note edit *did*
        // change membership. Asserting idempotency here pins the fix: once
        // assigned, a rank must not be silently recomputed by a plain re-render.
        name: 'ranks are stable across repeated re-renders (idempotent, not re-derived each time)',
        async run(page) {
            await loadDemoCollection(page);
            await page.click('#ranking-on-btn');
            await page.click('#group-note-btn');
            await page.waitForTimeout(150);

            const ranksAfterFirstRender = await page.evaluate(() => {
                const ranks = {};
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => { ranks[c.name] = c.rank; });
                }
                return ranks;
            });

            // Force a second full re-render, same as any other UI action would.
            await page.evaluate(() => { displaySeries(); });

            const ranksAfterSecondRender = await page.evaluate(() => {
                const ranks = {};
                for (const seriesName in AppState.seriesData) {
                    AppState.seriesData[seriesName].characters.forEach(c => { ranks[c.name] = c.rank; });
                }
                return ranks;
            });

            assert.deepStrictEqual(ranksAfterSecondRender, ranksAfterFirstRender,
                'expected ranks to stay identical across a repeated render');
        }
    }
];
