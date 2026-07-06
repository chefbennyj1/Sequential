// views/dashboard/js/LayoutBrowser.js
import { fetchLayouts } from '../../studio/api/StudioClient.js';

/**
 * Renders a visual grid of layout "Mini-Maps" for selection.
 */
export async function renderLayoutBrowser(containerId, hiddenInputId, currentLayoutId, mode = 'portrait') {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container) return;

    container.innerHTML = '<div style="color:#666; padding:20px;">Loading Visual Previews...</div>';

    try {
        const data = await fetchLayouts('portrait'); // Always fetch portrait
        if (!data.ok) throw new Error("Failed to fetch layouts");

        // Clear container and setup structure
        container.innerHTML = '';
        
        // Create Header
        const header = document.createElement('div');
        header.className = 'layout-browser-header';
        header.style = "display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:15px; padding:0 10px;";
        
        const title = document.createElement('span');
        title.className = "text-muted font-size-08 uppercase letter-spacing-1";
        title.textContent = "Layout Templates";
        header.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'layout-browser-grid-inner'; 

        const renderGrid = () => {
            grid.innerHTML = '';
            let layoutsToShow = data.layouts;

            if (layoutsToShow.length === 0) {
                grid.innerHTML = `<div class="text-muted padding-20">No layouts found.</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();

            for (const layoutFile of layoutsToShow) {
                const layoutId = layoutFile.replace('.html', '');
                const card = document.createElement('div');
                card.className = `layout-preview-card ${layoutId === currentLayoutId ? 'selected' : ''}`;
                card.classList.add('portrait-mode');
                
                if (layoutId === currentLayoutId && hiddenInput) {
                    hiddenInput.value = layoutFile;
                }

                const miniMap = document.createElement('div');
                miniMap.className = 'mini-map-container portrait-mode';
                
                fetch(`/layouts/portrait/${layoutFile}`).then(res => res.text()).then(html => {
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
                fragment.appendChild(card);
            }

            grid.appendChild(fragment);
        };

        container.appendChild(header);
        container.appendChild(grid);
        renderGrid();

    } catch (err) {
        console.error("LayoutBrowser Error:", err);
        container.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
    }
}
