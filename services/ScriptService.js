const fs = require('fs');
const path = require('path');
const Series = require('../models/Series');

/**
 * ScriptService
 * Generates comprehensive screenplay-style documents from atomic page data.
 */
class ScriptService {
    
    /**
     * Generates a script for an entire volume.
     * @param {string} seriesId - The MongoDB ID of the series.
     * @param {string} volumeFolderName - The folder name of the volume (e.g., 'volume-1').
     */
    static async generateVolumeScript(seriesId, volumeFolderName) {
        const series = await Series.findById(seriesId).populate('libraryRoot');
        if (!series) throw new Error('Series not found');

        let rootPath = series.sourcePath || path.join(series.libraryRoot.path, series.folderName);
        const volumePath = path.join(rootPath, 'Volumes', volumeFolderName);

        if (!fs.existsSync(volumePath)) throw new Error('Volume folder not found');

        let script = `================================================================================\n`;
        script += `SERIES: ${series.title.toUpperCase()}\n`;
        script += `VOLUME: ${volumeFolderName.toUpperCase()}\n`;
        script += `EXPORTED: ${new Date().toLocaleString()}\n`;
        script += `================================================================================\n\n`;

        const chapters = fs.readdirSync(volumePath)
            .filter(d => d.startsWith('chapter-'))
            .sort((a, b) => {
                const numA = parseInt(a.replace('chapter-', '')) || 0;
                const numB = parseInt(b.replace('chapter-', '')) || 0;
                return numA - numB;
            });

        for (const chapter of chapters) {
            const chapterPath = path.join(volumePath, chapter);
            script += `\n\n[ CHAPTER ${chapter.replace('chapter-', '')} ]\n`;
            script += `--------------------------------------------------------------------------------\n`;

            const pages = fs.readdirSync(chapterPath, { withFileTypes: true })
                .filter(d => d.isDirectory() && d.name.startsWith('page'))
                .map(d => d.name)
                .sort((a, b) => {
                    const numA = parseInt(a.replace('page', '')) || 0;
                    const numB = parseInt(b.replace('page', '')) || 0;
                    return numA - numB;
                });

            for (const pageId of pages) {
                const folderPath = path.join(chapterPath, pageId);
                const jsonPath = path.join(folderPath, 'page.json');
                
                if (fs.existsSync(jsonPath)) {
                    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    script += this.formatPage(pageId, data);
                }
            }
        }

        const fileName = `${series.folderName}_${volumeFolderName}_SCREENPLAY.txt`;
        const outputPath = path.join(rootPath, fileName);
        fs.writeFileSync(outputPath, script, 'utf8');

        return { fileName, outputPath };
    }

    /**
     * Formats a single page into screenplay style.
     */
    static formatPage(pageId, data) {
        let output = `\nPAGE: ${pageId.replace('page', '')}\n`;
        
        // --- SLUGLINE GENERATION ---
        let slugline = data.header?.slugline || '';
        
        if (!slugline && data.media && data.media.length > 0) {
            // Attempt to infer slugline from the first panel's description
            const firstDesc = data.media[0].description || '';
            const isExterior = /street|cityscape|skyline|alley|wasteland|outside|exterior|rooftop|sky/i.test(firstDesc);
            const location = firstDesc.match(/(hallway|corridor|office|server room|laboratory|apartment|elevator|room|chamber|deck)/i)?.[0] || 'OSHIMA CITY';
            const timeOfDay = /night|dark|sunset|dusk/i.test(firstDesc) ? 'NIGHT' : 'DAY';
            
            slugline = `${isExterior ? 'EXT.' : 'INT.'} ${location.toUpperCase()} - ${timeOfDay}`;
        }

        output += `${slugline || 'INT. OSHIMA CITY - NIGHT'}\n`;
        
        // Layout Info
        const layoutId = data.header && data.header.layouts && data.header.layouts.landscape 
            ? data.header.layouts.landscape.id 
            : 'Unknown Layout';
        output += `LAYOUT: ${layoutId}\n`;
        output += `................................................................................\n`;

        // Media / Visuals
        if (data.media && data.media.length > 0) {
            output += `VISUALS:\n`;
            data.media.forEach(m => {
                const desc = m.description || m.alt || 'No description available.';
                const type = m.type || 'image';
                const panel = m.panel || '.panel-?';
                output += `  - ${panel}: [${type}]: ${desc}\n`;
            });
            output += `\n`;
        }

        // Scene / Dialogue
        if (data.scene && data.scene.length > 0) {
            output += `SCENE:\n`;
            data.scene.forEach((item, index) => {
                const type = item.displayType ? item.displayType.type : 'Unknown';
                const speaker = item.character ? item.character.toUpperCase() : '???';
                
                if (type === 'SpeechBubble' || type === 'Dialogue' || type === 'InternalMonologue') {
                    const prefix = type === 'InternalMonologue' ? '(Internal) ' : '';
                    output += `\n  ${speaker}\n  ${prefix}${this.cleanText(item.text)}\n`;
                } else if (type === 'Narrator') {
                    output += `\n  [NARRATOR]\n  ${this.cleanText(item.text)}\n`;
                } else if (type === 'SoundEffect') {
                    output += `\n  SFX: ${this.cleanText(item.text)}\n`;
                } else {
                    output += `\n  [${type}] ${this.cleanText(item.text)}\n`;
                }

                // Media Actions during scene
                if (item.mediaAction && item.mediaAction.length > 0) {
                    item.mediaAction.forEach(action => {
                        const panel = action.panel || '.panel-?';
                        const fileName = action.fileName || action.file || 'unknown_asset';
                        const actionType = action.actionType || 'action';
                        output += `  >> MEDIA ACTION: ${panel} -> ${fileName} (${actionType})\n`;
                    });
                }
            });
            output += `\n`;
        } else {
            output += `(Silent Page)\n`;
        }

        output += `--------------------------------------------------------------------------------\n`;
        return output;
    }

    static cleanText(text) {
        if (!text) return '';
        return text
            .replace(/<br\s*\/?>/gi, '\n  ')
            .replace(/\[.*?\]/g, '')
            .trim();
    }
}

module.exports = ScriptService;