// views/dashboard/studio/js/StyleLab.js
import { populateSeriesSelect } from './LibraryManager.js';
import { fetchFontsAPI } from '../api/StudioClient.js';
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';
import ActionText from '/libs/ActionText/ActionText.js';

let activeSeriesId = null;
let currentSettings = {
    bubbleFontSize: "0.8rem",
    textBlockFontSize: "0.8em",
    actionTextFontSize: "2.5rem",
    primaryFontFamily: ""
};

const DEFAULTS = {
    bubbleFontSize: "0.8rem",
    textBlockFontSize: "0.8em",
    actionTextFontSize: "2.5rem",
    primaryFontFamily: ""
};

export function initStyleLab(container) {
    const seriesSelect = document.getElementById('styleLabSeriesSelect');
    const fontSelect = document.getElementById('styleLabFontSelect');
    const controls = document.getElementById('style-lab-controls');

    const bubbleSlider = document.getElementById('bubbleFontSizeSlider');
    const bubbleValueDisplay = document.getElementById('bubbleFontSizeValue');
    const textBlockSlider = document.getElementById('textBlockFontSizeSlider');
    const textBlockValueDisplay = document.getElementById('textBlockFontSizeValue');
    const actionSlider = document.getElementById('actionTextFontSizeSlider');
    const actionValueDisplay = document.getElementById('actionTextFontSizeValue');

    const saveBtn = document.getElementById('saveStyleSettingsBtn');
    const resetBtn = document.getElementById('resetStyleSettingsBtn');
    const cssInput = document.getElementById('styleLabCssInput');

    populateSeriesSelect('styleLabSeriesSelect');
    loadFonts(fontSelect);

    seriesSelect.addEventListener('change', async (e) => {
        activeSeriesId = e.target.value;
        if (!activeSeriesId) {
            controls.classList.add('hidden');
            return;
        }
        await loadSeriesSettings();
        controls.classList.remove('hidden');
        renderPreview();
    });

    // Font Size Listeners
    bubbleSlider.addEventListener('input', (e) => {
        const val = e.target.value + 'rem';
        currentSettings.bubbleFontSize = val;
        bubbleValueDisplay.textContent = val;
        updatePreviewStyles();
    });

    textBlockSlider.addEventListener('input', (e) => {
        const val = e.target.value + 'em';
        currentSettings.textBlockFontSize = val;
        textBlockValueDisplay.textContent = val;
        updatePreviewStyles();
    });

    actionSlider.addEventListener('input', (e) => {
        const val = e.target.value + 'rem';
        currentSettings.actionTextFontSize = val;
        actionValueDisplay.textContent = val;
        updatePreviewStyles();
    });

    fontSelect.addEventListener('change', (e) => {
        currentSettings.primaryFontFamily = e.target.value;
        updatePreviewStyles();
    });

    saveBtn.addEventListener('click', saveSettings);
    resetBtn.addEventListener('click', resetToDefaults);

    cssInput.addEventListener('change', uploadCss);
}

async function loadFonts(select) {
    const data = await fetchFontsAPI();
    if (data && data.files) {
        data.files.forEach(f => {
            const fontName = f.replace(/\.(ttf|otf|woff2|woff)$/i, '');
            const opt = document.createElement('option');
            opt.value = fontName;
            opt.textContent = fontName;
            select.appendChild(opt);
        });
    }
}

async function loadSeriesSettings() {
    try {
        const res = await fetch(`/api/style-lab/${activeSeriesId}`);
        const data = await res.json();
        if (data.ok) {
            currentSettings = { ...DEFAULTS, ...data.settings };
            updateUIFromSettings();
        }
    } catch (err) {
        console.error("Failed to load settings:", err);
    }
}

function updateUIFromSettings() {
    const bubbleSlider = document.getElementById('bubbleFontSizeSlider');
    const bubbleValueDisplay = document.getElementById('bubbleFontSizeValue');
    const textBlockSlider = document.getElementById('textBlockFontSizeSlider');
    const textBlockValueDisplay = document.getElementById('textBlockFontSizeValue');
    const actionSlider = document.getElementById('actionTextFontSizeSlider');
    const actionValueDisplay = document.getElementById('actionTextFontSizeValue');
    const fontSelect = document.getElementById('styleLabFontSelect');

    bubbleSlider.value = parseFloat(currentSettings.bubbleFontSize);
    bubbleValueDisplay.textContent = currentSettings.bubbleFontSize;

    textBlockSlider.value = parseFloat(currentSettings.textBlockFontSize);
    textBlockValueDisplay.textContent = currentSettings.textBlockFontSize;

    actionSlider.value = parseFloat(currentSettings.actionTextFontSize);
    actionValueDisplay.textContent = currentSettings.actionTextFontSize;

    fontSelect.value = currentSettings.primaryFontFamily || "";

    renderCustomCssList();
}

function renderCustomCssList() {
    const list = document.getElementById('custom-css-list');
    list.innerHTML = '';
    
    if (!currentSettings.customCssFiles || currentSettings.customCssFiles.length === 0) {
        list.innerHTML = '<div class="text-muted italic font-size-07">No custom CSS files uploaded.</div>';
        return;
    }

    currentSettings.customCssFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'flex-row justify-between align-center bg-black-20 padding-5 border-radius-4';
        item.innerHTML = `
            <span class="font-size-07 mono">${file}</span>
            <button class="btn-icon-small text-danger" data-file="${file}"><ion-icon name="trash-outline"></ion-icon></button>
        `;
        item.querySelector('button').onclick = () => deleteCss(file);
        list.appendChild(item);
    });
}

function renderPreview() {
    const previewPane = document.getElementById('style-lab-preview');
    previewPane.innerHTML = ''; // Clear

    // Force context for components
    previewPane.classList.add('page');
    
    // Ensure basic variables for preview visibility
    previewPane.style.setProperty('--speech-text-color', '#000000');
    previewPane.style.setProperty('--bubble-border', '#000000');
    previewPane.style.setProperty('--bubble-bg-one', '#ffffff');

    // 1. Narrator Block
    const narrator = new TextBlock(previewPane, {
        text: "NARRATOR: System initialization in progress...",
        textBlockType: "Narrator",
        top: "10%",
        left: "5%",
        width: "90%"
    });
    narrator.render().then(() => narrator.play());

    // 2. Speech Bubble
    const bubble = new SpeechBubble(previewPane, {
        text: "VIGIL: I can see everything now.",
        top: "40%",
        left: "50%",
        tailPosition: "top-left",
        width: "250px"
    });
    bubble.render().then(() => bubble.show());

    // 3. Action Text
    const action = new ActionText(previewPane, {
        text: "GLITCH",
        top: "85%",
        left: "50%",
        rotation: -5,
        color: "#00ccff"
    });
    action.render().then(() => action.show());

    updatePreviewStyles();
}

function updatePreviewStyles() {
    const previewPane = document.getElementById('style-lab-preview');
    const font = currentSettings.primaryFontFamily || 'inherit';

    // Apply Variables
    previewPane.style.setProperty('--bubble-font-size', currentSettings.bubbleFontSize);
    previewPane.style.setProperty('--action-font-size', currentSettings.actionTextFontSize);
    previewPane.style.setProperty('--bubble-font', font);
    previewPane.style.setProperty('--action-font', font);
    
    // Text Blocks
    const textBlocks = previewPane.querySelectorAll('.text-block-container');
    textBlocks.forEach(tb => {
        tb.style.fontSize = currentSettings.textBlockFontSize;
        tb.style.fontFamily = font;
    });

    // Action Text specifically needs to update its internal container size sometimes
    const actionTexts = previewPane.querySelectorAll('.action-text-content');
    actionTexts.forEach(at => {
        at.style.fontSize = currentSettings.actionTextFontSize;
    });
}

async function saveSettings() {
    const btn = document.getElementById('saveStyleSettingsBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/style-lab/${activeSeriesId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: currentSettings })
        });
        const data = await res.json();
        if (data.ok) {
            alert("Styles saved successfully!");
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Server communication error.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function resetToDefaults() {
    if (!confirm("Reset all styles for this series to factory defaults?")) return;
    currentSettings = { ...DEFAULTS };
    updateUIFromSettings();
    updatePreviewStyles();
}

async function uploadCss(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('seriesId', activeSeriesId);
    formData.append('cssFile', file);

    try {
        const res = await fetch('/api/style-lab/upload-css', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.ok) {
            if (!currentSettings.customCssFiles) currentSettings.customCssFiles = [];
            if (!currentSettings.customCssFiles.includes(data.fileName)) {
                currentSettings.customCssFiles.push(data.fileName);
            }
            renderCustomCssList();
        }
    } catch (err) {
        console.error(err);
        alert("Failed to upload CSS.");
    }
}

async function deleteCss(fileName) {
    if (!confirm(`Delete custom style: ${fileName}?`)) return;

    try {
        const res = await fetch('/api/style-lab/delete-css', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seriesId: activeSeriesId, fileName })
        });
        const data = await res.json();
        if (data.ok) {
            currentSettings.customCssFiles = currentSettings.customCssFiles.filter(f => f !== fileName);
            renderCustomCssList();
        }
    } catch (err) {
        console.error(err);
    }
}
