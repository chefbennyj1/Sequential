/**
 * VisualEditorUI.js
 * Pure template functions for the Visual Editor sidebar.
 */

/**
 * Renders a Liquid Glass Stepper to track Page Readiness.
 */
export function renderReadinessStepperTemplate(stats) {
    const { assets, ai, continuity } = stats;

    return `
        <div class="glass glass--bright padding-20 border-radius-12 margin-b-20 readiness-monitor">
            <h5 class="text-accent uppercase font-size-07 margin-b-15 letter-spacing-1" style="margin-left: 5px;">Page Readiness Monitor</h5>
            
            <div class="glass-stepper glass-stepper--vertical" style="padding: 0 5px;">
                <!-- Step 1: Assets -->
                <div class="glass-step ${assets.complete ? 'is-complete' : 'is-active'}">
                    <div class="glass-step__node">${assets.complete ? '✓' : '1'}</div>
                    <div class="glass-step__inner">
                        <div class="glass-step__label">Assets</div>
                        <div class="text-muted font-size-06">${assets.count}/${assets.total} Panels have images</div>
                    </div>
                    <div class="glass-step__connector"></div>
                </div>

                <!-- Step 2: Intelligence -->
                <div class="glass-step ${ai.complete ? 'is-complete' : (assets.complete ? 'is-active' : '')}">
                    <div class="glass-step__node">${ai.complete ? '✓' : '2'}</div>
                    <div class="glass-step__inner">
                        <div class="glass-step__label">Intelligence</div>
                        <div class="text-muted font-size-06">${ai.count}/${ai.total} Gemini descriptions</div>
                    </div>
                    <div class="glass-step__connector"></div>
                </div>

                <!-- Step 3: Continuity -->
                <div class="glass-step ${continuity.complete ? 'is-complete' : (ai.complete ? 'is-active' : '')}">
                    <div class="glass-step__node">${continuity.complete ? '✓' : '3'}</div>
                    <div class="glass-step__inner">
                        <div class="glass-step__label">Continuity</div>
                        <div class="text-muted font-size-06">${continuity.hasScene ? 'Dialogue Layer Active' : 'No Dialogue Found'}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function renderAllPanelsTemplate(panelNames, currentVisualMediaData, activeSeriesFolder, activeSeriesId, currentVisualContext, isSpread) {
    const allUniqueSelectors = new Set([...panelNames, ...currentVisualMediaData.map(m => m.panel)]);
    const allItems = Array.from(allUniqueSelectors).map(p => {
        const entry = currentVisualMediaData.find(m => m.panel === p);
        return { panel: p, isFloating: entry?.isFloating || false, fileName: entry?.fileName || '', type: entry?.type || 'image' };
    }).sort((a, b) => a.isFloating !== b.isFloating ? (a.isFloating ? 1 : -1) : a.panel.localeCompare(b.panel));

    return `
        <div class="flex-row justify-between align-center margin-b-15">
            <h4 class="margin-0">Page Panels</h4>
            <button id="addFloatingPanelBtn" class="glass glass-btn glass-btn--sm glass-btn--primary">+ Add Floating</button>
        </div>
        
        <div class="panel-editor-ui">
            <p class="text-muted margin-b-15">Select any element to edit its asset and alignment.</p>
            <div class="geometry-list margin-b-20">
                ${allItems.map(item => {
                    const series = activeSeriesFolder || activeSeriesId;
                    const { volume, chapter, pageId } = currentVisualContext;
                    const thumbSrc = item.fileName ? `/api/images/${series}/${volume}/${chapter}/${pageId}/assets/${item.fileName}` : null;
                    
                    return `
                        <div class="geometry-item glass glass--bright padding-10 border-radius-8 margin-b-10 flex-row align-center cursor-pointer hover-bright" data-panel="${item.panel}" data-floating="${item.isFloating}" style="${item.isFloating ? 'border-color: var(--accent);' : ''}">
                            <div class="flex-row align-center gap-10 flex-1">
                                <div class="geometry-thumb border-dim border-radius-4" style="width:40px; height:40px; background:rgba(0,0,0,0.05); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                                    ${thumbSrc ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;">` : `<ion-icon name="image-outline" class="text-muted"></ion-icon>`}
                                </div>
                                <div style="min-width:0;">
                                    <div class="text-accent font-weight-bold font-size-09 flex-row align-center gap-5">
                                        ${item.panel.replace('.', '')} ${item.isFloating ? `<span class="text-muted font-size-06 uppercase glass glass--dark padding-x-5 border-radius-4">Floating</span>` : ''}
                                    </div>
                                    <div class="text-muted font-size-07 truncate">${item.fileName || 'No asset assigned'}</div>
                                </div>
                            </div>
                            ${item.isFloating ? `<button class="glass glass-btn glass-btn--sm glass-btn--danger delete-geom-btn margin-l-10" title="Delete Geometry"><ion-icon name="trash-outline"></ion-icon></button>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="flex-row gap-10 margin-b-15 border-dim-bottom padding-b-10">
                <h5 class="text-accent margin-0 uppercase">Page Settings</h5>
            </div>

            <div class="form-group glass glass--bright padding-20 border-radius-12 border-dim margin-b-30">
                <div class="flex-row align-center justify-between margin-b-15">
                    <span class="font-weight-bold font-size-09">Layout Mode</span>
                    <div id="spreadToggleGroup" class="glass glass-toggle">
                        <span class="glass-toggle__opt ${!isSpread ? 'is-on' : ''}" data-value="single" tabindex="0">Single</span>
                        <span class="glass-toggle__opt ${isSpread ? 'is-on' : ''}" data-value="spread" tabindex="0">Spread</span>
                    </div>
                </div>
                <p class="text-muted font-size-07">
                    Spread mode pairs this page with its logical partner to form a widescreen layout.
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
                <button id="backToDirectoryBtn" class="glass glass-btn glass-btn--sm glass-btn--ghost">Close &rarr;</button>
            </div>

            ${entry.isFloating ? `
            <div class="floating-panel-settings glass glass--bright padding-10 margin-b-15 border-radius-8">
                <div class="flex-row justify-between align-center margin-b-10">
                    <h5 class="text-accent">Floating Geometry</h5>
                    <button id="deleteFloatingPanelBtn" class="glass glass-btn glass-btn--sm glass-btn--danger">Delete</button>
                </div>
                <div class="form-group margin-b-10 flex-row gap-10">
                    <div class="flex-1">
                        <label>Left (%)</label>
                        <input type="number" id="float-left" class="glass-input width-100" value="${getNum(entry.style?.left)}">
                    </div>
                    <div class="flex-1">
                        <label>Top (%)</label>
                        <input type="number" id="float-top" class="glass-input width-100" value="${getNum(entry.style?.top)}">
                    </div>
                    <div class="flex-1">
                        <label>Z-Index</label>
                        <input type="number" id="float-z" class="glass-input width-100" value="${entry.style?.['z-index'] || 10}">
                    </div>
                </div>
                <div class="form-group flex-row gap-10 margin-b-10">
                    <div class="flex-1">
                        <label>Width (%)</label>
                        <input type="number" id="float-width" class="glass-input width-100" value="${getNum(entry.style?.width)}">
                    </div>
                    <div class="flex-1">
                        <label>Height</label>
                        <input type="text" id="float-height" class="glass-input width-100" value="${entry.style?.height || 'auto'}" placeholder="auto or %">
                    </div>
                </div>
                <div class="form-group">
                    <label>Aspect Ratio (W/H)</label>
                    <input type="text" id="float-aspect" class="glass-input width-100" value="${entry.style?.['aspect-ratio'] || 'none'}" placeholder="e.g. 1 / 1 or 16 / 9">
                </div>
            </div>
            ` : ''}

            <input type="hidden" id="visual-asset-type" value="image">

            <div class="form-group margin-b-15">
                <label>File Name ${entry.isFloating ? '(Panel Overlay)' : ''}</label>
                <div class="flex-row gap-5">
                    <input type="text" id="visual-asset-name" class="glass-input flex-1" value="${entry.fileName || ''}" placeholder="e.g. background.png">
                    <button id="visual-asset-browse" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-browse">...</button>
                </div>
                <div class="flex-row gap-5 margin-t-5">
                    <button id="visual-flip-h" class="glass glass-btn glass-btn--sm glass-btn--ghost flex-1">Flip Horizontal</button>
                    <button id="visual-flip-v" class="glass glass-btn glass-btn--sm glass-btn--ghost flex-1">Flip Vertical</button>
                </div>
            </div>
            <div class="form-group margin-b-15">
                <div class="flex-row justify-between align-center margin-b-5">
                    <label class="margin-0">Panel Description (AI Metadata / Alt Text)</label>
                    <button id="visual-ai-analyze-btn" class="glass glass-btn glass-btn--sm glass-btn--ghost flex-row align-center gap-5" title="Run Gemini AI for this panel">
                        <ion-icon name="sparkles-outline"></ion-icon>
                        <span>AI Analyze Image</span>
                    </button>
                </div>
                <textarea id="visual-asset-description" class="glass-input width-100" rows="3" placeholder="Describe the action and composition...">${entry.description || ''}</textarea>
            </div>
            <div class="form-group margin-b-15 flex-row gap-10">
                <div class="flex-2">
                    <label>Overlay Image (PNG)</label>
                    <div class="flex-row gap-5">
                        <input type="text" id="visual-overlay-name" class="glass-input flex-1" value="${entry.overlayImage || ''}" placeholder="e.g. overlay_fx.png">
                        <button id="visual-overlay-browse" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-browse">...</button>
                    </div>
                </div>
                <div class="flex-1">
                    <label>Overlay Opacity</label>
                    <input type="number" id="visual-overlay-opacity" class="glass-input width-100" step="0.1" min="0" max="1" value="${entry.overlayOpacity !== undefined ? entry.overlayOpacity : 1.0}">
                </div>
            </div>
            
            <div class="flex-row gap-10 margin-b-15 border-dim-bottom padding-b-10">
                <h5 class="text-accent margin-0 uppercase">Display Alignment</h5>
            </div>

            <div id="portrait-controls" class="mode-controls">
                <div class="form-group margin-b-15">
                    <label>Alignment</label>
                    <select id="visual-portrait-style-object-position" class="glass-select width-100">
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
                        <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-scale" data-dir="-0.1">-</button>
                        <input type="number" id="visual-pt-scale" class="glass-input flex-1" step="0.1" min="1.0" value="${ptScale}">
                        <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-scale" data-dir="0.1">+</button>
                    </div>
                </div>
                <div id="pt-pan-wrapper" style="display: ${isPtCustom ? 'block' : 'none'};">
                    <label>Pan (X & Y)</label>
                    <div class="flex-row gap-5 align-center margin-b-5">
                       <span style="width: 15px">X</span>
                       <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-x" data-dir="-1">-</button>
                       <input type="range" id="pt-x-slider" min="-20" max="120" value="${ptPos.x}" class="flex-1">
                       <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-x" data-dir="1">+</button>
                    </div>
                    <div class="flex-row gap-5 align-center">
                       <span style="width: 15px">Y</span>
                       <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-y" data-dir="-1">-</button>
                       <input type="range" id="pt-y-slider" min="-20" max="120" value="${ptPos.y}" class="flex-1">
                       <button type="button" class="glass glass-btn glass-btn--sm glass-btn--ghost btn-nudge" data-target="pt-y" data-dir="1">+</button>
                    </div>
                </div>
            </div>

            <div class="tools-footer-sticky">
                <button id="saveVisualMediaBtn" class="glass glass-btn glass-btn--primary width-100">Save Panel Asset</button>
            </div>
        </div>
    `;
}
