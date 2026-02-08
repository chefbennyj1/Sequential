class SoundEffect {
    constructor(parentElement, options) {
        this.parentElement = parentElement; 
        this.options = {
            id: null,
            volume: null,
            chapter: null,
            pageId: null,
            audioSrc: null,
            text: '',
            top: '50%',
            left: '50%',
            duration: 2000, // Default duration if no audio
            ...options
        };
        this.container = null;
        this.audioElement = null;
        this.potentialAudioUrl = this.options.audioSrc || null;
        this.duration = this.options.duration; // Exposed for SceneManager
    }

    async render() {
        // 1. Audio Setup
        if (this.potentialAudioUrl) {
            try {
                this.audioElement = new Audio(this.potentialAudioUrl);
                this.audioElement.preload = 'auto';
                this.audioElement.onerror = () => {
                     console.warn('SoundEffect audio file failed to load:', this.potentialAudioUrl);
                };
                
                if (window.audioStateManager) {
                    window.audioStateManager.registerAudio(this.audioElement, this.options.pageId, true);
                }

                // If audio exists, let audio duration drive the cue
                this.audioElement.addEventListener('loadedmetadata', () => {
                    this.duration = this.audioElement.duration * 1000;
                });
            } catch (error) {
                console.error('Error setting up SoundEffect audio:', error);
            }
        }

        // 2. Visual Setup
        if (this.options.text && this.parentElement) {
            if (!document.querySelector('link[href*="SoundEffect.css"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/libs/SoundEffect/SoundEffect.css';
                document.head.appendChild(link);
            }

            const container = document.createElement('div');
            container.className = 'sound-effect-container';
            
            if (this.options.top) container.style.top = this.options.top;
            if (this.options.left) container.style.left = this.options.left;
            if (this.options.right) container.style.right = this.options.right;
            if (this.options.bottom) container.style.bottom = this.options.bottom;
            container.style.transformOrigin = 'center center';

            // Jagged Background Layer
            const bgEl = document.createElement('div');
            bgEl.className = 'sound-effect-bg';
            
            // Text Layer (on top)
            const textEl = document.createElement('div');
            textEl.className = 'sound-effect-text';
            textEl.innerHTML = this.options.text;

            container.appendChild(bgEl);
            container.appendChild(textEl);
            this.parentElement.appendChild(container);
            this.container = container;
        }

        return Promise.resolve();
    }

    show() {
        if (this.container) {
            this.container.classList.add('visible');
        }
    }

    hide() {
        if (this.container) {
            this.container.classList.remove('visible');
        }
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }

    destroy() {
        if (this.container && this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
        if (this.audioElement && window.audioStateManager) {
            window.audioStateManager.unregisterAudio(this.audioElement);
        }
    }
}

export default SoundEffect;