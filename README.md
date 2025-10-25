That's smart\! Copying the raw markdown will save you a lot of time and potential formatting errors.

Here is the complete, raw markdown content for your `README.md`.


# 🌍 Country Currency & Exchange API

This is a backend RESTful API built for the Stage 2 Bootcamp task. It integrates data from two external sources (`restcountries.com` and `open.er-api.com`), processes the data (calculates Estimated GDP), and caches the results in a **MySQL** database to provide fast, sortable, and filterable endpoints.

## ⚙️ Technical Stack

* **Language:** Node.js
* **Framework:** Express
* **Database:** MySQL
* **Key Libraries:** `axios` (HTTP), `mysql2` (DB connector), `dotenv` (Config), `sharp` (Image Generation)


## 🚀 Setup & Local Installation

Follow these steps to get a local copy of the project running on your system.

### 1. Prerequisites

Before starting, ensure you have the following installed:

* **Node.js** (v18.x or higher)
* **npm** (Node Package Manager)
* **MySQL Server** (Running on port 3306)
* **Git**

### 2. Clone the Repository

```
git clone YOUR_GITHUB_REPO_URL
cd country-api
````

### 3\. Install Dependencies

Install all necessary Node.js packages:

```
npm install
```

### 4\. Database Setup

You must configure user credentials and set up the environment variables. The application will automatically create the required `countries` and `status` tables when it first runs.

a. **Verify Database:** Ensure a database named `country_cache_db` exists on your MySQL server. If not, create it:

```
CREATE DATABASE IF NOT EXISTS country_cache_db;
```

b. **Configure Environment Variables:** Create a file named **`.env`** in the root directory and paste the following content, replacing the placeholders with your actual MySQL credentials:

```
# .env

# Server Config
PORT=3000

# MySQL Database Config (Replace with your actual credentials)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=country_cache_db

# External APIs - DO NOT CHANGE THESE URLs
COUNTRY_API_URL=[https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies](https://restcountries.com/v2/all?fields=name,capital,region,population,flag,currencies)
EXCHANGE_API_URL=[https://open.er-api.com/v6/latest/USD](https://open.er-api.com/v6/latest/USD)
```

### 5\. Run the Server

Start the application in development mode:

```bash
npm run dev
```

The server will initialize the database tables and start listening on the specified port.

> **Output:** `Server is running on port 3000`

-----

## 🧭 API Endpoints

All endpoints assume a base URL of `http://localhost:3000` (or your deployed domain).

### 1\. Data Management Endpoints

| Method | Endpoint | Description | Notes |
| :--- | :--- | :--- | :--- |
| **`POST`** | `/countries/refresh` | **Initializes/Updates the Cache.** Fetches countries and exchange rates from external APIs, processes GDP, and performs an **UPSERT** (Update or Insert) for all records in the database. | **MUST** be called first to populate data. |
| **`GET`** | `/status` | Shows the total number of cached countries and the last successful refresh timestamp. | |
| **`GET`** | `/countries/image` | Serves the generated PNG image reporting the total countries and top 5 GDP leaders. | Image is generated only after a successful refresh. |

### 2\. Country CRUD & Query Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **`GET`** | `/countries` | Retrieve a list of all cached countries. Supports filtering and sorting via query parameters. |
| **`GET`** | `/countries/:name` | Retrieve a single country record by its full name (case-insensitive). |
| **`DELETE`** | `/countries/:name` | Delete a single country record by its full name (case-insensitive). |

### Query Parameter Examples (`GET /countries`)

| Example URL | Functionality |
| :--- | :--- |
| `/countries?region=Africa` | Filters countries to show only those in the "Africa" region. |
| `/countries?currency=NGN` | Filters countries to show only those using the "NGN" currency code (case-insensitive). |
| `/countries?sort=gdp_desc` | Sorts the results by `estimated_gdp` in descending order. |
| `/countries?region=Asia&sort=gdp_asc` | Combines filters: Asian countries, sorted by GDP ascending. |

-----

## 🚨 Error Handling

The API adheres to the following consistent JSON error formats:

| HTTP Status | JSON Response | Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `{"error": "Validation failed", "details": {...}}` | Invalid or missing data in request body. |
| `404 Not Found` | `{"error": "Country not found"}` | Country name not found for GET/DELETE requests. |
| `503 Service Unavailable` | `{"error": "External data source unavailable", "details": "..."}` | External API (`restcountries` or `open-er-api`) fails during a refresh request. |
| `500 Internal Server Error` | `{"error": "Internal server error"}` | Unhandled application or database error. |

```
```
