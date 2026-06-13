// views/dashboard/components/CharacterLab/CharacterLab.js
import { fetchCharactersAPI, fetchSeriesAPI } from '../../studio/api/StudioClient.js';

export default class CharacterLab {
    constructor(container) {
        try {
            this.container = container;
            if (!container) return; // Guard clause
            
            this.listContainer = container.querySelector('#character-list');
            this.formContainer = container.querySelector('#character-form-container');
            this.createBtn = container.querySelector('#create-character-btn');
            this.seriesSelect = container.querySelector('#char-series-select');
            this.activeCharacterId = null;
            this.activeSeriesId = null;

            this.init();
        } catch (err) {
            console.error("[CharacterLab] Constructor failed:", err);
        }
    }

    async init() {
        console.log("[CharacterLab] Initializing...");
        if (!this.seriesSelect) {
            console.warn("[CharacterLab] Missing #char-series-select. Initialization aborted.");
            return;
        }
        
        // Load series list
        try {
            const seriesList = await fetchSeriesAPI();
            if (Array.isArray(seriesList)) {
                this.seriesSelect.innerHTML = '<option value="">Select Series</option>';
                seriesList.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s._id;
                    opt.textContent = s.title;
                    this.seriesSelect.appendChild(opt);
                });
            }
        } catch (e) { 
            console.error("[CharacterLab] Failed to load series:", e); 
        }

        this.seriesSelect.onchange = (e) => {
            this.activeSeriesId = e.target.value;
            if (this.createBtn) this.createBtn.disabled = !this.activeSeriesId;
            if (this.activeSeriesId) this.loadCharacters();
            else if (this.listContainer) this.listContainer.innerHTML = '';
        };

        if (this.createBtn) {
            this.createBtn.onclick = () => this.showForm();
        }
        
        const saveBtn = document.getElementById('save-character-btn');
        if (saveBtn) saveBtn.onclick = () => this.saveCharacter();
        
        const cancelBtn = document.getElementById('cancel-character-btn');
        if (cancelBtn) cancelBtn.onclick = () => this.hideForm();

        // Handle Avatar Upload
        const avatarInput = document.getElementById('char-avatar-input');
        if (avatarInput) {
            const avatarLabel = avatarInput.closest('label');
            if (avatarLabel) {
                avatarLabel.addEventListener('click', (e) => {
                    if (!this.activeCharacterId) {
                        e.preventDefault();
                        alert("Please Save the Record first before uploading a photo. We need an active profile to attach the image to!");
                    }
                }, true); // Capture phase to ensure we intercept before file picker
            }
            avatarInput.onchange = (e) => this.handleAvatarUpload(e);
        }

        // Handle AI Scan Profile
        this.aiScanBtn = document.getElementById('ai-analyze-char-btn');
        if (this.aiScanBtn) {
            this.aiScanBtn.onclick = () => this.handleAIScan();
        }

        // Handle Reference Upload
        const refInput = document.getElementById('char-reference-input');
        if (refInput) {
            const refLabel = refInput.closest('label');
            if (refLabel) {
                refLabel.addEventListener('click', (e) => {
                    if (!this.activeCharacterId) {
                        e.preventDefault();
                        alert("Please Save the Record first before adding reference images. We need an active profile to attach the files to!");
                    }
                }, true);
            }
            refInput.onchange = (e) => this.handleReferenceUpload(e);
        }
    }

    async loadCharacters() {
        this.listContainer.innerHTML = '<div class="text-muted">Loading subjects...</div>';
        try {
            const res = await fetch(`/api/characters?series=${this.activeSeriesId}`);
            const data = await res.json();
            if (data.ok) {
                this.renderList(data.characters);
            } else {
                throw new Error(data.message);
            }
        } catch (e) {
            this.listContainer.innerHTML = `<div class="text-accent">Failed to load dossier: ${e.message}</div>`;
        }
    }

    renderList(chars) {
        this.listContainer.innerHTML = '';
        if (!chars || chars.length === 0) {
            this.listContainer.innerHTML = '<div class="text-muted padding-20 italic">No characters found for this series.</div>';
            return;
        }
        chars.forEach(char => {
            const card = document.createElement('div');
            card.className = 'char-card glass glass--bright glass-card';
            card.innerHTML = `
                <img src="${char.image || '/views/public/images/avatar.png'}" class="char-avatar" style="border-color: ${char.color}">
                <div class="char-info">
                    <span class="char-name">${char.name}</span>
                    <span class="char-desc">${char.description || 'No description'}</span>
                </div>
            `;
            card.onclick = () => this.showForm(char);
            this.listContainer.appendChild(card);
        });
    }

    showForm(character = null) {
        this.container.classList.add('editing');
        this.formContainer.classList.remove('hidden');
        this.listContainer.classList.add('hidden');
        this.createBtn.classList.add('hidden');

        const refGrid = document.getElementById('char-references-grid');
        refGrid.innerHTML = ''; // Clear references

        if (character) {
            this.activeCharacterId = character._id;
            document.getElementById('char-name').value = character.name;
            document.getElementById('char-color').value = character.color;
            document.getElementById('char-description').value = character.description || '';
            document.getElementById('char-avatar-preview').src = character.image || '/views/public/images/avatar.png';
            document.getElementById('form-title').innerText = 'EDIT RECORD: ' + character.name;

            // Enable uploads
            this.setUploadsState(true);
            
            // Enable AI Scan if image exists
            this.aiScanBtn.disabled = !character.image;

            // Render References
            if (character.referenceImages && character.referenceImages.length > 0) {
                this.renderReferences(character.referenceImages);
            }

        } else {
            this.activeCharacterId = null;
            document.getElementById('char-name').value = '';
            document.getElementById('char-color').value = '#ffffff';
            document.getElementById('char-description').value = '';
            document.getElementById('char-avatar-preview').src = '/views/public/images/avatar.png';
            document.getElementById('form-title').innerText = 'NEW RECORD';

            // Disable uploads and AI until saved
            this.setUploadsState(false);
            this.aiScanBtn.disabled = true;
        }
    }

    setUploadsState(enabled) {
        const avatarInput = document.getElementById('char-avatar-input');
        const refInput = document.getElementById('char-reference-input');
        if (!avatarInput || !refInput) return;

        const avatarLabel = avatarInput.closest('label');
        const refLabel = refInput.closest('label');

        // We don't disable the input anymore, we intercept the click on the label
        // to show a helpful message if not enabled.
        if (enabled) {
            if (avatarLabel) {
                avatarLabel.style.opacity = '1';
                avatarLabel.style.cursor = 'pointer';
                avatarLabel.title = "";
            }
            if (refLabel) {
                refLabel.style.opacity = '1';
                refLabel.style.cursor = 'pointer';
                refLabel.title = "";
            }
        } else {
            if (avatarLabel) {
                avatarLabel.style.opacity = '0.5';
                avatarLabel.style.cursor = 'pointer'; // Keep pointer to encourage click
                avatarLabel.title = "Save character record first to enable uploads";
            }
            if (refLabel) {
                refLabel.style.opacity = '0.5';
                refLabel.style.cursor = 'pointer';
                refLabel.title = "Save character record first to enable uploads";
            }
        }
    }

    async handleAIScan() {
        if (!this.activeCharacterId) {
            return alert("Please Save the character record first to enable AI Profile Scanning.");
        }
        
        const originalText = this.aiScanBtn.textContent;
        this.aiScanBtn.disabled = true;
        this.aiScanBtn.textContent = "Scanning...";

        try {
            const res = await fetch(`/api/characters/${this.activeCharacterId}/analyze-avatar`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.ok) {
                document.getElementById('char-description').value = data.description;
                // Optional: display hashtags somewhere or alert
                console.log("[AI Scan] Tags:", data.hashtags);
                alert("AI Scan Complete! Profile updated.");
            } else {
                throw new Error(data.message);
            }
        } catch (e) {
            alert("AI Scan Failed: " + e.message);
        } finally {
            this.aiScanBtn.disabled = false;
            this.aiScanBtn.textContent = originalText;
        }
    }

    renderReferences(images) {
        const refGrid = document.getElementById('char-references-grid');
        refGrid.innerHTML = '';
        images.forEach(imgSrc => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.className = 'ref-thumb';
            refGrid.appendChild(img);
        });
    }

    hideForm() {
        this.container.classList.remove('editing');
        this.formContainer.classList.add('hidden');
        this.listContainer.classList.remove('hidden');
        this.createBtn.classList.remove('hidden');
    }

    async handleAvatarUpload(e) {
        if (!this.activeCharacterId) return;
        const file = e.target.files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append('avatar', file);

        try {
            const res = await fetch(`/api/characters/${this.activeCharacterId}/avatar`, {
                method: 'POST',
                body: fd
            });
            const data = await res.json();
            if (data.ok) {
                document.getElementById('char-avatar-preview').src = data.image;
                this.aiScanBtn.disabled = false; // Enable AI Scan now that we have an image
                this.loadCharacters(); // Refresh list
            } else {
                alert('Avatar upload failed: ' + data.message);
            }
        } catch (e) { console.error(e); }
    }

    async handleReferenceUpload(e) {
        if (!this.activeCharacterId) return;
        const file = e.target.files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append('image', file);

        try {
            const res = await fetch(`/api/characters/${this.activeCharacterId}/reference`, {
                method: 'POST',
                body: fd
            });
            const data = await res.json();
            if (data.ok) {
                this.renderReferences(data.referenceImages);
            } else {
                alert('Reference upload failed: ' + data.message);
            }
        } catch (e) {
            console.error(e);
            alert('Upload error');
        }
    }

    async saveCharacter() {
        const name = document.getElementById('char-name').value;
        const color = document.getElementById('char-color').value;
        const description = document.getElementById('char-description').value;

        if (!name) return alert('Name is required');
        if (!this.activeSeriesId) return alert('Series must be selected');

        const payload = {
            name,
            color,
            description,
            series: this.activeSeriesId // Include Series ID
        };

        try {
            let url = '/api/characters';
            let method = 'POST';

            if (this.activeCharacterId) {
                url += '/' + this.activeCharacterId;
                method = 'PUT';
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.ok) {
                if (window.GlassToast) {
                    window.GlassToast.show('success', 'Saved', `Character '${name}' successfully updated.`);
                }
                this.hideForm();
                this.loadCharacters();
            } else {
                alert('Error: ' + data.message);
            }
        } catch (e) { console.error(e); }
    }
}