const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

module.exports = [
    {
        name: 'quick notes can be reordered by dragging one onto another\'s position',
        async run(page) {
            await dismissChangelogIfPresent(page);

            const before = await page.evaluate(() => AppState.quickNotes.slice());
            assert.ok(before.length >= 3, 'expected at least 3 default quick notes for this test to be meaningful');

            const cardsBefore = page.locator('.quick-note');
            const firstCardTextBefore = (await cardsBefore.nth(0).textContent()).trim();
            assert.ok(firstCardTextBefore.includes(before[0]), `expected the rendered list to match AppState.quickNotes order, got: "${firstCardTextBefore}"`);

            // Native HTML5 drag-and-drop doesn't respond to synthetic mouse
            // events, so this drives the same handler functions a real drag
            // would (matching how this codebase already tests its other
            // drag-reorderable lists, e.g. moveNoteEntriesToIndex) rather
            // than simulating raw pointer movement.
            const after = await page.evaluate(() => {
                quickNoteDragFromIndex = 0;
                const fakeEvent = {
                    preventDefault: function () { },
                    stopPropagation: function () { },
                    currentTarget: { dataset: { index: '2' }, classList: { remove: function () { } } }
                };
                handleQuickNoteDrop(fakeEvent);
                return AppState.quickNotes.slice();
            });

            assert.strictEqual(after.length, before.length, 'expected no notes to be lost or duplicated by the reorder');
            assert.strictEqual(after[2], before[0], `expected the dragged note (originally first) to land at the drop target's position, got: ${JSON.stringify(after)}`);
            assert.strictEqual(after[0], before[1], 'expected the notes that were between the drag source and drop target to shift up by one');

            const cardsAfter = page.locator('.quick-note');
            const thirdCardTextAfter = (await cardsAfter.nth(2).textContent()).trim();
            assert.ok(thirdCardTextAfter.includes(before[0]), `expected the on-screen list to reflect the new order too, got: "${thirdCardTextAfter}"`);

            await page.reload();
            await dismissChangelogIfPresent(page);
            const afterReload = await page.evaluate(() => AppState.quickNotes.slice());
            assert.deepStrictEqual(afterReload, after, 'expected the reordered quick notes to persist across a reload');
        }
    },
    {
        name: 'dragging a quick note onto itself is a no-op',
        async run(page) {
            await dismissChangelogIfPresent(page);
            const before = await page.evaluate(() => AppState.quickNotes.slice());

            await page.evaluate(() => {
                quickNoteDragFromIndex = 1;
                const fakeEvent = {
                    preventDefault: function () { },
                    stopPropagation: function () { },
                    currentTarget: { dataset: { index: '1' }, classList: { remove: function () { } } }
                };
                handleQuickNoteDrop(fakeEvent);
            });

            const after = await page.evaluate(() => AppState.quickNotes.slice());
            assert.deepStrictEqual(after, before, 'expected dropping a note on its own position to leave the order unchanged');
        }
    }
];
