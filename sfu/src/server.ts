import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import colors from "colors";
const mediasoup = require("mediasoup");
import { AwaitQueue } from "awaitqueue";
//Local Imports
import RoomManagement from "./src/RoomManagement";
import { Express } from "express-serve-static-core";
import roomsRoute from "./routes/rooms";

const config = require("./config");
dotenv.config();

const roomManagement = new RoomManagement();

const PORT = process.env.PORT || 8004;

// Express application.
// @type {Function}
let app: Express;
// HTTP server.
// @type {http.Server}
let server: { listen: (arg0: string | number) => void };
//Socket.io Server
let io: { on: (arg0: string, arg1: (socket: any) => void) => void };
// mediasoup Workers.
// @type {Array<mediasoup.Worker>}
const mediasoupWorkers = [];
// Index of next mediasoup Worker to use.
// @type {Number}
let nextMediasoupWorkerIdx = 0;
// Async queue to manage rooms.
// @type {AwaitQueue}
const queue = new AwaitQueue();

//======================================================================================================
//										  Initializing										   |
//======================================================================================================

init();

async function init() {
  console.log("-------------------------------------------------");
  console.log("|          SFU Microservice is running          |");
  console.log("-------------------------------------------------");
  console.log("Environment: ", process.env.NODE_ENV);
  console.log("Running on at:", "http://" + process.env.DOMAIN + ":" + PORT);
  console.log("Listening Ip:", process.env.MEDIASOUP_LISTEN_IP);
  console.log("Announced Ip:", process.env.MEDIASOUP_ANNOUNCED_IP);
  console.log("-------------------------------------------------");
  console.log("|               Initializing...                 |");
  console.log("-------------------------------------------------");
  await initExpress();
  await initSockets();
  // Run a mediasoup Worker.
  await runMediasoupWorkers();

  //Call Server Management api and say the server is up and running.
}

//======================================================================================================
//											Express											   |
//======================================================================================================
async function initExpress() {
  app = express();
  app.use(cors());
  app.use(express.json());
  server = require("http").createServer(app);
  server.listen(PORT);
  attachApiEndpoints();
  console.log("Express server running!");
}

function attachApiEndpoints() {
  app.get("/", function (req, res) {
    res.send("Successfully hit the SFU api!");
  });
  app.use("/rooms", roomsRoute);
  /**
   * Error handler.
   */
  app.use((error: any, req: any, res: any, next: any) => {
    if (error) {
      error.status = error.status || (error.name === "TypeError" ? 400 : 500);

      res.statusMessage = error.message;
      res.status(error.status).send(String(error));
    } else {
      next();
    }
  });
}

//======================================================================================================
//											socket io										   |
//======================================================================================================

async function initSockets() {
  if (process.env.NODE_ENV === "development") {
    io = require("socket.io")(server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });
  } else {
    io = require("socket.io")(server);
  }
  if (io) {
    attachSocketEvents();
  }
  console.log("Socket.io server running!");
}

function attachSocketEvents() {
  io.on("connection", (socket: any) => {
    console.log("a user connected with id", socket.id);
  });
}

//======================================================================================================
//										  Media Soup										   |
//======================================================================================================

/**
 * Launch as many mediasoup Workers as given in the configuration file.
 */
async function runMediasoupWorkers() {
  const { numWorkers } = config.mediasoup;

  console.log("configuring " + numWorkers + " workers");
  for (let i = 0; i < numWorkers; ++i) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.workerSettings.logLevel,
      logTags: config.mediasoup.workerSettings.logTags,
      rtcMinPort: Number(config.mediasoup.workerSettings.rtcMinPort),
      rtcMaxPort: Number(config.mediasoup.workerSettings.rtcMaxPort),
    });

    worker.on("died", () => {
      setTimeout(() => process.exit(1), 2000);
    });

    mediasoupWorkers.push(worker);
  }
}
