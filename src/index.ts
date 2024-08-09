import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

function removeAreaParam(url: string): string {
    // Создаем объект URL из строки
    const parsedUrl = new URL(url);

    // Удаляем параметр 'area' из URLSearchParams
    parsedUrl.searchParams.delete('area');

    // Возвращаем обновленный URL как строку
    return parsedUrl.toString();
}


// Загрузите переменные окружения из файла .env
dotenv.config();
// Or import puppeteer from 'puppeteer-core';

// Launch the browser and open a new blank page
const browser = await puppeteer.launch({devtools: true, defaultViewport: null}); //Добавил хуйню чтобы на весь экран было
const page = await browser.newPage();

const domain = process.env.HH_DOMAIN_NAME || '';
const name = process.env.HH_TOKEN_NAME || '';
const value = process.env.HH_TOKEN_VALUE || '';

await page.setCookie({domain, name, value});

// Navigate the page to a URL.
await page.goto('https://hh.ru/', {timeout: 0});

await page.focus('input[id=a11y-search-input]');
await page.keyboard.type('Frontend');
await page.keyboard.press('Enter')

await page.goto(removeAreaParam(page.url()));

// await browser.close();

