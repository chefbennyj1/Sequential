// Server Entry Point
require('dotenv').config();
const express = require('express'); //server
const bcrypt = require('bcryptjs'); //password encryption
const path = require('path'); //files paths
const session = require('express-session'); //current session data
const { MongoStore } = require('connect-mongo'); // New robust DB session store (v6 named export)
const mongoose = require('mongoose'); //DB interface
const fs = require('fs'); //file system
const mime = require('mime-types'); //ensure proper mime types
const sharp = require('sharp'); //image editing
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Make io accessible to our routers/controllers
app.locals.io = io;

io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

const mongoDbURI = 'mongodb://localhost:27017/VeilSite';

const siteRoutes = require("./routes/routes.js");
const authRoutes = require("./authentication/authentication.js");
const apiRoutes = require("./api/api.js");
const contentRoutes = require("./routes/content.js");

const User = require("./models/User.js");
const VolumeSync = require("./services/VolumeSyncService.js")
const { isAuth } = require('./middleware/auth.js');


mongoose.connect(mongoDbURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  socketTimeoutMS: 45000,
}).then(async (res) => {
  console.log('mongoDb Connected');
  
  // Migration: Convert old administrator boolean to new role field
  try {
    const User = require('./models/User.js');
    const result = await User.updateMany(
      { administrator: { $exists: true } },
      [
        { $set: { role: { $cond: { if: { $eq: ["$administrator", true] }, then: "admin", else: "$role" } } } },
        { $unset: "administrator" }
      ]
    );
    if (result.modifiedCount > 0) {
      console.log(`[Migration] Processed ${result.modifiedCount} users: migrated 'administrator' to 'role' and removed legacy field.`);
    }
  } catch (err) {
    console.error("[Migration] Error updating roles:", err);
  }
}).catch(err => {
  console.error("MongoDB Connection Error:", err);
});

// --- CONNECTION EVENT LISTENERS ---
mongoose.connection.on('error', err => {
  console.error('[MongoDB] connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] reconnected');
});

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`[${signal}] Shutting down gracefully...`);
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

const store = MongoStore.create({
  mongoUrl: mongoDbURI,
  collectionName: 'VeilSessions',
  ttl: 24 * 60 * 60, // 24 hours
  autoRemove: 'native',
  crypto: {
    secret: process.env.SESSION_SECRET
  }
});

// --- MIDDLEWARE ---

// 1. Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}))

// 2. Global Locals (Config & User) - MUST BE BEFORE ROUTES
app.use(async (req, res, next) => {
  res.locals.config = {
    useCloudStorage: process.env.USE_CLOUD_STORAGE === 'true',
    gcsBucketName: process.env.GCS_BUCKET_NAME,
    gcsBaseUrl: process.env.GCS_BASE_URL
  };

  res.locals.user = null;

  if (!req.session.userId) {
    return next();
  }

  try {
    res.locals.user = await User.findById(req.session.userId);
  } catch (e) {
    console.error("User lookup failed:", e);
  }

  next();
});

// 3. Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. View Engine
app.set("views", path.join(__dirname, "views"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "ejs");

// 5. Static & Content Serving
app.use('/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/three_jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/views', express.static(path.join(__dirname, 'views')));
app.use('/layouts', express.static(path.join(__dirname, 'Library/layouts')));
app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use('/libs', express.static(path.join(__dirname, 'libs')));
app.use('/services/public', express.static(path.join(__dirname, 'services/public')));
app.use(express.static(path.join(__dirname, "views/public")));

// --- ROUTES ---

app.use("/api", apiRoutes);
app.use("/authentication", authRoutes);

// Main Site Routes (Must be before content routes to handle /library/series/...)
app.use("/", siteRoutes);

// IMPORTANT: Dynamic routes for library assets
app.use('/Library', isAuth, contentRoutes);
app.use('/Library', isAuth, express.static(path.join(__dirname, 'Library')));


const PORT = 3000;
var hostname = getLocalIPv4();
server.listen(PORT, () => {
  console.log(`Website running on http://${hostname}:${PORT}`);
});

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  const allAddrs = Object.values(interfaces).flat();
  const ipv4 = allAddrs.find(
    (iface) => iface.family === 'IPv4' && !iface.internal
  );
  return ipv4 ? ipv4.address : 'localhost';
}

// --- GLOBAL ERROR HANDLERS ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.stack || err);
});
