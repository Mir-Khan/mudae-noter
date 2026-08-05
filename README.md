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
-   Undo/redo (`Ctrl+Z` / `Ctrl+Y`) across the whole app for the current session.
-   Search characters by name, series, note, or owner.
-   Visualize player collection styles (Animanga vs. Game / Waifu vs. Husbando) based on harem owners.
-   Use it as a clean interface for showing off your collection or facilitating trades.

## How to Use

**Live Version:** [https://arczeus.github.io/mudae-noter/](https://arczeus.github.io/mudae-noter/)

**Or run locally:** Download `index.html` and open in your browser

1. Run `$mmsaty+ri-c+x+ko` or `$mmasi-`.
2. Copy the character list.
3. Paste it in the page and click **Parse Input**.  
4. Organize, rank, or note your characters.
5. Click Generate Notes or Generate Colors to get your Discord commands.


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


## Limitations
- **Desktop browsers only** - Mobile browsers are not supported
- Large collections (>5000 characters) may cause the page to slow down.


## Images

![Input section](images/input.png)

![Characters](images/characters.png)

## Why?
I wanted to add on to the functionality of the original app I used as I felt I needed something more than what the original tool was offering. So, I added some functionality I and others wanted alongside some functionalities I've seen on other websites.

![license](https://img.shields.io/badge/license-MIT-green?style=flat)
![AI Assisted](https://img.shields.io/badge/AI-Assisted-blue) 

![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)

