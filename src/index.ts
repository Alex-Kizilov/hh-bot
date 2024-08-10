import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
import winston from 'winston';

// Настройка Winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(), // Логирование в консоль
        new winston.transports.File({ filename: 'app.log' }) // Логирование в файл
    ]
});

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

await page.goto('https://hh.ru/', { timeout: 0 });
await page.waitForSelector('input[id=a11y-search-input]');
await page.focus('input[id=a11y-search-input]');
await page.keyboard.type('Frontend');
await page.keyboard.press('Enter');

await page.waitForNavigation({ timeout: 0 });
await page.goto(removeAreaParam(page.url()), { timeout: 0 });
await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

// Сохраняем список обработанных вакансий
const processedVacancies: Set<string> = new Set();

while (true) {
    // Проверка на наличие ошибки
    const checkForError = async () => {
        const errorNotification = await page.$('div[data-qa="bloko-notification"].bloko-notification_error');
        if (errorNotification) {
            logger.error('Обнаружена ошибка: диалоговое окно с атрибутом data-qa="bloko-notification" и классом bloko-notification_error');
            await browser.close();
            process.exit(1);
        }
    };

    // Проверьте наличие ошибки перед началом обработки вакансий
    await checkForError();

    const elements = await page.$$('a[data-qa="vacancy-serp__vacancy_response"]');

    if (elements.length === 0) {
        logger.info('Нет вакансий на текущей странице, переход к следующей');
        await page.goto(addPageParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
        await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');
        await checkForError();
        continue;
    }

    for (let i = 0; i < elements.length; i++) {
        // Проверьте наличие ошибки перед каждым кликом
        await checkForError();

        const element = elements[i];
        const box = await element.boundingBox();

        if (box) {
            const vacancyUrl = await element.evaluate(el => el.getAttribute('href'));

            if (vacancyUrl && !processedVacancies.has(vacancyUrl)) {
                logger.info(`Обрабатывается вакансия: ${vacancyUrl}`);

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
                        logger.info(`Отправлено сопроводительное письмо на вакансию: ${vacancyUrl}`);
                    }
                }

                const relocationModal = await page.$('button[data-qa="relocation-warning-confirm"]');
                if (relocationModal) {
                    await relocationModal.click();
                    logger.info(`Подтверждено предупреждение о переезде на вакансии: ${vacancyUrl}`);
                }

                const testPage = await page.$('p[data-qa="employer-asking-for-test"]');
                if (testPage) {
                    logger.info(`Обнаружена страница с тестом. Возвращаемся назад и перезагружаем страницу`);
                    await page.goBack({ timeout: 0, waitUntil: 'networkidle2' });

                    await new Promise(r => setTimeout(r, 1000));

                    pageNumber--; // Сбрасываем счетчик страницы, чтобы остаться на той же странице

                    await page.goto(addPageParam(removeAreaParam(page.url())), { timeout: 0, waitUntil: 'networkidle2' });

                    processedVacancies.add(vacancyUrl);
                    await checkForError();
                    break;
                }

                processedVacancies.add(vacancyUrl);

                await new Promise(r => setTimeout(r, 500));
            }
        } else {
            logger.warn('Элемент не видим и не может быть кликнут');
        }
    }

    pageNumber++; // Переход к следующей странице
    logger.info(`Переход к странице ${pageNumber}`);
    await page.goto(addPageParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
    await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');
    await checkForError();
}

// Закрытие браузера вне цикла
await browser.close();
