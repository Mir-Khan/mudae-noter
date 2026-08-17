const assert = require('assert');
const { dismissChangelogIfPresent } = require('./helpers');

async function openEmbeds(page) {
    await dismissChangelogIfPresent(page);
    await page.click('#tab-embeds-btn');
    await page.waitForSelector('#embedTextInput');
}

async function dragAndDrop(page, source, target) {
    const sBox = await source.boundingBox();
    const tBox = await target.boundingBox();
    await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 25 });
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(80);
}

// Dispatches a synthetic contextmenu event instead of a real mouse
// right-click, since a real click on a textarea collapses the selection to
// the click point unless it happens to land inside the highlighted range -
// this keeps the test's chosen selection reliable regardless of layout.
async function selectAndRightClickTextarea(page, start, end) {
    await page.evaluate(([s, e]) => {
        const el = document.getElementById('embedTextInput');
        el.focus();
        el.selectionStart = s;
        el.selectionEnd = e;
        const rect = el.getBoundingClientRect();
        const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10, view: window });
        el.dispatchEvent(evt);
    }, [start, end]);
}

module.exports = [
    {
        name: 'switching sub-tabs preserves each command\'s own draft text',
        async run(page) {
            await openEmbeds(page);

            await page.fill('#embedTextInput', 'Series$ Kakera - my custom layout');
            await page.click('#embed-tab-tuarrange-btn');
            await page.waitForTimeout(150);

            const tuarrangeText = await page.inputValue('#embedTextInput');
            assert.ok(tuarrangeText.length > 0 && tuarrangeText.indexOf('my custom layout') === -1, 'expected the tuarrange tab to show its own text, not arrangeim\'s draft');

            await page.click('#embed-tab-arrangeim-btn');
            await page.waitForTimeout(150);
            const arrangeimText = await page.inputValue('#embedTextInput');
            assert.strictEqual(arrangeimText, 'Series$ Kakera - my custom layout', 'expected the arrangeim draft to still be there after switching away and back');
        }
    },
    {
        name: 'clicking a category button inserts it at the cursor position, not just at the end',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim daily');

            // Put the cursor right after "claim" (position 5), then click "rolls".
            await page.evaluate(() => {
                const el = document.getElementById('embedTextInput');
                el.focus();
                el.selectionStart = el.selectionEnd = 5;
            });
            await page.click('button:has-text("rolls")');
            await page.waitForTimeout(150);

            const value = await page.inputValue('#embedTextInput');
            assert.strictEqual(value, 'claim rolls daily', `expected "rolls" inserted mid-text at the cursor, got: "${value}"`);
        }
    },
    {
        name: 'Reset to Default restores the documented default text for the active command',
        async run(page) {
            await openEmbeds(page);
            await page.fill('#embedTextInput', 'something else entirely');
            await page.click('button:has-text("Reset to Default")');
            await page.waitForTimeout(150);

            const value = await page.inputValue('#embedTextInput');
            assert.ok(value.startsWith('Series$ Gender'), `expected the documented $arrangeim default, got: "${value}"`);
            assert.ok(value.includes('*Roulette*$ · **Kakera**$ · Keys'), 'expected the exact default formatting to be preserved');
        }
    },
    {
        name: 'tokens preview groups categories by "jump" and flags unrecognized tokens',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls jump nonsensecategory');
            await page.waitForTimeout(150);

            const groupCount = await page.locator('#embedPreviewCard .embed-preview-group').count();
            assert.strictEqual(groupCount, 2, 'expected two groups, split by the jump token');

            const unknownCount = await page.locator('#embedPreviewCard .embed-preview-unknown').count();
            assert.strictEqual(unknownCount, 1, 'expected the unrecognized token to be flagged');

            const knownTokenText = await page.locator('#embedPreviewCard .embed-preview-token').first().textContent();
            assert.ok(knownTokenText.length > 0);
        }
    },
    {
        name: 'freeform preview splits on $ (same line) vs newline (new line) and applies basic markdown',
        async run(page) {
            await openEmbeds(page);
            await page.fill('#embedTextInput', 'Series$ Gender\n*Roulette*');
            await page.waitForTimeout(150);

            const lineCount = await page.locator('#embedPreviewCard .embed-preview-line').count();
            assert.strictEqual(lineCount, 2, 'expected two preview lines - one per real newline');

            const firstLineHtml = await page.locator('#embedPreviewCard .embed-preview-line').first().innerHTML();
            // Series and Gender should both appear as separate value spans on the same line.
            const tokenCountOnFirstLine = (firstLineHtml.match(/embed-preview-value/g) || []).length;
            assert.strictEqual(tokenCountOnFirstLine, 2, `expected Series and Gender both on the first line, got html: ${firstLineHtml}`);

            const secondLineHtml = await page.locator('#embedPreviewCard .embed-preview-line').nth(1).innerHTML();
            assert.ok(/<em>/.test(secondLineHtml), `expected *Roulette* to render as italic, got: ${secondLineHtml}`);
        }
    },
    {
        name: 'Save As / Load / Delete round-trip through localStorage, and the list is filtered to the active command',
        async run(page) {
            await openEmbeds(page);
            await page.fill('#embedTextInput', 'Series$ Kakera');
            await page.fill('#embedSaveNameInput', 'My Layout');
            await page.click('button:has-text("Save As")');
            await page.waitForSelector('.wishlist-card:has-text("My Layout")');

            const stored = await page.evaluate(() => localStorage.getItem('mudaeEmbedLayouts'));
            assert.ok(stored && stored.includes('My Layout'), 'expected the layout to persist to localStorage');

            // Switching to a different command hides it from the saved list.
            await page.click('#embed-tab-tuarrange-btn');
            await page.waitForTimeout(150);
            let cardCount = await page.locator('#embedSavedList .wishlist-card').count();
            assert.strictEqual(cardCount, 0, 'expected the saved-layouts list to be filtered to the active command');

            await page.click('#embed-tab-arrangeim-btn');
            await page.waitForSelector('.wishlist-card:has-text("My Layout")');

            await page.fill('#embedTextInput', 'something different');
            await page.click('.wishlist-card:has-text("My Layout") button:has-text("Load")');
            await page.waitForTimeout(150);
            const loadedValue = await page.inputValue('#embedTextInput');
            assert.strictEqual(loadedValue, 'Series$ Kakera', 'expected Load to restore the saved text');

            await page.click('.wishlist-card:has-text("My Layout") button:has-text("Delete")');
            await page.waitForTimeout(150);
            cardCount = await page.locator('#embedSavedList .wishlist-card').count();
            assert.strictEqual(cardCount, 0, 'expected Delete to remove the saved layout');
        }
    },
    {
        name: 'a Share code round-trips through Import into a new saved entry',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-profilearrange-btn');
            await page.fill('#embedTextInput', 'harem pokedex jump kakera');
            await page.fill('#embedSaveNameInput', 'Shareable One');
            await page.click('button:has-text("Save As")');
            await page.waitForSelector('.wishlist-card:has-text("Shareable One")');

            await page.click('.wishlist-card:has-text("Shareable One") button:has-text("Share")');
            await page.waitForSelector('#embedShareOutput .command-text');
            const code = await page.locator('#embedShareOutput .command-text').textContent();
            assert.ok(code.length > 10, 'expected a real share code to be generated');

            await page.click('.wishlist-card:has-text("Shareable One") button:has-text("Delete")');
            await page.waitForTimeout(150);

            await page.fill('#embedImportInput', code);
            await page.click('#embedsTabPanel button:has-text("Import")');
            await page.waitForSelector('.wishlist-card:has-text("Shareable One")');

            const importedValue = await page.evaluate(() => {
                const data = JSON.parse(localStorage.getItem('mudaeEmbedLayouts'));
                const entry = Object.values(data.entries).find(e => e.name === 'Shareable One');
                return entry ? entry.text : null;
            });
            assert.strictEqual(importedValue, 'harem pokedex jump kakera', 'expected the imported layout to reproduce the exact original text');
        }
    },
    {
        name: 'importing a malformed code shows an error instead of crashing',
        async run(page) {
            await openEmbeds(page);
            await page.fill('#embedImportInput', 'not-a-valid-code-at-all');
            await page.click('#embedsTabPanel button:has-text("Import")');
            await page.waitForTimeout(200);

            const messageText = await page.locator('#embedsMessage').textContent();
            assert.ok(/doesn't look valid/i.test(messageText), `expected a friendly validation error, got: "${messageText}"`);
        }
    },
    {
        name: 'Visual mode tokenizes the current draft text into chips, and switching back to Text mode round-trips it exactly',
        async run(page) {
            await openEmbeds(page);

            // tokens syntax (tuarrange)
            await page.click('#embed-tab-tuarrange-btn');
            const tokensDefault = await page.inputValue('#embedTextInput');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            const tokensChipCount = await page.locator('#embedCanvas .embed-chip').count();
            assert.strictEqual(tokensChipCount, tokensDefault.split(/\s+/).filter(Boolean).length, 'expected one chip per whitespace-separated token');
            await page.click('#embedModeTextBtn');
            assert.strictEqual(await page.inputValue('#embedTextInput'), tokensDefault, 'expected Text mode to show the exact same text after a no-op round-trip through Visual mode');

            // freeform syntax (arrangeim)
            await page.click('#embed-tab-arrangeim-btn');
            const freeformDefault = await page.inputValue('#embedTextInput');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            const freeformChipCount = await page.locator('#embedCanvas .embed-chip').count();
            assert.ok(freeformChipCount > 0, 'expected the freeform default text to tokenize into at least one chip');
            await page.click('#embedModeTextBtn');
            assert.strictEqual(await page.inputValue('#embedTextInput'), freeformDefault, 'expected Text mode to show the exact same freeform text after a no-op round-trip through Visual mode');
        }
    },
    {
        name: 'clicking a palette button in Visual mode appends a chip, matching Text mode\'s insert behavior',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.click('#embedPalette button:has-text("vote")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim rolls vote', 'expected the clicked category appended at the end');
        }
    },
    {
        name: 'dragging a palette button onto the canvas inserts a new chip, and dragging an existing chip reorders the canvas',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls daily');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            const paletteBtn = page.locator('#embedPalette button:has-text("vote")').first();
            const canvas = page.locator('#embedCanvas');
            await dragAndDrop(page, paletteBtn, canvas);
            await page.waitForTimeout(150);
            let text = await page.inputValue('#embedTextInput');
            assert.ok(/\bvote\b/.test(text), `expected "vote" to be inserted somewhere, got: "${text}"`);

            const chips = page.locator('#embedCanvas .embed-chip');
            const countBefore = await chips.count();
            await dragAndDrop(page, chips.first(), chips.last());
            await page.waitForTimeout(150);
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), countBefore, 'expected reordering to not change the chip count');
            text = await page.inputValue('#embedTextInput');
            assert.ok(!text.trim().startsWith('claim'), `expected the first chip ("claim") to have moved away from the front, got: "${text}"`);
        }
    },
    {
        name: 'clicking a chip\'s remove button deletes it from the canvas and the underlying command text',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls daily');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            const countBefore = await page.locator('#embedCanvas .embed-chip').count();
            await page.locator('#embedCanvas .embed-chip').first().locator('.embed-chip-remove').click();
            await page.waitForTimeout(150);
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), countBefore - 1);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'rolls daily');
        }
    },
    {
        name: 'a jump chip renders as its own divider and round-trips correctly',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim jump rolls');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(await page.locator('#embedCanvas .embed-chip-jump').count(), 1);
            await page.click('#embedModeTextBtn');
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim jump rolls');
        }
    },
    {
        name: 'the $profile preview shows a 10-icon color legend for reacts/spheres, and single/multi-icon categories render the right count',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-profilearrange-btn');
            await page.click('button:has-text("Reset to Default")');
            await page.waitForTimeout(150);

            const legendCount = await page.locator('#embedPreviewCard .embed-preview-icon-legend').count();
            assert.strictEqual(legendCount, 3, 'expected one legend each for reacts, spheres, and badges');
            const iconsInFirstLegend = await page.locator('#embedPreviewCard .embed-preview-icon-legend').first().locator('img').count();
            assert.strictEqual(iconsInFirstLegend, 10);
            const iconsInLastLegend = await page.locator('#embedPreviewCard .embed-preview-icon-legend').last().locator('img').count();
            assert.strictEqual(iconsInLastLegend, 7, 'expected all 7 badge-tier icons on the badges legend');

            const keysIcons = await page.locator('#embedPreviewCard .embed-preview-item:has-text("keys") img.embed-preview-icon').count();
            assert.strictEqual(keysIcons, 3, 'expected bronze/silver/gold key icons on the keys line');
        }
    },
    {
        name: 'on a mobile-sized viewport, the Visual mode toggle is hidden and Text mode is unaffected',
        async run(page) {
            await page.setViewportSize({ width: 390, height: 844 });
            await openEmbeds(page);
            assert.strictEqual(await page.locator('#embedModeVisualBtn').isVisible(), false, 'expected the Visual mode button to be hidden on a narrow viewport');
            assert.strictEqual(await page.locator('#embedTextInput').isVisible(), true, 'expected Text mode to still work normally on mobile');
        }
    },
    {
        name: 'right-clicking a freeform chip opens a Bold/Italic/Underline menu that wraps the chip in valid nested Discord markdown',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', 'Kakera');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            const chip = page.locator('#embedCanvas .embed-chip').first();

            await chip.click({ button: 'right' });
            await page.waitForSelector('#embedChipMenu');
            await page.click('#embedChipMenu button:has-text("Bold")');
            await page.waitForTimeout(200);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '**Kakera**');

            await chip.click({ button: 'right' });
            await page.waitForSelector('#embedChipMenu');
            await page.click('#embedChipMenu button:has-text("Italic")');
            await page.waitForTimeout(200);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '***Kakera***', 'expected bold+italic to nest into Discord\'s real ***text*** syntax');

            // toggling Bold back off should leave italic in place
            await chip.click({ button: 'right' });
            await page.waitForSelector('#embedChipMenu');
            await page.click('#embedChipMenu button:has-text("Bold")');
            await page.waitForTimeout(200);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '*Kakera*');
        }
    },
    {
        name: 'clicking outside the chip formatting menu closes it without changing anything',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', 'Kakera');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.locator('#embedCanvas .embed-chip').first().click({ button: 'right' });
            await page.waitForSelector('#embedChipMenu');
            await page.waitForTimeout(100); // let the menu's own outside-click listener (attached via setTimeout(0)) register before we click outside it
            await page.mouse.click(5, 5);
            await page.waitForTimeout(300);
            assert.strictEqual(await page.locator('#embedChipMenu').count(), 0);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'Kakera', 'expected no formatting to have been applied');
        }
    },
    {
        name: 'the formatting menu is not offered on tokens-syntax chips (tuarrange/profilearrange)',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.locator('#embedCanvas .embed-chip').first().click({ button: 'right' });
            await page.waitForTimeout(200);
            assert.strictEqual(await page.locator('#embedChipMenu').count(), 0, 'expected no formatting menu on a tokens-syntax chip');
        }
    },
    {
        name: 'entering Visual mode collapses an already markdown-wrapped category (like the default text\'s **Kakera**) into a single formatted chip',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '**Kakera**');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            const chips = page.locator('#embedCanvas .embed-chip');
            assert.strictEqual(await chips.count(), 1, 'expected one formatted category chip, not separate "**"/"Kakera"/"**" chips');
            assert.strictEqual(await chips.first().getAttribute('class'), 'embed-chip embed-chip-category');

            // round-trips back to the exact same text
            await page.click('#embedModeTextBtn');
            assert.strictEqual(await page.inputValue('#embedTextInput'), '**Kakera**');
        }
    },
    {
        name: 'the "*" and "_" symbol buttons are hidden from the palette in Visual mode but still present in Text mode',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');

            const textModeSymbolCount = await page.locator('#embedPalette button.embed-symbol-btn', { hasText: '*' }).count();
            assert.ok(textModeSymbolCount > 0, 'expected the "*" symbol button to still be offered in Text mode');

            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            const visualModeSymbolCount = await page.locator('#embedPalette button.embed-symbol-btn', { hasText: '*' }).count();
            assert.strictEqual(visualModeSymbolCount, 0, 'expected the redundant "*" symbol button to be hidden once right-click formatting covers the same job');
        }
    },
    {
        name: 'right-clicking a text selection in Text mode wraps it in Discord markdown, nesting correctly on repeated use',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', 'Kakera stats here');

            await selectAndRightClickTextarea(page, 0, 6);
            await page.waitForSelector('#embedTextFormatMenu');
            await page.click('#embedTextFormatMenu button:has-text("Bold")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '**Kakera** stats here');

            await selectAndRightClickTextarea(page, 2, 8);
            await page.waitForSelector('#embedTextFormatMenu');
            await page.click('#embedTextFormatMenu button:has-text("Italic")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '***Kakera*** stats here', 'expected nested bold+italic to produce Discord\'s real ***text*** syntax');
        }
    },
    {
        name: 'the Text-mode formatting menu only appears with an active selection, and never on tokens-syntax commands',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', 'Kakera stats here');
            await selectAndRightClickTextarea(page, 0, 0);
            await page.waitForTimeout(200);
            assert.strictEqual(await page.locator('#embedTextFormatMenu').count(), 0, 'expected no menu with nothing selected');

            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls');
            await selectAndRightClickTextarea(page, 0, 5);
            await page.waitForTimeout(200);
            assert.strictEqual(await page.locator('#embedTextFormatMenu').count(), 0, 'expected no menu on a tokens-syntax command, even with a selection');
        }
    },
    {
        name: 'Text mode auto-inserts "$" when two categories land back-to-back, including when inserting one between two existing categories',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '');

            await page.click('#embedPalette button:has-text("Series")');
            await page.waitForTimeout(100);
            await page.click('#embedPalette button:has-text("Gender")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'Series$Gender', 'expected a "$" auto-inserted between two back-to-back categories');

            await page.fill('#embedTextInput', 'SeriesGender');
            await page.evaluate(() => {
                const el = document.getElementById('embedTextInput');
                el.focus();
                el.selectionStart = el.selectionEnd = 6;
            });
            await page.click('#embedPalette button:has-text("Kakera")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'Series$Kakera$Gender', 'expected "$" on both sides of a category inserted between two others');
        }
    },
    {
        name: 'Visual mode auto-inserts a sameline chip when two categories end up back-to-back, whether clicked or dragged in',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.click('#embedPalette button:has-text("Series")');
            await page.waitForTimeout(100);
            await page.click('#embedPalette button:has-text("Gender")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'Series$Gender');
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), 3, 'expected Series, an auto-inserted sameline chip, and Gender');
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip-sameline').count(), 1);

            const paletteBtn = page.locator('#embedPalette button', { hasText: 'Kakera' }).first();
            const canvas = page.locator('#embedCanvas');
            await dragAndDrop(page, paletteBtn, canvas);
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'Series$Gender$Kakera', 'expected the dragged-in category appended with its own auto "$" separator');
        }
    },
    {
        name: 'each palette category button has a hover tooltip explaining what it shows, and the collapsible glossary lists all of them',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-profilearrange-btn');

            const haremBtn = page.locator('#embedPalette button', { hasText: 'harem' }).first();
            const title = await haremBtn.getAttribute('title');
            assert.ok(title && title.length > 5, `expected a non-trivial tooltip on the harem button, got: "${title}"`);

            await page.click('.embed-category-glossary summary');
            await page.waitForTimeout(150);
            const glossaryTerms = await page.locator('#embedCategoryGlossary dt').allTextContents();
            assert.deepStrictEqual(glossaryTerms, ['harem', 'pokedex', 'arena', 'reacts', 'mudapins', 'kakera', 'tower', 'keys', 'omegakeys', 'spheres', 'spherereacts', 'badges']);
            const glossaryDescriptions = await page.locator('#embedCategoryGlossary dd').allTextContents();
            assert.ok(glossaryDescriptions.every(function (d) { return d.length > 5; }), 'expected every category to have a real description, not a blank one');
        }
    },
    {
        name: 'the right-click formatting hint only shows for $arrangeim, since $tuarrange/$profilearrange don\'t support markdown at all',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            assert.strictEqual(await page.locator('#embedFormatHint').isVisible(), true, 'expected the hint visible on $arrangeim');

            await page.click('#embed-tab-tuarrange-btn');
            assert.strictEqual(await page.locator('#embedFormatHint').isVisible(), false, 'expected the hint hidden on $tuarrange');

            await page.click('#embed-tab-profilearrange-btn');
            assert.strictEqual(await page.locator('#embedFormatHint').isVisible(), false, 'expected the hint hidden on $profilearrange');
        }
    },
    {
        name: 'Undo/Redo in Text mode step back and forward through draft-text edits, and disable at each end of the stack',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', '');
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), true, 'expected Undo disabled with no edits yet');

            await page.click('#embedPalette button:has-text("claim")');
            await page.waitForTimeout(100);
            await page.click('#embedPalette button:has-text("rolls")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim rolls');
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), false);

            await page.click('#embedUndoBtn');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim');

            await page.click('#embedUndoBtn');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '');
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), true, 'expected Undo disabled at the bottom of the stack');

            await page.click('#embedRedoBtn');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim');
        }
    },
    {
        name: 'each command keeps its own separate undo history',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', '');
            await page.click('#embedPalette button:has-text("claim")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), false);

            await page.click('#embed-tab-arrangeim-btn');
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), true, 'expected a fresh, untouched command to have no undo history of its own');

            await page.click('#embed-tab-tuarrange-btn');
            assert.strictEqual(await page.locator('#embedUndoBtn').isDisabled(), false, 'expected switching back to restore that command\'s own undo history');
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim');
        }
    },
    {
        name: 'Undo/Redo also covers Visual-mode canvas edits and Reset to Default',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.click('#embedPalette button:has-text("daily")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim daily');

            await page.click('#embedUndoBtn');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim');
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), 1, 'expected the canvas to re-render to match the restored text');

            await page.click('button:has-text("Reset to Default")');
            await page.waitForTimeout(150);
            const afterReset = await page.inputValue('#embedTextInput');
            assert.notStrictEqual(afterReset, 'claim');

            await page.click('#embedUndoBtn');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim', 'expected Reset to Default itself to be undoable');
        }
    },
    {
        name: 'the preview substitutes the real sample text (not the raw category name) for every bold/italic/underline combination',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');

            const cases = {
                bold: '**Series**',
                italic: '*Series*',
                underline: '__Series__',
                'bold+italic': '***Series***',
                'bold+underline': '__**Series**__',
                'italic+underline': '__*Series*__',
                'all three': '__***Series***__'
            };

            for (const [name, text] of Object.entries(cases)) {
                await page.fill('#embedTextInput', text);
                await page.waitForTimeout(150);
                const tokenText = await page.locator('#embedPreviewCard .embed-preview-value').first().textContent();
                assert.strictEqual(tokenText, 'Jujutsu Kaisen', `expected the real sample text substituted for "${name}" (${text}), got: "${tokenText}"`);
            }
        }
    },
    {
        name: 'bold+italic (***text***) renders as properly nested <strong><em> tags, not mismatched/overlapping ones',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '***Series***');
            await page.waitForTimeout(150);

            const html = await page.locator('#embedPreviewCard .embed-preview-line').first().innerHTML();
            assert.ok(/<strong><em>.*<\/em><\/strong>/.test(html), `expected properly nested <strong><em>...</em></strong>, got: ${html}`);
        }
    },
    {
        name: 'underline renders as real <u> formatting, with no leftover literal "__" characters',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '__Series__');
            await page.waitForTimeout(150);

            const line = page.locator('#embedPreviewCard .embed-preview-line').first();
            assert.strictEqual(await line.locator('u').count(), 1, 'expected a real <u> element in the rendered preview');
            const text = await line.textContent();
            assert.ok(!text.includes('_'), `expected no literal underscore characters left over in the rendered text, got: "${text}"`);
        }
    },
    {
        name: 'applying bold to a category is actually visible - the substituted value has no default bold weight of its own to blend into',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');

            await page.fill('#embedTextInput', 'Series');
            await page.waitForTimeout(150);
            const plainWeight = await page.locator('#embedPreviewCard .embed-preview-value').first().evaluate(function (el) { return getComputedStyle(el).fontWeight; });

            await page.fill('#embedTextInput', '**Series**');
            await page.waitForTimeout(150);
            const boldWeight = await page.locator('#embedPreviewCard strong .embed-preview-value').first().evaluate(function (el) { return getComputedStyle(el).fontWeight; });

            assert.notStrictEqual(plainWeight, boldWeight, `expected bold text to have a visibly heavier font-weight than plain text, both were: "${plainWeight}"`);
        }
    },
    {
        name: 'Build Text: typing/pasting filters out disallowed characters live, and only $arrangeim offers the button',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.click('button:has-text("Build Text")');
            await page.waitForSelector('#embedTextBuilderOverlay', { state: 'visible' });

            await page.fill('#embedTextBuilderInput', 'abc-de');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextBuilderInput'), '-', 'expected only the allowed dash to survive, letters stripped');
            await page.click('#embedTextBuilderOverlay button:has-text("Cancel")');

            await page.click('#embed-tab-tuarrange-btn');
            assert.strictEqual(await page.locator('button:has-text("Build Text")').count(), 0, 'expected no Build Text button on a tokens-syntax command');
        }
    },
    {
        name: 'Build Text: the repeat count inserts N copies of a symbol in one click',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.click('button:has-text("Build Text")');
            await page.waitForSelector('#embedTextBuilderOverlay', { state: 'visible' });

            await page.fill('#embedTextBuilderRepeat', '5');
            await page.click('#embedTextBuilderSymbols button:has-text("★")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.inputValue('#embedTextBuilderInput'), '★★★★★');
        }
    },
    {
        name: 'Build Text inserts the whole run as a single chip in Visual mode, and at the cursor in Text mode',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '');

            await page.click('button:has-text("Build Text")');
            await page.waitForSelector('#embedTextBuilderOverlay', { state: 'visible' });
            await page.fill('#embedTextBuilderInput', '☾----------★★★★★----------☽');
            await page.click('button:has-text("Insert")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '☾----------★★★★★----------☽', 'expected the exact run inserted at the cursor in Text mode');

            await page.fill('#embedTextInput', '');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            await page.click('button:has-text("Build Text")');
            await page.waitForSelector('#embedTextBuilderOverlay', { state: 'visible' });
            await page.fill('#embedTextBuilderInput', '----------');
            await page.click('button:has-text("Insert")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), 1, 'expected the whole run as a single chip, not one per character');
            assert.strictEqual(await page.inputValue('#embedTextInput'), '----------');
        }
    },
    {
        name: 'the pencil button on a text chip re-opens Build Text pre-filled, and updates that chip in place',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '----------');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.click('#embedCanvas .embed-chip-edit');
            await page.waitForSelector('#embedTextBuilderOverlay', { state: 'visible' });
            assert.strictEqual(await page.inputValue('#embedTextBuilderInput'), '----------', 'expected the modal pre-filled with the chip\'s current value');

            await page.fill('#embedTextBuilderInput', '~~~~~');
            await page.click('button:has-text("Insert")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), 1, 'expected the same chip updated in place, not a second one added');
            assert.strictEqual(await page.inputValue('#embedTextInput'), '~~~~~');
        }
    },
    {
        name: 'copying a chip enables Paste, which appends independent copies (repeatable)',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            assert.strictEqual(await page.locator('#embedPasteBtn').isDisabled(), true, 'expected Paste disabled before anything is copied');

            await page.click('#embedCanvas .embed-chip button:has-text("⎘")');
            await page.waitForTimeout(100);
            assert.strictEqual(await page.locator('#embedPasteBtn').isDisabled(), false);

            await page.click('#embedPasteBtn');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim claim');

            await page.click('#embedPasteBtn');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim claim claim', 'expected Paste to be repeatable');
        }
    },
    {
        name: 'copying a formatted chip preserves bold/italic/underline on the pasted copy',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-arrangeim-btn');
            await page.fill('#embedTextInput', '**Kakera**');
            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);

            await page.click('#embedCanvas .embed-chip button:has-text("⎘")');
            await page.waitForTimeout(100);
            await page.click('#embedPasteBtn');
            await page.waitForTimeout(150);

            // Auto same-line insertion (from an earlier fix) correctly adds
            // a '$' between the two now-adjacent category chips.
            assert.strictEqual(await page.inputValue('#embedTextInput'), '**Kakera**$**Kakera**', 'expected the pasted copy to keep its bold formatting');
        }
    },
    {
        name: 'the Paste button is hidden entirely in Text mode',
        async run(page) {
            await openEmbeds(page);
            assert.strictEqual(await page.locator('#embedPasteBtn').isVisible(), false, 'expected Paste hidden by default in Text mode');

            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            await page.click('#embedModeTextBtn');
            assert.strictEqual(await page.locator('#embedPasteBtn').isVisible(), false, 'expected Paste hidden again after switching back to Text mode');
        }
    },
    {
        name: 'Clear Text empties the draft in both modes, and is itself undoable',
        async run(page) {
            await openEmbeds(page);
            await page.click('#embed-tab-tuarrange-btn');
            await page.fill('#embedTextInput', 'claim rolls daily');
            await page.waitForTimeout(100);

            await page.click('button:has-text("Clear Text")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '');

            await page.click('#embedUndoBtn');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.inputValue('#embedTextInput'), 'claim rolls daily', 'expected Clear Text itself to be undoable');

            await page.click('#embedModeVisualBtn');
            await page.waitForTimeout(150);
            await page.click('button:has-text("Clear Text")');
            await page.waitForTimeout(150);
            assert.strictEqual(await page.locator('#embedCanvas .embed-chip').count(), 0, 'expected the canvas emptied too');
            assert.strictEqual(await page.locator('#embedCanvas .embed-preview-empty').isVisible(), true);
            assert.strictEqual(await page.inputValue('#embedTextInput'), '');
        }
    }
];
