// views/dashboard/components/SceneEditor/VisualEditorDialogueUI.js
import { pushSceneUpdate } from './VisualEditorSync.js';

/**
 * VisualEditorDialogueUI
 * Specialized UI handler for editing dialogue items within the Visual Editor sidebar.
 */
export function renderDialogueProperties(container, item, propertiesManager, getActiveSceneData, currentVisualMediaData, currentVisualContext, onSaveCallback, onDeleteCallback, onCloseCallback) {
    container.innerHTML = '';
    container.classList.add('dialogue-editor-container');

    const header = document.createElement('div');
    header.className = 'flex-row justify-between align-center margin-b-15 padding-x-10';
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

    const scroll = document.createElement('div');
    scroll.className = 'dialogue-editor-scroll';
    container.appendChild(scroll);

    const originalFormEl = document.getElementById('sceneItemEditor');
    if (originalFormEl) {
        const clone = originalFormEl.cloneNode(true);
        clone.id = 'visual-dialogue-editor';
        clone.classList.remove('hidden');

        // Remove the in-form delete button — it lives in the sticky footer instead
        clone.querySelector('#deleteItemBtn')?.remove();

        scroll.appendChild(clone);

        propertiesManager.container = scroll;
        propertiesManager.form = clone.querySelector('#sceneItemForm');

        propertiesManager.setupFontInputUI();
        propertiesManager.setupCharacterInputUI();

        propertiesManager.onUpdate = () => {
            propertiesManager.updateItem(item);
            pushSceneUpdate(document.getElementById('pagePreviewFrame'), getActiveSceneData(), currentVisualMediaData, currentVisualContext.pageId);
        };

        propertiesManager.populate(item);
        clone.querySelectorAll('input, select, textarea').forEach(i => i.addEventListener('input', () => propertiesManager.onUpdate()));

        // Sticky footer — always visible at bottom of the panel, outside the scroll area
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
            if (confirm("Delete this dialogue item?")) {
                await onDeleteCallback(item);
                cleanupAndClose();
            }
        };

        container.appendChild(footer);
    }
}
