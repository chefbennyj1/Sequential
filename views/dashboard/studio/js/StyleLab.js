// views/dashboard/studio/js/StyleLab.js
import { populateSeriesSelect } from './LibraryManager.js';
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';

let activeSeriesId = null;
let currentSettings = {
    bubbleFontSize: "0.8rem",
    textBlockFontSize: "0.8em"
};

const DEFAULTS = {
    bubbleFontSize: "0.8rem",
    textBlockFontSize: "0.8em"
};

export function initStyleLab(container) {
    const seriesSelect = document.getElementById('styleLabSeriesSelect');
    const controls = document.getElementById('style-lab-controls');
    const previewPane = document.getElementById('style-lab-preview');

    const bubbleSlider = document.getElementById('bubbleFontSizeSlider');
    const bubbleValueDisplay = document.getElementById('bubbleFontSizeValue');
    const textBlockSlider = document.getElementById('textBlockFontSizeSlider');
    const textBlockValueDisplay = document.getElementById('textBlockFontSizeValue');

    const saveBtn = document.getElementById('saveStyleSettingsBtn');
    const resetBtn = document.getElementById('resetStyleSettingsBtn');
    const cssInput = document.getElementById('styleLabCssInput');

    populateSeriesSelect('styleLabSeriesSelect');

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

    saveBtn.addEventListener('click', saveSettings);
    resetBtn.addEventListener('click', resetToDefaults);

    cssInput.addEventListener('change', uploadCss);
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

    const bVal = parseFloat(currentSettings.bubbleFontSize);
    bubbleSlider.value = bVal;
    bubbleValueDisplay.textContent = currentSettings.bubbleFontSize;

    const tVal = parseFloat(currentSettings.textBlockFontSize);
    textBlockSlider.value = tVal;
    textBlockValueDisplay.textContent = currentSettings.textBlockFontSize;

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

    // 1. Create a dummy Narrator Block
    const narrator = new TextBlock(previewPane, {
        text: "This is a narrator block preview. Adjust the slider to see it change.",
        textBlockType: "Narrator",
        top: "20%",
        left: "10%",
        width: "80%"
    });
    narrator.render();

    // 2. Create a dummy Speech Bubble
    const bubble = new SpeechBubble(previewPane, {
        text: "System check complete. Vigil is watching.",
        top: "60%",
        left: "50%",
        tail: "top-left"
    });
    bubble.render();
    bubble.show();

    updatePreviewStyles();
}

function updatePreviewStyles() {
    const previewPane = document.getElementById('style-lab-preview');
    // Apply variables directly to the preview pane (which has the .page class)
    previewPane.style.setProperty('--bubble-font-size', currentSettings.bubbleFontSize);
    previewPane.style.setProperty('--text-block-scale', '1'); // Force 1:1 scale for preview
    
    // For text blocks, since they use em in .page context, we can set the container font size
    const textBlocks = previewPane.querySelectorAll('.text-block-container');
    textBlocks.forEach(tb => {
        tb.style.fontSize = currentSettings.textBlockFontSize;
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
    currentSettings.bubbleFontSize = DEFAULTS.bubbleFontSize;
    currentSettings.textBlockFontSize = DEFAULTS.textBlockFontSize;
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
