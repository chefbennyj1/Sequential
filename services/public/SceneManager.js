// services/public/SceneManager.js
/**
 * Sequential Comic Server - SceneManager
 * This version is optimized for static comic presentation.
 * Audio and Video sequential playback logic has been removed.
 */
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';
import { resolveMediaUrl } from '/libs/Utility.js';

export async function initScene(container, pageInfo, sceneData) {
    const { series, pageId, pageIndex, chapter, volume } = pageInfo;
    const page = container.querySelector('.section-container') || container;

    const renderedItems = [];
    
    // Render all items in the scene immediately
    for (const [index, item] of sceneData.entries()) {
        let renderedItem = null;

        if (item.displayType.type === 'SpeechBubble') {
            const panelEl = container.querySelector(item.placement.panel);
            if (!panelEl) {
                console.error(`SpeechBubble on page ${pageId}: Panel '${item.placement.panel}' not found.`);
                continue;
            }
            const bubbleOptions = { ...item, series, volume, chapter, pageId, pageIndex, dialogueIndex: index };
            if (item.attributes) bubbleOptions.attributes = item.attributes;
            if (item.style) bubbleOptions.style = item.style;
            Object.assign(bubbleOptions, item.placement); 
            const bubble = new SpeechBubble(panelEl, bubbleOptions);
            await bubble.render();
            if (bubble.show) bubble.show();
            if (bubble.element) bubble.element.style.visibility = 'visible';
            renderedItem = bubble;

        } else if (item.displayType.type === 'TextBlock') {
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : page;
            if (!panelEl) {
                console.error(`TextBlock on page ${pageId}: Panel or page container not found.`);
                continue;
            }
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
            if (item.attributes) textBlockOptions.attributes = item.attributes;
            if (item.style) textBlockOptions.style = item.style;
            Object.assign(textBlockOptions, item.placement); 
            const textBlock = new TextBlock(panelEl, textBlockOptions);
            await textBlock.render();
            if (textBlock.show) textBlock.show();
            if (textBlock.element) textBlock.element.style.visibility = 'visible';
            renderedItem = textBlock;
        }

        if (renderedItem) {
            renderedItems.push(renderedItem);
        }
    }

    // Return simple cleanup logic
    return { 
        cleanup: () => {
            renderedItems.forEach(item => {
                if (item.destroy) item.destroy();
            });
            renderedItems.length = 0;
        }, 
        restart: () => {
            // No restart needed for static scenes, but provided for API compatibility
            console.log("Static scene restart requested - no action needed.");
        },
        signalMediaActionCompletion: () => {}
    };
}