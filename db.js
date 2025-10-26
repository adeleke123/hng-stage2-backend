// db.js

require('dotenv').config();
const mysql = require('mysql2/promise');

// --- Configuration Setup ---
// 
// Check for the comprehensive URL first (used in Railway deployment as ${{MYSQL_PUBLIC_URL}})
// This is the most reliable way to connect to a cloud database.
//
const connectionConfig = process.env.DATABASE_URL
    ? { uri: process.env.DATABASE_URL } // Use the full URL string
    : {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        // Assuming default port 3306 if not using URL
    };

const pool = mysql.createPool({
    ...connectionConfig, // Spreads the properties from either the URL or individual vars
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- SQL to create the countries table ---
const CREATE_COUNTRIES_TABLE = `
CREATE TABLE IF NOT EXISTS countries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    capital VARCHAR(100),
    region VARCHAR(100),
    population BIGINT NOT NULL,
    currency_code VARCHAR(5),
    exchange_rate DECIMAL(10, 4),
    estimated_gdp DECIMAL(20, 2),
    flag_url VARCHAR(255),
    last_refreshed_at DATETIME
);
`;

// --- SQL to create the status table for global tracking ---
const CREATE_STATUS_TABLE = `
CREATE TABLE IF NOT EXISTS status (
    id INT PRIMARY KEY,
    total_countries INT NOT NULL DEFAULT 0,
    last_refreshed_at DATETIME
);
`;

// --- Database Initialization Function ---
const initializeDatabase = async () => {
    try {
        await pool.query(CREATE_COUNTRIES_TABLE);
        await pool.query(CREATE_STATUS_TABLE);
        
        // Ensure the status table has at least one row for updates
        await pool.query(
            'INSERT IGNORE INTO status (id, total_countries) VALUES (1, 0)'
        );
        console.log('Database tables checked/initialized successfully.');
    } catch (error) {
        console.error('Error initializing database:', error);
        // Important: Exit if DB setup fails
        process.exit(1); 
    }
};

module.exports = { pool, initializeDatabase };
