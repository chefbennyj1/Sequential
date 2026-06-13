// views/dashboard/components/SceneEditor/VisualEditorDialogueUI.js
import { pushSceneUpdate } from './VisualEditorSync.js';

/**
 * VisualEditorDialogueUI
 * Specialized UI handler for editing dialogue items within the Visual Editor sidebar.
 */
export function renderDialogueProperties(container, item, propertiesManager, getActiveSceneData, currentVisualMediaData, currentVisualContext, onSaveCallback, onDeleteCallback, onCloseCallback) {
    container.innerHTML = '';
    Object.assign(container.style, { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', boxSizing: 'border-box' });

    const header = document.createElement('div');
    header.className = 'flex-row justify-between align-center margin-b-15 padding-x-10';
    header.innerHTML = `<h4>Dialogue Properties</h4><button class="glass glass-btn glass-btn--sm glass-btn--ghost">&larr; Layout Tools</button>`;
    
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
    Object.assign(scroll.style, { overflowY: 'auto', padding: '0 10px', flex: '1' });
    container.appendChild(scroll);

    const originalFormEl = document.getElementById('sceneItemEditor');
    if (originalFormEl) {
        const clone = originalFormEl.cloneNode(true);
        clone.id = 'visual-dialogue-editor';
        clone.classList.remove('hidden');
        scroll.appendChild(clone);
        
        propertiesManager.container = scroll;
        propertiesManager.form = clone.querySelector('#sceneItemForm');
        
        // Re-initialize UI components for the new container
        propertiesManager.setupFontInputUI();
        propertiesManager.setupCharacterInputUI();
        
        propertiesManager.onUpdate = () => {
            propertiesManager.updateItem(item);
            pushSceneUpdate(document.getElementById('pagePreviewFrame'), getActiveSceneData(), currentVisualMediaData, currentVisualContext.pageId);
        };

        propertiesManager.populate(item);
        clone.querySelectorAll('input, select, textarea').forEach(i => i.addEventListener('input', () => propertiesManager.onUpdate()));

        // Handle Delete Button in Clone
        const deleteBtn = clone.querySelector('#deleteItemBtn');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm("Delete this dialogue item?")) {
                    await onDeleteCallback(item);
                    cleanupAndClose();
                }
            };
        }

        const footer = document.createElement('div');
        footer.className = 'tools-footer-sticky margin-t-20';
        footer.style.padding = '10px';
        footer.innerHTML = `<button class="glass glass-btn glass-btn--primary w-full">Save Dialogue Changes</button>`;
        footer.querySelector('button').onclick = async (e) => {
            const b = e.target; b.disabled = true; b.textContent = 'Saving...';
            propertiesManager.updateItem(item);
            await onSaveCallback();
            b.textContent = 'Saved!';
            setTimeout(() => { b.textContent = 'Save Dialogue Changes'; b.disabled = false; }, 2000);
        };
        scroll.appendChild(footer);
    }
}
