import { initScene } from "/services/public/SceneManager.js";
import { fetchScene, loadCSS } from "/libs/Utility.js";

export async function init(container, params) {
    const { volume, chapter, pageId } = params;
    const fileInput = document.getElementById('globalPanelUpload');
    let activeUploadTarget = null;
    let sceneController = null;
    let renderedDialogueItems = [];

    // --- 1. Resizer ---
    function fitContainer() {
        const sectionContainer = container.querySelector('.section-container') || container.querySelector('.page-layout');
        if (!sectionContainer) return;
        
        // Add the pageId class so page.css selectors match
        sectionContainer.classList.add(pageId);
        
        // Reset transform to get natural size for measurement
        sectionContainer.style.transform = 'none';
        
        const padding = 20;
        const availableWidth = window.innerWidth - padding;
        const availableHeight = window.innerHeight - padding;
        
        // Use getBoundingClientRect for absolute precision
        const rect = sectionContainer.getBoundingClientRect();
        const naturalWidth = rect.width;
        const naturalHeight = rect.height;

        if (naturalWidth === 0 || naturalHeight === 0) return;
        
        const scaleX = availableWidth / naturalWidth;
        const scaleY = availableHeight / naturalHeight;
        const scale = Math.min(scaleX, scaleY);
        
        sectionContainer.style.transform = `scale(${scale})`;
    }

    window.addEventListener('resize', fitContainer);
    setTimeout(fitContainer, 100);

    // --- 2. Shared Upload Logic ---
    async function handleUpload(file, panelElement, panelClass, labelElement) {
        if (!file || !panelClass) return;

        const originalText = labelElement.innerHTML;
        labelElement.innerHTML = "Uploading...";
        labelElement.style.color = "white";
        labelElement.style.background = "rgba(0,0,0,0.7)";

        const formData = new FormData();
        formData.append('volume', volume);
        formData.append('chapter', chapter);
        formData.append('pageId', pageId);
        formData.append('panel', '.' + panelClass);
        formData.append('asset', file);

        try {
            const res = await fetch('/api/editor/upload-asset', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.ok) {
                labelElement.innerText = "Success!";
                const el = document.createElement('img');
                
                const series = params.series;
                el.src = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${file.name}`;
                
                el.style.width = '100%'; 
                el.style.height = '100%'; 
                el.style.objectFit = 'cover';

                Array.from(panelElement.children).forEach(child => {
                    if (child !== labelElement) panelElement.removeChild(child);
                });
                
                panelElement.prepend(el);
                
                // CRITICAL: Notify parent that an asset was uploaded so it can update its local media cache
                window.parent.postMessage({ 
                    type: 'assetUploaded', 
                    panel: '.' + panelClass,
                    type: 'image',
                    fileName: file.name
                }, '*');

                setTimeout(() => labelElement.innerHTML = panelClass, 1500);
            } else {
                labelElement.innerHTML = "Error!";
                alert(data.message);
                setTimeout(() => labelElement.innerHTML = originalText, 2000);
            }
        } catch (err) {
            console.error(err);
            labelElement.innerHTML = "Failed";
            alert("Upload failed.");
            setTimeout(() => labelElement.innerHTML = originalText, 2000);
        }
    }

    // --- 3. Click-to-Upload Handler ---
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && activeUploadTarget) {
                handleUpload(file, activeUploadTarget.panel, activeUploadTarget.panelClass, activeUploadTarget.label);
            }
            fileInput.value = ''; 
            activeUploadTarget = null;
        });
    }

    // --- 4. Loader ---
    async function loadExistingMedia() {
        try {
            const series = params.series;
            if (!series) throw new Error("No series context in params");
            const res = await fetch(`/api/media/${series}/${volume}/${chapter}/${pageId}?t=${Date.now()}`);
            const data = await res.json();

            if (data.ok && data.media) {
                const mediaArray = Array.isArray(data.media) ? data.media : (data.media.media || []);
                mediaArray.forEach(item => {
                    let panel = container.querySelector(item.panel);
                    
                    // --- Handle Floating Panels in Preview ---
                    if (!panel && item.isFloating) {
                        panel = document.createElement('div');
                        const panelClass = item.panel.startsWith('.') ? item.panel.substring(1) : item.panel;
                        panel.className = `panel ${panelClass} floating-panel`;
                        
                        // Add to the layout container
                        const layoutCont = container.querySelector('.section-container') || container.querySelector('.page-layout') || container;
                        layoutCont.appendChild(panel);
                    }

                    if (!panel) return;

                    let el;
                    if (item.type === 'image' && item.fileName) {
                        el = document.createElement('img');
                        el.src = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.fileName}`;
                    }

                    if (el) {
                        el.style.width = '100%';
                        el.style.height = '100%';
                        el.style.objectFit = 'cover';
                        el.style.objectPosition = 'center';

                        // Apply custom styles from media.json
                        const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                        if (item.style) {
                            for (const prop in item.style) {
                                const target = (item.isFloating && !visualProps.includes(prop)) ? panel : el;
                                target.style[prop] = item.style[prop];
                            }
                        }
                        
                        // Apply portrait-specific overrides if active
                        if (params.mode === 'portrait' && item.portraitStyle) {
                            for (const prop in item.portraitStyle) {
                                const target = (item.isFloating && !visualProps.includes(prop)) ? panel : el;
                                target.style[prop] = item.portraitStyle[prop];
                            }
                        }
                        
                        panel.innerHTML = '';
                        panel.appendChild(el);
                    } else if (item.isFloating) {
                        // If it's a floating panel with no image yet, still apply styles so it shows up as a box
                        if (item.style) {
                            for (const prop in item.style) {
                                panel.style[prop] = item.style[prop];
                            }
                        }
                    }
                });

                initPanels(); 

                // Fetch initial scene from server, then we'll rely on pushed updates
                const sceneData = await fetchScene(volume, chapter, pageId, series);
                renderScene(sceneData, mediaArray);
            }
        } catch (e) { console.error("Failed to load media:", e); }
    }

    /**
     * Core renderer for the dialogue scene.
     */
    async function renderScene(sceneData, mediaData) {
        try {
            // --- 1. Load Dialogue Component Styles ---
            await Promise.all([
                loadCSS('/libs/SpeechBubble/SpeechBubble.css'),
                loadCSS('/libs/TextBlock/TextBlock.css'),
                loadCSS('/libs/ActionText/ActionText.css')
            ]);

            if (sceneController && sceneController.cleanup) sceneController.cleanup();

            const pageInfo = { ...params, pageIndex: 0 }; 
            sceneController = await initScene(container, pageInfo, sceneData, mediaData);

            if (sceneController && sceneController.visualItems) {
                renderedDialogueItems = sceneController.visualItems;
                renderedDialogueItems.forEach(item => {
                    if (item.container) {
                        item.container.classList.add('visible'); 
                        item.container.style.cursor = 'move';
                        item.container.style.pointerEvents = 'all'; 
                        makeDialogueDraggable(item);
                    }
                });
            }
        } catch (e) {
            console.error("Failed to render scene:", e);
        }
    }

    function initPanels() {
        const panels = [];
        container.querySelectorAll('.panel').forEach(panel => {
            const classes = Array.from(panel.classList);
            const panelClass = classes.find(c => c.startsWith('panel-') && c !== 'panel');
            if (panelClass) panels.push('.' + panelClass);
            
            const label = document.createElement('div');
            label.className = 'panel-label';
            label.innerHTML = `${panelClass || 'Unknown'}<br><span>Click or Drop to Upload</span>`;
            panel.appendChild(label);

            // --- Floating Panel Specific Logic ---
            if (panel.classList.contains('floating-panel')) {
                makeDraggable(panel);
            }

            panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag-over'); });
            panel.addEventListener('dragleave', (e) => { panel.classList.remove('drag-over'); });
            panel.addEventListener('drop', (e) => {
                e.preventDefault();
                panel.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file, panel, panelClass, label);
            });

            panel.addEventListener('click', (e) => {
                // If the panel was just dragged, don't trigger the selection reload
                if (panel.dataset.wasDragged === 'true') {
                    panel.dataset.wasDragged = 'false';
                    return;
                }

                container.querySelectorAll('.panel').forEach(p => p.classList.remove('selected'));
                panel.classList.add('selected');

                window.parent.postMessage({ 
                    type: 'panelSelected', 
                    panel: '.' + panelClass,
                    volume, chapter, pageId 
                }, '*');
            }, true);
        });

        window.GEMINI_PANELS = panels;
    }

    function makeDraggable(el) {
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, initialLeft, initialTop;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            
            isDragging = true;
            hasMoved = false;
            el.classList.add('is-dragging');
            
            const parent = el.offsetParent || container.querySelector('.section-container') || container;
            const parentRect = parent.getBoundingClientRect();
            
            startX = e.clientX;
            startY = e.clientY;
            
            initialLeft = parseFloat(el.style.left) || 0;
            initialTop = parseFloat(el.style.top) || 0;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // Threshold to distinguish between a click and a drag
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    hasMoved = true;
                    el.dataset.wasDragged = 'true';
                }

                const pctX = (dx / parentRect.width) * 100;
                const pctY = (dy / parentRect.height) * 100;

                const newLeft = initialLeft + pctX;
                const newTop = initialTop + pctY;

                el.style.left = `${newLeft.toFixed(2)}%`;
                el.style.top = `${newTop.toFixed(2)}%`;

                window.parent.postMessage({
                    type: 'panelDragged',
                    panel: '.' + Array.from(el.classList).find(c => c.startsWith('panel-')),
                    left: newLeft.toFixed(2),
                    top: newTop.toFixed(2)
                }, '*');
            };

            const onMouseUp = () => {
                isDragging = false;
                el.classList.remove('is-dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    function makeDialogueDraggable(item) {
        const el = item.container;
        const id = item.sceneItemId; // Use unique ID for robust tracking
        const targetParent = item.targetParentEl; // The physical parent (always Page)
        const logicalAnchor = item.intendedPanelEl || targetParent; // The panel or page it's locked to

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation(); // Don't trigger panel selection
            
            isDragging = true;
            el.classList.add('is-dragging');
            
            const parentRect = targetParent.getBoundingClientRect();
            const anchorRect = logicalAnchor.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            
            startX = e.clientX;
            startY = e.clientY;
            
            // --- ROBUST PANEL-LOCKED COORDINATE CALCULATION ---
            // Defensive Check: Ensure anchor has dimensions to avoid division by zero (NaN)
            const aWidth = anchorRect.width || 1;
            const aHeight = anchorRect.height || 1;

            initialLeft = ((elRect.left - anchorRect.left) / aWidth) * 100;
            initialTop = ((elRect.top - anchorRect.top) / aHeight) * 100;

            if (isNaN(initialLeft)) initialLeft = 0;
            if (isNaN(initialTop)) initialTop = 0;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // Mark as dragged to avoid triggering 'click' on release
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    el.dataset.wasDragged = 'true';
                }

                // Delta is relative to the logical anchor's scale
                const pctX = (dx / aWidth) * 100;
                const pctY = (dy / aHeight) * 100;

                // --- PROFESSIONAL TRANSITION: Always use Top/Left for drag results ---
                let newLeft = initialLeft + pctX;
                let newTop = initialTop + pctY;

                if (isNaN(newLeft)) newLeft = initialLeft;
                if (isNaN(newTop)) newTop = initialTop;

                // For the LIVE PREVIEW in the editor, we still move it on the PAGE layer.
                const pWidth = parentRect.width || 1;
                const pHeight = parentRect.height || 1;
                
                const globalXInPixels = anchorRect.left - parentRect.left + (newLeft / 100 * aWidth);
                const globalYInPixels = anchorRect.top - parentRect.top + (newTop / 100 * aHeight);

                el.style.left = `${(globalXInPixels / pWidth * 100).toFixed(2)}%`;
                el.style.top = `${(globalYInPixels / pHeight * 100).toFixed(2)}%`;
                el.style.right = 'auto';
                el.style.bottom = 'auto';

                const placement = {
                    left: `${newLeft.toFixed(2)}%`,
                    top: `${newTop.toFixed(2)}%`,
                    right: '',
                    bottom: ''
                };

                window.parent.postMessage({
                    type: 'dialogueDragged',
                    id: id,
                    placement: placement
                }, '*');
            };

            const onMouseUp = () => {
                isDragging = false;
                el.classList.remove('is-dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        // --- NEW: Visual Selection Integration ---
        el.addEventListener('click', (e) => {
            // Prevent if we just finished dragging (avoid accidental selection changes during movement)
            if (el.dataset.wasDragged === 'true') {
                el.dataset.wasDragged = 'false';
                return;
            }

            e.stopPropagation();
            
            // Visual feedback in the preview
            container.querySelectorAll('.speech-bubble-container, .text-block-container, .action-text-container')
                .forEach(item => item.classList.remove('selected-dialogue'));
            el.classList.add('selected-dialogue');

            // Notify parent to select this item in the sidebar
            window.parent.postMessage({
                type: 'dialogueSelected',
                id: id
            }, '*');
        });
    }

    window.addEventListener('message', (e) => {
        if (e.data.type === 'triggerUpload') {
            const pClass = e.data.panel.replace('.', '');
            const p = container.querySelector(e.data.panel);
            if (p) {
                const label = p.querySelector('.panel-label');
                activeUploadTarget = { panel: p, panelClass: pClass, label: label };
                fileInput.click();
            }
        }

        if (e.data.type === 'styleUpdate' || e.data.type === 'mediaPersisted') {
            const { panel: selector, styles, fileName, assetType, entry } = e.data;
            const panel = container.querySelector(selector);
            
            if (panel) {
                const targetFileName = fileName || entry?.fileName;
                
                // 1. SURGICAL ASSET SWAP
                if (targetFileName) {
                    let img = panel.querySelector('img');
                    const series = params.series;
                    const { volume, chapter, pageId } = params;
                    const newSrc = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${targetFileName}?t=${Date.now()}`;

                    if (!img) {
                        img = document.createElement('img');
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        panel.prepend(img);
                    }
                    img.src = newSrc;
                }

                // 2. STYLE UPDATES
                const targetStyles = styles || entry?.style || {};
                const img = panel.querySelector('img');
                const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                
                // Clear existing visual styles first to ensure a clean slate
                const targetEl = (panel.classList.contains('floating-panel')) ? panel : img;
                if (targetEl) {
                    visualProps.forEach(prop => {
                        targetEl.style[prop] = '';
                    });
                    
                    // Apply new styles
                    for (const prop in targetStyles) {
                        const isVisual = visualProps.includes(prop);
                        const applyTarget = (panel.classList.contains('floating-panel') && !isVisual) ? panel : img;
                        
                        // Map kebab-case from JSON to camelCase for JS style object
                        const jsProp = prop === 'aspect-ratio' ? 'aspectRatio' : (prop === 'z-index' ? 'zIndex' : prop);
                        
                        if (applyTarget) applyTarget.style[jsProp] = targetStyles[prop];
                    }
                }

                // Special case for Portrait Overrides
                if (params.mode === 'portrait' && entry?.portraitStyle) {
                    for (const prop in entry.portraitStyle) {
                        const isVisual = visualProps.includes(prop);
                        const applyTarget = (panel.classList.contains('floating-panel') && !isVisual) ? panel : img;
                        if (applyTarget) applyTarget.style[prop] = entry.portraitStyle[prop];
                    }
                }
            }
        }

        if (e.data.type === 'triggerPanelSelection') {
            const { panel: selector } = e.data;
            container.querySelectorAll('.panel').forEach(p => p.classList.remove('selected'));
            const p = container.querySelector(selector);
            if (p) p.classList.add('selected');
        }

        if (e.data.type === 'refreshScene') {
            loadExistingMedia();
        }

        if (e.data.type === 'updateScene') {
            const { scene, media } = e.data;
            renderScene(scene, media);
        }
    });

    await loadExistingMedia();

    // Notify parent that layout is fully loaded and GEMINI_PANELS is populated
    window.parent.postMessage({ type: 'previewReady' }, '*');
}
