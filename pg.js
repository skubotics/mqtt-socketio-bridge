require('dotenv').config();
const { Client } = require('pg');

// Create a new client instance with configuration from environment variables
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
    }
}

// Function to insert multiple rows into the table
async function insertMultipleValues(records) {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL RDS!');

        // Define the SQL statement to insert multiple rows
        const insertQuery = `
            INSERT INTO data (device, value, time)
            VALUES
            ${records.map(record => `('${record.device}', ${record.value}, '${record.time}')`).join(', ')}
        `;

        // Execute the SQL statement to insert multiple rows
        await client.query(insertQuery);
        console.log('Records inserted successfully.');

    } catch (err) {
        console.error('Error inserting records:', err.stack);
    }
}

// Function to delete all rows from the table but keep the table structure
async function deleteAllRows() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL RDS!');

        // Define the SQL statement to delete all rows
        const deleteQuery = `DELETE FROM data;`;

        // Execute the SQL statement to delete all rows
        await client.query(deleteQuery);
        console.log('All rows deleted from table.');

    } catch (err) {
        console.error('Error deleting rows:', err.stack);
    }
}

// Function to fetch all records from the table
async function fetchAllRecords() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL RDS!');

        // Define the SQL statement to fetch all records
        const fetchQuery = `SELECT * FROM data;`;

        // Execute the SQL statement to fetch all records
        const res = await client.query(fetchQuery);
        console.log('Fetched records:', res.rows);

        return res.rows; // Return the fetched records

    } catch (err) {
        console.error('Error fetching records:', err.stack);
    }
}

// Example Usage

async function main() {
    // await createTable();

    // Insert multiple values
    const records = [
        { device: "CPU222#ADC222#CH12", value: 3.42, time: "2024-08-25T16:50:29Z" },
        { device: "CPU223#ADC223#CH13", value: 5.67, time: "2024-08-26T16:50:29Z" },
        { device: "CPU224#ADC224#CH14", value: 7.89, time: "2024-08-27T16:50:29Z" }
    ];
    await insertMultipleValues(records);

    // Fetch all records
    await fetchAllRecords();

    // Delete all rows (if needed)
    await deleteAllRows();
}

main().catch(err => {
    console.error('Error in main execution:', err.stack);
}).finally(() => {
    console.log('Completed')
    client.end(); // Ensure the client is always ended
});
