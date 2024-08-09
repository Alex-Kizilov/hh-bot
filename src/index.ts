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
await page.setViewport({ width: 1920, height: 1080})

const domain = process.env.HH_DOMAIN_NAME || '';
const name = process.env.HH_TOKEN_NAME || '';
const value = process.env.HH_TOKEN_VALUE || '';

await page.setCookie({domain, name, value});

// Navigate the page to a URL.
await page.goto('https://hh.ru/', {timeout: 0});

console.log('Успешный переход');

await page.waitForSelector('input[id=a11y-search-input]');
await page.focus('input[id=a11y-search-input]');
await page.keyboard.type('Frontend');
await page.keyboard.press('Enter')

console.log('данные введены');

console.log(removeAreaParam(page.url()));

await page.waitForNavigation();
await page.goto(removeAreaParam(page.url()), {timeout: 0});

await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

const elements = await page.$$('a[data-qa="vacancy-serp__vacancy_response"]');

for (const element of elements) {
    const box = await element.boundingBox();
    if (box) {
        await element.evaluate(el => el.scrollIntoView());
        await element.click();
    } else {
        console.log('Элемент не видим и не может быть кликнут');
    }
}

// все data-qa
// если переходим на страницу с ответами на вопросы - employer-asking-for-test
// модалка с вакухой из другой страны - relocation-warning-confirm
// модалка с сопроводительным:
// textarea - vacancy-response-popup-form-letter-input
// кнопка  - vacancy-response-submit-popup


// await browser.close();

