// libs/ExportMatchScale.js
//
// Makes bubble/text-block sizing track the page's ACTUAL rendered height using
// the same formula ExportController.js already uses for print (scaleFactor =
// pageHeightPx / 1080, baseFontSize 16). Bubbles/text-blocks get the print
// pipeline's own "Brute Force" treatment too (font-size/padding/border-width
// set directly from scaleFactor, bypassing --bubble-font-size) — confirmed
// against a real export as the intended look, not just an approximation of it.
//
// .super-bubble's min-width: 115px (SpeechBubble.css) is a raw px constant
// export never has to touch — at export's ~3146px-tall page, real dialogue
// always needs more than 115px anyway, so the floor never binds. At a smaller
// rendered page it does bind, forcing short lines wider than their content —
// so it gets the same scaleFactor treatment here.
//
// IMPORTANT: this never touches document.documentElement's font-size. That
// was the first version's approach, and it works fine in the editor (the
// preview iframe's document contains ONLY the comic page, nothing else) but
// breaks the reader, whose document also contains the navigation UI in the
// same DOM tree — rescaling root font-size there rescales nav buttons too.
// Instead, everything is scoped: bubble/text-block sizes are explicit px
// overrides (never relied on rem in the first place), and action-text's
// rem-based --action-font-size gets its own scoped multiplier via a
// --page-scale-factor custom property set on pageEl itself, which cascades
// only to that page's descendants — never near anything outside `.page`.
//
// Shared by the editor's live preview (PreviewPageController.js) and the
// reader (pageInitializer.js) so both stay mathematically identical to
// export instead of two separate approximations drifting apart.

let styleEl = null;

export function applyExportMatchScale(pageEl) {
    if (!pageEl) return;
    // offsetHeight (layout box), not getBoundingClientRect() (post-transform
    // painted box): the reader's page can carry a transform from viewer.css's
    // zoom-scroll-in/out animations — scale(0) while entering, scale(1.5) once
    // fully scrolled out/never-entered. getBoundingClientRect() would read
    // near-zero or 1.5x-inflated depending on the moment; offsetHeight always
    // reflects the true 94vh layout height regardless of animation state.
    const heightPx = pageEl.offsetHeight;
    if (!heightPx) return;

    const baseHeight = 1080;
    const baseFontSize = 16;
    const scaleFactor = heightPx / baseHeight;
    const scaledFontSize = (baseFontSize * scaleFactor).toFixed(2) + 'px';

    // Speech bubble text specifically, per Ben (2026-07-21): "slightly larger"
    // than the rest of the scaled sizing. Keep this in sync with
    // BUBBLE_FONT_SCALE in controllers/ExportController.js — that's the actual
    // print/export reference this file mirrors, and both must move together.
    const BUBBLE_FONT_SCALE = 1.1;
    const bubbleFontSize = (baseFontSize * scaleFactor * BUBBLE_FONT_SCALE).toFixed(2) + 'px';

    // Scoped to this page element only — cascades to its descendants (including
    // action-text-content) without touching anything outside `.page`.
    pageEl.style.setProperty('--page-scale-factor', scaleFactor.toFixed(4));

    if (!styleEl || !styleEl.isConnected) {
        styleEl = document.createElement('style');
        styleEl.id = 'export-match-scale';
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
        .page .super-bubble { font-size: ${bubbleFontSize} !important; padding: ${(10 * scaleFactor).toFixed(2)}px ${(15 * scaleFactor).toFixed(2)}px !important; border-width: ${(3 * scaleFactor).toFixed(2)}px !important; line-height: 1.1 !important; min-width: ${(115 * scaleFactor).toFixed(2)}px !important; }
        .page .speech-text { font-size: ${bubbleFontSize} !important; line-height: 1.1 !important; }
        .page .text-block { font-size: ${scaledFontSize} !important; padding: ${(15 * scaleFactor).toFixed(2)}px !important; line-height: 1.1 !important; border-width: ${(4 * scaleFactor).toFixed(2)}px !important; }
        .page .tail-container::before, .page .tail-container::after { border-width: ${(15 * scaleFactor).toFixed(2)}px !important; }
        .page .action-text-content { font-size: calc(var(--action-font-size, 3rem) * var(--page-scale-factor, 1)) !important; }
    `;
}
