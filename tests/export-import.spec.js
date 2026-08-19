const assert = require('assert');
const { dismissChangelogIfPresent, loadDemoCollection } = require('./helpers');

module.exports = [
    {
        name: 'buildCollectionExportPayload produces the expected envelope shape, excluding activeId and the ImgChest token',
        async run(page) {
            await loadDemoCollection(page);

            const payload = await page.evaluate(() => {
                saveToLocalStorage();
                localStorage.setItem('mudaeImgChestToken', 'super-secret-token');
                const meta = ensureCollectionsMeta();
                return buildCollectionExportPayload([meta.activeId], { includeEmbedLayouts: false });
            });

            assert.strictEqual(payload.kind, 'mudae-noter-export');
            assert.strictEqual(payload.v, 1);
            assert.strictEqual(payload.collections.length, 1);
            assert.ok(payload.collections[0].state.seriesData, 'expected the collection state to include seriesData');
            assert.ok(!('activeId' in payload), 'expected activeId to never be exported');
            assert.ok(!JSON.stringify(payload).includes('super-secret-token'), 'expected the ImgChest token to never be exported');
        }
    },
    {
        name: 'validateImportPayload accepts a real export and rejects wrong kind, a newer format version, and malformed entries',
        async run(page) {
            await dismissChangelogIfPresent(page);

            const results = await page.evaluate(() => {
                return {
                    empty: validateImportPayload({}),
                    wrongKind: validateImportPayload({ kind: 'something-else' }),
                    newerVersion: validateImportPayload({ kind: 'mudae-noter-export', v: 99, collections: [{ name: 'x', state: { seriesData: {} } }] }),
                    malformedEntry: validateImportPayload({ kind: 'mudae-noter-export', v: 1, collections: [{ name: 'x' }] }),
                    valid: validateImportPayload({ kind: 'mudae-noter-export', v: 1, collections: [{ name: 'x', state: { seriesData: {} } }] })
                };
            });

            assert.strictEqual(results.empty.ok, false);
            assert.strictEqual(results.wrongKind.ok, false);
            assert.strictEqual(results.newerVersion.ok, false);
            assert.ok(/newer version/i.test(results.newerVersion.error));
            assert.strictEqual(results.malformedEntry.ok, false);
            assert.strictEqual(results.valid.ok, true);
        }
    },
    {
        name: 'normalizeImportedState backfills every default field (especially ui) without touching the real data it carries',
        async run(page) {
            await dismissChangelogIfPresent(page);

            const normalized = await page.evaluate(() => {
                // Deliberately old-shaped: missing sortData, noteOrder, and
                // the whole ui object, the way a save from before those
                // features existed would look.
                const old = { seriesData: { Sample: { characters: [{ name: 'Test Char', note: 'hi' }] } } };
                return normalizeImportedState(old);
            });

            assert.deepStrictEqual(normalized.seriesData, { Sample: { characters: [{ name: 'Test Char', note: 'hi' }] } });
            assert.ok(Array.isArray(normalized.sortData));
            assert.ok(Array.isArray(normalized.noteOrder));
            assert.strictEqual(typeof normalized.ui, 'object');
            assert.strictEqual(normalized.ui.gameMode, 1);
            assert.strictEqual(normalized.ui.grouping, 'series');
        }
    },
    {
        name: 'importing as "new" creates a fresh collection with a deduped name and the exact same data, without touching the original',
        async run(page) {
            await loadDemoCollection(page);

            const before = await page.evaluate(() => {
                saveToLocalStorage();
                return {
                    orderLength: ensureCollectionsMeta().order.length,
                    charCount: Object.values(AppState.seriesData).reduce((n, s) => n + s.characters.length, 0)
                };
            });

            // importCollectionsFromPayload calls location.reload() itself
            // (real production behavior) - waitForNavigation is armed
            // BEFORE triggering it to avoid racing the reload, and the
            // evaluate() call's own rejection (execution context destroyed
            // out from under it) is expected and swallowed rather than a
            // real failure.
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'load' }),
                page.evaluate(() => {
                    const meta = ensureCollectionsMeta();
                    const payload = buildCollectionExportPayload([meta.activeId], { includeEmbedLayouts: false });
                    importCollectionsFromPayload(payload, 'new', null);
                }).catch(() => { })
            ]);

            const after = await page.evaluate(() => {
                const meta = ensureCollectionsMeta();
                return {
                    orderLength: meta.order.length,
                    activeName: meta.collections[meta.activeId].name,
                    charCount: Object.values(AppState.seriesData).reduce((n, s) => n + s.characters.length, 0)
                };
            });

            assert.strictEqual(after.orderLength, before.orderLength + 1, 'expected exactly one new collection to be created');
            assert.ok(/\(2\)$/.test(after.activeName), `expected the duplicate name to be deduped, got "${after.activeName}"`);
            assert.strictEqual(after.charCount, before.charCount, 'expected the imported collection to carry the exact same character count');
        }
    },
    {
        name: 'importing with "overwrite" replaces the target collection\'s data but keeps its name and does not add a new collection',
        async run(page) {
            await loadDemoCollection(page);

            const setup = await page.evaluate(() => {
                saveToLocalStorage();
                const meta = ensureCollectionsMeta();
                const sourcePayload = buildCollectionExportPayload([meta.activeId], { includeEmbedLayouts: false });

                // Create a second, distinct target collection to overwrite.
                const targetId = generateCollectionId();
                meta.collections[targetId] = { id: targetId, name: 'Overwrite Target' };
                meta.order.push(targetId);
                localStorage.setItem(collectionStateKey(targetId), JSON.stringify(defaultCollectionState()));
                saveCollectionsMeta(meta);

                return { sourcePayload, targetId, orderLengthBefore: meta.order.length };
            });

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'load' }),
                page.evaluate(({ sourcePayload, targetId }) => {
                    importCollectionsFromPayload(sourcePayload, 'overwrite', targetId);
                }, setup).catch(() => { })
            ]);

            const after = await page.evaluate((targetId) => {
                const meta = ensureCollectionsMeta();
                const state = JSON.parse(localStorage.getItem(collectionStateKey(targetId)));
                return {
                    orderLength: meta.order.length,
                    targetName: meta.collections[targetId].name,
                    activeId: meta.activeId,
                    charCount: Object.values(state.seriesData).reduce((n, s) => n + s.characters.length, 0)
                };
            }, setup.targetId);

            assert.strictEqual(after.orderLength, setup.orderLengthBefore, 'expected overwrite to add no new collection');
            assert.strictEqual(after.targetName, 'Overwrite Target', 'expected the target\'s name to be preserved');
            assert.strictEqual(after.activeId, setup.targetId, 'expected the overwritten collection to become active');
            assert.ok(after.charCount > 0, 'expected the target to now hold the imported characters');
        }
    },
    {
        name: 'the file-picker import flow parses a chosen file, shows a preview with the collection name and character count, and imports on confirm',
        async run(page) {
            await loadDemoCollection(page);

            const payload = await page.evaluate(() => {
                saveToLocalStorage();
                const meta = ensureCollectionsMeta();
                return buildCollectionExportPayload([meta.activeId], { includeEmbedLayouts: false });
            });
            const expectedCharCount = Object.values(payload.collections[0].state.seriesData).reduce((n, s) => n + s.characters.length, 0);

            await page.click('button:has-text("Export / Import")');
            await page.waitForSelector('#dataPanel', { state: 'visible' });
            await page.setInputFiles('#importFileInput', {
                name: 'export.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(payload))
            });
            await page.waitForTimeout(150);

            const previewText = await page.locator('#importPreview').textContent();
            assert.ok(previewText.includes(String(expectedCharCount)), `expected the preview to show the character count, got: "${previewText}"`);

            const orderLengthBefore = await page.evaluate(() => ensureCollectionsMeta().order.length);
            await page.click('#importPreview button:has-text("Import")');
            await page.waitForLoadState('load');
            const orderLengthAfter = await page.evaluate(() => ensureCollectionsMeta().order.length);
            assert.strictEqual(orderLengthAfter, orderLengthBefore + 1);
        }
    },
    {
        name: 'choosing a file that is not valid JSON, or not a recognizable export, shows an error instead of importing anything',
        async run(page) {
            await dismissChangelogIfPresent(page);
            await page.click('button:has-text("Export / Import")');
            await page.waitForSelector('#dataPanel', { state: 'visible' });

            await page.setInputFiles('#importFileInput', {
                name: 'not-json.json',
                mimeType: 'application/json',
                buffer: Buffer.from('{ this is not valid json')
            });
            await page.waitForTimeout(150);
            let previewText = await page.locator('#importPreview').textContent();
            assert.ok(/valid json/i.test(previewText), `expected an invalid-JSON error, got: "${previewText}"`);

            await page.setInputFiles('#importFileInput', {
                name: 'foreign.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify({ hello: 'world' }))
            });
            await page.waitForTimeout(150);
            previewText = await page.locator('#importPreview').textContent();
            assert.ok(/doesn't look like a Mudae Noter export/i.test(previewText), `expected a foreign-file error, got: "${previewText}"`);
        }
    }
];
