# Sequential Comic Server - Engine & Architecture Guide (GEMINI.md)

This document provides system-level documentation, a structural code map, and operational guides for the Sequential Comic Server. Refer to this document to understand the codebase layout, data models, viewer rendering flow, and export pipelines.

---

## 1. System Architecture Overview

The Sequential Comic Server is a Node.js Express application backed by MongoDB. It provides an atomic page-oriented framework for reading, editing, and publishing digital comics. 

Key architectural layers:
1. **Core Web Server (`server.js`):** Entry point setting up Express middleware, static directories, WebSocket (Socket.io) channels, and MongoDB database connections.
2. **REST API (`api/` & `routes/`):** Exposes endpoints for authentication, asset upload, dashboard editing, page scaffolding, and PDF/PNG exports.
3. **Dynamic View Engine (`views/`):** Incorporates EJS templates for the public viewer, dashboard studio, and page editor.
4. **Headless Render System (`controllers/ExportController.js`):** Launches Puppeteer to render visual pages at high resolution (300 DPI with trim bleed) and export them as PNG/PDF assets.
5. **Vision AI Pipeline (`services/gemini/`):** Hashing and Gemini Flash/Pro integrations for automated panel metadata generation.

---

## 2. Directory Code Map (Token-Efficient)

```text
E:\Sequential Comic Server\
├── api/                       # API Route Handling and Initializations
│   ├── api.js                 # API route declarations & middleware routing
│   └── scanLibrary.js         # Core filesystem scanning & database sync logic
├── authentication/            # User Registration & Login Flow controllers
├── controllers/               # Business Logic Controllers
│   ├── AssetUploadController.js  # Image upload, panel cropping, & flipping logic
│   ├── ExportController.js       # Puppeteer automation & PDF compilation
│   ├── LibraryController.js      # Series and Volume metadata query routes
│   ├── MediaController.js        # Dynamic image and page-specific asset serving
│   ├── PageDataController.js     # DB reading/writing of page.json cue files
│   ├── PageStructureController.js# Operations for page insertion, shifting, and reordering
│   └── UserController.js         # Admin & Moderator account management
├── Library/                   # System-level Layout Templates
│   └── layouts/               # Comic book structural blueprints
│       ├── portrait/          # HTML structures of panels (e.g. Two_Col_Sidebar.html)
│       └── styles/            # Layout base styling (base-comic-layout.css)
├── middleware/                # Route security and permissions checking
│   └── auth.js                # Session validation & export bypass rules
├── models/                    # Mongoose Data Models
│   ├── LibraryRoot.js         # Root directory definitions for series scans
│   ├── Series.js              # Comic Series configurations and custom CSS mapping
│   └── Volume.js              # Volume definition, Chapter collections, & Page schema
├── routes/                    # EJS Page Router Configurations
│   ├── content.js             # Middleware-secured library routes
│   └── routes.js              # Landing, Dashboard, and Reader route definitions
├── services/                  # Business Domain Services
│   ├── public/                # Client-Side Service Scripts
│   │   ├── PageManager.js     # Orchestrates reader transitions and preloading
│   │   └── SceneManager.js    # Renders panels, masks, and text cues
│   ├── VolumeService.js       # File-shifting on page insert & bulk syncs
│   └── gemini/                # Google Gemini Vision integrations
├── utils/                     # Script-to-PDF converters and helpers
└── views/                     # UI Templates (EJS & Static Assets)
    ├── dashboard/             # Dashboard, Studio Layouts, and Story Critic UI
    ├── public/                # Static libraries and utilities
    └── reader/                # Comic book reader views (Reader UI and Viewer)
```

---

## 3. Database Schema & Filesystem Sync Flow

The database stores metadata pointers and caches layout details from local `page.json` configuration files.

### Data Relationships
* **Series:** References multiple **Volumes**. Contains general layout styles (bubble fonts, sizes, narrator background/borders) and custom CSS paths.
* **Volume:** References the parent Series and contains an embedded array of **Chapters**.
* **Chapter:** Embedded subdocument under Volume. Contains an index array of **Pages**.
* **Page Schema:** Caches page config:
  * `index` (Number)
  * `path` (String relative path to `page.json`)
  * `layout`: `{ id, html, css }`
  * `header`: Direct cache of page configuration headers
  * `mediaData`: Image assets mapped to specific panel CSS classes
  * `sceneData`: Speech bubbles, dialogue cues, and sound effects

### Synchronization Sequence (`api/scanLibrary.js` + `services/VolumeService.js`)
1. Scanner reads subdirectories under active `LibraryRoot` paths.
2. Identifies Series directories containing `Volumes/volume-N/chapter-X/pageY/` folders.
3. Performs auto-scaffolding if `page.json`, `page.js`, or `page.css` are missing.
4. Reads each `page.json` from the disk and populates the Volume chapter array.
5. Saves state to MongoDB to align database lookups with current disk folders.

---

## 4. Comic Viewer Layout & Rendering System

The reader mounts and initializes comic pages dynamically within a sliding window.

### Viewer Initiation (`views/reader/viewer/index.ejs`)
1. Client fetches chapter data using `fetchChapterData(volumeId, chapterNumber)` from `/api/volume/...`.
2. Groups pages into spreads (unless running in `exportSecret` mode, which forces single-page layout blocks).
3. Creates a `.master-stage` container inside the DOM for each page slot.
4. Instantiates `PageManager` with the page collections.

### Sliding Preload Window (`services/public/PageManager.js`)
* Dynamically manages DOM content for `[Previous, Current, Next]` pages.
* Purges pages outside this window to keep browser memory usage low.
* Uses `loadSection()` to resolve the page's HTML structure:
  1. Resolves template path: `/layouts/portrait/${layoutId}.html`.
  2. Injects the HTML template into the target `.page-cell` or `.master-stage`.
  3. Loads page-specific CSS: `${pagePath}/page.css`.
  4. Bypasses database cache and parses raw filesystem state by running `init(container, pageInfo)` from `libs/pageInitializer.js`.
  5. Imports and executes `onPageLoad(container, pageInfo)` from `${pagePath}/page.js`.

---

## 5. Print Exporter Pipeline

The print exporter automates high-resolution PNG page renders and compiles them into a unified PDF.

### Processing Steps (`controllers/ExportController.js`)
1. Reads all chapters and page directories for the targeted Volume on disk.
2. Filters out placeholder pages that have no media or scene cue objects.
3. Launches a headless Puppeteer browser using `--disable-web-security` (to prevent CORS blocks on local resources).
4. Sets the viewport to preset dimensions (e.g. US Portrait: `2058x3146` pixels, incorporating 3mm bleed margins).
5. For each page in the list, navigates to:
   `/viewer?series={series}&volume={volume}&chapter={chapter}&page={page}&exportSecret={secret}&mode=portrait`
6. Waits for `window.renderComplete === true` (client-side images loaded).
7. Calls `_injectPrintStyles` inside the Puppeteer execution context.

### Styling Injection (`_injectPrintStyles`)
* **Hides UI Controls:** Hides navigation overlays, buttons, debug layers, and standard readers headers.
* **Sets Bleed Stage:** Wraps the active stage in `#print-stage-black` with custom dimensions.
* **Calculates Scale Factor:** Dynamically calculates:
  `scaleFactor = viewportH / 1080`
* **Scales CSS Styles:** Scales speech bubble fonts, paddings, borders, action text limits, and layout margins proportionally.
* **Padding Margin:** Uses `safePadding = Math.round(10 * scaleFactor)` to maintain a tight, consistent gutter around the edge of the printed sheet.
* **Captures Screenshot:** Takes a viewport-only PNG and saves to `Print_Exports/{Volume}_Book_Pages/{Preset}/`.

---

## 6. Vision Scan & Hashing System

Automates analysis of panel contents while preventing redundant API queries.

### MD5 Hashing Verification
To avoid rescanning unchanged images, the system compares the `imageHash` stored in `page.json` with the raw file bytes on disk.
```javascript
const crypto = require('crypto');
const fs = require('fs');
const hash = crypto.createHash('md5').update(fs.readFileSync(imagePath)).digest('hex');
```
* **Quick Scanner Mode:** Loops through page folders and updates missing or outdated `imageHash` fields in `page.json` without querying Gemini.
* **Full Scanner Mode:** Sends new/mismatched image arrays to Gemini to obtain descriptions, alt tags, and hashtags. It bypasses files matched in `.gemmaignore` configurations.

---

## 7. Developer Standards for Future Coding Agents
* **Flat Code Execution:** Use guard clauses at the beginning of functions to handle fallback conditions and prevent nested conditional statements.
* **Style Segregation:** Avoid inline styles. Place custom dashboard and story editor formatting in standalone CSS modules.
* **Tone & Interactions:** Keep console outputs descriptive and direct. Never use emojis in code, commits, or technical comments.
