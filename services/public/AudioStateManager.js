// services/public/AudioStateManager.js
class AudioStateManager {
    constructor() {
        this._globalAudioEnabled = true; 
        this._registeredPageAudioElements = new Map();
        this._audioContext = null;
        this._analyzer = null; 
        this._sourceNodes = new Map(); 
        this._audioVisualizerAnimateFn = null;
        this._audioBtnVisualizer = null;

        this._backgroundAudio = new Audio(); 
        this._backgroundAudio.loop = true;
        this._backgroundAudio.crossOrigin = "anonymous";
        this._currentCrossfadeInterval = null;

        this._ambientAudio = new Audio();
        this._ambientAudio.loop = true;
        this._ambientAudio.crossOrigin = "anonymous";
        this._currentAmbientCrossfadeInterval = null;

        const savedState = localStorage.getItem('globalAudioEnabled');
        if (savedState !== null) {
            this._globalAudioEnabled = JSON.parse(savedState);
        }

        window.addEventListener('user-interaction-detected', () => {
            if (this._globalAudioEnabled) {
                if (this._backgroundAudio.paused && this._backgroundAudio.src) {
                    this._backgroundAudio.play().catch(e => console.warn("Background Audio auto-resume failed:", e));
                }
                if (this._ambientAudio.paused && this._ambientAudio.src) {
                    this._ambientAudio.play().catch(e => console.warn("Ambient Audio auto-resume failed:", e));
                }
            }
        });
    }

    async ensureAudioContext() {
        if (!this._audioContext || this._audioContext.state === 'closed') {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this._analyzer = this._audioContext.createAnalyser();
            this._analyzer.connect(this._audioContext.destination);
            if (!this._globalAudioEnabled && this._audioContext.state === 'running') {
                await this._audioContext.suspend();
            }
        }
        return this._audioContext;
    }

    async unlockAudioContext() {
        const ctx = await this.ensureAudioContext();
        if (ctx.state === 'suspended') {
            await ctx.resume().then(() => console.log("AudioStateManager: AudioContext resumed via explicit unlock."));
        }
    }

    setVisualizerElements(audioBtnVisualizer, animateFn) {
        this._audioBtnVisualizer = audioBtnVisualizer;
        this._audioVisualizerAnimateFn = animateFn;
        this.updateButtonVisuals();
    }

    async playBackgroundAudio(url, volume = 1.0) {
        if (this._currentCrossfadeInterval) {
            clearInterval(this._currentCrossfadeInterval);
            this._currentCrossfadeInterval = null;
        }

        await this.ensureAudioContext();

        if (!url) {
            this.stopGlobalAudio(this._backgroundAudio, 1000);
            return;
        }

        const temp = document.createElement('a');
        temp.href = url;
        const absoluteUrl = temp.href;

        const currentSrcBase = this._backgroundAudio.src.split('?')[0];
        const newSrcBase = absoluteUrl.split('?')[0];

        if (currentSrcBase === newSrcBase && currentSrcBase !== '') {
            this._backgroundAudio.volume = volume;
            if (this._backgroundAudio.paused && this._globalAudioEnabled) {
                this._backgroundAudio.play().catch(e => console.warn("Background Audio resume failed:", e));
            }
            return;
        }

        const nextAudio = new Audio(url);
        nextAudio.loop = true;
        nextAudio.volume = 0;
        nextAudio.crossOrigin = "anonymous";

        await this.registerAudio(nextAudio, 'background', true);

        // Transition: Fade Out Old -> Play New -> Fade In New
        this._currentCrossfadeInterval = this._transitionAudio(this._backgroundAudio, nextAudio, volume, (completedAudio) => {
            this._backgroundAudio = completedAudio;
            this._currentCrossfadeInterval = null;
        });
    }

    async playAmbientAudio(url, volume = 1.0) {
        if (this._currentAmbientCrossfadeInterval) {
            clearInterval(this._currentAmbientCrossfadeInterval);
            this._currentAmbientCrossfadeInterval = null;
        }

        await this.ensureAudioContext();

        if (!url) {
            this.stopGlobalAudio(this._ambientAudio, 1000);
            return;
        }

        const temp = document.createElement('a');
        temp.href = url;
        const absoluteUrl = temp.href;

        const currentSrcBase = this._ambientAudio.src.split('?')[0];
        const newSrcBase = absoluteUrl.split('?')[0];

        if (currentSrcBase === newSrcBase && currentSrcBase !== '') {
            this._ambientAudio.volume = volume;
            if (this._ambientAudio.paused && this._globalAudioEnabled) {
                this._ambientAudio.play().catch(e => console.warn("Ambient Audio resume failed:", e));
            }
            return;
        }

        const nextAudio = new Audio(url);
        nextAudio.loop = true;
        nextAudio.volume = 0;
        nextAudio.crossOrigin = "anonymous";

        await this.registerAudio(nextAudio, 'ambient', true);

        this._currentAmbientCrossfadeInterval = this._transitionAudio(this._ambientAudio, nextAudio, volume, (completedAudio) => {
            this._ambientAudio = completedAudio;
            this._currentAmbientCrossfadeInterval = null;
        });
    }

    _transitionAudio(currentAudio, nextAudio, targetVolume, onComplete) {
        const fadeOutDuration = 1000;
        const fadeInDuration = 1000;
        const intervalTime = 50;
        
        let state = 'fading_out';
        
        // Setup Fade Out steps
        const outSteps = fadeOutDuration / intervalTime;
        const startVolOut = currentAudio ? currentAudio.volume : 0;
        const volStepOut = startVolOut / outSteps;

        // Setup Fade In steps
        const inSteps = fadeInDuration / intervalTime;
        const volStepIn = targetVolume / inSteps;

        return setInterval(() => {
            if (state === 'fading_out') {
                if (currentAudio && !currentAudio.paused && currentAudio.volume > 0) {
                    let newVol = currentAudio.volume - volStepOut;
                    if (newVol <= 0.01) {
                        currentAudio.volume = 0;
                        currentAudio.pause();
                        currentAudio.currentTime = 0;
                        this.unregisterAudio(currentAudio);
                        
                        // Switch state
                        state = 'fading_in';
                        if (this._globalAudioEnabled) {
                            nextAudio.play().catch(e => console.warn("Next Audio play failed:", e));
                        }
                    } else {
                        currentAudio.volume = newVol;
                    }
                } else {
                    // Current already stopped or nonexistent
                    state = 'fading_in';
                    if (this._globalAudioEnabled) {
                        nextAudio.play().catch(e => console.warn("Next Audio play failed:", e));
                    }
                }
            }
            else if (state === 'fading_in') {
                if (nextAudio.volume < targetVolume) {
                    let newVol = nextAudio.volume + volStepIn;
                    if (newVol >= targetVolume) {
                        nextAudio.volume = targetVolume;
                        state = 'complete';
                    } else {
                        nextAudio.volume = newVol;
                    }
                } else {
                    state = 'complete';
                }
            }
            
            if (state === 'complete') {
                clearInterval(this._currentCrossfadeInterval || this._currentAmbientCrossfadeInterval); // Safety clear logic handled by caller wrapper but safe here
                if (onComplete) onComplete(nextAudio);
                console.log("AudioStateManager - Transition complete.");
                return; // End loop
            }
        }, intervalTime);
    }

    async registerAudio(audioElement, pageId = null, connectToAnalyzer = false) {
        await this.ensureAudioContext();

        if (this._globalAudioEnabled && this._audioContext.state === 'suspended') {
            this._audioContext.resume().catch(e => console.warn("AudioContext resume failed:", e));
        }

        if (connectToAnalyzer && this._analyzer) {
            try {
                if (!this._sourceNodes.has(audioElement)) {
                    if (audioElement instanceof HTMLMediaElement) {
                        if (!audioElement.crossOrigin && audioElement.src.startsWith('http')) {
                             audioElement.crossOrigin = "anonymous";
                        }
                        const sourceNode = this._audioContext.createMediaElementSource(audioElement);
                        sourceNode.connect(this._analyzer);
                        this._sourceNodes.set(audioElement, sourceNode);
                    }
                }
            } catch(e) {
                console.warn("AudioStateManager: Analyzer connection failed", e);
            }
        }

        if (pageId === 'background' || pageId === 'ambient') {
            audioElement.muted = !this._globalAudioEnabled;
            return;
        }

        if (pageId === 'pageTransition') {
            audioElement.currentTime = 0;
            audioElement.muted = false;
            return;
        }

        this._registeredPageAudioElements.set(audioElement, { pageId: pageId });
        audioElement.currentTime = 0;
        if (!this._globalAudioEnabled) {
            audioElement.muted = true;
        }
    }

    unregisterAudio(audioElement) {
        if (this._registeredPageAudioElements.has(audioElement)) {
            const sourceNode = this._sourceNodes.get(audioElement);
            if (sourceNode) {
                sourceNode.disconnect(this._analyzer);
                this._sourceNodes.delete(audioElement);
            }
            audioElement.pause();
            audioElement.currentTime = 0;
            this._registeredPageAudioElements.delete(audioElement);
            return;
        }
        
        if (this._sourceNodes.has(audioElement)) {
            const sourceNode = this._sourceNodes.get(audioElement);
            sourceNode.disconnect(this._analyzer);
            this._sourceNodes.delete(audioElement);
        }
    }

    unregisterAllPageAudio(pageId) {
        const audioElementsToUnregister = [];
        this._registeredPageAudioElements.forEach((info, audioElement) => {
            if (info.pageId === pageId) {
                audioElementsToUnregister.push(audioElement);
            }
        });
        audioElementsToUnregister.forEach(audioEl => this.unregisterAudio(audioEl));
    }

    async resetFullAudioState() {
        this._registeredPageAudioElements.forEach((pageInfo, audioElement) => {
            audioElement.pause();
            audioElement.currentTime = 0;
            const sourceNode = this._sourceNodes.get(audioElement);
            if (sourceNode) {
                sourceNode.disconnect(this._analyzer);
                this._sourceNodes.delete(audioElement);
            }
        });
        this._registeredPageAudioElements.clear();

        // Reset global tracks
        [this._backgroundAudio, this._ambientAudio].forEach(audio => {
            if(audio) {
                audio.pause(); 
                audio.currentTime = 0;
            }
        });

        if (this._audioContext && this._audioContext.state === 'running') {
            await this._audioContext.suspend().catch(e => console.error("AudioContext suspend failed:", e));
        }
    }

    async startBackgroundPlayback(delayMs = 5000) {
        if (!this._globalAudioEnabled) return;

        const audioContext = await this.ensureAudioContext();
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume().catch(e => console.error("AudioContext resume failed:", e));
        }

        if (this._backgroundAudio && this._backgroundAudio.src) {
            this._backgroundAudio.play().catch(e => console.warn("Background audio play failed:", e));
        }
        if (this._ambientAudio && this._ambientAudio.src) {
            this._ambientAudio.play().catch(e => console.warn("Ambient audio play failed:", e));
        }

        if (this._audioVisualizerAnimateFn) this._audioVisualizerAnimateFn();
        this.updateButtonVisuals();
    }

    async toggleAudio() {
        this._globalAudioEnabled = !this._globalAudioEnabled;
        localStorage.setItem('globalAudioEnabled', JSON.stringify(this._globalAudioEnabled));

        const audioContext = await this.ensureAudioContext();

        if (this._globalAudioEnabled) {
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume().catch(e => console.error("AudioContext resume failed:", e));
            }
            this._registeredPageAudioElements.forEach((info, audioElement) => {
                audioElement.muted = false;
                if (audioElement.paused) {
                    audioElement.play().catch(e => console.warn("Failed to play audio:", audioElement.src, e));
                }
            });

            [this._backgroundAudio, this._ambientAudio].forEach(audio => {
                if (audio) {
                    audio.muted = false;
                    if (audio.src && audio.paused) audio.play().catch(e => console.warn("Global audio resume failed", e));
                }
            });

            if (this._audioVisualizerAnimateFn) this._audioVisualizerAnimateFn();

        } else {
            if (audioContext && audioContext.state === 'running') {
                await audioContext.suspend().catch(e => console.error("AudioContext suspend failed:", e));
            }
            this._registeredPageAudioElements.forEach((info, audioElement) => {
                audioElement.pause();
                audioElement.muted = true;
            });
            
            [this._backgroundAudio, this._ambientAudio].forEach(audio => {
                if (audio) {
                    audio.pause();
                    audio.muted = true;
                }
            });
        }
        this.updateButtonVisuals();
    }

    stopDialogueAudio() {
        this._registeredPageAudioElements.forEach((info, audioElement) => {
            audioElement.pause();
            audioElement.currentTime = 0;
        });
    }

    stopGlobalAudio(audioElement, duration = 2000) {
        if (!audioElement || audioElement.paused) return;

        const initialVolume = audioElement.volume;
        if (initialVolume === 0 || duration === 0) {
            audioElement.pause();
            audioElement.currentTime = 0;
            return;
        }

        const intervalTime = 50;
        const steps = duration / intervalTime;
        const volumeDecrement = initialVolume / steps;

        const fadeInterval = setInterval(() => {
            let newVolume = audioElement.volume - volumeDecrement;
            if (newVolume <= 0) {
                newVolume = 0;
                audioElement.pause();
                audioElement.currentTime = 0;
                audioElement.volume = initialVolume; // Reset volume for next use? No, logic elsewhere sets it to 0
                clearInterval(fadeInterval);
            }
            try { audioElement.volume = newVolume; } catch (e) { clearInterval(fadeInterval); }
        }, intervalTime);
    }

    stopBackgroundAudio(duration = 2000) {
        this.stopGlobalAudio(this._backgroundAudio, duration);
    }

    resumeBackgroundAudio() {
        if (this._globalAudioEnabled) {
             if (this._backgroundAudio && this._backgroundAudio.paused) this._backgroundAudio.play();
             if (this._ambientAudio && this._ambientAudio.paused) this._ambientAudio.play();
        }
    }

    updateButtonVisuals() {
        if (this._audioBtnVisualizer) {
            const label = this._audioBtnVisualizer.querySelector('.label');
            const bars = this._audioBtnVisualizer.querySelectorAll('.audio-bar');
            if (this._globalAudioEnabled) {
                this._audioBtnVisualizer.classList.remove('off');
                if (label) label.textContent = 'ON';
                bars.forEach(bar => bar.style.display = 'block');
            } else {
                this._audioBtnVisualizer.classList.add('off');
                if (label) label.textContent = 'OFF';
                bars.forEach(bar => bar.style.display = 'none');
            }
        }
    }

    get globalAudioEnabled() {
        return this._globalAudioEnabled;
    }
}
export default AudioStateManager;