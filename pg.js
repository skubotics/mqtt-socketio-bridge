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

client.connect()
    .then(() => console.log('Connected to PostgreSQL RDS!'))
    .catch(err => console.error('Connection error', err.stack));