# Oshima City / No://Overflow - HTML Hierarchy & Scaffolding

This document maps the structural hierarchy of the Oshima City engine to assist in the transition from `innerHTML` to `document.createElement`.

## 1. Global Layout (`views/shared/layouts/main.ejs`)
The shell for all pages in the application.

- `body`
    - `<header>` (`views/shared/partials/header.ejs`)
    - `<main id="main-content">`
        - `<%- body %>` (Injection point for Viewer or Dashboard)

---

## 2. Dashboard Hierarchy (`views/dashboard/dashboard.html`)
A single-page application (SPA) structure using hidden sections.

- `<aside class="sidebar">` (Global Navigation)
- `<main class="main-content">`
    - `<header class="topbar">`
    - `div.studio.dashboard-section` (The main Hub)
        - `div.global-settings`
        - `div.mode-card` (Grid of tools)
    - `div.page-builder.dashboard-section`
        - `div#pageBuilderModeSelection`
        - `div#createPageContainer`
        - `div#editPageContainer`
            - `div#activePageToolbar` (Loaded after selecting a page)
    - `div.layout-editor.dashboard-section` (The Visual Editor)
        - `div.editor-container`
            - `div.preview-pane` -> `iframe#pagePreviewFrame`
            - `div.tools-pane` (Panel controls)
    - `div.scene-editor.dashboard-section` (The Timeline)
        - `div.editor-container`
            - `div.scene-tree-pane` -> `ul#sceneTreeList`
            - `div.scene-props-pane` -> `form#sceneItemForm`

---

## 3. Viewer Hierarchy (`views/reader/viewer/index.ejs`)
The comic reading engine.

- `div.scroll-wrapper` (The infinite/scrolling container)
    - `section.scroll-section.page-container` (One per page)
        - `div.spread-wrapper` (Only in Spread Mode)
            - `div.page-inner-container` (The actual page shell)
                - `[INJECTED LAYOUT HTML]` (From `Library/layouts/`)
                    - `div.section-container` (The layout root)
                        - `div.panel.panel-X` (The comic panels)
                            - `img` or `video` (The content)
                            - `div.speech-bubble-container` (Injected by SpeechBubble.js)
                            - `div.text-block-container` (Injected by TextBlock.js)

---

## 4. Component Scaffolding (Dynamic)

### Speech Bubble (`libs/SpeechBubble/SpeechBubble.js`)
- `div.speech-bubble-container`
    - `div.super-bubble`
        - `span.speech-text`
        - `div.tail-container`
            - `div.tail-shape`

### Text Block (`libs/TextBlock/TextBlock.js`)
- `div.text-block-container`
    - `div.text-block.[type]` (Narrator, Dialogue, etc.)

---

## 5. Refactor Priority List
1.  **SpeechBubble.js**: High complexity, high risk of XSS.
2.  **TextBlock.js**: High frequency usage.
3.  **VisualEditorManager.js**: Complex UI rendering.
4.  **StoryCritic.js**: Large markdown-to-HTML conversion.
