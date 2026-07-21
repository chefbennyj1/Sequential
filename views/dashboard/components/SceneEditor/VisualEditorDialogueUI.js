// views/dashboard/components/SceneEditor/VisualEditorDialogueUI.js
import { pushSceneUpdate } from './VisualEditorSync.js';

/**
 * Glass-styled confirm dialog (delegates to the shared ui-kit component).
 */
function glassConfirm(title, message) {
    return window.GlassConfirm.show(title, message, 'Delete');
}

/**
 * Builds the dialogue item editor form HTML.
 * Owned here so the visual editor has no DOM dependency on any external template.
 */
function buildDialogueFormHTML() {
    return `
    <form id="sceneItemForm">
        <div class="input-field"><label>ID</label><input type="text" id="prop-id" class="glass-input" readonly></div>
        <div class="input-field">
            <label>Display Type</label>
            <select id="prop-type" class="glass-select width-100">
                <option value="SpeechBubble">Speech Bubble</option>
                <option value="Narrator">TextBlock: Narrator</option>
                <option value="InternalMonologue">TextBlock: Internal Monologue</option>
                <option value="Dialogue">TextBlock: Dialogue</option>
                <option value="ActionText">Action Text (Minimal)</option>
            </select>
        </div>
        <div class="input-field prop-group-character"><label>Character</label><input type="text" id="prop-character" class="glass-input"></div>
        <div class="input-field prop-group-text"><label>Dialogue</label><textarea id="prop-text" rows="4" class="glass-textarea"></textarea></div>
        <div class="props-group">
            <h5>Placement</h5>
            <div class="input-field"><label>Panel Selector</label><input type="text" id="prop-panel" class="glass-input" placeholder=".panel-A"></div>
            <div class="input-field"><label>Top (%)</label><input type="text" id="prop-top" class="glass-input"></div>
            <div class="input-field"><label>Left (%)</label><input type="text" id="prop-left" class="glass-input"></div>
            <div class="input-field"><label>Right (%)</label><input type="text" id="prop-right" class="glass-input"></div>
            <div class="input-field"><label>Bottom (%)</label><input type="text" id="prop-bottom" class="glass-input"></div>
            <div class="input-field"><label>Width (%)</label><input type="text" id="prop-width" class="glass-input" placeholder="Auto"></div>
            <div class="input-field">
                <label>Tail Position</label>
                <select id="prop-tail" class="glass-select width-100">
                    <option value="">None</option>
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                </select>
            </div>
            <div class="input-field"><label>Tail Skew</label><input type="number" id="prop-tail-skew" class="glass-input" placeholder="25"></div>
            <div class="input-field"><label>Tail Scale</label><input type="text" id="prop-tail-scale" class="glass-input" placeholder="1.0"></div>
            <div class="input-field prop-group-fontsize">
                <label>Font Size</label>
                <input type="text" id="prop-font-size" class="glass-input" placeholder="0.85rem">
            </div>
            <div class="input-field prop-group-font">
                <label>Action Font</label>
                <select id="prop-font-family" class="glass-select width-100">
                    <option value="">Default</option>
                </select>
            </div>
            <div class="input-field">
                <label>Text Color</label>
                <input type="color" id="prop-action-color" value="#000000" class="gov-color-input">
            </div>
            <div class="palette-extraction-row flex-column gap-10 margin-b-15 glass glass--dark padding-10 border-radius-8">
                <div class="flex-row align-center gap-10">
                    <select id="prop-palette-panel" class="glass-select flex-1">
                        <option value="">-- Select Panel --</option>
                    </select>
                    <button type="button" id="prop-gen-palette" class="glass glass-btn glass-btn--primary flex-row align-center gap-5" style="white-space: nowrap;">
                        <ion-icon name="color-palette-outline"></ion-icon>
                        <span>Extract Palette</span>
                    </button>
                </div>
                <div id="prop-palette-swatches" class="flex-row gap-5 flex-wrap hidden"></div>
            </div>
            <div class="input-field" style="display:flex;flex-direction:row;align-items:center;gap:8px;margin-bottom:15px;">
                <input type="checkbox" id="prop-outline-enabled" style="margin:0;">
                <label style="margin:0;">Text Outline</label>
            </div>
            <div class="input-field">
                <label>Outline Color</label>
                <input type="color" id="prop-outline-color" value="#000000" class="gov-color-input">
            </div>
            <div class="input-field">
                <label>Thickness (px)</label>
                <input type="number" step="0.1" id="prop-outline-size" class="glass-input" placeholder="1.0">
            </div>
            <div class="prop-group-curve">
                <div class="input-field"><label>Curve (0 = straight, + = up, − = down)</label><input type="number" id="prop-curve" class="glass-input" placeholder="0" min="-60" max="60" step="1" title="Negative curves the text down, 0 is straight, positive curves the text up."></div>
                <div class="input-field"><label>Curve W</label><input type="number" id="prop-curve-w" class="glass-input" placeholder="300"></div>
                <div class="input-field"><label>Curve H</label><input type="number" id="prop-curve-h" class="glass-input" placeholder="100"></div>
                <div class="input-field"><label>Rotation</label><input type="number" step="0.1" id="prop-rotation" class="glass-input" placeholder="-20"></div>
            </div>
        </div>
    </form>`;
}

/**
 * Renders the dialogue properties panel into the given container.
 * Fully self-contained — builds its own form HTML, no external DOM template required.
 */
export function renderDialogueProperties(container, item, propertiesManager, getActiveSceneData, currentVisualMediaData, currentVisualContext, onSaveCallback, onDeleteCallback, onCloseCallback) {
    container.innerHTML = '';
    container.classList.add('dialogue-editor-container');

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'flex-row justify-between align-center margin-b-15 padding-x-10 padding-top-10';
    header.innerHTML = `<h4>Dialogue Properties</h4><button class="glass glass-btn glass-btn--ghost">&larr; Layout Tools</button>`;

    const originalOnUpdate = propertiesManager.onUpdate;
    const originalContainer = propertiesManager.container;
    const originalForm = propertiesManager.form;

    const cleanupAndClose = () => {
        propertiesManager.onUpdate = originalOnUpdate;
        propertiesManager.container = originalContainer;
        propertiesManager.form = originalForm;
        onCloseCallback();
    };

    header.querySelector('button').onclick = cleanupAndClose;
    container.appendChild(header);

    // --- Scrollable form area ---
    const scroll = document.createElement('div');
    scroll.className = 'dialogue-editor-scroll';
    scroll.innerHTML = buildDialogueFormHTML();
    container.appendChild(scroll);

    // Wire up PropertyManager to the freshly built form
    propertiesManager.container = scroll;
    propertiesManager.form = scroll.querySelector('#sceneItemForm');

    propertiesManager.setupFontInputUI();
    propertiesManager.setupCharacterInputUI();

    propertiesManager.onUpdate = () => {
        propertiesManager.updateItem(item);
        pushSceneUpdate(document.getElementById('pagePreviewFrame'), getActiveSceneData(), currentVisualMediaData, currentVisualContext.pageId);
    };

    propertiesManager.populate(item);
    // Debounce keystrokes: each onUpdate re-renders the whole preview scene, so
    // firing per character floods the iframe with overlapping renders.
    let inputDebounce = null;
    scroll.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => {
            clearTimeout(inputDebounce);
            inputDebounce = setTimeout(() => propertiesManager.onUpdate(), 120);
        });
    });

    // --- Sticky footer: Save + Delete side by side, always visible ---
    const footer = document.createElement('div');
    footer.className = 'dialogue-editor-footer';
    footer.innerHTML = `
        <button id="saveDialogueBtn" class="glass glass-btn glass-btn--primary flex-1">Save Changes</button>
        <button id="deleteDialogueBtn" class="glass glass-btn glass-btn--danger flex-1">Delete Item</button>
    `;

    footer.querySelector('#saveDialogueBtn').onclick = async (e) => {
        const b = e.target; b.disabled = true; b.textContent = 'Saving...';
        propertiesManager.updateItem(item);
        await onSaveCallback();
        b.textContent = 'Saved!';
        setTimeout(() => { b.textContent = 'Save Changes'; b.disabled = false; }, 2000);
    };

    footer.querySelector('#deleteDialogueBtn').onclick = async () => {
        const confirmed = await glassConfirm('Delete Item', 'This dialogue item will be permanently removed. Are you sure?');
        if (confirmed) {
            await onDeleteCallback(item);
            cleanupAndClose();
        }
    };

    container.appendChild(footer);
}
