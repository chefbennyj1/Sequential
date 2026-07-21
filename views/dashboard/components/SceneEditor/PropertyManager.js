// views/dashboard/components/SceneEditor/PropertyManager.js
import { fetchFontsAPI } from '../../studio/api/StudioClient.js';
import { extractPalette } from '/libs/Utility.js';

export class PropertyManager {
    constructor(container, onUpdate, getPanelImageUrl) {
        this.container = container;
        this.form = container.querySelector('#sceneItemForm');
        this.onUpdate = onUpdate;
        this.getPanelImageUrl = getPanelImageUrl;
        this.availableCharacters = [];
        this.availablePanels = [];
        this.availableFonts = { files: [], cssVariables: [] };
        this.loadFonts();
    }

    async loadFonts() {
        try {
            this.availableFonts = await fetchFontsAPI();
            this.setupFontInputUI();
        } catch (e) {
            console.error("Failed to load fonts into PropertyManager", e);
        }
    }

    setupFontInputUI() {
        const fontSelect = this.container.querySelector('#prop-font-family');
        if (!fontSelect) return;

        // Preserve current value in case populate() ran before fetch finished
        const currentValue = fontSelect.value;

        // Clear existing except default
        fontSelect.innerHTML = '<option value="">Default</option>';

        if (this.availableFonts.cssVariables.length > 0) {
            const group = document.createElement('optgroup');
            group.label = 'CSS Variables';
            this.availableFonts.cssVariables.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v.replace('--font-family-', '').replace(/-/g, ' ');
                fontSelect.appendChild(opt);
            });
            fontSelect.appendChild(group);
        }

        if (this.availableFonts.files.length > 0) {
            const group = document.createElement('optgroup');
            group.label = 'Font Files';
            this.availableFonts.files.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                fontSelect.appendChild(opt);
            });
            fontSelect.appendChild(group);
        }

        // Restore value
        if (currentValue) {
            fontSelect.value = currentValue;
        }
    }

    setAvailableData(characters, panels) {
        this.availableCharacters = characters || [];
        this.availablePanels = panels || [];
        this.setupCharacterInputUI();
        this.updateDatalist();
        this.setupPalettePanelUI();
    }

    setupCharacterInputUI() {
        const charContainer = this.container.querySelector('.prop-group-character');
        if (!charContainer) return;

        charContainer.innerHTML = `
            <label>Character</label>
            <div class="char-input-group">
                <div class="flex-1">
                    <select id="prop-character-select" class="glass-select hidden">
                        <option value="">-- Select Character --</option>
                    </select>
                    <input type="text" id="prop-character" placeholder="Character Name" class="glass-input width-100">
                </div>
                <img id="prop-character-avatar" src="" class="char-avatar-small hidden">
            </div>
            <div class="toggle-input-link-wrapper">
                <a href="#" id="toggleCharInputMode" class="text-accent">Toggle Input Mode</a>
            </div>
        `;

        const select = this.container.querySelector('#prop-character-select');
        const input = this.container.querySelector('#prop-character');
        const avatar = this.container.querySelector('#prop-character-avatar');
        const toggle = this.container.querySelector('#toggleCharInputMode');

        if (this.availableCharacters.length > 0) {
            this.availableCharacters.forEach(char => {
                const opt = document.createElement('option');
                opt.value = char._id;
                opt.textContent = char.name;
                opt.dataset.image = char.image || '';
                select.appendChild(opt);
            });
            input.classList.add('hidden');
            select.classList.remove('hidden');
        } else {
            input.classList.remove('hidden');
            select.classList.add('hidden');
            toggle.classList.add('hidden');
        }

        toggle.onclick = (e) => {
            e.preventDefault();
            if (input.classList.contains('hidden')) {
                input.classList.remove('hidden');
                select.classList.add('hidden');
                avatar.classList.add('hidden');
                select.value = "";
            } else {
                input.classList.add('hidden');
                select.classList.remove('hidden');
                if (select.value) avatar.classList.remove('hidden');
            }
        };

        select.onchange = () => {
            const opt = select.options[select.selectedIndex];
            if (opt && opt.value) {
                const img = opt.dataset.image;
                avatar.src = img || '';
                img ? avatar.classList.remove('hidden') : avatar.classList.add('hidden');
            } else {
                avatar.classList.add('hidden');
            }
            this.onUpdate();
        };
    }

    setupPalettePanelUI() {
        const select = this.container.querySelector('#prop-palette-panel');
        if (!select) return;
        
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Select Panel --</option>';
        this.availablePanels.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.replace('.', '');
            select.appendChild(opt);
        });

        if (this.availablePanels.includes(currentVal)) {
            select.value = currentVal;
        } else if (this.availablePanels.length > 0) {
            // Auto-select first panel if nothing selected
            select.value = this.availablePanels[0];
        }
    }

    populate(item) {
        if (!item) return;

        const setVal = (id, val) => { const el = this.container.querySelector(id); if (el) el.value = val; };
        const setCheck = (id, val) => { const el = this.container.querySelector(id); if (el) el.checked = !!val; };

        setVal('#prop-id', item.id || '');

        let type = item.displayType?.type || 'SpeechBubble';
        if (type === 'TextBlock' && item.displayType?.style) {
            type = item.displayType.style;
        }
        
        // Migrate legacy SoundEffects to ActionText
        if (type === 'SoundEffect') {
            type = 'ActionText';
        }
        
        setVal('#prop-type', type);

        const select = this.container.querySelector('#prop-character-select');
        const input = this.container.querySelector('#prop-character');
        const avatar = this.container.querySelector('#prop-character-avatar');

        if (select && input) {
            if (item.characterId && this.availableCharacters.some(c => c._id === item.characterId)) {
                select.value = item.characterId;
                select.classList.remove('hidden');
                input.classList.add('hidden');
                const char = this.availableCharacters.find(c => c._id === item.characterId);
                if (char && char.image) {
                    if (avatar) { avatar.src = char.image; avatar.classList.remove('hidden'); }
                } else {
                    if (avatar) avatar.classList.add('hidden');
                }
            } else {
                input.value = item.character || '';
                select.value = "";
                input.classList.remove('hidden');
                select.classList.add('hidden');
                if (avatar) avatar.classList.add('hidden');
            }
        }

        setVal('#prop-text', item.text || '');
        const p = item.placement || {};
        setVal('#prop-panel', p.panel || '');
        setVal('#prop-top', p.top || '');
        setVal('#prop-left', p.left || '');
        setVal('#prop-right', p.right || '');
        setVal('#prop-bottom', p.bottom || '');
        setVal('#prop-width', p.width || '');
        setVal('#prop-tail', p.tailPosition || '');
        setVal('#prop-tail-skew', (p.tailSkew || '').replace('deg', ''));
        setVal('#prop-tail-scale', p.tailScale || '');
        setVal('#prop-curve', item.curve || '');
        setVal('#prop-curve-w', item.curveWidth || '');
        setVal('#prop-curve-h', item.curveHeight || '');
        setVal('#prop-rotation', item.rotation || '');
        setVal('#prop-font-size', item.fontSize || '');
        setVal('#prop-action-color', item.color || '#000000');
        setCheck('#prop-outline-enabled', item.outlineEnabled);
        setVal('#prop-outline-color', item.outlineColor || '#000000');
        setVal('#prop-outline-size', item.outlineSize || '1.0');
        setVal('#prop-duration', item.duration || '');
        setVal('#prop-font-family', item.fontFamily || '');

        this.toggleVisibility(item.displayType?.type);
        this.updateDatalist();
        this.bindPaletteTool();
    }

    bindPaletteTool() {
        const palBtn = this.container.querySelector('#prop-gen-palette');
        const swatchesCont = this.container.querySelector('#prop-palette-swatches');
        const panelSelect = this.container.querySelector('#prop-palette-panel');
        const textColorInput = this.container.querySelector('#prop-action-color');
        const outlineColorInput = this.container.querySelector('#prop-outline-color');

        if (!palBtn || !swatchesCont || !panelSelect) return;

        palBtn.onclick = async () => {
            const panelSelector = panelSelect.value;
            if (!panelSelector) return alert("Please select a panel first.");

            const imgUrl = this.getPanelImageUrl(panelSelector);
            if (!imgUrl) return alert("No image found for the selected panel.");

            swatchesCont.innerHTML = '<span class="text-muted font-size-07">Extracting...</span>';
            swatchesCont.classList.remove('hidden');

            try {
                const colors = await extractPalette(imgUrl);
                swatchesCont.innerHTML = '';
                colors.forEach(hex => {
                    const s = document.createElement('div');
                    s.className = 'palette-swatch';
                    s.style.backgroundColor = hex;
                    s.title = "Left click: Text Color | Right click: Outline Color | Shift+Click: Both";

                    s.onclick = (e) => {
                        if (e.shiftKey) {
                            textColorInput.value = hex;
                            outlineColorInput.value = hex;
                            this.container.querySelector('#prop-outline-enabled').checked = true;
                        } else {
                            textColorInput.value = hex;
                        }
                        this.onUpdate();
                    };

                    s.oncontextmenu = (e) => {
                        e.preventDefault();
                        outlineColorInput.value = hex;
                        this.container.querySelector('#prop-outline-enabled').checked = true;
                        this.onUpdate();
                    };

                    swatchesCont.appendChild(s);
                });
            } catch (err) {
                console.error(err);
                swatchesCont.innerHTML = '<span class="text-danger font-size-07">Extraction failed.</span>';
            }
        };
    }

    updateDatalist() {
        const mainPanelInput = this.container.querySelector('#prop-panel');
        if (mainPanelInput) {
            mainPanelInput.setAttribute('list', 'availablePanelsList');
            let datalist = document.getElementById('availablePanelsList');
            if (!datalist) {
                datalist = document.createElement('datalist');
                datalist.id = 'availablePanelsList';
                document.body.appendChild(datalist);
            }
            datalist.innerHTML = this.availablePanels.map(p => `<option value="${p}">`).join('');
        }
    }

    updateItem(item) {
        if (!item) return;

        // Never take item.id from the form: #prop-id is display-only. The form
        // can hold another item's id (mis-populate) or a stale one (server
        // reassigns ids on save) — writing it back forges identity and lets one
        // bubble overwrite another.
        let type = this.container.querySelector('#prop-type').value;
        if (['Narrator', 'InternalMonologue', 'Dialogue'].includes(type)) {
            item.displayType = { type: 'TextBlock', style: type };
        } else {
            item.displayType = { type: type };
        }

        const select = this.container.querySelector('#prop-character-select');
        const input = this.container.querySelector('#prop-character');
        if (select && !select.classList.contains('hidden') && select.value) {
            item.characterId = select.value;
            item.character = select.options[select.selectedIndex].text;
        } else {
            item.character = input.value;
            item.characterId = null;
        }

        item.text = this.container.querySelector('#prop-text').value;
        item.curve = this.container.querySelector('#prop-curve').value;
        item.curveWidth = this.container.querySelector('#prop-curve-w').value;
        item.curveHeight = this.container.querySelector('#prop-curve-h').value;
        item.rotation = this.container.querySelector('#prop-rotation').value;
        item.fontSize = this.container.querySelector('#prop-font-size').value;
        item.color = this.container.querySelector('#prop-action-color').value;
        item.fontFamily = this.container.querySelector('#prop-font-family').value;
        item.outlineEnabled = this.container.querySelector('#prop-outline-enabled').checked;
        item.outlineColor = this.container.querySelector('#prop-outline-color').value;
        item.outlineSize = this.container.querySelector('#prop-outline-size').value;

        item.placement = {
            panel: this.container.querySelector('#prop-panel').value,
            top: this.container.querySelector('#prop-top').value,
            left: this.container.querySelector('#prop-left').value,
            right: this.container.querySelector('#prop-right').value,
            bottom: this.container.querySelector('#prop-bottom').value,
            width: this.container.querySelector('#prop-width').value,
            tailPosition: this.container.querySelector('#prop-tail').value,
            tailSkew: this.container.querySelector('#prop-tail-skew').value ? this.container.querySelector('#prop-tail-skew').value + 'deg' : '',
            tailScale: this.container.querySelector('#prop-tail-scale').value
        };
    }

    toggleVisibility(type) {
        const groups = {
            curve: this.container.querySelector('.prop-group-curve'),
            font: this.container.querySelector('.prop-group-font'),
            fontSize: this.container.querySelector('.prop-group-fontsize'),
            palette: this.container.querySelector('.palette-extraction-row')
        };
        const isActionText = (type === 'ActionText' || type === 'SoundEffect');

        if (groups.curve) isActionText ? groups.curve.classList.remove('hidden') : groups.curve.classList.add('hidden');
        if (groups.font) isActionText ? groups.font.classList.remove('hidden') : groups.font.classList.add('hidden');
        // Font size is brute-forced from page height for SpeechBubble/TextBlock
        // (see libs/ExportMatchScale.js) — the per-item value is never read for
        // those types anymore, only for ActionText, so the field would silently
        // do nothing if left visible.
        if (groups.fontSize) isActionText ? groups.fontSize.classList.remove('hidden') : groups.fontSize.classList.add('hidden');

        if (groups.palette) {
            const aiEnabled = window.AI_CONFIG?.visionEnabled;
            (aiEnabled && isActionText) ? groups.palette.classList.remove('hidden') : groups.palette.classList.add('hidden');
        }
    }
}
