require('dotenv').config();
const AWS = require('aws-sdk');
const { Client } = require('pg');

// Configure the AWS SDK with the appropriate region and credentials
const rds = new AWS.RDS({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_ACCESS_SECRET,
    region: process.env.AWS_REGION
});

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
        const createTableQuery1 = `
            CREATE TABLE IF NOT EXISTS data (
                id SERIAL PRIMARY KEY,
                device VARCHAR(20) NOT NULL,
                value NUMERIC(10, 3) NOT NULL,
                time TIMESTAMPTZ NOT NULL
            );
        `;

        const createTableQuery2 = `
            CREATE TABLE IF NOT EXISTS axledata (
                id SERIAL PRIMARY KEY,
                device VARCHAR(20) NOT NULL,
                value VARCHAR NOT NULL,
                time TIMESTAMPTZ NOT NULL
            );
        `;

        // Execute the SQL statement to create the table
        await client.query(createTableQuery2);
        console.log('Table "data" created successfully.');

    } catch (err) {
        console.error('Error creating table:', err.stack);
    }
}

// Function to insert multiple rows into the table
async function insertMultipleValues(records) {
    try {
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

async function countAllRecords() {
    try {
        // Define the SQL statement to count all records
        const countQuery = `SELECT COUNT(*) AS total FROM data;`;

        // Execute the SQL statement to count all records
        const res = await client.query(countQuery);
        const totalCount = res.rows[0].total; // Get the total count from the result

        console.log('Total records:', totalCount);

        return totalCount; // Return the total count

    } catch (err) {
        console.error('Error counting records:', err.stack);
    }
}


async function alterColumnValueToVarchar() {
    try {
        // Define the SQL statement to alter the column type
        const alterQuery = `ALTER TABLE data ALTER COLUMN value TYPE VARCHAR(6);`;

        // Execute the SQL statement to alter the column type
        await client.query(alterQuery);
        console.log('Column "value" altered to VARCHAR successfully.');

    } catch (err) {
        console.error('Error altering column:', err.stack);
    }
}

async function calculateTableSize() {
    try {
        // Define the SQL statement to calculate the size of the table
        const sizeQuery = `SELECT pg_size_pretty(pg_table_size('data')) AS size;`;

        // Execute the SQL statement to calculate the table size
        const res = await client.query(sizeQuery);
        const tableSize = res.rows[0].size; // Get the table size from the result

        console.log('Table size:', tableSize);

        return tableSize; // Return the table size

    } catch (err) {
        console.error('Error calculating table size:', err.stack);
    }
}

async function getTotalRDSAllocatedStorage() {
    try {
        const dbInstanceIdentifier = process.env.RDS_ENTITY;
        const params = { DBInstanceIdentifier: dbInstanceIdentifier };
        const data = await rds.describeDBInstances(params).promise();
        const allocatedStorage = data.DBInstances[0].AllocatedStorage; // In GB
        console.log('Total Allocated Storage (GB):', allocatedStorage);
        return allocatedStorage;
    } catch (err) {
        console.error('Error fetching RDS allocated storage:', err.stack);
    }
}

async function getRDSUsedStorage() {
    try {
        const dbInstanceIdentifier = process.env.RDS_ENTITY;
        const params = { DBInstanceIdentifier: dbInstanceIdentifier };
        const data = await rds.describeDBInstances(params).promise();

        const allocatedStorage = data.DBInstances[0].AllocatedStorage; // In GB

        // Query to get the total database size
        const totalDatabaseSizeQuery = `
            SELECT pg_size_pretty(pg_database_size(current_database())) AS used_space;
        `;

        const res = await client.query(totalDatabaseSizeQuery);
        const usedSpace = res.rows[0].used_space; // This will be in a human-readable format

        console.log('Used Storage:', usedSpace);

        // Since the `used_space` from `pg_database_size` might be in a human-readable format (e.g., '32 MB'),
        // you might need to parse it if you want to compare it numerically with `allocatedStorage`.

        // Example (simple parsing might be necessary):
        const usedSpaceInGB = parseFloat(usedSpace) / 1024; // This assumes usedSpace is returned in MB

        console.log('Used Storage (GB):', usedSpaceInGB);

        // Calculate free space
        const freeSpaceInGB = allocatedStorage - usedSpaceInGB;

        console.log('Free Storage (GB):', freeSpaceInGB);

        return {
            usedSpace: usedSpaceInGB,
            freeSpace: freeSpaceInGB
        };
    } catch (err) {
        console.error('Error calculating RDS used storage:', err.stack);
    }
}


// Main function to orchestrate the operations
async function main() {
    try {
        await client.connect(); // Connect to the database once

        // Create the table
        await createTable();

        // Insert multiple values
        // const records = [
        //     { device: "CPU222#ADC222#CH12", value: 3.42, time: "2024-08-25T16:50:29Z" },
        // ];
        // await insertMultipleValues(records);

        // Fetch all records
        // await fetchAllRecords();

        // Optionally delete all rows
        // await deleteAllRows();

        // await alterColumnValueToVarchar();

        // await countAllRecords();
        // await calculateTableSize();
        // await getTotalRDSAllocatedStorage();
        // await getRDSUsedStorage();

    } catch (err) {
        console.error('Error in main execution:', err.stack);
    } finally {
        await client.end(); // Ensure the client is always ended
    }
}

// Run the main function
main();
