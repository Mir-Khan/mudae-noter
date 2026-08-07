# Mudae Noter

A simple web-based tool to view and note your Mudae collection.  
Designed for use with the [Mudae bot](https://top.gg/bot/432610292342587392) on Discord.

> This is a fork of [Arczeus/mudae-noter](https://github.com/Arczeus/mudae-noter) with a bunch of collection-management features layered on top - see [What's New in This Fork](#whats-new-in-this-fork) below.

## Features

-   Import your collection from the `$mmsaty+ri-c+x+ko` command and show characters with their images, series, kakera, and key values.
-   Manage multiple collections at once - create, duplicate, rename, delete, and switch between them.
-   Group and sort characters.
-   A ranking system to number characters. 
-   Bulk-apply notes or hex colors to entire series or selected groups.
-   Automatically creates optimized `$n`, `$ec`, and `$ai` (Imgur image) commands ready to paste back into Discord.
-   Compare two collections, or transfer notes or colors from one collection onto matching characters in another.
-   Reorder your whole collection - drag-and-drop, jump-to-position, or select-and-move multiple at once - and generate `$sm`/`$smpos` commands, with detailed/compact/grid views and search/filtering.
-   Reorder series the same way and generate `$smseries` commands, with each series pictured by its highest-kakera character.
-   Sort your collection by note directly from the Notes tab - drag your notes into a priority order and generate a `$smnote` command.
-   Pick colors visually with a color wheel on the **Colors** tab and apply them to all or just your selected characters, with a live preview of who's currently selected.
-   Add just your newest characters without re-pasting your whole collection - the **+ Add New Characters** popup walks you through Mudae's "not noted" filter and merges the result in.
-   After running a generated `$sm`/`$smseries`/`$smnote` command in Discord, confirm it worked to lock that order in as the app's new baseline - no need to re-import to keep everything in sync.
-   Save your own and your friends' `$wishlist` output on the **Wishlists** tab, and compare any two to see exactly which characters overlap - handy for trades or spotting who else wants what you've got.
-   Undo/redo (`Ctrl+Z` / `Ctrl+Y`) across the whole app for the current session.
-   Search characters by name, series, note, or owner.
-   Visualize player collection styles (Animanga vs. Game / Waifu vs. Husbando) based on harem owners.
-   Use it as a clean interface for showing off your collection or facilitating trades.

## How to Use

**run locally:** Download `index.html` and open in your browser

1. Run `$mmsaty+ri-c+x+ko` or `$mmasi-` in Discord.
2. Copy the character list.
3. Paste it in the page and click **Parse Input** - this creates a collection (create more from the collection switcher if you want to keep multiple sets side by side).
4. Organize, rank, or note your characters, or head to the **Sort** / **Series Order** tabs to reorder your collection or series.
5. Click Generate Notes or Generate Colors (or the `$sm`/`$smpos`/`$smseries`/`$smnote` buttons on the Sort/Series Order/Notes tabs) to get your Discord commands.
6. Use **Compare & Transfer** to diff two collections and carry notes or colors between them, and `Ctrl+Z`/`Ctrl+Y` (or the Undo/Redo widget) to undo any changes.
7. Head to the **Colors** tab to pick a color visually and apply it to all or just your currently selected characters.
8. On the **Wishlists** tab, run `$wishlist` in Discord (yours, or a friend's) and paste the result in to save it, then compare any two saved wishlists to see the overlap.


## What's New in This Fork

Everything below was added on top of [Arczeus's original project](https://github.com/Arczeus/mudae-noter):

-   **Multi-collection support** - create, duplicate, rename, delete, and switch between separate collections, each with its own saved state and its own Imgur-only filter + `$ai` command generator.
-   **Compare & Transfer** - compare two collections to see what's only in one or the other, and generate commands to transfer notes or colors from matching characters in Collection A onto Collection B (color transfers require at least 1 key on both sides, so nothing gets applied to a character you don't actually own there).
-   **Sort tab** - drag-and-drop or type-a-position reordering of your whole collection, with detailed/compact/grid views, search plus multi-select series filtering, multi-select drag-and-move, and `$sm`/`$smpos` command generation for both full reorders and small position-only fixes.
-   **Series Order tab** - the same reordering/search/multi-select workflow, but for series instead of individual characters, with a cover-art grid view (each series pictured by its highest-kakera character) and `$smseries` command generation.
-   **Undo/redo** - a floating Undo/Redo widget (plus `Ctrl+Z`/`Ctrl+Y`) that covers every change made anywhere in the app for the current session.
-   **Notes search** - filter the character grid by name, series, note, or owner without touching your actual selections.
-   **Color command chips** - generated `$ec` commands now show exactly which characters they cover, not just a count.
-   **More reliable alias matching** - the Sort tab's `$mmmka+s` import now falls back to matching characters by series + kakera value, so a character renamed with Mudae's `$alias` command still gets its notes/image/color pulled in correctly.
-   **Colors tab** - a canvas-based color wheel + lightness slider (or type a hex directly) for picking colors visually, with **Apply to All** / **Apply to Selected** buttons that work across your whole collection, plus a "Show Selected" list so you can see exactly which characters "Selected Only" will affect before applying.
-   **Sort by Notes** - a section on the Notes tab that lists every note in use, lets you drag them into a priority order, and generates a `$smnote` command from it - the same drag/select workflow as Series Order, without leaving the Notes tab.
-   **Fixed: key/kakera/gender/etc. filters getting stuck** - re-running **Apply Filter** with looser bounds (e.g. widening Min/Max Keys) now correctly un-hides characters that match again, instead of leaving anything previously filtered out stuck hidden.
-   **Fixed: custom order inside a note group resetting** - Ranking order within a group is now saved as soon as it's assigned, so it survives things like applying a note elsewhere instead of quietly reverting to parse order.
-   **Fixed: `$smseries` generation for large collections** - `$smseries` has no append/insert/continuation mode (confirmed against the real bot - it only accepts the complete order in one message), so this now always generates a single command instead of multiple commands that looked valid but silently overwrote each other. If the full order is over Discord's 2,000-character limit but still fits under Nitro's 4,000, you get a warning plus a working command and a confirm button. If it's too long even for Nitro, the command is cut off at the last series/note that fits, with a clear note on how many were left out and a pointer to sort the rest manually (Sort by Notes, or one at a time) - the same truncate-and-explain behavior applies to `$smnote`.
-   **+ Add New Characters** - a popup for adding just-claimed characters without re-pasting your entire collection: run `$mmsaty+ri-c+x+kon` (your usual import flags plus Mudae's `n` "not noted" flag) to DM yourself only your un-noted characters, paste that into the popup, and it merges them in - existing characters (matched by series + name) are left completely untouched, newly-added ones are slotted in by global rank (lower # first) rather than always landing last, and the input box is regenerated from the merged collection afterward so everything shows up grouped under its proper series instead of tacked on as a duplicate block at the end.
-   **Confirm order applied** - after generating a `$sm`/`$smseries`/`$smnote` command and running it in Discord, a "✓ Ran this in Discord" button lets you lock that order in as the app's new baseline (reordering the underlying character/series data to match), so later actions build on the real current order instead of the stale one from your last full import. Shown any time the command could plausibly have been sent (including Nitro-only lengths), not just when it's under the base 2,000-char limit.
-   **Wishlists tab** - save your own and other players' `$wishlist` output (paste it, name it) and compare any two side by side to see exactly which characters overlap. A trailing `⭐` (starwish) or `✅` (already claimed) in the pasted text is recognized and shown next to matching characters in the results. Wishlists are stored independently of your collections, so they stick around no matter which collection you're viewing.


## Limitations
- **Desktop browsers only** - Mobile browsers are not supported
- Large collections (>5000 characters) may cause the page to slow down.


## Running Tests

`index.html` is a single static file with no build step, so the test suite drives it end-to-end in a real browser (via [Playwright](https://playwright.dev/)) rather than unit-testing pieces of it in isolation.

```
npm install
npm test
```

This launches whatever Chromium-based browser is installed (Edge or Chrome), loads `index.html` directly from disk, and runs through the app's tabs like a user would - loading the demo collection, applying filters, ranking, generating commands, picking colors, etc. If no supported browser is found, point `MUDAE_TEST_BROWSER_PATH` at one:

```
MUDAE_TEST_BROWSER_PATH="/path/to/chrome" npm test
```

Test files live in `tests/*.spec.js`, one per feature area. Add a new `*.spec.js` file (see the existing ones for the pattern) to cover new features or lock in a bug fix - `tests/run.js` picks up any file matching that name automatically.


## Images

![Input section](images/input.png)

![Characters](images/characters.png)
![Sorter](images/characters.png)
![Characters](images/characters.png)

## Why?
I wanted to add on to the functionality of the original app I used as I felt I needed something more than what the original tool was offering. So, I added some functionality I and others wanted alongside some functionalities I've seen on other websites.

![license](https://img.shields.io/badge/license-MIT-green?style=flat)

