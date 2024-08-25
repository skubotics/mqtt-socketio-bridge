require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    host: process.env.RDS_ENDPOINT,
    port: 5432,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_DB_PASSWORD,
    database: process.env.RDS_DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

// Function to create a table
async function createTable() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL RDS!');

        // Define the SQL statement to create the table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS data (
                id SERIAL PRIMARY KEY,
                device VARCHAR(20) NOT NULL,
                value NUMERIC(10, 3) NOT NULL,
                time TIMESTAMPTZ NOT NULL
            );
        `;

        // Execute the SQL statement to create the table
        await client.query(createTableQuery);
        console.log('Table "data" created successfully.');

    } catch (err) {
        console.error('Error creating table:', err.stack);
    } finally {
        // End the client connection
        await client.end();
    }
}

// Call the function to create the table
createTable();