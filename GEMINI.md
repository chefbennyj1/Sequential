# Project Instructions (GEMINI.md)

## Core Workflow: Vision & Image Hashing

### 1. Image Hashing Logic (Critical)
To prevent redundant AI re-scans, the `imageHash` in `page.json` MUST match the server's internal hash. The server (`services/gemini/GeminiVisionService.js`) generates hashes using the following method:
- **Input:** Raw file bytes (no preprocessing)
- **Algorithm:** MD5
- **Library:** Node.js built-in `crypto`

To generate a matching hash manually:
```js
const crypto = require('crypto');
const fs = require('fs');
const hash = crypto.createHash('md5').update(fs.readFileSync(imagePath)).digest('hex');
```

> **Note:** An earlier version of this spec described a `sharp`-based approach (resize 256x256, grayscale, then MD5).
> That was abandoned due to native segfaults on Windows during bulk scans. The implementation now uses a
> direct raw-file MD5. If you manually set `imageHash` values in `page.json`, use the method above.


### 2. Vision Scanning Workflow
- **Quick Scan:** Updates `imageHash` in `page.json` if missing or mismatched, but DOES NOT trigger AI analysis. Use this to sync the state after manual file changes.
- **Full Scan:** Triggers **Google Gemini 1.5 Flash/Pro** to generate structured metadata.
- **Structured Output:** The scanner now retrieves a JSON object containing:
    - `description`: Detailed narrative description.
    - `alt`: Accessibility text.
    - `hashtags`: Array of thematic tags (e.g., #NoOverflow, #Cyberpunk).
- **Skip Logic:** The scanner respects `.gemmaignore` files at the series root.
- **Manual Overrides:** If you manually write a description, ensure the `imageHash` is correct; otherwise, the scanner might overwrite your manual entry if it thinks the image changed.

## Technical Standards
- **Page Data:** All panel metadata is stored in `page.json` within each page folder.
- **Assets:** Images are stored in `assets/image/` relative to the `page.json`.
- **Nesting:** Avoid 'if soup' by using guard clauses in all JavaScript functions.
- **No Emojis:** Maintain a professional CLI tone in all code and comments.

