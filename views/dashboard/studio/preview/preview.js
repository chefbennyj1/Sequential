import { applyPersistentMask } from "/libs/Utility.js";

export async function init(container, params) {
    const { volume, chapter, pageId } = params;
    const fileInput = document.getElementById('globalPanelUpload');
    let activeUploadTarget = null;

    // --- 1. Resizer ---
    function fitContainer() {
        const sectionContainer = container.querySelector('.section-container') || container.querySelector('.page-layout');
        if (!sectionContainer) return;
        
        // Add the pageId class so page.css selectors match
        sectionContainer.classList.add(pageId);
        
        // Reset transform to get natural size
        sectionContainer.style.transform = 'none';
        
        const padding = 40;
        const availableWidth = window.innerWidth - padding;
        const availableHeight = window.innerHeight - padding;
        
        // Use offsetWidth/Height for natural unscaled dimensions
        const naturalWidth = sectionContainer.offsetWidth;
        const naturalHeight = sectionContainer.offsetHeight;

        if (naturalWidth === 0 || naturalHeight === 0) return;
        
        const scaleX = availableWidth / naturalWidth;
        const scaleY = availableHeight / naturalHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        
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

                        // Apply persistent mask if defined
                        if (item.maskGif) {
                            const maskUrl = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.maskGif}`;
                            setTimeout(() => {
                                applyPersistentMask(panel, maskUrl, item.maskBg);
                            }, 50);
                        }
                    } else if (item.isFloating) {
                        // If it's a floating panel with no image yet, still apply styles so it shows up as a box
                        if (item.style) {
                            for (const prop in item.style) {
                                panel.style[prop] = item.style[prop];
                            }
                        }
                    }
                });
            }
        } catch (e) { console.error("Failed to load media:", e); }

        initPanels(); 
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
                    let mediaEl = panel.querySelector('img') || panel.querySelector('video');
                    const series = params.series;
                    const { volume, chapter, pageId } = params;
                    // Add cache buster to newSrc to force refresh
                    const newSrc = `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${targetFileName}?t=${Date.now()}`;

                    const isVideo = targetFileName.match(/\.(mp4|webm|mov)$/i);
                    const currentIsVideo = mediaEl && mediaEl.tagName === 'VIDEO';

                    if (!mediaEl || (isVideo && !currentIsVideo) || (!isVideo && currentIsVideo)) {
                        if (mediaEl) mediaEl.remove();
                        mediaEl = document.createElement(isVideo ? 'video' : 'img');
                        mediaEl.style.width = '100%';
                        mediaEl.style.height = '100%';
                        mediaEl.style.objectFit = 'cover';
                        if (isVideo) {
                            mediaEl.autoplay = true;
                            mediaEl.loop = true;
                            mediaEl.muted = true;
                        }
                        panel.prepend(mediaEl);
                    }

                    // Force update if filename is different or we just need to refresh
                    mediaEl.src = newSrc;
                }

                // 2. STYLE UPDATES
                const targetStyles = styles || entry?.style || {};
                const img = panel.querySelector('img') || panel.querySelector('video');
                const visualProps = ['objectFit', 'objectPosition', 'transform', 'transformOrigin', 'filter', 'opacity'];
                
                for (const prop in targetStyles) {
                    const isVisual = visualProps.includes(prop);
                    const target = (panel.classList.contains('floating-panel') && !isVisual) ? panel : (img || panel);
                    if (target) target.style[prop] = targetStyles[prop];
                }

                // Special case for Portrait Overrides
                if (params.mode === 'portrait' && entry?.portraitStyle) {
                    for (const prop in entry.portraitStyle) {
                        const isVisual = visualProps.includes(prop);
                        const target = (panel.classList.contains('floating-panel') && !isVisual) ? panel : (img || panel);
                        if (target) target.style[prop] = entry.portraitStyle[prop];
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
    });

    await loadExistingMedia();

    // Notify parent that layout is fully loaded and GEMINI_PANELS is populated
    window.parent.postMessage({ type: 'previewReady' }, '*');
}
