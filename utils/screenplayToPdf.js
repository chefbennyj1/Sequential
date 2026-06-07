const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function convertToPdf(txtPath, pdfPath) {
    console.log(`[PDF] Converting ${txtPath} to ${pdfPath}...`);

    try {
        const content = fs.readFileSync(txtPath, 'utf8');
        
        // Wrap in professional screenplay-style HTML/CSS
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12pt;
                    line-height: 1.2;
                    margin: 0;
                    padding: 1in;
                    background: white;
                    color: black;
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                }
                .page-header {
                    text-align: center;
                    border-bottom: 2px solid #333;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                }
                .chapter-title {
                    text-align: center;
                    font-weight: bold;
                    text-decoration: underline;
                    margin-top: 40px;
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="page-header">
                NO OVERFLOW<br>
                SCREENPLAY EXPORT
            </div>
            <pre>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
        </html>
        `;

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlContent);
        
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            margin: {
                top: '1in',
                right: '1in',
                bottom: '1in',
                left: '1in'
            },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: '<div style="font-family: Courier; font-size: 10px; width: 100%; text-align: center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
        });

        await browser.close();
        console.log(`[PDF] Success! PDF saved to: ${pdfPath}`);
        return true;
    } catch (err) {
        console.error(`[PDF] Error:`, err);
        return false;
    }
}

// Auto-run if executed directly
const input = process.argv[2];
const output = process.argv[3];

if (input && output) {
    convertToPdf(input, output);
}

module.exports = { convertToPdf };
