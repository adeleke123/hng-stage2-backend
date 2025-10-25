// index.js

require('dotenv').config();
const express = require('express');
const { initializeDatabase } = require('./db');
const { 
    refreshCountries, 
    getCountries, 
    getCountryByName, 
    deleteCountry, 
    getStatus, 
    getCountryImage, 
    sendError 
} = require('./countryController');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize the database before starting the server
initializeDatabase().then(() => {
    
    // Middlewares
    app.use(express.json()); // for parsing application/json

    // --- Endpoints ---
    
    // Status endpoint
    app.get('/status', getStatus);
    
    // Refresh and Image endpoints
    app.post('/countries/refresh', refreshCountries);
    app.get('/countries/image', getCountryImage);
    
    // CRUD and List operations
    app.get('/countries', getCountries);
    app.get('/countries/:name', getCountryByName);
    // Note: The task implies we only need GET and DELETE for single country by name
    // For a complete API, you'd add POST /countries and PUT/PATCH /countries/:name
    app.delete('/countries/:name', deleteCountry); 

    // 404 Handler - Catch-all for undefined routes
    app.use((req, res) => {
        sendError(res, 404, 'Not found', `The requested endpoint ${req.path} does not exist.`);
    });
    
    // Global Error Handler (Express 4-argument error middleware)
    app.use((err, req, res, next) => {
        console.error(err.stack);
        sendError(res, 500, 'Internal server error', 'An unexpected error occurred.');
    });

    // Start the server
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Access at http://localhost:${PORT}`);
    });
});