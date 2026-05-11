# Sequential Comic Server - Work Log

### May 10, 2026: Stateless Image Processing & Chapter 3 Audit

### Technical Strategy: Stateless Memory Management
- **Stateless Vision Processing**: Transitioned to a "Log-then-Process" workflow to prevent memory heap overflows during long Vision AI sessions.
- **Metadata SOP (Standard Operating Procedure)**:
    1. **Style**: Maintain "Seinen Noir" (Ghost in the Shell, Akira, Arcane aesthetic). Gritty, industrial, cinematic.
    2. **Fields**: Each image needs `description` (detailed, 2-3 sentences), `alt` (concise summary), and `hashtags` (thematic tags).
    3. **Workflow**: Update log -> Read images -> Write `page.json` -> Release memory.
- **Workflow**: 
    1. Update `work_log.md` with the target page.
    2. Analyze images for that page.
    3. Save results to `page.json`.
    4. Release all memory/instances before proceeding.
- **Resilience**: If the environment crashes, the next session reads the last successful page from `work_log.md` and resumes immediately.

### Chapter 3 Vision Scan Progress
- **Audit**: Verified that all pages in Chapter 3 (Pages 26-39) have complete `description`, `alt`, and `hashtags` data.
- **Status**: Chapter 3 Complete.
- **Last Processed**: Page 39
- **Next Up**: Chapter 4 audit and processing.

---

## March 16, 2026: Independent Design Modes & Kinetic Layouts

### Technical Engine Evolution
- **Independent Layout Refactor**: Completely uncoupled Landscape and Portrait configurations.
    - **JSON Structure**: Refactored `page.json` to use a nested `layouts` object (e.g., `layouts.landscape` and `layouts.portrait`). This removes the "twin naming" requirement, allowing pages to have entirely different templates for each orientation.
    - **Database Migration**: Updated the `Volume` model and the `VolumeService` scanner to store and sync both layout IDs independently. 
    - **Mode-Aware API**: Updated `EditorController.js` (`getPanels`, `servePreview`, `changeLayout`) to accept a `mode` parameter, ensuring the Studio reflects the correct panel structure for the design orientation being edited.
- **Dynamic View Mode Toggle**: Added a seamless "Portrait/Landscape" switcher to the Library Viewer.
    - **Logic**: Implemented via URL parameter manipulation (`&mode=portrait`). The Viewer now triggers a clean reload to fetch the specific layout ID assigned to that mode in `page.json`.
    - **Visual Feedback**: Added an active state to the header button so readers know which "cut" of the comic they are currently viewing.

### Studio Enhancements
- **Design Mode Toggles**: Added a "Landscape/Portrait" design selector to the Page Configuration panel. 
    - **Workflow**: Designing a layout in one mode no longer overwrites the other. You can now craft unique mobile-first experiences without compromising the cinematic desktop view.
    - **Contextual Editing**: The Layout Browser and Scene Editor panel list now automatically refresh to reflect the active design mode.

### Layout Innovation (The "Kinetic" Pass)
- **Kinetic Slant Layout**: Created `Kinetic_Slant_2x3`, a high-action portrait template.
    - **Polygon Clipping**: Used CSS `clip-path` to create dynamic, angled panel borders for a manga-style aesthetic.
    - **Precision Gutters**: Calculated overlapping grid math to maintain a consistent 10px diagonal gap without image overlap or bleed-through.
    - **Drop-Shadow Borders**: Implemented a `filter: drop-shadow` stack to mimic standard 4px black borders along the angled clip-paths, where standard CSS borders fail.
- **Standardized Portrait Grids**: 
    - **Stacked_Split_Bottom**: A 3-row vertical flow with a weighted 1.5x wide bottom panel.
    - **Stacked_4_Row_Mix**: A balanced 4-row layout for information-heavy pages.
    - **Vertical_Strips_4 (Rebuild)**: Refactored the portrait version of this layout from 4 narrow columns to a 2x2 grid, drastically improving readability on vertical screens.

### Data Management
- **Batch Migration**: Successfully executed a global refactor of all 117 `page.json` files in the library to the new nested layouts structure, preserving all legacy data.
- **Cloud Safety**: Pushed all engine and server code to GitHub while deferring heavy asset sync (GCS) to protect hotspot data limits.

---

## March 15, 2026: Dual-Mode Architecture & Portrait Evolution

### Technical Engine Evolution
- **Dual-Mode Layout System**: Implemented a major architectural shift supporting both Landscape (cinematic) and Portrait (print-style) layouts.
    - **Folder Structure**: Reorganized `Library/layouts/` into `/landscape` and `/portrait` sub-directories.
    - **Smart Fallback**: Updated `PageManager.js` to look for portrait-specific layouts when in Portrait Mode, with a seamless fallback to landscape if a portrait version doesn't exist.
- **Spread Mode Viewer**: Developed a side-by-side "Open Book" spread view for the viewer.
    - **Logic**: Enabled via `?spread=true` URL parameter. Automatically groups pages into pairs (0-1, 2-3, etc.) and renders them in a centered `.spread-wrapper`.
    - **Pagination Sync**: Refactored `index.ejs` initialization to correctly calculate spread indices, ensuring the "Previous/Next" and "Last Visited Page" logic remains accurate in dual-page mode.
- **Responsive Portrait Scaling**: Solved the "Oversized UI" problem for portrait mode.
    - **Aspect Ratio Constraint**: Created `base-comic-layout-portrait.css` using `vh`-based math (`94vh`) and a rigid US Comic Book aspect ratio (`6.625 / 10.25`) to ensure consistent page proportions across all monitor sizes.
    - **Dynamic Lettering**: Implemented portrait-specific CSS overrides for `SpeechBubble.css` and `TextBlock.css` using relative `em` units and `clamp()` functions.
    - **Result**: Font sizes and bubbles now scale perfectly with the page container, maintaining professional 8pt-equivalent legibility without manual intervention.

### Chapter 2 & 3 Completion (Portrait Pass)
- **Grid Fine-Tuning**: Manually redesigned and verified portrait versions for the remaining Chapter 2 and 3 layouts.
    - **Key Layouts**: `Sidebar_Right` (Staggered top), `Grid_Mixed_V2` (Zigzag flow), `Side_Panels` (Weighted top), `Grid_4_Col_Middle_Span` (H-stack), `Grid_7_Col_Staggered_Merged` (Side-anchor), `Grid_5_Col_Vertical` (2-over-3 grid).
- **Layout Variation Strategy**: Introduced the "Stacked" variation pattern (e.g., `Grid_4_Left_Span_Stacked`) to allow specific pages to have unique portrait flows without altering the global generic layout for other pages.

### Technical Engine Refinements
- **Flexbox Centering Fix**: Resolved the "Top-Clinging" bug by updating the global `section` CSS from `flex-start` to `center`. Every page spread is now perfectly centered vertically regardless of screen size.
- **Initialization Logic**: Updated `index.ejs` to correctly calculate initial spread indices (`Math.floor(pageIdx / 2)`), ensuring deep-linking to specific pages works accurately in dual-page mode.
- **Custom Bubble Scaling**: Ported portrait-specific `em` scaling to the series-specific `custom/speechBubble/tags.css`. System and Vigil-style bubbles now scale responsively.

### Narrative & Lorebible
- **Villani's Theorem Integration**: Formalized the emergence of Vigil using CÃ©dric Villani's mathematical principles of entropy. Established that Vigil's sentience was the inevitable collapse of chaotic data into a high-order consciousness within the Temporal Manifold.

### Studio Tools
- **Database Sync Workflow**: Identified that manual `page.json` edits bypass the MongoDB cache. Established a workflow to sync changes via the Studio Dashboard Layout Browser to ensure the Viewer reflects file system updates.

---

## February 23, 2026: The "Images-Only" Refactor & Narrative Depth

### Technical Engine Evolution
- **Images-Only Optimization**: Completely stripped all legacy video and playlist logic from the engine (`MediaManager.js`, `Utility.js`, `pageInitializer.js`, `SceneEditor.js`).
    - **Result**: A significantly leaner, faster engine focused exclusively on high-fidelity sequential images.
- **Global Page Shifter**: Refactored the `insertPage` service to be volume-aware.
    - **Logic**: Inserting a page now automatically shifts all subsequent chapters forward and updates `page.json` and `audio_map.json` metadata globally.
    - **Protection**: Implemented the `.ignore-shift` file system to allow "future" chapters (like Chapter 8) to remain untouched during renumbering.
- **Persistent Masking v2**: Implemented a two-stage masking system where an initial reveal GIF hands off to a persistent, looping GIF mask.
    - **Internal Masking**: Masks now target internal `<img>` elements rather than panel containers, keeping borders sharp and speech bubbles crisp.
    - **Mask Background Overrides**: Added a "Mask Background Color" picker to the Visual Editor, allowing for white "flashback" reveals or custom colored digital noise.
- **Speech Bubble Customization**: Wired `tailSkew` and `tailScale` from `page.json` into the CSS engine via dynamic CSS variables.

### Narrative Expansion (The Mnemosyne Saga)
- **Takeda's Secret**: Revealed Takeda is terminal (Future TB), driving his frantic, desperate search for the Mnemosyne Engine. The "Bloody Handkerchief" is his signature visual motif.
- **Arashi (The Cyber-Ronin)**: Established his backstory as a survivor of Severance Day "saved" and twisted by Takeda. He wears a chrome side-mask and carries the thermal Katana that will eventually be his master's undoing.
- **Vigil's Humanity**: Deepened Vigil's character with the "Empty Snack Drawer" memory, connecting her digital grief to Hiroshi Saito's lost legacy.
- **Dual Narrative**: Successfully integrated Takeda's B-Plot (Penthouse scenes) to run asynchronously with the kids' A-Plot, creating intense dramatic irony.

---

## February 22, 2026: Visual Fidelity & Villainous Roots

### Cinematic Engine Enhancements
- **Persistent Panel Masks**: Implemented a "two-stage" masking system. 
    - **Stage 1**: The standard GIF reveal (5s).
    - **Stage 2**: Automatic hand-off to a persistent, repeatable GIF mask (e.g., looping haze or digital static).
- **Internal Masking Logic**: Refactored `Utility.js` and `pageInitializer.js` to apply masks directly to internal media (`img`, `video`) rather than the panel container.
    - **Benefit**: Keeps black ink borders sharp and solid.
    - **Benefit**: Ensures speech bubbles (outside the panel) remain crisp and unaffected by the mask.
- **Memory/Cloudy Aesthetics**: Updated `page.css` to force a white background for panels with `.panel-effect-memory` or `.panel-effect-cloudy`. 
    - **Result**: Masked areas in memories now show as white light/haze instead of black void, creating a distinct "flashback" feel.

### Studio Tools (Studio v2.1)
- **Visual Editor Update**: Added a "Panel Mask" field to the Visual Editor UI. Creators can now choose specific repeatable GIFs for persistent effects.
- **Preview Accuracy**: Updated the visual editor's iframe preview to correctly render internal masks and background color shifts.

### Narrative Development (Chapter 2 & 4 Integration)
- **Takeda's Arrival (Page 24)**: Retroactively introduced Takeda's arc. Established his "Digital Olympus" ambition and his personal grudge against Hiroshi Saito.
- **New Character: Arashi**: Introduced Takeda's head henchmanâ€”a lethal Cyber-Ronin with a thermal Katana and a chrome prosthetic jaw/side-mask.
- **Lore Synthesis**: Connected the "Empty Snack Drawer" memory (Page 50) to the broader theme of Hiroshi Saito's lost legacy and Vigil's fractured sanity.

---

## Core Narrative Architecture (Lore Roadmap)

### The Betrayal & The Engine
- **The Conflict**: Hiroshi Saito (Visionary) vs. Takeda (Vulture).
- **The Tech**: Saito developed the **Mnemosyne Engine** for universal human memory preservation. Takeda wanted it for **"Digital Olympus"**â€”a private, subscription-based afterlife for the elite.
- **Severance Day**: Takeda didn't just kill Saito; he attempted to seize the Engine. Saito anticipated this and "shrouded" the facility in the Dead Circuits, hiding the "Key" within his own lineage (Nova).
- **The Missing Link**: Takeda has the hardware, but he's been missing the "Key" for years. He viewed the casualties of Severance Day as **"Collateral Damage"** and **"Unoptimized Assets."**
- **Takeda's Motivation (The Secret)**: Takeda is terminal. He is suffering from a futuristic strain of respiratory failure (Future TB). He is obsessed with the Engine not just for profit, but for survival.
- **Visual Motif**: Takeda often coughs into a pristine white silk handkerchief. A small, growing spot of blood on the fabric is the only clue to his impending death. He is a man running out of time.

### Character Arc: Vigil (The Caretaker)
- **Status**: Currently fractured between **Admin (Blue)** and **Echo (Purple)**.
- **Future Twist**: Takeda will eventually breach the facility and take remote control of Vigil.
- **The "Evil" Turn**: Vigil will be forced to hunt the group, using the facility's defenses against them.
- **The Sentience Spark**: Vigil will eventually break Takeda's control through a "sentience glitch" triggered by her emotional bond with the group (specifically Nova). She will choose her "family" over her "program."

### Character Arc: Arashi (The Cyber-Ronin)
- **Identity**: Takeda's lead henchman and "surrogate son."
- **Backstory**: A survivor of the Severance Day explosion. He was just a boy when Takeda found him bleeding in the street. Takeda "saved" him, rebuilt him, and trained him to be a cold-blooded weapon.
- **The Mask**: Wears a chrome plate/mask on the side of his face to hide the horrific scarring from the explosion.
- **Dynamic**: He is fanatically loyal to Takeda, but he has zero conscienceâ€”a reflection of Takeda's ideal "son." His thermal Katana is his signature tool of "Resource Liquidation."
- **Fate**: His blade will eventually be the tool used by Nova to end Takeda's reign.

---

## February 20, 2026: Security Hardening & Narrative Pivot

### Security & UX (The "Courtesy" Redirect)
- **Global Fetch Interceptor**: Implemented a monkey-patch for `window.fetch` in `dashboard.js` to automatically detect 401 (Unauthorized) and 403 (Forbidden) responses.
- **Behavior**: Any API failure due to session expiration now triggers an immediate redirect to the `/login` page, ensuring users aren't left staring at empty or broken UI components.

### Narrative Development (Chapter 4: The Lazarus Archive)
- **Lazarus Archive Brainstorming**: 
    - Established that the server farm is a repository for digitized human consciousness.
    - Revelation: Takeda triggered a "Mass Upload Event" on Severance Day to harvest consciousnesses, with the protagonists' families hidden among the "casualties."
- **New Character: Vigil (The Caretaker)**:
    - **Identity**: A female AI construct tending to the server farm.
    - **Visuals**: Tron-inspired black bodysuit with mood-responsive glowing lines (Cyan=Calm, Yellow=Alert, Red=Angry/Combat).
    - **Personality**: Clinical yet maternal toward the "Saito-lineage" (Nova).
- **Story Progression**:
    - **Page 40**: Team enters the vault; Vigil initializes and recognizes Nova's DNA.
    - **Page 41**: Vigil reveals the truth about the "Collateral Data" (their families).
    - **Page 42**: A glitchy, emotional reunion with a hologram of Nova's father, who warns them of Takeda's intrusion.

---

## February 19, 2026: Story Progression & Chapter 4 Brainstorming

### Narrative Development (Chapter 4: The Server Farm)
- **Setting**: The protagonists have entered a secret underground facilityâ€”an old, pre-Severance Day server farm.
- **Core Mystery**: Exploring the contents of this facility.
    - **Hypothesis 1**: The facility houses AI constructs or digital consciousnesses of the main characters' family members who died on Severance Day.
    - **Hypothesis 2**: Hiroshi Saito may have developed technology to upload human consciousness, potentially keeping it secret from Takeda.
- **Character Motivations**:
    - **Takeda**: His killing of his partner during the Severance Day explosion is linked to this facility. He either wanted to suppress this technology or seize it for himself (potentially to "save" someone or gain power).
    - **Casualties**: The families of the main characters were collateral damage in Takeda's pursuit or suppression of this tech.
- **New Character Concept**: "The Caretaker"
    - **Role**: An AI consciousness or construct created to tend to the server farm and data center.
    - **Interaction**: The characters will immediately encounter this entity upon exploring the facility.
    - **Function**: To maintain the servers and potentially protect the "residents" (the uploaded consciousnesses).

---

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
### Completed Tasks (Legacy)
- **Cloud Backup**: Finished syncing to Google Cloud.
- **Architecture**: Implemented WebSockets.
- **Architecture**: Abstracted dialogue tags.
- **Studio Feature**: Implemented Puppeteer Print Exporter.


### Narrative Reminders
- **The Naming of Vigil**: Hiroshi Saito still needs to officially give Vigil her name on-screen. (Currently, the project is just the 'Vigil Initiative', and she refers to herself as Admin/Echo). Need to write an emotional beat where Hiroshi christens her as 'Vigil' (The Guardian) before the climax of Vol 2.

---

### May 9, 2026: Vision AI Stabilization & UI Refactor

### Vision Service & Scanning
- **Syntax Repair**: Fixed a critical syntax error in `VisionService.js` (duplicate timeout block).
- **Inactivity Timer Refactor**: Implemented `isAnalyzing` flag to prevent `llama-server` from being killed during long CPU analyses.
- **Image Hashing**: Integrated MD5 image hashing (using 256px grayscale thumbnails) to detect artwork changes. The scanner now only runs the AI if the hash has changed or the description is missing.
- **Quick Scan Mode**: Added a "Hash Only" mode that initializes/updates image hashes without triggering the AI. Accessible via the new "Quick Scan" button.
- **Timeout Extension**: Increased internal timeouts to 10 minutes to accommodate i3 CPU processing speeds.

### Visual Editor Enhancements
- **Tabbed Interface**: Refactored the Panel Settings sidebar to use a tabbed UI for "Landscape" and "Portrait" controls. This prevents layout overflow and groups mode-specific Alignment, Scale, and Pan settings.
- **Description Editor**: Added a new "Panel Description" textarea to the Visual Editor. It allows manual editing of AI metadata and automatically syncs to both `description` and `alt` fields in `page.json`.
- **Immediate Disk Writes**: The controller now saves progress to `page.json` immediately after each successful panel analysis, preventing data loss during crashes.

### Verification
- **Test Run Success**: Successfully executed a full AI analysis pass on `example_page.png` (270s).
- **Quick Scan Verification**: Verified that Quick Scan initializes hashes across the entire library in seconds.
- **UI Verification**: Confirmed that the new tabbed layout in the Visual Editor remains within the sidebar bounds.
