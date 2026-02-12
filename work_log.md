# Sequential Comic Server - Work Log

## February 12, 2026: Architectural Refactor & Tail Customization

### Core Engine & Architecture
- **Standardized Layout System**: Implemented a global `views/layouts/main.ejs` shell and shared partials (`head.ejs`, `header.ejs`) across all main views (Viewer, Library, Dashboard, Login).
- **Dashboard Modularization**: Reorganized the dashboard into a "Studio" architecture. Created `views/dashboard/studio/` to house editor-specific CSS and JS, improving maintainability and reducing file clutter.
- **Preview Shell Isolation**: Decoupled the Visual Editor's iframe content into `views/preview-shell/`, clearly separating the "editor UI" from the "content being edited."
- **Asset Loading Optimization**: Standardized on the `Utility.js` loading pattern for CSS and JS. Removed redundant `loadScript` calls in favor of clean ESM imports, resolving 404 errors and initialization conflicts.

### Visual Engine Improvements
- **Natural Sizing**: Removed `max-width` and `min-width` constraints from Speech Bubbles and Text Blocks, allowing them to scale naturally based on dialogue length.
- **Dynamic Tail Skew**: 
    - Introduced the `--tail-skew` CSS variable for granular control over tail lean.
    - Refactored `SpeechBubble.css` to support container-level skew inheritance for both organic and system (rigid) tails.
    - Updated `SpeechBubble.js` and `SceneManager.js` to pass and apply `tailSkew` options from scene data.
- **Scene Editor UI**: Added a "Tail Skew" property field to the Scene Editor, allowing creators to precisely adjust the tail's point-of-origin (e.g., `-30deg`, `10deg`).

### Git & Sync
- **History Management**: Successfully pushed the heavy initial commit and subsequent refactors to GitHub (`chefbennyj1/Sequential`).
- **Path Integrity**: Verified and corrected all relative import paths following the directory reorganization.

---

## February 9, 2026: UI Polish & Layout Expansion

### Visual Transitions & Animation
- **Zoom-Blur Effect**: Implemented a cinematic transition system using zoom-scroll-in and zoom-scroll-out keyframes. 
- **Page Manager Hook**: Refactored PageManager.js to apply the leaving class to old pages. Implemented an 800ms delay to allow exit animations to complete before DOM purging.
- **CSS Standardization**: Synchronized page.css and keyframes.css across the engine and layout roots to ensure consistent animation behavior.

### Layout Expansion
- **Grid_4_Right_Span**: Created a new mirrored layout (Grid_4_Right_Span.html) featuring a tall vertical strip on the right side with a 2x2 grid on the left.

### Data & Structure (Pending)
- **Chapter 1 Restructuring**: Plan to insert a new page5 by shifting all subsequent pages (page5 -> page6, etc.) and cloning the configuration from page4.

---

## February 8, 2026: Project Initialization & Core Refactor

### Engine Optimization (The "Stripped Down" Refactor)
- **FFmpeg Removal**: Completely stripped fluent-ffmpeg and video streaming logic (streamVideo.js, etc.) from the server to create a lean, sequential-focused engine.
- **Library Porting**: Restored critical layout templates and CSS from the "New Site" project to enable structural rendering.
- **Service Restoration**: Fixed broken frontend module imports by porting missing public services (e.g., AudioStateManager.js).

### Authentication & Account Security
- **Session Standardization**: Fixed a critical bug where session variables were mismatched. Standardized on req.session.userId across the stack.
- **Admin Scaffolding**: Created api/createAdmin.js to initialize the database with a default administrator account.
- **Dashboard UX**: Restored the clickable user profile menu in the sidebar with Account and Logout options.

### Library & Scanner
- **Root Management**: Registered E:\Comic Series as the primary external library root.
- **No_Overflow Indexing**: Successfully scanned and cached 4 chapters of the "No_Overflow" series into the local MongoDB.
- **Atomic Page Insertion**: Created api/insertPage7.js to handle automatic folder shifting and page re-indexing for Chapter 1.

---

## Visual Design & Layouts

### Speech Bubble Redesign (Super Bubble v2.0)
- **Boxy Aesthetic**: Replaced the previous oval bubbles with a wobbly, rectangular hand-drawn shape using complex border-radii.
- **Stable Tails**: Re-implemented the "Legacy Border-Triangle" method for tails to ensure they "just fit" without scaling or distortion issues.
- **Inker's Weight**: Increased the main border weight to 3px and thickened the wobbly layers for a bold, graphic look.
- **Layering & Alignment**: 
    - Forced text to the highest z-index (20) to prevent tails or borders from overlapping words.
    - Fixed top-right and bottom-right tail alignment/anchoring.
    - Adjusted tail offsets to tuck them correctly into the new boxy frame.
- **Typography**: Scaled down font-sizes across Bubbles, TextBlocks, and Layouts for a tighter, professional comic feel.

### New Layouts
- **Grid_ZigZag_2x2**: Created a new staggered layout where panels 1a+1b and 2b+2c are combined into wide banner-style frames.

---

## Performance & Stability

### Intelligent Preloading (Sliding Window)
- **Memory Management**: Refactored PageManager.js to implement a "Sliding Window" strategy.
- **Behavior**: The engine now loads the Current, Previous, and Next pages simultaneously.
- **Purging**: As the user scrolls, pages outside of this 3-page window are automatically unloaded and purged from memory to prevent browser lag.
- **Cache Busting**: Enabled forceReload for CSS assets to ensure UI tweaks are visible immediately during development.

### Data Processing
- **Frame Extraction**: Created and executed api/extract_last_frames.js to automatically organize backup videos into folders and extract their final frames as JPEG covers.

### Git Configuration
- **Repository Setup**: Fixed the remote origin URL to point to chefbennyj1/Sequential.git.
- **Ignore Rules**: Updated .gitignore to strictly exclude .env, node_modules, and all large video formats.