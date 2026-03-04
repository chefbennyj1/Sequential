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
        if (this.options.top) container.style.top = this.options.top;
        if (this.options.bottom) container.style.bottom = this.options.bottom;
        if (this.options.left) container.style.left = this.options.left;
        if (this.options.right) container.style.right = this.options.right;
        
        const rot = parseFloat(this.options.rotation);
        const rotationValue = isNaN(rot) ? -20 : rot;
        
        container.style.transform = `translate(-50%, -50%) scale(0.8) rotate(${rotationValue}deg)`;
        container.style.setProperty('--action-rotation', `${rotationValue}deg`);
        
        // Set Font Variable
        const fontValue = this.options.fontFamily.startsWith('--') 
            ? `var(${this.options.fontFamily})` 
            : this.options.fontFamily;
        container.style.setProperty('--action-font', fontValue);
        container.style.fontSize = this.options.fontSize;
        container.style.color = this.options.color;

        // DEFAULT: Always render curved unless explicitly set to 'none' or 'false'
        if (this.options.curve === 'none' || this.options.curve === false) {
            this._renderStandard(container);
        } else {
            this._renderCurved(container);
        }

        this.parentElement.appendChild(container);
        this.container = container;
        
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
