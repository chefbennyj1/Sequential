/**
 * renderLayoutPreview.js
 *
 * Renders a layout template on its own - no server, no session, no MongoDB -
 * and reports what the browser actually laid out. Built for the angled
 * clip-path layouts, where the difference between correct and nearly correct
 * is a few pixels of gutter that no amount of squinting at a live page will
 * settle.
 *
 * Two outputs, and the second one is the point:
 *
 *   1. A screenshot at the true 6.625:10.25 page box, with labelled
 *      placeholder art in every panel the template declares. The art is a
 *      framed card reading "full frame" with corner ticks, so whatever
 *      object-fit crops away is visible as a missing edge.
 *   2. A table of each panel's measured box as a percentage of the page.
 *      Comparing that against the numbers written in the template comment is
 *      what catches a corner that was shifted in the wrong direction.
 *
 * Usage:
 *   node utils/renderLayoutPreview.js                        list templates
 *   node utils/renderLayoutPreview.js 6_Panel                render to 6_Panel.png
 *   node utils/renderLayoutPreview.js 6_Panel out/six.png    render to a path
 *
 * See "Angled Layout Templates" in Agents.md for the construction method these
 * previews are used to verify.
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const repoRoot = path.resolve(__dirname, "..");
const layoutsDir = path.join(repoRoot, "Library", "layouts");
const portraitDir = path.join(layoutsDir, "portrait");
const baseCssPath = path.join(layoutsDir, "styles", "base-comic-layout.css");

const PAGE_RATIO = 6.625 / 10.25;

/**
 * Placeholder artwork: a framed card with corner ticks and a large label.
 * If the frame or the ticks are missing in the render, object-fit cropped
 * them - which is the signal that a panel's box is a poor fit for its shape.
 */
function placeholderArt(label, hue) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
    <rect width="800" height="1200" fill="hsl(${hue},45%,32%)"/>
    <rect x="14" y="14" width="772" height="1172" fill="none" stroke="hsl(${hue},70%,78%)" stroke-width="16"/>
    <g stroke="hsl(${hue},70%,78%)" stroke-width="10">
      <path d="M14 120 H140 M14 1080 H140 M660 120 H786 M660 1080 H786"/>
    </g>
    <text x="400" y="640" font-family="Arial" font-size="300" font-weight="bold"
      fill="hsl(${hue},80%,88%)" text-anchor="middle">${label}</text>
    <text x="400" y="760" font-family="Arial" font-size="70"
      fill="hsl(${hue},70%,80%)" text-anchor="middle">full frame</text>
  </svg>`;
    return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

function listTemplates() {
    if (!fs.existsSync(portraitDir)) return [];
    return fs.readdirSync(portraitDir)
        .filter(f => f.endsWith(".html"))
        .map(f => f.replace(".html", ""));
}

async function render(templateName, outPath) {
    const templatePath = path.join(portraitDir, `${templateName}.html`);

    if (!fs.existsSync(templatePath)) {
        console.error(`[RenderLayoutPreview] No such template: ${templateName}`);
        console.error(`[RenderLayoutPreview] Available: ${listTemplates().join(", ")}`);
        process.exitCode = 1;
        return;
    }
    if (!fs.existsSync(baseCssPath)) {
        console.error(`[RenderLayoutPreview] Missing base stylesheet: ${baseCssPath}`);
        process.exitCode = 1;
        return;
    }

    // The template's @import is server-relative (/layouts/...), which resolves
    // to nothing when the file is loaded standalone. Inline it instead.
    const baseCss = fs.readFileSync(baseCssPath, "utf8");
    const template = fs.readFileSync(templatePath, "utf8").replace(
        /@import\s+url\(['"]\/layouts\/styles\/base-comic-layout\.css['"]\);/,
        baseCss
    );

    const html = `<html><head><style>
      html,body{margin:0;height:100%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;}
    </style></head><body>${template}</body></html>`;

    const browser = await puppeteer.launch({ headless: "new" });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: "networkidle0" });

        const panels = await page.evaluate(() => {
            const ids = [];
            document.querySelectorAll(".panel").forEach(el => {
                const cls = [...el.classList].find(c => /^panel-[A-Za-z0-9]+$/.test(c));
                if (cls) ids.push(cls.replace("panel-", ""));
            });
            return ids;
        });

        if (panels.length === 0) {
            console.warn(`[RenderLayoutPreview] ${templateName} declares no .panel-X elements`);
        }

        for (let i = 0; i < panels.length; i++) {
            const hue = Math.round((360 / Math.max(panels.length, 1)) * i + 205) % 360;
            await page.evaluate((id, src) => {
                const el = document.querySelector(`.panel-${id}`);
                if (el) el.innerHTML = `<img src="${src}">`;
            }, panels[i], placeholderArt(panels[i], hue));
        }

        // Let layout and decode settle before measuring or capturing
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

        const target = await page.$(".section-container.page");
        if (!target) {
            console.error("[RenderLayoutPreview] Template has no .section-container.page root");
            process.exitCode = 1;
            return;
        }

        fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
        await target.screenshot({ path: outPath });

        const geometry = await page.evaluate(() => {
            const pageRect = document.querySelector(".section-container.page").getBoundingClientRect();
            const rows = [];
            document.querySelectorAll(".panel").forEach(el => {
                const cls = [...el.classList].find(c => /^panel-[A-Za-z0-9]+$/.test(c));
                const r = el.getBoundingClientRect();
                rows.push({
                    panel: cls,
                    "left %": +((r.left - pageRect.left) / pageRect.width * 100).toFixed(2),
                    "top %": +((r.top - pageRect.top) / pageRect.height * 100).toFixed(2),
                    "width %": +(r.width / pageRect.width * 100).toFixed(2),
                    "height %": +(r.height / pageRect.height * 100).toFixed(2)
                });
            });
            return { w: pageRect.width, h: pageRect.height, rows };
        });

        console.log(`[RenderLayoutPreview] ${templateName} -> ${outPath}`);
        console.log(`[RenderLayoutPreview] panels: ${panels.join(", ") || "none"}`);
        console.log(`[RenderLayoutPreview] page box ${Math.round(geometry.w)} x ${Math.round(geometry.h)} ` +
            `(ratio ${(geometry.w / geometry.h).toFixed(4)}, expected ${PAGE_RATIO.toFixed(4)})`);
        console.table(geometry.rows);
        console.log("[RenderLayoutPreview] Compare these against the box table in the template comment.");
    } finally {
        await browser.close();
    }
}

const templateName = process.argv[2];
const outPath = process.argv[3] || `${templateName}.png`;

if (!templateName) {
    console.log("[RenderLayoutPreview] Usage: node utils/renderLayoutPreview.js <Template_Name> [out.png]");
    console.log(`[RenderLayoutPreview] Templates:\n  ${listTemplates().join("\n  ")}`);
    process.exit(0);
}

render(templateName, outPath).catch(err => {
    console.error("[RenderLayoutPreview] Render failed:", err.message);
    process.exit(1);
});
