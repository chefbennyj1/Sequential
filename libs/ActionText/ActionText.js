class ActionText {
    constructor(parentElement, options) {
        this.parentElement = parentElement;
        this.options = {
            id: null,
            text: '',
            top: '50%',
            left: '50%',
            right: null,
            bottom: null,
            duration: 2000,
            fontFamily: '--font-family-mangat-bold',
            fontSize: '1.8rem',
            color: '#ffffff',
            curve: null, // SVG path string or null
            curveWidth: 300,
            curveHeight: 100,
            rotation: -20, // New default tilt
            ...options
        };

        if (options && options.placement) {
            Object.assign(this.options, options.placement);
        }

        this.container = null;
        this.duration = this.options.duration;
        
        // Use provided rotation or default to -20
        const baseRotation = parseFloat(this.options.rotation);
        this.rotation = isNaN(baseRotation) ? -20 : baseRotation;
    }

    async render() {
        if (!this.options.text || !this.parentElement) return;

        // Ensure CSS is loaded
        if (!document.querySelector('link[href*="ActionText.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/libs/ActionText/ActionText.css';
            document.head.appendChild(link);
        }

        const container = document.createElement('div');
        container.className = 'action-text-container';
        
        // Position & Random Rotation
        if (this.options.top) container.style.setProperty('--action-top', this.options.top);
        if (this.options.bottom) container.style.setProperty('--action-bottom', this.options.bottom);
        if (this.options.left) container.style.setProperty('--action-left', this.options.left);
        if (this.options.right) container.style.setProperty('--action-right', this.options.right);
        
        const rot = parseFloat(this.options.rotation);
        const rotationValue = isNaN(rot) ? -20 : rot;
        
        container.style.setProperty('--action-rotation', `${rotationValue}deg`);
        
        // Set Font Variable
        let fontValue = this.options.fontFamily;
        if (fontValue && fontValue.startsWith('--')) {
            fontValue = `var(${fontValue})`;
        } else if (fontValue && (fontValue.endsWith('.ttf') || fontValue.endsWith('.otf') || fontValue.endsWith('.woff') || fontValue.endsWith('.woff2'))) {
            // It's a raw font file. Create a dynamic @font-face if it doesn't exist.
            const fontName = fontValue.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
            if (!document.getElementById(`font-face-${fontName}`)) {
                const style = document.createElement('style');
                style.id = `font-face-${fontName}`;
                const format = fontValue.endsWith('.otf') ? 'opentype' : 'truetype';
                style.textContent = `
                    @font-face {
                        font-family: "${fontName}";
                        src: url("/views/public/styles/fonts/${fontValue}") format("${format}");
                    }
                `;
                document.head.appendChild(style);
            }
            fontValue = `"${fontName}"`;
        } else if (!fontValue || fontValue === 'initial') {
            fontValue = 'var(--font-family-mangat-bold)';
        }

        container.style.setProperty('--action-font', fontValue);

        // Normalize font size
        let fs = this.options.fontSize || '1.8rem';
        if (!isNaN(fs) && fs !== '') fs = fs + 'rem';
        container.style.setProperty('--action-font-size', fs);
        if (this.options.color) container.style.setProperty('--action-text-color', this.options.color);

        // Apply outline if enabled
        if (this.options.outlineEnabled) {
            const strokeColor = this.options.outlineColor || '#000000';
            const strokeWidth = this.options.outlineSize || '1.0';
            container.style.setProperty('--action-stroke', strokeColor);
            container.style.setProperty('--action-stroke-width', `${strokeWidth}px`);
        } else {
            container.style.setProperty('--action-stroke', 'transparent');
            container.style.setProperty('--action-stroke-width', '0px');
        }

        // DEFAULT: Always render curved unless explicitly set to 'none' or 'false'
        if (this.options.curve === 'none' || this.options.curve === false) {
            this._renderStandard(container);
        } else {
            this._renderCurved(container);
        }

        this.parentElement.appendChild(container);
        this.container = container;
        this.container.setAttribute('data-id', this.options.id || '');
        
        // Apply attributes and style from options
        if (this.options.attributes) {
            for (const attr in this.options.attributes) {
                this.container.setAttribute(attr, this.options.attributes[attr]);
            }
        }
        if (this.options.style) {
            for (const prop in this.options.style) {
                this.container.style[prop] = this.options.style[prop];
            }
        }

        return Promise.resolve();
    }

    _renderStandard(container) {
        const textEl = document.createElement('div');
        textEl.className = 'action-text-content';
        textEl.innerHTML = this.options.text;
        container.appendChild(textEl);
    }

            _renderCurved(container) {
                // Estimate dynamic width based on text length and font size to prevent cutoff
                const textLength = this.options.text.length;
                
                // Robustly parse the font size (handle '1.8rem', '24px', etc.)
                let charWidthEstimate = 28; // Default fallback
                const fontSizeStr = String(this.options.fontSize);
                if (fontSizeStr.includes('rem') || fontSizeStr.includes('em')) {
                    const remValue = parseFloat(fontSizeStr);
                    charWidthEstimate = remValue * 16; // Assume 16px base font size for rem
                } else if (fontSizeStr.includes('px')) {
                    charWidthEstimate = parseFloat(fontSizeStr);
                } else {
                    charWidthEstimate = parseFloat(fontSizeStr) || 28;
                }
        
                const estimatedTextWidth = textLength * (charWidthEstimate * 0.6); // 0.6 is a standard character width ratio
        
                // Use the larger of either the provided width, 300px (default), or the newly calculated dynamic width
                const baseWidth = parseInt(this.options.curveWidth) || 300;
                // Increase the buffer significantly for large text strings
                const w = Math.max(baseWidth, estimatedTextWidth + 150); 
                
                const h = parseInt(this.options.curveHeight) || 150; // Increased base height slightly to prevent vertical clipping
                const pathId = `path-${Math.random().toString(36).substr(2, 9)}`;
        
                // DEFAULT CURVE: Subtle upward arc stretched to the new dynamic width
                let curvePath = `M 10,${h-30} Q ${w/2},10 ${w-10},${h-30}`;
        
                // If a specific path is provided (not 'auto', not null), use it.
                if (this.options.curve && this.options.curve !== 'auto' && this.options.curve !== true) {
                    curvePath = this.options.curve;
                }
        
                container.innerHTML = `
                    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="action-text-svg" style="overflow: visible;">
                        <defs>
                            <path id="${pathId}" d="${curvePath}" />
                        </defs>
                        <text class="action-text-content" fill="currentColor">
                            <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">
                                ${this.options.text}
                            </textPath>
                        </text>
                    </svg>
                `;
            }    show() {
        if (this.container) {
            const rot = this.container.style.getPropertyValue('--action-rotation') || '-20deg';
            this.container.style.transform = `translate(-50%, -50%) scale(1.0) rotate(${rot})`;
            this.container.classList.add('visible');
        }
    }

    hide() {
        if (this.container) {
            this.container.classList.remove('visible');
        }
    }

    destroy() {
        if (this.container && this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
        this.container = null;
    }
}

export default ActionText;
