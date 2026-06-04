/**
 * VisualEditorUI.js
 * Pure template functions for the Visual Editor sidebar.
 */

export function renderAllPanelsTemplate(panelNames, currentVisualMediaData, activeSeriesFolder, activeSeriesId, currentVisualContext, isSpread) {
    const allUniqueSelectors = new Set([...panelNames, ...currentVisualMediaData.map(m => m.panel)]);
    const allItems = Array.from(allUniqueSelectors).map(p => {
        const entry = currentVisualMediaData.find(m => m.panel === p);
        return { panel: p, isFloating: entry?.isFloating || false, fileName: entry?.fileName || '', type: entry?.type || 'image' };
    }).sort((a, b) => a.isFloating !== b.isFloating ? (a.isFloating ? 1 : -1) : a.panel.localeCompare(b.panel));

    return `
        <div class="flex-row justify-between align-center margin-b-15">
            <h4 class="margin-0">Page Panels</h4>
            <button id="addFloatingPanelBtn" class="small btn-accent">+ Add Floating</button>
        </div>
        
        <div class="panel-editor-ui">
            <p class="text-muted margin-b-15">Select any element to edit its asset and alignment.</p>
            <div class="geometry-list margin-b-20">
                ${allItems.map(item => {
                    const series = activeSeriesFolder || activeSeriesId;
                    const { volume, chapter, pageId } = currentVisualContext;
                    const thumbSrc = item.fileName ? `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.fileName}` : null;
                    
                    return `
                        <div class="geometry-item ${item.isFloating ? 'bg-black-20 border-accent' : 'bg-black-10 border-dim'} padding-10 border-radius-8 margin-b-10 flex-row align-center cursor-pointer hover-bright" data-panel="${item.panel}" data-floating="${item.isFloating}">
                            <div class="flex-row align-center gap-10 flex-1">
                                <div class="geometry-thumb border-dim border-radius-4" style="width:40px; height:40px; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                    ${thumbSrc ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<ion-icon name="image-outline" class="text-muted"></ion-icon>`}
                                </div>
                                <div style="min-width:0;">
                                    <div class="text-accent font-weight-bold font-size-09 flex-row align-center gap-5">
                                        ${item.panel.replace('.', '')} ${item.isFloating ? `<span class="text-muted font-size-06 uppercase border-dim padding-x-5 border-radius-4">Floating</span>` : ''}
                                    </div>
                                    <div class="text-muted font-size-07 truncate">${item.fileName || 'No asset assigned'}</div>
                                </div>
                            </div>
                            ${item.isFloating ? `<button class="small btn-danger-outline delete-geom-btn margin-l-10" title="Delete Geometry"><ion-icon name="trash-outline"></ion-icon></button>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="flex-row gap-10 margin-b-15 border-dim-bottom padding-b-10">
                <h5 class="text-accent margin-0 uppercase">Page Settings</h5>
            </div>

            <div class="form-group bg-black-10 padding-15 border-radius-8 border-dim">
                <label class="flex-row align-center gap-10 cursor-pointer">
                    <input type="checkbox" id="toggleSpreadMode" ${isSpread ? 'checked' : ''} style="width: 18px; height: 18px;">
                    <span class="font-weight-bold">Enable Double-Page Spread</span>
                </label>
                <p class="text-muted font-size-08 margin-t-10">
                    If enabled, this page will pair with its logical partner (e.g. page 2 & 3) to form a widescreen layout.
                </p>
            </div>
        </div>
    `;
}

export function renderPanelSettings(panelSelector, entry, isLsCustom, isPtCustom, lsPos, ptPos, lsScale, ptScale, getNum) {
    return `
        <div class="panel-editor-ui">
            <div class="flex-between align-center tools-header-sticky">
                <h4 class="text-accent margin-0" style="text-transform: uppercase;">${panelSelector.replace('.', '')}</h4>
                <button id="backToDirectoryBtn" class="small">Close &rarr;</button>
            </div>

            ${entry.isFloating ? `
            <div class="floating-panel-settings border-dim padding-10 margin-b-15 border-radius-8 bg-black-20">
                <div class="flex-row justify-between align-center margin-b-10">
                    <h5 class="text-accent">Floating Geometry</h5>
                    <button id="deleteFloatingPanelBtn" class="small btn-danger-outline">Delete</button>
                </div>
                <div class="form-group margin-b-10 flex-row gap-10">
                    <div class="flex-1">
                        <label>Left (%)</label>
                        <input type="number" id="float-left" class="gov-input width-100" value="${getNum(entry.style?.left)}">
                    </div>
                    <div class="flex-1">
                        <label>Top (%)</label>
                        <input type="number" id="float-top" class="gov-input width-100" value="${getNum(entry.style?.top)}">
                    </div>
                    <div class="flex-1">
                        <label>Z-Index</label>
                        <input type="number" id="float-z" class="gov-input width-100" value="${entry.style?.['z-index'] || 10}">
                    </div>
                </div>
                <div class="form-group flex-row gap-10 margin-b-10">
                    <div class="flex-1">
                        <label>Width (%)</label>
                        <input type="number" id="float-width" class="gov-input width-100" value="${getNum(entry.style?.width)}">
                    </div>
                    <div class="flex-1">
                        <label>Height</label>
                        <input type="text" id="float-height" class="gov-input width-100" value="${entry.style?.height || 'auto'}" placeholder="auto or %">
                    </div>
                </div>
                <div class="form-group">
                    <label>Aspect Ratio (W/H)</label>
                    <input type="text" id="float-aspect" class="gov-input width-100" value="${entry.style?.['aspect-ratio'] || 'none'}" placeholder="e.g. 1 / 1 or 16 / 9">
                </div>
            </div>
            ` : ''}

            <input type="hidden" id="visual-asset-type" value="image">

            <div class="form-group margin-b-15">
                <label>File Name ${entry.isFloating ? '(Panel Overlay)' : ''}</label>
                <div class="flex-row gap-5">
                    <input type="text" id="visual-asset-name" class="gov-select flex-1" value="${entry.fileName || ''}" placeholder="e.g. background.png">
                    <button id="visual-asset-browse" class="small btn-browse">...</button>
                </div>
                <div class="flex-row gap-5 margin-t-5">
                    <button id="visual-flip-h" class="small btn-secondary flex-1">Flip Horizontal</button>
                    <button id="visual-flip-v" class="small btn-secondary flex-1">Flip Vertical</button>
                </div>
            </div>
            <div class="form-group margin-b-15">
                <div class="flex-row justify-between align-center margin-b-5">
                    <label class="margin-0">Panel Description (AI Metadata / Alt Text)</label>
                    <button id="visual-ai-analyze-btn" class="small btn-secondary flex-row align-center gap-5" title="Run Gemini AI for this panel">
                        <ion-icon name="sparkles-outline"></ion-icon>
                        <span>AI Analyze Image</span>
                    </button>
                </div>
                <textarea id="visual-asset-description" class="gov-select width-100" rows="3" placeholder="Describe the action and composition...">${entry.description || ''}</textarea>
            </div>
            <div class="form-group margin-b-15 flex-row gap-10">
                <div class="flex-2">
                    <label>Overlay Image (PNG)</label>
                    <div class="flex-row gap-5">
                        <input type="text" id="visual-overlay-name" class="gov-select flex-1" value="${entry.overlayImage || ''}" placeholder="e.g. overlay_fx.png">
                        <button id="visual-overlay-browse" class="small btn-browse">...</button>
                    </div>
                </div>
                <div class="flex-1">
                    <label>Overlay Opacity</label>
                    <input type="number" id="visual-overlay-opacity" class="gov-input width-100" step="0.1" min="0" max="1" value="${entry.overlayOpacity !== undefined ? entry.overlayOpacity : 1.0}">
                </div>
            </div>
            
            <div class="flex-row gap-10 margin-b-15 border-dim-bottom padding-b-10">
                <h5 class="text-accent margin-0 uppercase">Display Alignment</h5>
            </div>

            <div id="portrait-controls" class="mode-controls">
                <div class="form-group margin-b-15">
                    <label>Alignment</label>
                    <select id="visual-portrait-style-object-position" class="gov-select width-100">
                        <option value="cover" ${(!isPtCustom && (!entry.portraitStyle || (entry.portraitStyle.objectFit !== 'contain' && (!entry.portraitStyle.objectPosition || entry.portraitStyle.objectPosition === 'center')))) ? 'selected' : ''}>Cover (Center)</option>
                        <option value="contain" ${(entry.portraitStyle && entry.portraitStyle.objectFit === 'contain') ? 'selected' : ''}>Contain (Fit Full)</option>
                        <option value="top center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'top center') ? 'selected' : ''}>Cover (Top Pinned)</option>
                        <option value="bottom center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'bottom center') ? 'selected' : ''}>Cover (Bottom Pinned)</option>
                        <option value="left center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'left center') ? 'selected' : ''}>Cover (Left Pinned)</option>
                        <option value="right center" ${(entry.portraitStyle && entry.portraitStyle.objectPosition === 'right center') ? 'selected' : ''}>Cover (Right Pinned)</option>
                        <option value="custom" ${isPtCustom ? 'selected' : ''}>Cover (Custom Pan)</option>
                    </select>
                </div>
                <div class="form-group margin-b-15">
                    <label>Scale (Zoom)</label>
                    <div class="flex-row gap-5 align-center">
                        <button type="button" class="small btn-nudge" data-target="pt-scale" data-dir="-0.1">-</button>
                        <input type="number" id="visual-pt-scale" class="gov-input flex-1" step="0.1" min="1.0" value="${ptScale}">
                        <button type="button" class="small btn-nudge" data-target="pt-scale" data-dir="0.1">+</button>
                    </div>
                </div>
                <div id="pt-pan-wrapper" style="display: ${isPtCustom ? 'block' : 'none'};">
                    <label>Pan (X & Y)</label>
                    <div class="flex-row gap-5 align-center margin-b-5">
                       <span style="width: 15px">X</span>
                       <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="-1">-</button>
                       <input type="range" id="pt-x-slider" min="-20" max="120" value="${ptPos.x}" class="flex-1">
                       <button type="button" class="small btn-nudge" data-target="pt-x" data-dir="1">+</button>
                    </div>
                    <div class="flex-row gap-5 align-center">
                       <span style="width: 15px">Y</span>
                       <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="-1">-</button>
                       <input type="range" id="pt-y-slider" min="-20" max="120" value="${ptPos.y}" class="flex-1">
                       <button type="button" class="small btn-nudge" data-target="pt-y" data-dir="1">+</button>
                    </div>
                </div>
            </div>

            <div class="tools-footer-sticky">
                <button id="saveVisualMediaBtn" class="update__btn width-100">Save Panel Asset</button>
            </div>
        </div>
    `;
}
