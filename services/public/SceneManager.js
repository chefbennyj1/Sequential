// services/public/SceneManager.js
import SpeechBubble from '/libs/SpeechBubble/SpeechBubble.js';
import TextBlock from '/libs/TextBlock/TextBlock.js';
import SoundEffect from '/libs/SoundEffect/SoundEffect.js';
import ActionText from '/libs/ActionText/ActionText.js';
import { resolveMediaUrl } from '/libs/Utility.js';

export async function initScene(container, pageInfo, sceneData) {
    const { series, pageId, pageIndex, chapter, volume } = pageInfo;
    const page = container.querySelector('.section-container') || container;

    const visualItemsToRender = [];
    
    for (const [index, item] of sceneData.entries()) {
        let visualItem = null;

        if (item.displayType.type === 'SpeechBubble') {
            const panelEl = container.querySelector(item.placement.panel);
            if (!panelEl) continue;

            const bubbleOptions = { ...item, series, volume, chapter, pageId, pageIndex, dialogueIndex: index };
            if (item.attributes) bubbleOptions.attributes = item.attributes;
            if (item.style) bubbleOptions.style = item.style;
            Object.assign(bubbleOptions, item.placement); 
            
            const bubble = new SpeechBubble(panelEl, bubbleOptions);
            await bubble.render();
            visualItem = bubble;

        } else if (item.displayType.type === 'TextBlock') {
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : page;
            if (!panelEl) continue;

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
            visualItem = textBlock;

        } else if (item.displayType.type === 'SoundEffect') {
            // Sound Effects are purely visual ActionText objects now in the new engine
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : null;
            const soundEffectOptions = { ...item, series, volume, chapter, pageId };
            if (item.placement) Object.assign(soundEffectOptions, item.placement);
            const soundEffect = new SoundEffect(panelEl, soundEffectOptions);
            await soundEffect.render();
            visualItem = soundEffect;
            
        } else if (item.displayType.type === 'ActionText') {
            const panelEl = (item.placement && item.placement.panel) ? container.querySelector(item.placement.panel) : null;
            const actionTextOptions = { ...item, series, volume, chapter, pageId };
            if (item.placement) Object.assign(actionTextOptions, item.placement);
            const actionText = new ActionText(panelEl, actionTextOptions);
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
