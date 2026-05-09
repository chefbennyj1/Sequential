const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * BinaryManager
 * Handles the automatic unpacking of platform-specific tools (like llama-server)
 * from the master resource zips to the working bin directory.
 */
class BinaryManager {
    constructor() {
        this.basePath = path.resolve(__dirname, '..');
        this.resourceDir = path.join(this.basePath, 'resources', 'binaries');
        this.binDir = path.join(this.basePath, 'bin');
        this.platform = process.platform;
        
        // Define what we are looking for to verify "extracted" state
        this.binaries = {
            win32: 'llama-server.exe',
            linux: 'llama-server',
            darwin: 'llama-server'
        };
    }

    async bootstrap() {
        console.log(`[Bootstrap] Checking binary integrity for platform: ${this.platform}...`);
        
        const targetFile = this.binaries[this.platform];
        if (!targetFile) {
            console.warn(`[Bootstrap] No binary definitions for platform ${this.platform}. Skipping.`);
            return;
        }

        const targetPath = path.join(this.binDir, this.platform, targetFile);
        const zipPath = path.join(this.resourceDir, `${this.platform}.zip`);

        // 1. Check if already extracted
        if (fs.existsSync(targetPath)) {
            console.log(`[Bootstrap] ${targetFile} is present and ready.`);
            return;
        }

        // 2. Check if source zip exists
        if (!fs.existsSync(zipPath)) {
            console.error(`[Bootstrap] ERROR: Source archive not found at ${zipPath}`);
            console.error(`[Bootstrap] Please ensure ${this.platform}.zip is in the resources/binaries folder.`);
            return;
        }

        // 3. Unpack
        try {
            const destDir = path.join(this.binDir, this.platform);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            console.log(`[Bootstrap] Unpacking ${this.platform}.zip to ${destDir}...`);
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(destDir, true);
            
            // 4. Apply permissions for Unix-like systems
            if (this.platform !== 'win32') {
                console.log(`[Bootstrap] Setting executable permissions for ${targetFile}...`);
                fs.chmodSync(targetPath, '755');
            }

            console.log(`[Bootstrap] Successfully initialized ${targetFile}.`);
        } catch (err) {
            console.error(`[Bootstrap] FATAL: Failed to unpack binaries:`, err.message);
        }
    }
}

module.exports = new BinaryManager();
