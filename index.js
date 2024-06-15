var mqtt = require('mqtt')
var express = require('express')
var app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)

// Port that the web server should listen on
var port = process.env.PORT || 3000;

// Enter details of the MQTT broker that you want to interface to
var MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://13.235.151.163"

var topicMatch = function(topic1, topic2) {
        var matchStr = topic1.replace(/#/g, ".*")
        return (topic2.match("^"+matchStr+"$") != null)
}

var client = mqtt.connect(MQTT_BROKER)
client.on('connect', function() {
        console.log("Connected to "+MQRS.T_BROKER);
})

client.on('message', function(topic, payload) {
        console.log("topic: "+topic)
        console.log("payload: "+payload)
        Object.keys(io.sockets.adapter.rooms).map(function(room_name) {
                if (topicMatch(room_name, topic)) {
                        var subscriberCount = Object.keys(io.sockets.adapter.rooms[room_name].sockets).length;
                        console.log("Broadcasting to "+subscriberCount+" subscribers in topic: " + room_name);
                        for (var clientId in io.sockets.adapter.rooms[room_name].sockets) {
                                io.sockets.connected[clientId].emit('mqtt', { 'topic': topic, 'payload': payload.toString() })
                        }
                }
        })
})

io.sockets.on('connection', function(sock) {
        console.log("New connection from "+sock.id)

        sock.on('subscribe', function(msg) {
                console.log("Asked to subscribe to "+msg.topic)
                if (msg.topic !== undefined) {
                        sock.join(msg.topic)
                        if (io.sockets.adapter.rooms[msg.topic].length == 1) {
                                console.log("First subscriber for topic: "+msg.topic);
                                client.subscribe(msg.topic)
                        }
                        else {
                                var subscriberCount = io.sockets.adapter.rooms[msg.topic].length;
                                console.log(subscriberCount+" total subscribers for topic: "+msg.topic);
                        }
                }
        })

        sock.on('publish', function(msg) {
                console.log("socket published ["+msg.topic+"] >>"+msg.payload+"<<")
                client.publish(msg.topic, msg.payload)
        })

        sock.on('disconnect', function(reason) {
                console.log("disconnect from "+sock.id)
                for (var sub in client._resubscribeTopics) {
                        if (io.sockets.adapter.rooms[sub] == undefined) {
                                console.log("Unsubscribing from "+sub)
                                client.unsubscribe(sub)
                        }
                }
        })
})

app.use(express.static('static_files'))

app.get('/dashboard', function(req, res) {
        res.sendFile(__dirname+"/static_files/mqtt-socket.html")
})

app.get('/', function(req, res) {
        res.sendFile(__dirname+"/static_files/mqtt-watcher.html")
})

http.listen(port, function() {
        console.log("listening on "+port)
})
