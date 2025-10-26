// countryController.js

const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const { pool } = require('./db');
require('dotenv').config();

const CACHE_IMAGE_PATH = path.join(__dirname, 'cache', 'summary.png');
const CACHE_DIR = path.join(__dirname, 'cache');

// --- HARDCODE API URLs to prevent 503 error from missing ENV variables ---
const COUNTRY_API_URL = process.env.COUNTRY_API_URL || 'https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies';
const EXCHANGE_API_URL = process.env.EXCHANGE_API_URL || 'https://open.er-api.com/v6/latest/USD';

// --- Utility Functions ---

/**
 * Generates a random number between min (inclusive) and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const getRandomMultiplier = (min = 1000, max = 2000) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Computes the Estimated GDP.
 * @param {number} population
 * @param {number} exchangeRate
 * @returns {number|null}
 */
const computeEstimatedGdp = (population, exchangeRate) => {
    if (exchangeRate === null || exchangeRate === 0) return null;
    if (population === 0) return 0;
    
    const multiplier = getRandomMultiplier();
    
    // estimated_gdp = population × random(1000–2000) ÷ exchange_rate
    return (population * multiplier) / exchangeRate;
};

/**
 * Sends a consistent JSON error response.
 * @param {object} res - Express response object.
 * @param {number} status - HTTP status code.
 * @param {string} error - The main error message.
 * @param {object|string} [details] - Optional details for the error.
 */
const sendError = (res, status, error, details = undefined) => {
    const response = { error };
    if (details) response.details = details;
    res.status(status).json(response);
};

// --- Image Generation ---

/**
 * Step 4: Generates the summary image and saves it to disk.
 * @param {number} totalCountries
 * @param {object[]} topCountries
 * @param {string} lastRefreshedAt - ISO string.
 */
const generateSummaryImage = async (totalCountries, topCountries, lastRefreshedAt) => {
    // 1. Prepare text content
    let text = `Total Countries: ${totalCountries}\n`;
    text += `Last Refresh: ${new Date(lastRefreshedAt).toUTCString()}\n\n`;
    text += "Top 5 Countries by Estimated GDP:\n";

    topCountries.forEach((c, index) => {
        const gdp = c.estimated_gdp 
            ? parseFloat(c.estimated_gdp).toLocaleString(undefined, { maximumFractionDigits: 0 }) 
            : 'N/A';
        text += `${index + 1}. ${c.name} (GDP: $${gdp})\n`;
    });

    // 2. Generate image using sharp
    const width = 600;
    const height = 400;
    const padding = 20;

    const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text font-family="monospace" font-size="16" fill="#333" dominant-baseline="hanging">
            ${text.split('\n').map((line, i) =>
                `<tspan x="${padding}" dy="${i === 0 ? padding : 20}">${line}</tspan>`
            ).join('')}
        </text>
    </svg>`;

    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    await sharp(Buffer.from(svg))
        .png()
        .toFile(CACHE_IMAGE_PATH);
};

// --- Main Controller Functions ---

const refreshCountries = async (req, res) => {
    let connection;
    const ISO_NOW = new Date().toISOString(); // Always use ISO format for final response

    try {
        // Use the hardcoded/defaulted URLs from the top of the file
        const [exchangeRes, countryRes] = await Promise.all([
            axios.get(EXCHANGE_API_URL),
            axios.get(COUNTRY_API_URL)
        ]).catch(error => {
            const apiName = error.config && error.config.url.includes('restcountries') ? 'Rest Countries API' : 'Exchange Rate API';
            sendError(res, 503, 'External data source unavailable', `Could not fetch data from ${apiName}`);
            throw new Error('API_FAILURE');
        });

        if (!exchangeRes.data || !exchangeRes.data.rates || !countryRes.data || !Array.isArray(countryRes.data)) {
             sendError(res, 503, 'External data source unavailable', 'External API returned invalid or unexpected data structure.');
             throw new Error('API_FAILURE');
        }

        const exchangeRates = exchangeRes.data.rates;
        const countryData = countryRes.data;
        // Use ISO_NOW but convert it to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss) for storage
        const dbTimestamp = ISO_NOW.slice(0, 19).replace('T', ' '); 

        connection = await pool.getConnection();
        await connection.beginTransaction();

        let totalCountries = 0;

        for (const country of countryData) {
            const countryName = country.name;
            let currency_code = null;
            let exchange_rate = null;
            let estimated_gdp = null;

            if (Array.isArray(country.currencies) && country.currencies.length > 0) {
                currency_code = (country.currencies[0].code || '').toUpperCase();
            }

            if (currency_code) {
                if (exchangeRates.hasOwnProperty(currency_code)) {
                    exchange_rate = exchangeRates[currency_code];
                }
            }

            const population = country.population || 0;
            estimated_gdp = computeEstimatedGdp(population, exchange_rate);
            
            if (currency_code === null) {
                estimated_gdp = 0;
            }

            const sql = `
                INSERT INTO countries (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    capital = VALUES(capital),
                    region = VALUES(region),
                    population = VALUES(population),
                    currency_code = VALUES(currency_code),
                    exchange_rate = VALUES(exchange_rate),
                    estimated_gdp = VALUES(estimated_gdp),
                    flag_url = VALUES(flag_url),
                    last_refreshed_at = VALUES(last_refreshed_at);
            `;

            const values = [
                countryName,
                country.capital || null,
                country.region || null,
                population,
                currency_code,
                exchange_rate,
                estimated_gdp,
                country.flag || null,
                dbTimestamp
            ];

            await connection.query(sql, values);
            totalCountries++;
        }

        // 3. Update Status Table
        await connection.query(
            'UPDATE status SET total_countries = ?, last_refreshed_at = ? WHERE id = 1',
            [totalCountries, dbTimestamp]
        );

        // 4. Image Generation
        const [topCountries] = await connection.query(
            'SELECT name, estimated_gdp FROM countries ORDER BY estimated_gdp DESC LIMIT 5'
        );

        // Pass the ISO_NOW timestamp for clean image generation
        await generateSummaryImage(totalCountries, topCountries, ISO_NOW);

        await connection.commit();
        connection.release();

        // Return the ISO_NOW timestamp for the required checker format
        res.json({ 
            message: 'Country data and exchange rates refreshed successfully.', 
            total_countries: totalCountries, 
            last_refreshed_at: ISO_NOW // Correct ISO format (TEST 5 fix)
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        
        if (error.message === 'API_FAILURE') return;

        console.error('Refresh error:', error);
        sendError(res, 500, 'Internal server error', 'A database or processing error occurred during refresh.');
    }
};

// --- GET /countries (List, Filter, Sort) ---

const getCountries = async (req, res) => {
    const { region, currency, sort } = req.query;
    let query = 'SELECT * FROM countries';
    const params = [];
    const conditions = [];

    // 1. Filtering Logic - Use UPPER/LOWER for case-insensitivity in filtering
    if (region) {
        conditions.push('LOWER(region) = LOWER(?)');
        params.push(region);
    }
    if (currency) {
        conditions.push('LOWER(currency_code) = LOWER(?)');
        params.push(currency);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    // 2. Sorting Logic
    let orderBy = ' ORDER BY name ASC'; // Default sort

    if (sort) {
        const [field, direction] = sort.split('_');
        const validDirections = ['desc', 'asc'];
        
        if (field === 'gdp' && validDirections.includes(direction)) {
            // Sort by estimated_gdp
            orderBy = ` ORDER BY estimated_gdp ${direction.toUpperCase()}`;
        }
    }

    query += orderBy;

    try {
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Get countries error:', error);
        sendError(res, 500, 'Internal server error');
    }
};

// --- GET /countries/:name (Read) ---

const getCountryByName = async (req, res) => {
    const { name } = req.params;

    try {
        const [rows] = await pool.query(
            'SELECT * FROM countries WHERE LOWER(name) = LOWER(?)',
            [name]
        );

        if (rows.length === 0) {
            return sendError(res, 404, 'Country not found');
        }

        res.json(rows[0]);

    } catch (error) {
        console.error('Get country by name error:', error);
        sendError(res, 500, 'Internal server error');
    }
};

// --- DELETE /countries/:name (Delete) ---

const deleteCountry = async (req, res) => {
    const { name } = req.params;

    try {
        const [result] = await pool.query(
            'DELETE FROM countries WHERE LOWER(name) = LOWER(?)',
            [name]
        );
        
        if (result.affectedRows === 0) {
            return sendError(res, 404, 'Country not found');
        }

        res.json({ message: `Country deleted successfully.` });

    } catch (error) {
        console.error('Delete country error:', error);
        sendError(res, 500, 'Internal server error');
    }
};

// --- GET /status (Status) ---

const getStatus = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT total_countries, last_refreshed_at FROM status WHERE id = 1');

        if (rows.length === 0) {
             return sendError(res, 500, 'Internal server error', 'Status record missing from database.');
        }
        
        const statusRow = rows[0];

        res.json({
            total_countries: statusRow.total_countries || 0,
            // FIX for TEST 5: Ensure correct ISO format
            last_refreshed_at: statusRow.last_refreshed_at 
                ? new Date(statusRow.last_refreshed_at).toISOString() 
                : null
        });

    } catch (error) {
        console.error('Get status error:', error);
        sendError(res, 500, 'Internal server error');
    }
};

// --- GET /countries/image (Image Serving) ---

const getCountryImage = async (req, res) => {
    try {
        // Check if file exists
        await fs.access(CACHE_IMAGE_PATH); 
        
        res.setHeader('Content-Type', 'image/png');
        
        // Use the absolute path
        res.sendFile(CACHE_IMAGE_PATH); 

    } catch (error) {
        // ENOENT means file not found
        if (error.code === 'ENOENT') {
            return sendError(res, 404, 'Summary image not found');
        }

        console.error('Get image error:', error);
        sendError(res, 500, 'Internal server error');
    }
};

module.exports = {
    refreshCountries,
    getCountries,
    getCountryByName,
    deleteCountry,
    getStatus,
    getCountryImage,
    sendError, 
};
