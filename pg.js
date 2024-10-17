require('dotenv').config();
const mqtt = require('mqtt');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client } = require('pg');

const port = process.env.PORT;
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_TOPIC = process.env.MQTT_TOPIC;

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

const mqttClient = mqtt.connect(MQTT_BROKER);
mqttClient.on('connect', function () {
    console.log("Connected to " + MQTT_BROKER);
    mqttClient.subscribe(MQTT_TOPIC, function (err) {
        if (!err) {
            console.log("Subscribed to topic: " + MQTT_TOPIC);
        } else {
            console.error("Failed to subscribe to topic: " + MQTT_TOPIC, err);
        }
    });
});

mqttClient.on('message', async function (topic, payload) {
    if (topic === MQTT_TOPIC) {

        incomingData = payload.toString();
        let pattern1 = /^CPU\d+#ADC\d+#(((-?\d+(\.\d+)?|[Xx]),)*(-?\d+(\.\d+)?|[Xx]))#(\d{4}-\d{2}-\d{2})#(\d{2}:\d{2}:\d{2})$/;
        let pattern2 = /^AXEL#(.*?)(#\d{4}-\d{2}-\d{2}#\d{2}:\d{2}:\d{2})$/;

        if (pattern1.test(incomingData)) {
            const [cpu, adc, values, date, time] = incomingData.split('#');
            const valuesList = values.split(',');
            const result = [];
            const documents = [];

            valuesList.forEach((value, index) => {
                result.push(`${cpu}#${adc}#CH${index + 1}#${value}#${date}T${time}Z`);
                documents.push({
                    device: `${cpu}#${adc}#CH${index + 1}`,
                    value: value,
                    time: `${date}T${time}Z`
                });
            });

            io.emit('mqtt', { 'topic': topic, 'payload': incomingData, 'data': JSON.stringify(result) });

            const insertQuery = `
                INSERT INTO data (device, value, time)
                VALUES
                ${documents.map(record => `('${record.device}', '${record.value}', '${record.time}')`).join(', ')}
            `;

            try {
                await client.query(insertQuery);
                // console.log("Data inserted into PostgreSQL");
            } catch (err) {
                console.error("Failed to insert data into PostgreSQL => ".insertQuery, err);
            }
        } else if (pattern2.test(incomingData)) {
            // Split the incoming data based on the '#'
            const [_, middleData, dateTime] = incomingData.split('#');
            const [date, time] = dateTime.split('#'); // Split to get date and time

            // Use the fixed device value
            const defaultDevice = 'CPU9#ADC1#CH1';

            // The value will be the middle data, which can be anything
            const result = [];
            const documents = [];

            // Split the middleData by commas for multiple entries
            const valuesList = middleData.split(',');

            // Process each value
            valuesList.forEach((value) => {
                result.push(`${defaultDevice}#${value}#${date}T${time}Z`);
                documents.push({
                    device: defaultDevice,
                    value: value,
                    time: `${date}T${time}Z`
                });
            });

            // Emit the data
            io.emit('mqtt', { 'topic': topic, 'payload': incomingData, 'data': JSON.stringify(result) });

            // Create the insert query
            const insertQuery = `
                INSERT INTO axledata (device, value, time)
                VALUES
                ${documents.map(record => `('${record.device}', '${record.value}', '${record.time}')`).join(', ')}
            `;

            // Execute the insert query
            try {
                await client.query(insertQuery);
                // console.log("Data inserted into PostgreSQL");
            } catch (err) {
                console.error("Failed to insert data into PostgreSQL => ", insertQuery, err);
            }
        } else {
            io.emit('mqtt', { 'topic': topic, 'payload': incomingData });
        }
    }
});

io.on('connection', function (sock) {
    console.log("New connection from " + sock.id);

    sock.on('disconnect', function () {
        console.log("Socket disconnected: " + sock.id);
    });
});

app.use(express.static('static_files'));

app.use(cors({
    origin: '*'
}));

app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.sendFile(__dirname + "/static_files/mqtt-watcher.html");
});

app.delete('/cleardb', async (req, res) => {
    const deviceParam = req.query.device; // Get the device parameter from the query
    const devices = deviceParam ? decodeURIComponent(deviceParam).split('#') : []; // Decode and split using #

    if (devices.length === 0) {
        return res.status(400).send("No devices specified for deletion.");
    }

    try {
        // Create a parameterized query to avoid SQL injection
        const deleteQuery = `DELETE FROM data WHERE device = ANY($1::text[])`;
        const result = await client.query(deleteQuery, [devices]);

        console.log(`${result.rowCount} rows were deleted for devices: ${devices.join(', ')}`);

        if (result.rowCount > 0) {
            res.status(200).send(`${result.rowCount} rows were deleted`);
        } else {
            res.status(204).send(); // No Content
        }
    } catch (err) {
        console.error("Error deleting rows:", err);
        res.status(500).send("Failed to delete rows");
    }
});

app.post('/history', async (req, res) => {
    const { deviceIds, page = 1, limit = 30, startTime, endTime } = req.body;

    if (!deviceIds || deviceIds.length === 0) {
        return res.status(400).send("No device IDs provided.");
    }

    try {
        // Construct the base query
        let query = `
            SELECT device, time, value
            FROM data
            WHERE device = ANY($1)
        `;

        // Add date filtering if provided
        const values = [deviceIds];
        if (startTime && endTime) {
            query += ` AND time BETWEEN $2 AND $3`;
            values.push(new Date(startTime), new Date(endTime));
        } else if (startTime) {
            query += ` AND time >= $2`;
            values.push(new Date(startTime));
        } else if (endTime) {
            query += ` AND time <= $2`;
            values.push(new Date(endTime));
        }

        // Add sorting
        query += ` ORDER BY device ASC, time DESC`;

        // Execute the query
        const result = await client.query(query, values);

        // Group results by device and paginate in JavaScript
        const groupedData = {};
        result.rows.forEach(row => {
            if (!groupedData[row.device]) {
                groupedData[row.device] = [];
            }
            groupedData[row.device].push({ time: row.time, value: row.value });
        });

        // Apply pagination to each device's data
        const records = Object.keys(groupedData).map(device => ({
            device: device,
            data: groupedData[device].slice((page - 1) * limit, page * limit)
        }));

        res.json(records);
    } catch (err) {
        console.error("Error fetching data from PostgreSQL:", err);
        res.status(500).send("Failed to retrieve data");
    }
});

// experimental for axle data
app.delete('/axle-cleardb', async (req, res) => {
    try {
        // Create a DELETE query to remove all rows from the axledata table
        const deleteQuery = `DELETE FROM axledata`;
        const result = await client.query(deleteQuery);

        // Log the result
        console.log(`${result.rowCount} rows were deleted from axledata`);

        // Send a response
        if (result.rowCount > 0) {
            res.status(200).send(`${result.rowCount} rows were deleted from axledata`);
        } else {
            res.status(204).send(); // No Content
        }
    } catch (err) {
        console.error("Error deleting rows in axledata:", err);
        res.status(500).send("Failed to delete rows");
    }
});

app.post('/axle-history', async (req, res) => {
    const { deviceIds, page = 1, limit = 30, startTime, endTime } = req.body;

    if (!deviceIds || deviceIds.length === 0) {
        return res.status(400).send("No device IDs provided.");
    }

    try {
        // Construct the base query
        let query = `
            SELECT device, time, value
            FROM axledata
            WHERE device = ANY($1)
        `;

        // Add date filtering if provided
        const values = [deviceIds];
        if (startTime && endTime) {
            query += ` AND time BETWEEN $2 AND $3`;
            values.push(new Date(startTime), new Date(endTime));
        } else if (startTime) {
            query += ` AND time >= $2`;
            values.push(new Date(startTime));
        } else if (endTime) {
            query += ` AND time <= $2`;
            values.push(new Date(endTime));
        }

        // Add sorting
        query += ` ORDER BY device ASC, time DESC`;

        // Execute the query
        const result = await client.query(query, values);

        // Group results by device and paginate in JavaScript
        const groupedData = {};
        result.rows.forEach(row => {
            if (!groupedData[row.device]) {
                groupedData[row.device] = [];
            }
            groupedData[row.device].push({ time: row.time, value: row.value });
        });

        // Apply pagination to each device's data
        const records = Object.keys(groupedData).map(device => ({
            device: device,
            data: groupedData[device].slice((page - 1) * limit, page * limit)
        }));

        res.json(records);
    } catch (err) {
        console.error("Error fetching data from PostgreSQL for AXLE:", err);
        res.status(500).send("Failed to retrieve data for AXLE");
    }
});

// experimental for axle data


http.listen(port, function () {
    console.log("Server listening on port " + port);
});
