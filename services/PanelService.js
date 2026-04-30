const fs = require('fs');
const path = require('path');

/**
 * PanelService
 * Handles logical operations for panels, including ID generation for fixed and floating panels.
 */
class PanelService {
    /**
     * Determines the next available panel ID for a page.
     * Checks both the HTML template and the page.json for existing IDs.
     * @param {string} templateHtml - The content of the layout HTML file.
     * @param {Object} pageJson - The parsed page.json content.
     * @returns {string} - The next ID (e.g., "5" if 1-4 exist, or "E" if A-D exist).
     */
    static getNextPanelId(templateHtml, pageJson) {
        const ids = new Set();

        // 1. Extract IDs from template HTML
        // Regex matches class="... panel-([a-zA-Z0-9]+) ..."
        const templatePanelRegex = /class=\"[^"]*panel-([a-zA-Z0-9]+)[^"]*\"/g;
        let match;
        while ((match = templatePanelRegex.exec(templateHtml)) !== null) {
            ids.add(match[1]);
        }

        // 2. Extract IDs from pageJson media
        if (pageJson && pageJson.media) {
            pageJson.media.forEach(m => {
                // If it's a selector like ".panel-A", extract "A"
                const cleanId = m.panel.startsWith('.') ? m.panel.replace(/^\.panel-/, '') : m.panel;
                ids.add(cleanId);
            });
        }

        const idList = Array.from(ids);
        if (idList.length === 0) return "1";

        // 3. Determine if we are using numeric or alphabetic IDs
        const hasAlpha = idList.some(id => /[a-zA-Z]/.test(id));
        
        if (hasAlpha) {
            // Find the highest character
            const chars = idList.filter(id => /^[a-zA-Z]$/.test(id)).map(id => id.toUpperCase());
            if (chars.length === 0) return "A";
            chars.sort();
            const lastChar = chars[chars.length - 1];
            const nextCharCode = lastChar.charCodeAt(0) + 1;
            return String.fromCharCode(nextCharCode);
        } else {
            // Find the highest number
            const nums = idList.map(id => parseInt(id)).filter(n => !isNaN(n));
            if (nums.length === 0) return "1";
            const maxNum = Math.max(...nums);
            return (maxNum + 1).toString();
        }
    }

    /**
     * Extracts all panel selectors (.panel-X) from a layout template.
     * @param {string} templateHtml - The content of the layout HTML file.
     * @returns {Set<string>} - A set of selectors.
     */
    static getPanelsFromTemplate(templateHtml) {
        const panels = new Set();
        const templatePanelRegex = /class=\"[^"]*panel-([a-zA-Z0-9]+)[^"]*\"/g;
        let match;
        while ((match = templatePanelRegex.exec(templateHtml)) !== null) {
            panels.add(`.panel-${match[1]}`);
        }
        return panels;
    }

    /**
     * Checks if a panel ID exists in either the template or the json.
     */
    static panelIdExists(id, templateHtml, pageJson) {
        const cleanId = id.replace(/^\.panel-/, '');
        const currentNext = this.getNextPanelId(templateHtml, pageJson);
        // This is a bit lazy but works for single-page context
        const ids = new Set();
        const templatePanelRegex = /class=\"[^"]*panel-([a-zA-Z0-9]+)[^"]*\"/g;
        let match;
        while ((match = templatePanelRegex.exec(templateHtml)) !== null) {
            ids.add(match[1]);
        }
        if (pageJson && pageJson.media) {
            pageJson.media.forEach(m => {
                ids.add(m.panel.replace(/^\.panel-/, ''));
            });
        }
        return ids.has(cleanId);
    }
}

module.exports = PanelService;
