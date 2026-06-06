import { initScene } from "/services/public/SceneManager.js";
import { fetchScene, loadCSS } from "/libs/Utility.js";

class PageController {
    constructor(container, pageId, params, globalControls) {
        this.container = container;
        this.pageId = pageId;
        this.params = params;
        this.globalControls = globalControls;
        this.sceneController = null;
        this.renderedDialogueItems = [];
        this.mediaData = [];
    }

    async init() {
        const sectionContainer = this.container.querySelector('.section-container') || this.container.querySelector('.page-layout');
        if (sectionContainer) {
            sectionContainer.classList.add(this.pageId);
        }
        await this.loadExistingMedia();
    }

    async loadExistingMedia() {
        try {
            const { series, volume, chapter, mode } = this.params;
            const res = await fetch(`/api/media/${series}/${volume}/${chapter}/${this.pageId}?t=${Date.now()}`);
            const data = await res.json();

            if (data.ok && data.media) {
                this.mediaData = Array.isArray(data.media) ? data.media : (data.media.media || []);
                this.mediaData.forEach(item => {
                    let panel = this.container.querySelector(item.panel);
                    
                    if (!panel && item.isFloating) {
                        panel = document.createElement('div');
                        const panelClass = item.panel.startsWith('.') ? item.panel.substring(1) : item.panel;
                        panel.className = `panel ${panelClass} floating-panel`;
                        const layoutCont = this.container.querySelector('.section-container') || this.container.querySelector('.page-layout') || this.container;
                        layoutCont.appendChild(panel);
                    }

                    if (!panel) return;

                    let el;
                    if (item.type === 'image' && item.fileName) {
                        el = document.createElement('img');
                        el.src = `/api/images/${series}/${volume}/${chapter}/${this.pageId}/assets/${item.fileName}`;
                        el.className = 'main-asset';
                    }

                    if (el) {
                        el.style.width = '100%';
                        el.style.height = '100%';
                        el.style.objectFit = 'cover';
                        el.style.objectPosition = 'center';

                        const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                        if (item.style) {
                            for (const prop in item.style) {
                                const target = (item.isFloating && !visualProps.includes(prop)) ? panel : el;
                                target.style[prop] = item.style[prop];
                            }
                        }
                        
                        if (mode === 'portrait' && item.portraitStyle) {
                            for (const prop in item.portraitStyle) {
                                const target = (item.isFloating && !visualProps.includes(prop)) ? panel : el;
                                target.style[prop] = item.portraitStyle[prop];
                            }
                        }
                        
                        panel.innerHTML = '';
                        panel.appendChild(el);
                    } else if (item.isFloating) {
                        if (item.style) {
                            for (const prop in item.style) {
                                panel.style[prop] = item.style[prop];
                            }
                        }
                    }
                });

                this.initPanels(); 
                const sceneData = await fetchScene(volume, chapter, this.pageId, series);
                await this.renderScene(sceneData, this.mediaData);
            } else {
                this.initPanels();
            }
        } catch (e) { 
            console.error(`[${this.pageId}] Failed to load media:`, e); 
            this.initPanels();
        }
    }

    async renderScene(sceneData, mediaData) {
        try {
            await Promise.all([
                loadCSS('/libs/SpeechBubble/SpeechBubble.css'),
                loadCSS('/libs/TextBlock/TextBlock.css'),
                loadCSS('/libs/ActionText/ActionText.css')
            ]);

            if (this.sceneController && this.sceneController.cleanup) this.sceneController.cleanup();

            const pageInfo = { ...this.params, pageId: this.pageId, pageIndex: 0 }; 
            this.sceneController = await initScene(this.container, pageInfo, sceneData, mediaData);

            if (this.sceneController && this.sceneController.visualItems) {
                this.renderedDialogueItems = this.sceneController.visualItems;
                this.renderedDialogueItems.forEach(item => {
                    if (item.container) {
                        item.container.classList.add('visible'); 
                        item.container.style.cursor = 'move';
                        item.container.style.pointerEvents = 'all'; 
                        this.makeDialogueDraggable(item);
                    }
                });
            }
        } catch (e) {
            console.error(`[${this.pageId}] Failed to render scene:`, e);
        }
    }

    initPanels() {
        this.container.querySelectorAll('.panel').forEach(panel => {
            const classes = Array.from(panel.classList);
            const panelClass = classes.find(c => c.startsWith('panel-') && c !== 'panel');
            
            if (!panel.querySelector('.panel-label')) {
                const label = document.createElement('div');
                label.className = 'panel-label';
                label.innerHTML = `${panelClass || 'Unknown'}<br><span>Click or Drop to Upload</span>`;
                panel.appendChild(label);
            }

            const label = panel.querySelector('.panel-label');

            if (panel.classList.contains('floating-panel')) {
                this.makeDraggable(panel);
            }

            panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag-over'); });
            panel.addEventListener('dragleave', (e) => { panel.classList.remove('drag-over'); });
            panel.addEventListener('drop', (e) => {
                e.preventDefault();
                panel.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) this.handleUpload(file, panel, panelClass, label);
            });

            panel.addEventListener('click', (e) => {
                if (panel.dataset.wasDragged === 'true') {
                    panel.dataset.wasDragged = 'false';
                    return;
                }

                document.querySelectorAll('.panel').forEach(p => p.classList.remove('selected'));
                panel.classList.add('selected');

                window.parent.postMessage({ 
                    type: 'panelSelected', 
                    panel: '.' + panelClass,
                    volume: this.params.volume, 
                    chapter: this.params.chapter, 
                    pageId: this.pageId 
                }, '*');
            }, true);
        });
    }

    async handleUpload(file, panelElement, panelClass, labelElement) {
        if (!file || !panelClass) return;

        const originalText = labelElement.innerHTML;
        labelElement.innerHTML = "Uploading...";
        
        const formData = new FormData();
        formData.append('volume', this.params.volume);
        formData.append('chapter', this.params.chapter);
        formData.append('pageId', this.pageId);
        formData.append('panel', '.' + panelClass);
        formData.append('asset', file);

        try {
            const res = await fetch('/api/editor/upload-asset', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.ok) {
                labelElement.innerText = "Success!";
                const el = document.createElement('img');
                el.className = 'main-asset';
                el.src = `/api/images/${this.params.series}/${this.params.volume}/${this.params.chapter}/${this.pageId}/assets/${file.name}`;
                el.style.width = '100%'; 
                el.style.height = '100%'; 
                el.style.objectFit = 'cover';

                Array.from(panelElement.children).forEach(child => {
                    if (child !== labelElement) panelElement.removeChild(child);
                });
                panelElement.prepend(el);
                
                window.parent.postMessage({ 
                    type: 'assetUploaded', 
                    panel: '.' + panelClass,
                    pageId: this.pageId,
                    assetType: 'image',
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

    makeDraggable(el) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            el.classList.add('is-dragging');
            const parent = el.offsetParent || this.container.querySelector('.section-container') || this.container;
            const parentRect = parent.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = parseFloat(el.style.left) || 0;
            initialTop = parseFloat(el.style.top) || 0;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) el.dataset.wasDragged = 'true';

                const pctX = (dx / parentRect.width) * 100;
                const pctY = (dy / parentRect.height) * 100;

                const newLeft = initialLeft + pctX;
                const newTop = initialTop + pctY;

                el.style.left = `${newLeft.toFixed(2)}%`;
                el.style.top = `${newTop.toFixed(2)}%`;

                window.parent.postMessage({
                    type: 'panelDragged',
                    pageId: this.pageId,
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

    makeDialogueDraggable(item) {
        const el = item.container;
        const id = item.sceneItemId;
        const targetParent = item.targetParentEl;
        const logicalAnchor = item.intendedPanelEl || targetParent;
        const isActionText = item.options?.displayType?.type === 'ActionText' || item.options?.displayType?.type === 'SoundEffect';

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        if (!isActionText) {
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                isDragging = true;
                el.classList.add('is-dragging');
                const anchorRect = logicalAnchor.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                const aWidth = anchorRect.width || 1;
                const aHeight = anchorRect.height || 1;
                initialLeft = ((elRect.left - anchorRect.left) / aWidth) * 100;
                initialTop = ((elRect.top - anchorRect.top) / aHeight) * 100;

                const onMouseMove = (e) => {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) el.dataset.wasDragged = 'true';
                    const pctX = (dx / aWidth) * 100;
                    const pctY = (dy / aHeight) * 100;
                    let newLeft = initialLeft + pctX;
                    let newTop = initialTop + pctY;

                    const parentRect = targetParent.getBoundingClientRect();
                    const pWidth = parentRect.width || 1;
                    const pHeight = parentRect.height || 1;
                    const globalXInPixels = anchorRect.left - parentRect.left + (newLeft / 100 * aWidth);
                    const globalYInPixels = anchorRect.top - parentRect.top + (newTop / 100 * aHeight);

                    el.style.left = `${(globalXInPixels / pWidth * 100).toFixed(2)}%`;
                    el.style.top = `${(globalYInPixels / pHeight * 100).toFixed(2)}%`;
                    el.style.right = 'auto';
                    el.style.bottom = 'auto';

                    window.parent.postMessage({
                        type: 'dialogueDragged',
                        pageId: this.pageId,
                        id: id,
                        placement: { left: `${newLeft.toFixed(2)}%`, top: `${newTop.toFixed(2)}%`, right: '', bottom: '' }
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
        } else {
            // ActionText shouldn't show a move cursor since dragging is disabled
            el.style.cursor = 'pointer';
        }

        el.addEventListener('click', (e) => {
            if (el.dataset.wasDragged === 'true') {
                el.dataset.wasDragged = 'false';
                return;
            }
            e.stopPropagation();
            document.querySelectorAll('.speech-bubble-container, .text-block-container, .action-text-container').forEach(item => item.classList.remove('selected-dialogue'));
            el.classList.add('selected-dialogue');
            window.parent.postMessage({
                type: 'dialogueSelected',
                id: id,
                pageId: this.pageId,
                volume: this.params.volume,
                chapter: this.params.chapter
            }, '*');
        });
    }
}

export async function init(container, params) {
    const pages = [];
    const pageContainers = container.querySelectorAll('.page-container');
    
    const globalControls = {
        fileInput: document.getElementById('globalPanelUpload'),
        activeUploadTarget: null
    };

    if (globalControls.fileInput) {
        globalControls.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && globalControls.activeUploadTarget) {
                const { controller, panel, panelClass, label } = globalControls.activeUploadTarget;
                controller.handleUpload(file, panel, panelClass, label);
            }
            globalControls.fileInput.value = ''; 
            globalControls.activeUploadTarget = null;
        });
    }

    for (const pageCont of pageContainers) {
        const pageId = pageCont.dataset.pageId;
        const controller = new PageController(pageCont, pageId, params, globalControls);
        await controller.init();
        pages.push(controller);
    }

    function fitContainer() {
        const padding = 20;
        const gap = params.isSpread ? 20 : 0; // Matches CSS gutter gap
        const availableWidth = window.innerWidth - padding - gap;
        const availableHeight = window.innerHeight - padding;
        
        pageContainers.forEach(pageCont => {
            const sectionContainer = pageCont.querySelector('.section-container') || pageCont.querySelector('.page-layout');
            if (!sectionContainer) return;
            sectionContainer.style.transform = 'none';
            const rect = sectionContainer.getBoundingClientRect();
            const naturalWidth = rect.width;
            const naturalHeight = rect.height;
            if (naturalWidth === 0 || naturalHeight === 0) return;
            
            const scaleX = (availableWidth / (params.isSpread ? 2 : 1)) / naturalWidth;
            const scaleY = availableHeight / naturalHeight;
            const scale = Math.min(scaleX, scaleY);
            sectionContainer.style.transform = `scale(${scale})`;
        });
    }

    window.addEventListener('resize', fitContainer);
    setTimeout(fitContainer, 100);

    window.addEventListener('message', (e) => {
        const targetPage = pages.find(p => p.pageId === e.data.pageId);
        if (!targetPage && e.data.pageId) return;

        if (e.data.type === 'triggerUpload') {
            const controller = targetPage || pages[0];
            const p = controller.container.querySelector(e.data.panel);
            if (p) {
                const pClass = e.data.panel.replace('.', '');
                const label = p.querySelector('.panel-label');
                globalControls.activeUploadTarget = { controller, panel: p, panelClass: pClass, label: label };
                globalControls.fileInput.click();
            }
        }

        if (e.data.type === 'styleUpdate' || e.data.type === 'mediaPersisted') {
            const controller = targetPage || pages[0];
            const { panel: selector, styles, fileName, overlayImage, overlayOpacity, entry } = e.data;
            const panel = controller.container.querySelector(selector);
            if (panel) {
                const targetFileName = fileName || entry?.fileName;
                const targetOverlay = overlayImage || entry?.overlayImage;
                const targetOpacity = overlayOpacity !== undefined ? overlayOpacity : entry?.overlayOpacity;
                if (targetFileName) {
                    let img = panel.querySelector('img.main-asset');
                    if (!img) img = Array.from(panel.querySelectorAll('img')).find(i => !i.classList.contains('panel-overlay-img'));
                    if (!img) {
                        img = document.createElement('img');
                        img.className = 'main-asset';
                        img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
                        panel.prepend(img);
                    }
                    img.src = `/api/images/${params.series}/${params.volume}/${params.chapter}/${controller.pageId}/assets/${targetFileName}?t=${Date.now()}`;
                }
                if (targetOverlay) {
                    let over = panel.querySelector('img.panel-overlay-img');
                    if (!over) {
                        over = document.createElement('img');
                        over.className = 'panel-overlay-img';
                        Object.assign(over.style, { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' });
                        panel.appendChild(over);
                    }
                    over.src = `/api/images/${params.series}/${params.volume}/${params.chapter}/${controller.pageId}/assets/${targetOverlay}?t=${Date.now()}`;
                    over.style.opacity = targetOpacity || 1.0;
                } else {
                    panel.querySelector('img.panel-overlay-img')?.remove();
                }
                const targetStyles = styles || entry?.style || {};
                const img = panel.querySelector('img.main-asset') || panel.querySelector('img');
                const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                const targetEl = (panel.classList.contains('floating-panel')) ? panel : img;
                if (targetEl) {
                    visualProps.forEach(prop => { targetEl.style[prop] = ''; });
                    for (const prop in targetStyles) {
                        const isVisual = visualProps.includes(prop);
                        const applyTarget = (panel.classList.contains('floating-panel') && !isVisual) ? panel : img;
                        let jsProp = prop.includes('-') ? prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase()) : prop;
                        if (applyTarget) applyTarget.style[jsProp] = targetStyles[prop];
                    }
                }
                if (params.mode === 'portrait' && entry?.portraitStyle) {
                    for (const prop in entry.portraitStyle) {
                        const isVisual = visualProps.includes(prop);
                        const applyTarget = (panel.classList.contains('floating-panel') && !isVisual) ? panel : img;
                        let jsProp = prop.includes('-') ? prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase()) : prop;
                        if (applyTarget) applyTarget.style[jsProp] = entry.portraitStyle[prop];
                    }
                }
            }
        }

        if (e.data.type === 'triggerPanelSelection') {
            const controller = targetPage || pages[0];
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('selected'));
            const p = controller.container.querySelector(e.data.panel);
            if (p) p.classList.add('selected');
        }

        if (e.data.type === 'refreshScene') {
            (targetPage || pages[0]).loadExistingMedia();
        }

        if (e.data.type === 'updateScene') {
            const controller = targetPage || pages[0];
            controller.renderScene(e.data.scene, e.data.media);
        }
    });

    window.parent.postMessage({ type: 'previewReady', isSpread: params.isSpread, pageId: params.pageId, partnerPageId: params.partnerPageId }, '*');
}
