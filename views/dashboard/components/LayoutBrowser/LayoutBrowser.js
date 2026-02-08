// views/dashboard/js/LayoutBrowser.js
import { fetchLayouts } from '../../js/ApiService.js';

/**
 * Renders a visual grid of layout "Mini-Maps" for selection.
 */
export async function renderLayoutBrowser(containerId, hiddenInputId, currentLayoutId) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!container) return;

    container.innerHTML = '<div style="color:#666; padding:20px;">Loading Visual Previews...</div>';

    try {
        const data = await fetchLayouts();
        if (!data.ok) throw new Error("Failed to fetch layouts");

        container.innerHTML = '';
        
        for (const layoutFile of data.layouts) {
            const layoutId = layoutFile.replace('.html', '');
            const card = document.createElement('div');
            card.className = `layout-preview-card ${layoutId === currentLayoutId ? 'selected' : ''}`;
            
            // If this is the active layout, set the hidden input initially
            if (layoutId === currentLayoutId && hiddenInput) {
                hiddenInput.value = layoutFile;
            }

            // Mini-map container
            const miniMap = document.createElement('div');
            miniMap.className = 'mini-map-container';
            
            // Fetch the layout HTML directly from server
            const res = await fetch(`/layouts/${layoutFile}`);
            const html = await res.text();
            
            // Inject and clean (remove scripts if any)
            miniMap.innerHTML = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
            
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
                    // Trigger a custom event for other managers to react if needed
                    container.dispatchEvent(new CustomEvent('layoutChanged', { detail: { layout: layoutFile } }));
                }
            };

            container.appendChild(card);
        }
    } catch (err) {
        console.error("LayoutBrowser Error:", err);
        container.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
    }
}
