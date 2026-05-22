/**
 * VisualEditorUI.js
 * Pure template functions for the Visual Editor sidebar.
 */

export function renderPanelSettings(panelSelector, entry, isLsCustom, isPtCustom, lsPos, ptPos, lsScale, ptScale, getNum) {
    return `
        <div class="panel-editor-ui">
            <div class="flex-between align-center margin-b-15">
                <button id="backToDirectoryBtn" class="small">&larr; Geometry Directory</button>
                <h4 class="text-accent margin-0" style="text-transform: uppercase;">${panelSelector.replace('.', '')}</h4>
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
                <button class="mode-tab-btn flex-1 small" data-mode="landscape" id="ls-tab-btn">Landscape</button>
                <button class="mode-tab-btn flex-1 small" data-mode="portrait" id="pt-tab-btn">Portrait</button>
            </div>

            <div id="landscape-controls" class="mode-controls">
                <div class="form-group margin-b-15">
                    <label>Alignment</label>
                    <select id="visual-style-object-position" class="gov-select width-100">
                        <option value="cover" ${(!isLsCustom && (!entry.style || (entry.style.objectFit !== 'contain' && (!entry.style.objectPosition || entry.style.objectPosition === 'center')))) ? 'selected' : ''}>Cover (Center)</option>
                        <option value="contain" ${(entry.style && entry.style.objectFit === 'contain') ? 'selected' : ''}>Contain (Fit Full)</option>
                        <option value="top center" ${(entry.style && entry.style.objectPosition === 'top center') ? 'selected' : ''}>Cover (Top Pinned)</option>
                        <option value="bottom center" ${(entry.style && entry.style.objectPosition === 'bottom center') ? 'selected' : ''}>Cover (Bottom Pinned)</option>
                        <option value="left center" ${(entry.style && entry.style.objectPosition === 'left center') ? 'selected' : ''}>Cover (Left Pinned)</option>
                        <option value="right center" ${(entry.style && entry.style.objectPosition === 'right center') ? 'selected' : ''}>Cover (Right Pinned)</option>
                        <option value="custom" ${isLsCustom ? 'selected' : ''}>Cover (Custom Pan)</option>
                    </select>
                </div>
                <div class="form-group margin-b-15">
                    <label>Scale (Zoom)</label>
                    <div class="flex-row gap-5 align-center">
                        <button type="button" class="small btn-nudge" data-target="ls-scale" data-dir="-0.1">-</button>
                        <input type="number" id="visual-ls-scale" class="gov-input flex-1" step="0.1" min="1.0" value="${lsScale}">
                        <button type="button" class="small btn-nudge" data-target="ls-scale" data-dir="0.1">+</button>
                    </div>
                </div>
                <div id="ls-pan-wrapper" style="display: ${isLsCustom ? 'block' : 'none'};">
                    <label>Pan (X & Y)</label>
                    <div class="flex-row gap-5 align-center margin-b-5">
                       <span style="width: 15px">X</span>
                       <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="-1">-</button>
                       <input type="range" id="ls-x-slider" min="-20" max="120" value="${lsPos.x}" class="flex-1">
                       <button type="button" class="small btn-nudge" data-target="ls-x" data-dir="1">+</button>
                    </div>
                    <div class="flex-row gap-5 align-center">
                       <span style="width: 15px">Y</span>
                       <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="-1">-</button>
                       <input type="range" id="ls-y-slider" min="-20" max="120" value="${lsPos.y}" class="flex-1">
                       <button type="button" class="small btn-nudge" data-target="ls-y" data-dir="1">+</button>
                    </div>
                </div>
            </div>

            <div id="portrait-controls" class="mode-controls" style="display:none;">
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
