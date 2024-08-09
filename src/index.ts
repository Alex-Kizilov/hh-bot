import puppeteer from 'puppeteer';
// Or import puppeteer from 'puppeteer-core';

// Launch the browser and open a new blank page
const browser = await puppeteer.launch({devtools: true, defaultViewport: null}); //Добавил хуйню чтобы на весь экран было
const page = await browser.newPage();

// Navigate the page to a URL.
await page.goto('https://hh.ru/');

// Set screen size.
//await page.setViewport({width: 1900, height: 1070}); Нам это не надо

// Type into search box.
await page.locator('.devsite-search-field').fill('automate beyond recorder');

// Wait and click on first result.
await page.locator('.devsite-result-item-link').click();

// Locate the full title with a unique string.
const textSelector = await page
    .locator('text/Customize and automate')
    .waitHandle();
const fullTitle = await textSelector?.evaluate(el => el.textContent);

// Print the full title.
console.log('The title of this blog post is "%s".', fullTitle);

await browser.close();

