var mqtt = require('mqtt')
var express = require('express')
var app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)

// Port that the web server should listen on
var port = process.env.PORT || 3000;

// MQTT Broker URL
var MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://13.235.151.163"

// Match MQTT topics with possible wildcards
var topicMatch = function(topic1, topic2) {
    var matchStr = topic1.replace(/#/g, ".*")
    return (topic2.match("^" + matchStr + "$") != null)
}

// MQTT Client
var client = mqtt.connect(MQTT_BROKER)
client.on('connect', function() {
    console.log("Connected to " + MQTT_BROKER);
})

client.on('message', function(topic, payload) {
    console.log("Received message on topic: " + topic);
    console.log("Message payload: " + payload.toString());
    Object.keys(io.sockets.adapter.rooms).map(function(room_name) {
        if (topicMatch(room_name, topic)) {
            var subscriberCount = Object.keys(io.sockets.adapter.rooms[room_name].sockets).length;
            console.log("Broadcasting to " + subscriberCount + " subscriber(s) in topic: " + room_name);
            for (var clientId in io.sockets.adapter.rooms[room_name].sockets) {
                io.sockets.connected[clientId].emit('mqtt', { 'topic': topic, 'payload': payload.toString() })
            }
        }
    })
})

// Socket.IO Handling
io.sockets.on('connection', function(sock) {
    console.log("New connection from " + sock.id);

    sock.on('subscribe', function(msg) {
        console.log("Subscription requested for topic: " + msg.topic);
        if (msg.topic !== undefined) {
            sock.join(msg.topic);
            var subscriberCount = io.sockets.adapter.rooms[msg.topic] ? io.sockets.adapter.rooms[msg.topic].length : 0;
            console.log(subscriberCount + " subscriber(s) now listening to " + msg.topic);
            if (subscriberCount === 1) {
                client.subscribe(msg.topic);
            }
        }
    })

    sock.on('publish', function(msg) {
        console.log("Publishing message to topic [" + msg.topic + "] with payload >>" + msg.payload + "<<");
        client.publish(msg.topic, msg.payload)
    })

    sock.on('disconnect', function(reason) {
        console.log("Socket disconnected: " + sock.id);
        for (var sub in client._resubscribeTopics) {
            if (!io.sockets.adapter.rooms[sub]) {
                console.log("No more subscribers for topic: " + sub + ", unsubscribing.");
                client.unsubscribe(sub);
            }
        }
    })
})

// Static file handling
app.use(express.static('static_files'))

// Routes
app.get('/dashboard', function(req, res) {
    res.sendFile(__dirname + "/static_files/mqtt-socket.html")
})

app.get('/', function(req, res) {
    res.sendFile(__dirname + "/static_files/mqtt-watcher.html")
})

// Start server
http.listen(port, function() {
    console.log("Server listening on port " + port);
})
