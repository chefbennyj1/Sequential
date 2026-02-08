// Server Entry Point
require('dotenv').config();
const express = require('express'); //server
const bcrypt = require('bcryptjs'); //password encryption
const path = require('path'); //files paths
const session = require('express-session'); //current session data
const MongoDbSession = require('connect-mongodb-session')(session); //DB
const mongoose = require('mongoose'); //DB interface
const fs = require('fs'); //file system
const mime = require('mime-types'); //ensure proper mime types
const sharp = require('sharp'); //image editing
const os = require('os');

const app = express();

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
  useUnifiedTopology: true
}).then((res) => {
  console.log('mongoDb Connected');
})

const store = new MongoDbSession({
  uri: mongoDbURI,
  collection: 'VeilSessions'
})

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

  if (req.session.userId) {
    try {
      res.locals.user = await User.findById(req.session.userId);
    } catch (e) {
      console.error("User lookup failed:", e);
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
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

// Main Site Routes (Must be before content routes to handle /library/series/...)
app.use("/", siteRoutes);

// IMPORTANT: Dynamic routes for library assets
app.use('/Library', isAuth, contentRoutes);
app.use('/Library', isAuth, express.static(path.join(__dirname, 'Library')));

app.use("/authentication", authRoutes);
app.use("/api", apiRoutes);


const PORT = 3000;
var hostname = getLocalIPv4();
app.listen(PORT, () => {
  console.log(`Website running on http://${hostname}:${PORT}`);
});

VolumeSync.updateVolumesFromFS();
// Optionally, schedule updates every 5 minutes
setInterval(() => {
  VolumeSync.updateVolumesFromFS();
}, 5 * 60 * 1000);

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  const allAddrs = Object.values(interfaces).flat();
  const ipv4 = allAddrs.find(
    (iface) => iface.family === 'IPv4' && !iface.internal
  );
  return ipv4 ? ipv4.address : 'localhost';
}