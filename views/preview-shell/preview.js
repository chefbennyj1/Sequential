export async function init(container, params) {
    const { volume, chapter, pageId } = params;
    const fileInput = document.getElementById('globalPanelUpload');
    let activeUploadTarget = null;

    // --- 1. Resizer ---
    function fitContainer() {
        const sectionContainer = container.querySelector('.section-container');
        if (!sectionContainer) return;
        
        sectionContainer.style.transform = 'none';
        const padding = 40;
        const availableWidth = window.innerWidth - padding;
        const availableHeight = window.innerHeight - padding;
        const rect = sectionContainer.getBoundingClientRect();
        const scaleX = availableWidth / rect.width;
        const scaleY = availableHeight / rect.height;
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
                const isVideo = file.type.startsWith('video');
                const el = isVideo ? document.createElement('video') : document.createElement('img');
                
                if (isVideo) {
                     el.src = `/api/videos/No_Overflow/${volume}/${chapter}/${pageId}/assets/${file.name}`;
                     el.controls = true;
                     el.muted = true;
                } else {
                     el.src = `/api/images/No_Overflow/${volume}/${chapter}/${pageId}/assets/${file.name}`;
                }
                
                el.style.width = '100%'; 
                el.style.height = '100%'; 
                el.style.objectFit = 'cover';

                Array.from(panelElement.children).forEach(child => {
                    if (child !== labelElement) panelElement.removeChild(child);
                });
                
                panelElement.prepend(el);
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
            const res = await fetch(`/api/media/${volume}/${chapter}/${pageId}`);
            const data = await res.json();
            
            if (data.ok && data.media && Array.isArray(data.media.media)) {
                data.media.media.forEach(item => {
                    const panel = container.querySelector(item.panel);
                    if (!panel) return;

                    let el;
                    if (item.type === 'image') {
                        el = document.createElement('img');
                        el.src = `/api/images/No_Overflow/${volume}/${chapter}/${pageId}/assets/${item.fileName}`;
                    } else if (item.type === 'video') {
                        el = document.createElement('video');
                        el.src = `/api/videos/No_Overflow/${volume}/${chapter}/${pageId}/assets/${item.fileName}`;
                        el.muted = true;
                        el.controls = true;
                    }

                    if (el) {
                        el.style.width = '100%';
                        el.style.height = '100%';
                        el.style.objectFit = 'cover';
                        
                        panel.innerHTML = '';
                        panel.appendChild(el);
                    }
                });
            }
        } catch (e) { console.error("Failed to load media:", e); }

        initPanels(); 
    }

    function initPanels() {
        container.querySelectorAll('.panel').forEach(panel => {
            const classes = Array.from(panel.classList);
            const panelClass = classes.find(c => c.startsWith('panel-') && c !== 'panel');
            
            const label = document.createElement('div');
            label.className = 'panel-label';
            label.innerHTML = `${panelClass || 'Unknown'}<br><span>Click or Drop to Upload</span>`;
            panel.appendChild(label);

            panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('drag-over'); });
            panel.addEventListener('dragleave', (e) => { panel.classList.remove('drag-over'); });
            panel.addEventListener('drop', (e) => {
                e.preventDefault();
                panel.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file, panel, panelClass, label);
            });

            panel.addEventListener('click', (e) => {
                container.querySelectorAll('.panel').forEach(p => p.classList.remove('selected'));
                panel.classList.add('selected');

                window.parent.postMessage({ 
                    type: 'panelSelected', 
                    panel: '.' + panelClass,
                    volume, chapter, pageId 
                }, '*');
            }, true);
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
    });

    await loadExistingMedia();
}
