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
        const fontSelect = document.getElementById('prop-font-family');
        if (!fontSelect) return;

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
    }

    setAvailableData(characters, panels) {
        this.availableCharacters = characters;
        this.availablePanels = panels;
        this.setupCharacterInputUI();
    }

    setupCharacterInputUI() {
        const charContainer = this.container.querySelector('.prop-group-character');
        if (!charContainer) return;

        charContainer.innerHTML = `
            <label>Character</label>
            <div class="char-input-group">
                <div class="flex-1">
                    <select id="prop-character-select" class="char-select-custom hidden">
                        <option value="">-- Select Character --</option>
                    </select>
                    <input type="text" id="prop-character" placeholder="Character Name" class="width-100">
                </div>
                <img id="prop-character-avatar" src="" class="char-avatar-small hidden">
            </div>
            <div class="toggle-input-link-wrapper">
                <a href="#" id="toggleCharInputMode" class="text-accent">Toggle Input Mode</a>
            </div>
        `;

        const select = document.getElementById('prop-character-select');
        const input = document.getElementById('prop-character');
        const avatar = document.getElementById('prop-character-avatar');
        const toggle = document.getElementById('toggleCharInputMode');

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

    populate(item) {
        if (!item) return;

        document.getElementById('prop-id').value = item.id || '';

        let type = item.displayType?.type || 'SpeechBubble';
        if (type === 'TextBlock' && item.displayType?.style) {
            type = item.displayType.style;
        }
        document.getElementById('prop-type').value = type;

        const select = document.getElementById('prop-character-select');
        const input = document.getElementById('prop-character');
        const avatar = document.getElementById('prop-character-avatar');

        if (select && input) {
            if (item.characterId && this.availableCharacters.some(c => c._id === item.characterId)) {
                select.value = item.characterId;
                select.classList.remove('hidden');
                input.classList.add('hidden');
                const char = this.availableCharacters.find(c => c._id === item.characterId);
                if (char && char.image) {
                    avatar.src = char.image;
                    avatar.classList.remove('hidden');
                } else {
                    avatar.classList.add('hidden');
                }
            } else {
                input.value = item.character || '';
                select.value = "";
                input.classList.remove('hidden');
                select.classList.add('hidden');
                avatar.classList.add('hidden');
            }
        }

        document.getElementById('prop-text').value = item.text || '';
        const p = item.placement || {};
        document.getElementById('prop-panel').value = p.panel || '';
        document.getElementById('prop-top').value = p.top || '';
        document.getElementById('prop-left').value = p.left || '';
        document.getElementById('prop-right').value = p.right || '';
        document.getElementById('prop-bottom').value = p.bottom || '';
        document.getElementById('prop-tail').value = p.tailPosition || '';
        document.getElementById('prop-tail-skew').value = (p.tailSkew || '').replace('deg', '');
        document.getElementById('prop-tail-scale').value = p.tailScale || '';
        document.getElementById('prop-curve').value = item.curve || '';
        document.getElementById('prop-curve-w').value = item.curveWidth || '';
        document.getElementById('prop-curve-h').value = item.curveHeight || '';
        document.getElementById('prop-rotation').value = item.rotation || '';
        document.getElementById('prop-font-size').value = item.fontSize || '';
        document.getElementById('prop-action-color').value = item.color || '#000000';
        document.getElementById('prop-outline-enabled').checked = !!item.outlineEnabled;
        document.getElementById('prop-outline-color').value = item.outlineColor || '#000000';
        document.getElementById('prop-outline-size').value = item.outlineSize || '1.0';
        document.getElementById('prop-duration').value = item.duration || '';
        document.getElementById('prop-panel-effect').value = item.panelEffect || '';
        document.getElementById('prop-font-family').value = item.fontFamily || '';

        this.toggleVisibility(item.displayType?.type);
        this.updateDatalist();
        this.bindPaletteTool();
    }

    bindPaletteTool() {
        const palBtn = document.getElementById('prop-gen-palette');
        const swatchesCont = document.getElementById('prop-palette-swatches');
        const textColorInput = document.getElementById('prop-action-color');
        const outlineColorInput = document.getElementById('prop-outline-color');

        if (!palBtn || !swatchesCont) return;

        palBtn.onclick = async () => {
            const panelSelector = document.getElementById('prop-panel').value;
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
                    s.style.cssText = `width:24px; height:24px; background:${hex}; border-radius:4px; cursor:pointer; border:1px solid rgba(255,255,255,0.1);`;
                    s.title = "Left click: Text Color | Right click: Outline Color";
                    
                    s.onclick = (e) => {
                        if (e.shiftKey) {
                            // Apply to BOTH
                            textColorInput.value = hex;
                            outlineColorInput.value = hex;
                            document.getElementById('prop-outline-enabled').checked = true;
                        } else {
                            // Just Text
                            textColorInput.value = hex;
                        }
                        this.onUpdate();
                    };

                    s.oncontextmenu = (e) => {
                        e.preventDefault();
                        // Just Outline
                        outlineColorInput.value = hex;
                        document.getElementById('prop-outline-enabled').checked = true;
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
        const mainPanelInput = document.getElementById('prop-panel');
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

        item.id = document.getElementById('prop-id').value;
        let type = document.getElementById('prop-type').value;
        if (['Narrator', 'InternalMonologue', 'Dialogue'].includes(type)) {
            item.displayType = { type: 'TextBlock', style: type };
        } else {
            item.displayType = { type: type };
        }

        const select = document.getElementById('prop-character-select');
        const input = document.getElementById('prop-character');
        if (select && !select.classList.contains('hidden') && select.value) {
            item.characterId = select.value;
            item.character = select.options[select.selectedIndex].text;
        } else {
            item.character = input.value;
            item.characterId = null;
        }

        item.text = document.getElementById('prop-text').value;
        item.panelEffect = document.getElementById('prop-panel-effect').value;
        item.curve = document.getElementById('prop-curve').value;
        item.curveWidth = document.getElementById('prop-curve-w').value;
        item.curveHeight = document.getElementById('prop-curve-h').value;
        item.rotation = document.getElementById('prop-rotation').value;
        item.fontSize = document.getElementById('prop-font-size').value;
        item.color = document.getElementById('prop-action-color').value;
        item.fontFamily = document.getElementById('prop-font-family').value;
        item.outlineEnabled = document.getElementById('prop-outline-enabled').checked;
        item.outlineColor = document.getElementById('prop-outline-color').value;
        item.outlineSize = document.getElementById('prop-outline-size').value;

        item.placement = {
            panel: document.getElementById('prop-panel').value,
            top: document.getElementById('prop-top').value,
            left: document.getElementById('prop-left').value,
            right: document.getElementById('prop-right').value,
            bottom: document.getElementById('prop-bottom').value,
            tailPosition: document.getElementById('prop-tail').value,
            tailSkew: document.getElementById('prop-tail-skew').value ? document.getElementById('prop-tail-skew').value + 'deg' : '',
            tailScale: document.getElementById('prop-tail-scale').value
        };
        if (item.displayType.type === 'Pause') {
            item.duration = parseInt(document.getElementById('prop-duration').value) || 1000;
        }
    }

    toggleVisibility(type) {
        const groups = {
            char: this.container.querySelector('.prop-group-character'),
            text: this.container.querySelector('.prop-group-text'),
            dur: this.container.querySelector('.prop-group-duration'),
            place: this.container.querySelector('.props-group'),
            curve: this.container.querySelector('.prop-group-curve'),
            font: this.container.querySelector('.prop-group-font')
        };
        const isPause = type === 'Pause';
        const isActionText = type === 'ActionText';

        if (groups.char) isPause ? groups.char.classList.add('hidden') : groups.char.classList.remove('hidden');
        if (groups.text) isPause ? groups.text.classList.add('hidden') : groups.text.classList.remove('hidden');
        if (groups.place) isPause ? groups.place.classList.add('hidden') : groups.place.classList.remove('hidden');
        if (groups.dur) isPause ? groups.dur.classList.remove('hidden') : groups.dur.classList.add('hidden');
        if (groups.curve) isActionText ? groups.curve.classList.remove('hidden') : groups.curve.classList.add('hidden');
        if (groups.font) isActionText ? groups.font.classList.remove('hidden') : groups.font.classList.add('hidden');
    }
}
