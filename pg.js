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
        let pattern = /^CPU\d+#ADC\d+#(((-?\d+(\.\d+)?|[Xx]),)*(-?\d+(\.\d+)?|[Xx]))#(\d{4}-\d{2}-\d{2})#(\d{2}:\d{2}:\d{2})$/;

        if (pattern.test(incomingData)) {
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
                ${documents.map(record => `('${record.device}', ${record.value}, '${record.time}')`).join(', ')}
            `;

            try {
                await client.query(insertQuery);
                console.log("Data inserted into PostgreSQL");
            } catch (err) {
                console.error("Failed to insert data into PostgreSQL", err);
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
    try {
        const deleteQuery = `DELETE FROM data;`;
        const result = await client.query(deleteQuery);
        console.log(`${result.rowCount} rows were deleted`);
        res.send(`${result.rowCount} rows were deleted`);
    } catch (err) {
        console.error("Error deleting rows:", err);
        res.status(500).send("Failed to delete rows");
    }
});

app.post('/history', async (req, res) => {
    const deviceIds = req.body.deviceIds;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 30;
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    if (!deviceIds || deviceIds.length === 0) {
        return res.status(400).send("No device IDs provided.");
    }

    const offset = (page - 1) * limit;

    try {
        // Construct the WHERE clause based on optional parameters
        let whereConditions = [];
        if (deviceIds.length > 0) {
            whereConditions.push(`device IN (${deviceIds.map(id => `'${id}'`).join(', ')})`);
        }
        if (startDate) {
            whereConditions.push(`time >= '${startDate.toISOString()}'`);
        }
        if (endDate) {
            whereConditions.push(`time <= '${endDate.toISOString()}'`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Define the SQL statement to fetch records with pagination
        const fetchQuery = `
        SELECT device, time, value
        FROM data
        ${whereClause}
        ORDER BY device ASC, time DESC
        LIMIT $1 OFFSET $2;
      `;

        // Execute the SQL statement to fetch records
        const { rows: records } = await client.query(fetchQuery, [limit, offset]);

        // Group records by device
        const groupedRecords = records.reduce((acc, record) => {
            if (!acc[record.device]) {
                acc[record.device] = [];
            }
            acc[record.device].push({ time: record.time, value: record.value });
            return acc;
        }, {});

        // Create response ensuring all requested devices are included
        const response = deviceIds.map(deviceId => ({
            device: deviceId,
            data: groupedRecords[deviceId] || []
        }));

        res.json(response);
    } catch (err) {
        console.error("Error fetching data from PostgreSQL:", err);
        res.status(500).send("Failed to retrieve data");
    }
});

http.listen(port, function () {
    console.log("Server listening on port " + port);
});
