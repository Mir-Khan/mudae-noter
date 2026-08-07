// Shared helpers for the Playwright-driven tests in this folder.
//
// index.html is a single static file with no build step and no server, so
// tests launch it directly via a file:// URL. There's no bundled Chromium
// here (playwright-core doesn't ship one) - launch tries a few installed
// browser channels in order instead. If none are found, set the
// MUDAE_TEST_BROWSER_PATH env var to a Chromium-based browser executable.
const path = require('path');
const { chromium } = require('playwright-core');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

async function launchBrowser() {
    const attempts = [];

    if (process.env.MUDAE_TEST_BROWSER_PATH) {
        attempts.push({ executablePath: process.env.MUDAE_TEST_BROWSER_PATH });
    }
    attempts.push({ channel: 'msedge' }, { channel: 'chrome' }, { channel: 'chromium' }, {});

    let lastError = null;
    for (const options of attempts) {
        try {
            return await chromium.launch(Object.assign({ headless: true }, options));
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(
        'Could not launch a Chromium-based browser for tests. Install Chrome/Edge, or set ' +
        'MUDAE_TEST_BROWSER_PATH to a browser executable.\nLast error: ' + lastError.message
    );
}

// Fresh page loaded straight to index.html with no collection parsed yet.
// Each call gets its own incognito browser context (not just a new tab in a
// shared one), so localStorage - and therefore things like the "seen the
// changelog popup" flag - never leaks between tests regardless of run order.
async function newPage(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('CONSOLE: ' + msg.text()); });
    page._consoleErrors = consoleErrors;
    page._context = context;

    await page.goto(APP_URL);
    return page;
}

// The changelog popup shows on first visit in a fresh (no localStorage)
// context - most specs don't care about it and just want it out of the way.
async function dismissChangelogIfPresent(page) {
    const gotIt = page.locator('#changelogOverlay button:has-text("Got it")');
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
}

// Loads the built-in demo collection (same data used for manual smoke
// testing) via the "Load Demo" button + Parse Input, on the Notes tab.
async function loadDemoCollection(page) {
    await dismissChangelogIfPresent(page);
    await page.click('button:has-text("Load Demo")');
    await page.click('button:has-text("Parse Input")');
    await page.waitForSelector('.series-card');
}

function assertNoConsoleErrors(page) {
    if (page._consoleErrors.length) {
        throw new Error('Unexpected console/page errors:\n' + page._consoleErrors.join('\n'));
    }
}

module.exports = { APP_URL, launchBrowser, newPage, loadDemoCollection, dismissChangelogIfPresent, assertNoConsoleErrors };
