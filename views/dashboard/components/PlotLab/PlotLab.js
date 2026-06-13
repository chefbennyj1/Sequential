// views/dashboard/components/PlotLab/PlotLab.js

let currentSeries = "";
let plotBeats = [];

// DOM Elements
let container, selectSeries, addBtn, board;

export async function initPlotLab(dashboardContainer) {
    container = dashboardContainer.querySelector('.plot-lab');
    if (!container) return;

    selectSeries = document.getElementById('plot-series-select');
    addBtn = document.getElementById('add-plot-beat-btn');
    board = document.getElementById('plot-board-container');

    // Fetch available series
    try {
        const res = await fetch('/api/library/series');
        const data = await res.json();
        if (data.ok) {
            selectSeries.innerHTML = '<option value="">Select Series</option>';
            data.series.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.folderName;
                opt.textContent = s.title;
                selectSeries.appendChild(opt);
            });
        }
    } catch (e) { console.error(e); }

    // Event Listeners
    selectSeries.addEventListener('change', async (e) => {
        currentSeries = e.target.value;
        if (currentSeries) {
            addBtn.disabled = false;
            await loadPlotBoard();
        } else {
            addBtn.disabled = true;
            board.innerHTML = '<div class="text-muted padding-20">Select a series to load the plot board.</div>';
        }
    });

    addBtn.addEventListener('click', () => openBeatForm());
    addBtn.disabled = true;

    // Setup Drag and Drop on the board
    setupDragAndDrop();
}

async function loadPlotBoard() {
    board.innerHTML = '<div class="text-muted padding-20">Loading...</div>';
    try {
        const res = await fetch(`/api/editor/plot-board/${currentSeries}`);
        const data = await res.json();
        plotBeats = data.board || [];
        renderBoard();
    } catch (e) {
        console.error(e);
        board.innerHTML = '<div class="text-danger padding-20">Failed to load plot board.</div>';
    }
}

async function savePlotBoard() {
    if (!currentSeries) return;
    try {
        await fetch(`/api/editor/plot-board/${currentSeries}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board: plotBeats })
        });
    } catch (e) { console.error("Failed to save plot board", e); }
}

function renderBoard() {
    board.innerHTML = '';
    if (plotBeats.length === 0) {
        board.innerHTML = '<div class="text-muted padding-20">No plot beats found. Click "+ Add Beat" to start brainstorming!</div>';
        return;
    }

    plotBeats.forEach((beat, index) => {
        const el = document.createElement('div');
        el.className = 'plot-beat-card glass glass--bright glass-card';
        el.draggable = true;
        el.dataset.index = index;

        el.innerHTML = `
            <div class="plot-beat-header">
                <span class="plot-beat-title">${beat.title || 'Untitled Beat'}</span>
                <span class="plot-beat-type type-${(beat.type || 'plot').toLowerCase()}">${beat.type || 'Plot'}</span>
            </div>
            <p class="plot-beat-desc">${beat.description || ''}</p>
            <div class="plot-beat-controls">
                <button class="glass glass-btn glass-btn--sm glass-btn--ghost edit-btn">Edit</button>
                <button class="glass glass-btn glass-btn--sm glass-btn--danger delete-btn">Delete</button>
            </div>
        `;

        // Drag events
        el.addEventListener('dragstart', () => el.classList.add('dragging'));
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            updateOrderFromDOM();
        });

        // Controls
        el.querySelector('.edit-btn').addEventListener('click', () => openBeatForm(index));
        el.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this beat?")) {
                plotBeats.splice(index, 1);
                renderBoard();
                savePlotBoard();
            }
        });

        board.appendChild(el);
    });
}

function setupDragAndDrop() {
    board.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(board, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (draggable) {
            if (afterElement == null) {
                board.appendChild(draggable);
            } else {
                board.insertBefore(draggable, afterElement);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.plot-beat-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateOrderFromDOM() {
    const newBeats = [];
    const elements = board.querySelectorAll('.plot-beat-card');
    elements.forEach(el => {
        const oldIndex = parseInt(el.dataset.index);
        newBeats.push(plotBeats[oldIndex]);
    });
    plotBeats = newBeats;
    renderBoard(); // re-render to update dataset indexes
    savePlotBoard();
}

// Modal Form Logic
function openBeatForm(editIndex = null) {
    const isEdit = editIndex !== null;
    const beat = isEdit ? plotBeats[editIndex] : { title: '', type: 'Plot', description: '' };

    const modal = document.createElement('div');
    modal.className = 'plot-form-modal';
    modal.innerHTML = `
        <div class="plot-form-content glass glass--bright glass-card">
            <h3>${isEdit ? 'Edit Story Beat' : 'New Story Beat'}</h3>
            <div class="input-field">
                <label>Title</label>
                <input type="text" id="beat-title" class="glass-input" value="${beat.title}">
            </div>
            <div class="input-field">
                <label>Type</label>
                <select id="beat-type" class="glass-select width-100">
                    <option value="Plot" ${beat.type === 'Plot' ? 'selected' : ''}>Plot / Action</option>
                    <option value="Lore" ${beat.type === 'Lore' ? 'selected' : ''}>Lore / Rule</option>
                    <option value="Character" ${beat.type === 'Character' ? 'selected' : ''}>Character Arc</option>
                </select>
            </div>
            <div class="input-field">
                <label>Description</label>
                <textarea id="beat-desc" class="glass-input" rows="6">${beat.description}</textarea>
            </div>
            <div class="flex-row gap-10 margin-t-20">
                <button id="save-beat-btn" class="glass glass-btn glass-btn--primary flex-1">Save Beat</button>
                <button id="cancel-beat-btn" class="glass glass-btn glass-btn--ghost flex-1">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#save-beat-btn').addEventListener('click', () => {
        const newBeat = {
            title: modal.querySelector('#beat-title').value,
            type: modal.querySelector('#beat-type').value,
            description: modal.querySelector('#beat-desc').value,
            id: beat.id || Date.now().toString()
        };

        if (isEdit) {
            plotBeats[editIndex] = newBeat;
        } else {
            plotBeats.push(newBeat);
        }

        renderBoard();
        savePlotBoard();
        modal.remove();
    });

    modal.querySelector('#cancel-beat-btn').addEventListener('click', () => modal.remove());
}