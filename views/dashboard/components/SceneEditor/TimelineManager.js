// views/dashboard/components/SceneEditor/TimelineManager.js

export class TimelineManager {
    constructor(container, onSelect, onReorder) {
        this.list = container.querySelector('#sceneTreeList');
        this.onSelect = onSelect;
        this.onReorder = onReorder;
        this.selectedItemIndex = -1;
        this.dragSrcIndex = -1;
        this.currentSceneData = [];
        this.availableCharacters = [];
    }

    setData(sceneData, characters) {
        this.currentSceneData = sceneData;
        this.availableCharacters = characters;
        this.render();
    }

    setSelectedIndex(index) {
        this.selectedItemIndex = index;
        this.render();
    }

    render() {
        if (!this.list) return;
        this.list.innerHTML = '';
        this.currentSceneData.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = `scene-item ${index === this.selectedItemIndex ? 'selected' : ''} ${item.isOrphaned ? 'is-orphaned' : ''}`;
            li.draggable = true;
            li.dataset.index = index;

            const type = item.displayType?.type || 'Unknown';
            const char = item.character || '';
            const previewText = item.text ? `"${item.text.substring(0, 30)}${item.text.length > 30 ? '...' : ''}"` : '';
            const shortId = item.id?.substring(0, 4) || '----';

            let avatarHtml = '';
            if (item.characterId && this.availableCharacters.length > 0) {
                const charObj = this.availableCharacters.find(c => c._id === item.characterId);
                if (charObj && charObj.image) {
                    avatarHtml = `<img src="${charObj.image}" class="char-avatar-mini">`;
                }
            }

            li.innerHTML = `
                <div class="item-main">
                    <div class="item-header">
                        <span class="item-type">${type}</span>
                        <div style="display:flex; align-items:center;">
                            ${avatarHtml}
                            ${char ? `<span class="item-char">${char}</span>` : ''}
                        </div>
                    </div>
                    ${previewText ? `<div class="item-text">${previewText}</div>` : ''}
                </div>
                <div class="item-meta" style="display:flex; align-items:center; gap:5px;">
                    ID: ${shortId}
                </div>
            `;

            li.onclick = () => this.onSelect(index);
            
            li.addEventListener('dragstart', e => { 
                this.dragSrcIndex = index; 
                e.dataTransfer.effectAllowed = 'move'; 
                li.style.opacity = '0.4'; 
            });
            li.addEventListener('dragover', e => { 
                e.preventDefault(); 
                e.dataTransfer.dropEffect = 'move'; 
            });
            li.addEventListener('drop', (e) => this.handleDrop(e, index));
            li.addEventListener('dragend', () => { 
                li.style.opacity = '1'; 
                document.querySelectorAll('.scene-item').forEach(i => i.classList.remove('over')); 
            });

            this.list.appendChild(li);
        });
    }

    handleDrop(e, destIndex) {
        e.stopPropagation();
        if (this.dragSrcIndex !== destIndex) {
            const item = this.currentSceneData[this.dragSrcIndex];
            this.currentSceneData.splice(this.dragSrcIndex, 1);
            this.currentSceneData.splice(destIndex, 0, item);
            this.currentSceneData.forEach((itm, i) => itm.displayOrder = i);
            this.onReorder(this.currentSceneData, destIndex);
        }
    }
}
