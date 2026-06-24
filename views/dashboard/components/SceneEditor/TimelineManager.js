// views/dashboard/components/SceneEditor/TimelineManager.js

export class TimelineManager {
    constructor(container, onSelect, onReorder, onDuplicate) {
        this.container = container;
        this.onSelect = onSelect;
        this.onReorder = onReorder;
        this.onDuplicate = onDuplicate;
        this.selectedItemIndex = -1;
        this.dragSrcIndex = -1;
        this.currentSceneData = [];
        this.availableCharacters = [];
        this.contextMenu = null;
        this.initContextMenu();
        this.initEventListeners();
    }

    initEventListeners() {
        // --- Event Delegation on Container: Click & Context Menu ---
        this.container.addEventListener('click', (e) => {
            const item = e.target.closest('.scene-item');
            if (item) {
                const index = parseInt(item.dataset.index);
                this.onSelect(index);
            }
        });

        this.container.addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.scene-item');
            if (item) {
                e.preventDefault();
                const index = parseInt(item.dataset.index);
                this.showContextMenu(e.clientX, e.clientY, index);
            }
        });
    }

    initContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'timeline-context-menu hidden';
        this.contextMenu.innerHTML = `
            <ul>
                <li id="cm-duplicate">Duplicate Item</li>
            </ul>
        `;
        document.body.appendChild(this.contextMenu);

        document.addEventListener('click', () => this.hideContextMenu());
    }

    showContextMenu(x, y, index) {
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.classList.remove('hidden');

        const dupBtn = this.contextMenu.querySelector('#cm-duplicate');
        dupBtn.onclick = (e) => {
            e.stopPropagation();
            this.hideContextMenu();
            if (this.onDuplicate) this.onDuplicate(index);
        };
    }

    hideContextMenu() {
        if (this.contextMenu) this.contextMenu.classList.add('hidden');
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
        this.list = this.container.querySelector('#sceneTreeList');
        if (!this.list) return;
        this.list.innerHTML = '';

        if (this.currentSceneData.length === 0) {
            this.list.innerHTML = '<div class="text-muted italic padding-15">Empty Scene</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

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
                        <div class="glass-badge glass-badge--aqua">${type}</div>
                        <div class="item-meta">ID: ${shortId}</div>
                    </div>
                    <div class="item-body">
                        ${avatarHtml}
                        <span class="item-char">${char || '---'}</span>
                    </div> 
                    ${previewText ? `<div class="item-text">${previewText}</div>` : ''}      
                </div>
            `;

            li.addEventListener('dragstart', e => {
                this.dragSrcIndex = index;
                e.dataTransfer.effectAllowed = 'move';        
                li.classList.add('is-dragging');
            });
            li.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            li.addEventListener('drop', (e) => this.handleDrop(e, index));
            li.addEventListener('dragend', () => {
                li.classList.remove('is-dragging');
                this.list.querySelectorAll('.scene-item').forEach(i => i.classList.remove('over'));
            });

            fragment.appendChild(li);
        });

        this.list.appendChild(fragment);
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
