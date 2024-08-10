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
const coverLetterText = process.env.COVER_LETTER_TEXT || '.';

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

await page.waitForNavigation({timeout: 0});
await page.goto(removeAreaParam(page.url()), {timeout: 0});

await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

const elements = await page.$$('a[data-qa="vacancy-serp__vacancy_response"]');

// Сохраняем список обработанных вакансий
const processedVacancies: Set<string> = new Set();

while (true) {
    const elements = await page.$$('a[data-qa="vacancy-serp__vacancy_response"]');

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const box = await element.boundingBox();

        // Проверка, что элемент видим и не был обработан ранее
        if (box) {
            const vacancyUrl = await element.evaluate(el => el.getAttribute('href'));

            if (vacancyUrl && !processedVacancies.has(vacancyUrl)) {
                await element.evaluate(el => el.scrollIntoView());

                // Задержка
                await new Promise(r => setTimeout(r, 1000));

                await element.click();

                // Задержка для обработки модальных окон или перехода на новую страницу
                await new Promise(r => setTimeout(r, 1000));

                // Проверка на открытие модального окна с сопроводительным письмом
                const coverLetterModal = await page.$('textarea[data-qa="vacancy-response-popup-form-letter-input"]');
                if (coverLetterModal) {
                    await coverLetterModal.type(coverLetterText);
                    const submitButton = await page.$('button[data-qa="vacancy-response-submit-popup"]');
                    if (submitButton) {
                        await submitButton.click();
                    }
                }

                // Проверка на появление окна о релокации
                const relocationModal = await page.$('button[data-qa="relocation-warning-confirm"]');
                if (relocationModal) {
                    await relocationModal.click();
                }

                // Проверка на переход на страницу с тестовым заданием
                const testPage = await page.$('p[data-qa="employer-asking-for-test"]');
                if (testPage) {
                    console.log('Обнаружена страница с тестовым заданием. Возвращаемся назад.');
                    await page.goBack(); // Возвращаемся обратно на страницу с вакансиями
                    processedVacancies.add(vacancyUrl); // Помечаем вакансию как обработанную
                    break; // Перезапускаем цикл, чтобы обновить список вакансий
                }

                // Помечаем вакансию как обработанную
                processedVacancies.add(vacancyUrl);

                // Небольшая задержка перед переходом к следующему элементу
                await new Promise(r => setTimeout(r, 500));
            }
        } else {
            console.log('Элемент не видим и не может быть кликнут');
        }
    }

    // Обновляем страницу после возврата
    await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');
}

// все data-qa
// если переходим на страницу с ответами на вопросы - employer-asking-for-test
// модалка с вакухой из другой страны - relocation-warning-confirm
// модалка с сопроводительным:
// textarea - vacancy-response-popup-form-letter-input
// кнопка  - vacancy-response-submit-popup




// await browser.close();

