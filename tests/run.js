// Minimal test runner - no framework needed for a handful of Playwright
// specs. Each *.spec.js file in this folder exports an array of
// { name, run(page) } test cases; run() should throw (e.g. via assert) to
// fail. Each test gets its own fresh page (and thus a clean in-page
// AppState/localStorage), but all tests in a run share one browser.
const fs = require('fs');
const path = require('path');
const { launchBrowser, newPage, assertNoConsoleErrors } = require('./helpers');

async function main() {
    const specFiles = fs.readdirSync(__dirname)
        .filter(f => f.endsWith('.spec.js'))
        .sort();

    if (specFiles.length === 0) {
        console.log('No *.spec.js files found in tests/.');
        return;
    }

    const browser = await launchBrowser();
    let passed = 0;
    let failed = 0;
    const failures = [];

    try {
        for (const file of specFiles) {
            const cases = require(path.join(__dirname, file));
            for (const testCase of cases) {
                const fullName = `${file} > ${testCase.name}`;
                const page = await newPage(browser);
                try {
                    await testCase.run(page);
                    assertNoConsoleErrors(page);
                    console.log(`  ok  - ${fullName}`);
                    passed++;
                } catch (e) {
                    console.log(`FAIL  - ${fullName}`);
                    console.log(`        ${e.message.split('\n').join('\n        ')}`);
                    failed++;
                    failures.push(fullName);
                } finally {
                    await (page._context ? page._context.close() : page.close());
                }
            }
        }
    } finally {
        await browser.close();
    }

    console.log('');
    console.log(`${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('Failed: ' + failures.join(', '));
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Test runner crashed:', e);
    process.exit(1);
});
