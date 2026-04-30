// views/dashboard/js/LayoutBrowser.js
import { fetchLayouts } from '../../studio/api/StudioClient.js';

/**
 * Renders a visual grid of layout "Mini-Maps" for selection.
 */
export async function renderLayoutBrowser(containerId, hiddenInputId, currentLayoutId, mode = 'landscape', landscapeLayoutId = null) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container) return;

    container.innerHTML = '<div style="color:#666; padding:20px;">Loading Visual Previews...</div>';

    try {
        const data = await fetchLayouts(mode);
        if (!data.ok) throw new Error("Failed to fetch layouts");

        // Clear container and setup structure
        container.innerHTML = '';
        
        // Create Header for Filter
        const header = document.createElement('div');
        header.className = 'layout-browser-header';
        header.style = "display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:15px; padding:0 10px;";
        
        const title = document.createElement('span');
        title.className = "text-muted font-size-08 text-uppercase letter-spacing-1";
        title.textContent = mode === 'portrait' ? "Portrait Options" : "Landscape Options";
        header.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'layout-browser-grid-inner'; // We'll style this to match the old .layout-browser-grid

        const renderGrid = (useFilter) => {
            grid.innerHTML = '';
            let layoutsToShow = data.layouts;

            if (useFilter && mode === 'portrait' && landscapeLayoutId && data.layoutMap && data.layoutMap[landscapeLayoutId]) {
                const compatibleIds = data.layoutMap[landscapeLayoutId];
                layoutsToShow = data.layouts.filter(file => compatibleIds.includes(file.replace('.html', '')));
            }

            if (layoutsToShow.length === 0) {
                grid.innerHTML = `<div class="text-muted padding-20">No compatible ${mode} layouts defined for ${landscapeLayoutId}.</div>`;
                return;
            }

            for (const layoutFile of layoutsToShow) {
                const layoutId = layoutFile.replace('.html', '');
                const card = document.createElement('div');
                card.className = `layout-preview-card ${layoutId === currentLayoutId ? 'selected' : ''}`;
                if (mode === 'portrait') card.classList.add('portrait-mode');
                
                if (layoutId === currentLayoutId && hiddenInput) {
                    hiddenInput.value = layoutFile;
                }

                const miniMap = document.createElement('div');
                miniMap.className = 'mini-map-container' + (mode === 'portrait' ? ' portrait-mode' : '');
                
                fetch(`/layouts/${mode}/${layoutFile}`).then(res => res.text()).then(html => {
                    miniMap.innerHTML = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
                });
                
                const nameLabel = document.createElement('div');
                nameLabel.className = 'layout-card-name';
                nameLabel.textContent = layoutId.replace(/_/g, ' ').toUpperCase();

                card.appendChild(miniMap);
                card.appendChild(nameLabel);

                card.onclick = () => {
                    container.querySelectorAll('.layout-preview-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    if (hiddenInput) {
                        hiddenInput.value = layoutFile;
                        container.dispatchEvent(new CustomEvent('layoutChanged', { detail: { layout: layoutFile } }));
                    }
                };
                grid.appendChild(card);
            }
        };

        // Add Filter Toggle if in portrait mode and we have a landscape ID to match against
        if (mode === 'portrait' && landscapeLayoutId) {
            const filterWrapper = document.createElement('div');
            filterWrapper.className = "flex-row-center gap-10";
            
            const hasMatches = data.layoutMap && data.layoutMap[landscapeLayoutId] && data.layoutMap[landscapeLayoutId].length > 0;
            
            filterWrapper.innerHTML = `
                <label class="font-size-07 text-muted cursor-pointer" style="display:flex; align-items:center; gap:5px;">
                    <input type="checkbox" id="layoutCompFilter" ${hasMatches ? 'checked' : ''} style="margin:0;">
                    Compatible Only
                </label>
            `;
            header.appendChild(filterWrapper);

            const filterCheckbox = filterWrapper.querySelector('#layoutCompFilter');
            filterCheckbox.onchange = (e) => renderGrid(e.target.checked);
            
            container.appendChild(header);
            container.appendChild(grid);
            renderGrid(hasMatches); // Initial render with filter if matches exist
        } else {
            container.appendChild(header);
            container.appendChild(grid);
            renderGrid(false);
        }

    } catch (err) {
        console.error("LayoutBrowser Error:", err);
        container.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
    }
}
