import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

function removeAreaParam(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.delete('area');
    return parsedUrl.toString();
}

let pageNumber: number = 0;

function addPageParam(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('page', pageNumber.toString());
    return parsedUrl.toString();
}

// Загрузите переменные окружения из файла .env
dotenv.config();

const browser = await puppeteer.launch({ devtools: true, defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

const domain = process.env.HH_DOMAIN_NAME || '';
const name = process.env.HH_TOKEN_NAME || '';
const value = process.env.HH_TOKEN_VALUE || '';
const coverLetterText = process.env.COVER_LETTER_TEXT || '.';

await page.setCookie({ domain, name, value });

// Navigate the page to a URL.
await page.goto('https://hh.ru/', { timeout: 0 });

console.log('Успешный переход');

await page.waitForSelector('input[id=a11y-search-input]');
await page.focus('input[id=a11y-search-input]');
await page.keyboard.type('Frontend');
await page.keyboard.press('Enter');

console.log('Данные введены');

console.log(removeAreaParam(page.url()));

await page.waitForNavigation({ timeout: 0 });
await page.goto(removeAreaParam(page.url()), { timeout: 0 });

await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

// Сохраняем список обработанных вакансий
const processedVacancies: Set<string> = new Set();

while (true) {
    const elements = await page.$$('a[data-qa="vacancy-serp__vacancy_response"]');

    if (elements.length === 0) {
        console.log('Нет доступных вакансий на этой странице.');
        await page.goto(addPageParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
        await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');
        continue;
    }

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const box = await element.boundingBox();

        if (box) {
            const vacancyUrl = await element.evaluate(el => el.getAttribute('href'));

            if (vacancyUrl && !processedVacancies.has(vacancyUrl)) {
                await element.evaluate(el => el.scrollIntoView());

                await new Promise(r => setTimeout(r, 1000));

                await element.click();

                await new Promise(r => setTimeout(r, 1000));

                const coverLetterModal = await page.$('textarea[data-qa="vacancy-response-popup-form-letter-input"]');
                if (coverLetterModal) {
                    await coverLetterModal.type(coverLetterText);
                    const submitButton = await page.$('button[data-qa="vacancy-response-submit-popup"]');
                    if (submitButton) {
                        await submitButton.click();
                    }
                }

                const relocationModal = await page.$('button[data-qa="relocation-warning-confirm"]');
                if (relocationModal) {
                    await relocationModal.click();
                }

                const testPage = await page.$('p[data-qa="employer-asking-for-test"]');
                if (testPage) {
                    console.log('Обнаружена страница с тестовым заданием. Возвращаемся назад.');
                    await page.goBack({ timeout: 0, waitUntil: 'networkidle2' });

                    // Перезагружаем страницу с начальной пагинацией
                    pageNumber--; // Сбрасываем счетчик страницы, чтобы остаться на той же странице
                    await page.goto(addPageParam(removeAreaParam(page.url())), { timeout: 0, waitUntil: 'networkidle2' });

                    processedVacancies.add(vacancyUrl);
                    break;
                }

                processedVacancies.add(vacancyUrl);

                await new Promise(r => setTimeout(r, 500));
            }
        } else {
            console.log('Элемент не видим и не может быть кликнут');
        }
    }

    pageNumber++; // Переход к следующей странице
    await page.goto(addPageParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
    await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');
}
