const mqtt = require('mqtt');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const cors = require('cors');
const bodyParser = require('body-parser');

const { MongoClient, ServerApiVersion } = require('mongodb');
const moment = require('moment-timezone');

const port = process.env.PORT || 3000;
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://13.235.151.163";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "test";
const uri = "mongodb+srv://streetjerk:iOmabKFeDS11jYqs@rail.qgm5ln9.mongodb.net/?retryWrites=true&w=majority&appName=rail";

const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectMongoDB() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB!");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}
connectMongoDB();

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
    let pattern = /^CPU\d+#ADC\d+#(-?\d+(\.\d+)?,)*(-?\d+(\.\d+)?)#(\d{4}-\d{2}-\d{2})#(\d{2}:\d{2}:\d{2})$/;

    if (pattern.test(incomingData)) {
      const [cpu, adc, values, date, time] = incomingData.split('#');
      const valuesList = values.split(',');
      const result = [];
      const documents = [];

      valuesList.forEach((value, index) => {
        result.push(`${cpu}#${adc}#CH${index + 1}#${value}`);
        documents.push({
          device: `${cpu}#${adc}#CH${index + 1}`,
          value: value,
          time: `${date}T${time}Z`
        })
      });

      io.emit('mqtt', { 'topic': topic, 'payload': incomingData, 'data': JSON.stringify(result) });

      const db = mongoClient.db("test");
      const collection = db.collection("test");

      try {
        await collection.insertMany(documents);
        console.log("Data inserted into MongoDB");
      } catch (err) {
        console.error("Failed to insert data into MongoDB", err);
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
    const db = mongoClient.db("test");
    const collection = db.collection("test");
    const result = await collection.deleteMany({});
    console.log(`${result.deletedCount} documents were deleted`);
    res.send(`${result.deletedCount} documents were deleted`);
  } catch (err) {
    console.error("Error deleting documents:", err);
    res.status(500).send("Failed to delete documents");
  }
});

app.post('/history', async (req, res) => {
  const deviceIds = req.body.deviceIds;

  if (!deviceIds || deviceIds.length === 0) {
    return res.status(400).send("No device IDs provided.");
  }

  try {
    const db = mongoClient.db("test");
    const collection = db.collection("test");

    const records = await collection.aggregate([
      { $match: { device: { $in: deviceIds } } },
      { $sort: { device: 1, time: -1 } },
      {
        $group: {
          _id: "$device",
          data: { $push: { time: "$time", value: "$value" } }
        }
      },
      {
        $project: {
          _id: 0,
          device: "$_id",
          data: { $slice: ["$data", 30] }
        }
      }
    ]).toArray();

    res.json(records);
  } catch (err) {
    console.error("Error fetching data from MongoDB:", err);
    res.status(500).send("Failed to retrieve data");
  }
});

http.listen(port, function () {
  console.log("Server listening on port " + port);
});
