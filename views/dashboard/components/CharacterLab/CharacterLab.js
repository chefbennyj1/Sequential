import { fetchSeriesAPI } from '../../js/ApiService.js';

export default class CharacterEditor {
    constructor() {
        this.container = document.getElementById('character-editor-container');
        this.listContainer = document.getElementById('character-list');
        this.formContainer = document.getElementById('character-form-container');
        this.saveBtn = document.getElementById('save-character-btn');
        this.createBtn = document.getElementById('create-character-btn');
        this.cancelBtn = document.getElementById('cancel-character-btn');
        this.seriesSelect = document.getElementById('char-series-select');
        
        this.activeCharacterId = null;
        this.activeSeriesId = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.populateSeriesSelect();
    }

    bindEvents() {
        this.createBtn.addEventListener('click', () => this.showForm());
        this.saveBtn.addEventListener('click', () => this.saveCharacter());
        this.cancelBtn.addEventListener('click', () => this.hideForm());
        
        const colorPicker = document.getElementById('char-color');
        const colorText = document.getElementById('char-color-text');
        
        colorPicker.addEventListener('input', (e) => colorText.value = e.target.value);
        colorText.addEventListener('input', (e) => colorPicker.value = e.target.value);

        document.getElementById('char-avatar-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.uploadAvatar(e.target.files[0]);
        });

        // Reference Image Upload Listener
        document.getElementById('char-reference-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.uploadReference(e.target.files[0]);
        });

        this.seriesSelect.addEventListener('change', (e) => {
            this.activeSeriesId = e.target.value;
            this.createBtn.disabled = !this.activeSeriesId;
            if (this.activeSeriesId) {
                this.loadCharacters(this.activeSeriesId);
            } else {
                this.listContainer.innerHTML = '';
            }
        });
    }

    // ... (populateSeriesSelect, loadCharacters, renderList remain same) ...

    async populateSeriesSelect() {
        try {
            const seriesList = await fetchSeriesAPI();
            this.seriesSelect.innerHTML = '<option value="">Select Series</option>';
            seriesList.forEach(series => {
                const option = document.createElement('option');
                option.value = series._id;
                option.textContent = series.title;
                this.seriesSelect.appendChild(option);
            });
        } catch (e) {
            console.error("Failed to load series for character editor", e);
        }
    }

    async loadCharacters(seriesId) {
        try {
            const response = await fetch(`/api/characters?series=${seriesId}`);
            if (!response.ok) throw new Error('Failed to fetch characters');
            const characters = await response.json();
            this.renderList(characters);
        } catch (error) {
            console.error('Error loading characters:', error);
        }
    }

    renderList(characters) {
        this.listContainer.innerHTML = '';
        if (characters.length === 0) {
            this.listContainer.innerHTML = '<p class="text-muted">No characters found for this series.</p>';
            return;
        }

        characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'character-item';
            
            const avatarUrl = char.image || '/views/public/images/avatar.png';
            
            item.innerHTML = `
                <img src="${avatarUrl}" class="char-avatar" style="border-color: ${char.color}">
                <div class="char-info">
                    <span class="char-name">${char.name}</span>
                    <span class="char-desc">${char.description || 'No description'}</span>
                </div>
                <button class="edit-btn" data-id="${char._id}">EDIT</button>
            `;
            
            item.dataset.character = JSON.stringify(char);

            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                const charData = JSON.parse(e.target.closest('.character-item').dataset.character);
                this.showForm(charData);
            });

            this.listContainer.appendChild(item);
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
            document.getElementById('char-color-text').value = character.color;
            document.getElementById('char-voice-id').value = character.voiceId || '';
            document.getElementById('char-description').value = character.description || '';
            document.getElementById('char-avatar-preview').src = character.image || '/views/public/images/avatar.png';
            document.getElementById('form-title').innerText = 'EDIT RECORD: ' + character.name;
            
            // Enable uploads
            document.getElementById('char-avatar-input').disabled = false;
            document.getElementById('char-reference-input').disabled = false;

            // Render References
            if (character.referenceImages && character.referenceImages.length > 0) {
                this.renderReferences(character.referenceImages);
            }

        } else {
            this.activeCharacterId = null;
            document.getElementById('char-name').value = '';
            document.getElementById('char-color').value = '#ffffff';
            document.getElementById('char-color-text').value = '#ffffff';
            document.getElementById('char-voice-id').value = '';
            document.getElementById('char-description').value = '';
            document.getElementById('char-avatar-preview').src = '/views/public/images/avatar.png';
            document.getElementById('form-title').innerText = 'NEW RECORD';
            
            // Disable uploads until saved
            document.getElementById('char-avatar-input').disabled = true;
            document.getElementById('char-reference-input').disabled = true;
        }
    }

    renderReferences(images) {
        const refGrid = document.getElementById('char-references-grid');
        refGrid.innerHTML = '';
        images.forEach(imgSrc => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.className = 'ref-thumb';
            img.onclick = () => window.open(imgSrc, '_blank');
            refGrid.appendChild(img);
        });
    }

    hideForm() {
        this.container.classList.remove('editing');
        this.formContainer.classList.add('hidden');
        this.listContainer.classList.remove('hidden');
        this.createBtn.classList.remove('hidden');
        this.activeCharacterId = null;
    }

    async uploadAvatar(file) {
        if (!this.activeCharacterId) return alert("Please save the character first.");
        
        const fd = new FormData();
        fd.append('avatar', file);

        try {
            const res = await fetch(`/api/characters/${this.activeCharacterId}/avatar`, {
                method: 'POST',
                body: fd
            });
            const data = await res.json();
            if (data.url) {
                document.getElementById('char-avatar-preview').src = data.url;
                await this.loadCharacters(this.activeSeriesId);
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Upload error');
        }
    }

    async uploadReference(file) {
        if (!this.activeCharacterId) return alert("Please save the character first.");

        const fd = new FormData();
        fd.append('image', file);

        try {
            const res = await fetch(`/api/characters/${this.activeCharacterId}/reference`, {
                method: 'POST',
                body: fd
            });
            const data = await res.json();
            if (data.url) {
                this.renderReferences(data.referenceImages);
                // We don't strictly need to reload the list for references, but updating local state is good
                // Note: renderList doesn't currently show ref images, so visual update in form is enough.
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Upload error');
        }
    }

    async saveCharacter() {
        const name = document.getElementById('char-name').value;
        const color = document.getElementById('char-color').value;
        const voiceId = document.getElementById('char-voice-id').value;
        const description = document.getElementById('char-description').value;

        if (!name) return alert('Name is required');
        if (!this.activeSeriesId) return alert('Series must be selected');

        const payload = { 
            name, 
            color, 
            voiceId, 
            description,
            series: this.activeSeriesId // Include Series ID
        };

        try {
            let url = '/api/characters';
            let method = 'POST';

            if (this.activeCharacterId) {
                url = `/api/characters/${this.activeCharacterId}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to save character');

            await this.loadCharacters(this.activeSeriesId);
            this.hideForm();

        } catch (error) {
            console.error('Error saving character:', error);
            alert('Error saving character');
        }
    }
}