// services/public/SceneManager.js
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';
import ActionText from '/libs/ActionText/ActionText.js';
import { resolveMediaUrl } from '/libs/Utility.js';

export async function initScene(container, pageInfo, sceneData, mediaData = []) {
    const { series, pageId, pageIndex, chapter, volume } = pageInfo;
    const page = container.querySelector('.section-container') || container;

    // --- Detect Global Mode (Any floating panels exist?) ---
    const floatingPanelSelectors = new Set(
        mediaData.filter(m => m.isFloating).map(m => m.panel)
    );
    const hasFloatingPanels = floatingPanelSelectors.size > 0;
    const visualItemsToRender = [];

    const getGlobalPos = (placement, panelEl) => {
        if (!panelEl || panelEl === page) return placement;
        
        const pageRect = page.getBoundingClientRect();
        const panelRect = panelEl.getBoundingClientRect();

        const result = { ...placement };

        const translateCoord = (val, size, panelSize, pageOffset, pageSize) => {
            if (!val || val === 'auto') return 'auto';
            const pixels = (parseFloat(val) / 100) * panelSize;
            const globalPixels = (size - pageOffset) + pixels;
            return ((globalPixels / pageSize) * 100).toFixed(2) + '%';
        };

        // Resolve Left/Right
        result.left = translateCoord(placement.left, panelRect.left, panelRect.width, pageRect.left, pageRect.width);
        result.right = translateCoord(placement.right, panelRect.right, -panelRect.width, pageRect.right, -pageRect.width);

        // Resolve Top/Bottom
        result.top = translateCoord(placement.top, panelRect.top, panelRect.height, pageRect.top, pageRect.height);
        result.bottom = translateCoord(placement.bottom, panelRect.bottom, -panelRect.height, pageRect.bottom, -pageRect.height);

        return result;
    };
    
    for (const [index, item] of sceneData.entries()) {
        let visualItem = null;
        const targetPanel = item.placement?.panel;
        const panelEl = targetPanel ? container.querySelector(targetPanel) : (item.displayType.type === 'TextBlock' ? page : null);

        // --- Orphan Detection ---
        const isFloatingTarget = targetPanel && floatingPanelSelectors.has(targetPanel);
        if ((item.displayType.type === 'SpeechBubble' || item.displayType.type === 'TextBlock') && !panelEl && !isFloatingTarget) {
            console.warn(`Orphaned item detected: ${item.id} targeting ${targetPanel}`);
            item.isOrphaned = true;
            continue; 
        }

        const renderParent = (hasFloatingPanels || isFloatingTarget) ? page : panelEl;
        const finalPlacement = (hasFloatingPanels || isFloatingTarget) ? getGlobalPos(item.placement, panelEl) : item.placement;

        if (item.displayType.type === 'SpeechBubble') {
            const bubbleOptions = { ...item, series, volume, chapter, pageId, pageIndex, dialogueIndex: index };
            Object.assign(bubbleOptions, finalPlacement); 
            
            const bubble = new SpeechBubble(renderParent, bubbleOptions);
            await bubble.render();
            visualItem = bubble;

        } else if (item.displayType.type === 'TextBlock') {
            const textBlockOptions = { 
                ...item, 
                series, 
                volume, 
                chapter, 
                pageId, 
                textBlockType: item.displayType.style || 'Narrator', 
                pageIndex, 
                dialogueIndex: index
            };
            Object.assign(textBlockOptions, finalPlacement); 
            
            const textBlock = new TextBlock(renderParent, textBlockOptions);
            await textBlock.render();
            visualItem = textBlock;

        } else if (item.displayType.type === 'ActionText') {
            const actionTextOptions = { ...item, series, volume, chapter, pageId };
            Object.assign(actionTextOptions, finalPlacement);
            
            const actionText = new ActionText(renderParent, actionTextOptions);
            await actionText.render();
            visualItem = actionText;
        }

        if (visualItem) {
            visualItemsToRender.push(visualItem);
        }
    }

    if (visualItemsToRender.length > 0) {
        visualItemsToRender.sort((a, b) => {
            const orderA = (a.options && a.options.displayOrder !== undefined) ? a.options.displayOrder : Infinity;
            const orderB = (b.options && b.options.displayOrder !== undefined) ? b.options.displayOrder : Infinity;
            return orderA - orderB;
        });

        visualItemsToRender.forEach(item => {
            if (item.show) item.show();
            if (item.element) item.element.style.visibility = 'visible'; 
        });

        return { 
            cleanup: () => {
                 visualItemsToRender.forEach(item => {
                    if (item.destroy) item.destroy();
                });
            }, 
            restart: () => {} 
        };
    }
    
    return { cleanup: () => {}, restart: () => {} };
}
