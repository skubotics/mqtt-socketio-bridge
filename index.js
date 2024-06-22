var mqtt = require('mqtt');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var cors = require('cors');

// Port that the web server should listen on
var port = process.env.PORT || 3000;

// MQTT Broker URL
var MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://13.235.151.163";

// MQTT Topic to listen to
var MQTT_TOPIC = process.env.MQTT_TOPIC || "test";

// MQTT Client
var client = mqtt.connect(MQTT_BROKER);
client.on('connect', function () {
    console.log("Connected to " + MQTT_BROKER);
    client.subscribe(MQTT_TOPIC, function (err) {
        if (!err) {
            console.log("Subscribed to topic: " + MQTT_TOPIC);
        } else {
            console.error("Failed to subscribe to topic: " + MQTT_TOPIC, err);
        }
    });
});

client.on('message', function (topic, payload) {
    if (topic === MQTT_TOPIC) {
        console.log("Received message on topic: " + topic);
        console.log("Message payload: " + payload.toString());

        const incomingData = payload.toString();
        const lastHyphenIndex = incomingData.lastIndexOf('-');
        const base = incomingData.substring(0, lastHyphenIndex);
        const values = incomingData.substring(lastHyphenIndex + 1);
        const valuesList = values.split(',');
        const result = valuesList.map((value, index) => `${base}-CH${index + 1}-${value}`);

        io.emit('mqtt', { 'topic': topic, 'payload': payload.toString(), 'data': JSON.stringify(result) });
    }
});

// Socket.IO Handling
io.on('connection', function (sock) {
    console.log("New connection from " + sock.id);

    sock.on('disconnect', function () {
        console.log("Socket disconnected: " + sock.id);
    });
});

// Static file handling
app.use(express.static('static_files'));

// Use Cors
app.use(cors({
    origin: '*'
}));

app.get('/', function (req, res) {
    res.sendFile(__dirname + "/static_files/mqtt-watcher.html");
});

// Start server
http.listen(port, function () {
    console.log("Server listening on port " + port);
});
