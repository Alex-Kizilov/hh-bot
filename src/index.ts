import puppeteer, { Page, Browser } from 'puppeteer';
import dotenv from 'dotenv';
import winston from 'winston';
import { CONFIG } from './config.js';
import * as XLSX from 'xlsx';
import fs from 'fs';

dotenv.config();

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
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' })
    ]
});

// Пути к файлу
const excelFilePath = 'vacancies.xlsx';
const tempFilePath = 'vacancies_temp.xlsx';

// Создание нового Excel файла или загрузка существующего
let workbook: XLSX.WorkBook;
let worksheetData: unknown[];

// Функция для создания нового файла Excel
function initializeWorkbook() {
    if (fs.existsSync(excelFilePath)) {
        workbook = XLSX.readFile(excelFilePath);
        const worksheet = workbook.Sheets['Vacancies'];
        worksheetData = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[] : [];
    } else {
        workbook = XLSX.utils.book_new();
        worksheetData = [['Заголовок вакансии', 'Ссылка', 'Требуемый опыт']];
    }
}

// Инициализация
initializeWorkbook();

function saveToExcel() {
    try {
        const newWorksheet = XLSX.utils.aoa_to_sheet(worksheetData as unknown[][]);
        if (workbook.Sheets['Vacancies']) {
            workbook.Sheets['Vacancies'] = newWorksheet;
        } else {
            XLSX.utils.book_append_sheet(workbook, newWorksheet, 'Vacancies');
        }
        XLSX.writeFile(workbook, tempFilePath);
        fs.renameSync(tempFilePath, excelFilePath);
        logger.info('Данные успешно сохранены в файл Excel.');
    } catch (error) {
        logger.error('Ошибка при сохранении данных в Excel:', error);
    }
}

function removeAreaParam(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.delete('area');
    return parsedUrl.toString();
}

function addExpParam(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('experience', CONFIG.filters.experience);
    return parsedUrl.toString();
}

function addPageParam(url: string, pageNumber: number): string {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('page', pageNumber.toString());
    return parsedUrl.toString();
}

async function checkForError(page: Page, browser: Browser): Promise<void> {
    const errorNotification = await page.$('div[data-qa="bloko-notification"].bloko-notification_error');
    if (errorNotification) {
        logger.error('Обнаружена ошибка: диалоговое окно с атрибутом data-qa="bloko-notification" и классом bloko-notification_error');
        await browser.close();
        saveToExcel(); // Сохраняем данные перед выходом
        process.exit(1);
    }
}

async function processVacancies(page: Page, browser: Browser, processedVacancies: Set<string>, coverLetterText: string): Promise<boolean> {
    const vacancyElements = await page.$$('div[data-qa="vacancy-serp__vacancy vacancy-serp__vacancy_standard_plus"], div[data-qa="vacancy-serp__vacancy vacancy-serp__vacancy_standard"]');
    logger.info(`Обрабатывается ${vacancyElements.length} вакансий`);

    let isNeedPageInc = false;

    for (const element of vacancyElements) {
        const titleElement = await element.$('span[data-qa="serp-item__title"]');
        const experienceElement = await element.$('span[data-qa="vacancy-serp__vacancy-work-experience"]');
        const buttonElement = await element.$('a[data-qa="vacancy-serp__vacancy_response"]');

        if (buttonElement) {
            const vacancyUrl = await buttonElement.evaluate(el => el.getAttribute('href'));

            if (vacancyUrl && !processedVacancies.has(vacancyUrl)) {
                const title = titleElement ? await titleElement.evaluate(el => el.innerText) : 'Без заголовка';
                const experience = experienceElement ? await experienceElement.evaluate(el => el.innerText) : 'Не указан';

                logger.info(`Обрабатывается вакансия: ${title} (${experience}) - ${vacancyUrl}`);

                // Добавляем данные в таблицу Excel
                worksheetData.push([title, vacancyUrl, experience]);

                await buttonElement.evaluate(el => el.scrollIntoView());
                await buttonElement.click();

                const result = await Promise.allSettled([
                    page.waitForSelector('textarea[data-qa="vacancy-response-popup-form-letter-input"], button[data-qa="relocation-warning-confirm"], p[data-qa="employer-asking-for-test"]', { visible: true, timeout: 5000 }),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 1000 })
                ]);

                if (result === null) {
                    logger.info('Переход на другую страницу или отсутствие модальных окон');
                    continue; // Переходим к следующей вакансии
                }

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
                    processedVacancies.add(vacancyUrl);

                    isNeedPageInc = true;
                    continue;
                }

                processedVacancies.add(vacancyUrl);
            } else {
                logger.warn('Элемент не видим и не может быть кликнут');
            }
        }
    }

    return isNeedPageInc;
}

(async () => {
    const browser = await puppeteer.launch({ devtools: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const domain = process.env.HH_DOMAIN_NAME || '';
    const name = process.env.HH_TOKEN_NAME || '';
    const value = process.env.HH_TOKEN_VALUE || '';
    const coverLetterText = process.env.COVER_LETTER_TEXT || '.';

    await page.setCookie({ domain, name, value });
    await page.goto('https://hh.ru/', { timeout: 0, waitUntil: 'networkidle2' });
    await page.waitForSelector('input[id=a11y-search-input]');
    await page.focus('input[id=a11y-search-input]');
    await page.keyboard.type(CONFIG.jobTitle);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ timeout: 0, waitUntil: 'networkidle2' });
    await page.goto(removeAreaParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
    await page.goto(addExpParam(page.url()), { timeout: 0, waitUntil: 'networkidle2' });
    await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

    const processedVacancies: Set<string> = new Set();
    let pageNumber = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        await checkForError(page, browser);
        const isNeedPageInc = await processVacancies(page, browser, processedVacancies, coverLetterText);

        logger.info(`Нужен ли переход на новую страницу?: ${isNeedPageInc}`);

        if (isNeedPageInc) {
            pageNumber++;
        }

        logger.info(`Переход к странице ${pageNumber}`);
        await page.goto(addPageParam(removeAreaParam(page.url()), pageNumber), { timeout: 0, waitUntil: 'networkidle2' });
        await page.waitForSelector('a[data-qa="vacancy-serp__vacancy_response"]');

        // Частичное сохранение данных
        saveToExcel();
    }

    // Запись данных в файл Excel по завершению
    saveToExcel();
    await browser.close();
})();
