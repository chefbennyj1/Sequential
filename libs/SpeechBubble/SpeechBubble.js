class SpeechBubble {
  constructor(parentElement, options) {
    this.parentElement = parentElement;
    this.options = {
      text: '',
      id: null,
      volume: null,
      chapter: null,
      pageId: null,
      top: null,
      bottom: null,
      left: null,
      right: null,
      tailPosition: 'bottom-left',
      audioSrc: null,
      ...options
    };
    this.container = null;
    this.duration = getBubbleDuration(this.options.text);
    this.audioElement = null;
    this.potentialAudioUrl = this.options.audioSrc || null;

    if (!this.parentElement) {
      console.error('SpeechBubble: parentElement not provided.');
      return;
    }
  }

  // Helper method to clean text
  _getCleanText() {
    const expressiveFlagRegex = /\[.*?\]/g;
    return this.options.text.replace(expressiveFlagRegex, '').trim();
  }

  _getBubbleHtml() {
    const tailClass = `tail-${this.options.tailPosition}`;
    const cleanText = this._getCleanText();
    return `
       <div class="speech ${tailClass}">
          ${cleanText}
       </div>
    `;
  }

  async render() {
    // Instantiate audio directly. If it fails to load, it simply won't play.
    // This avoids CORS pre-flight HEAD request issues.
    if (this.potentialAudioUrl) {
        this.audioElement = new Audio(this.potentialAudioUrl);
        this.audioElement.preload = 'auto';
        this.audioElement.volume = 1.0;
        // Optional: Listen for errors to log missing files without crashing
        this.audioElement.onerror = () => {
             console.warn('Audio file failed to load (404 or Decode Error):', this.potentialAudioUrl);
        };
        
        if (window.audioStateManager) {
            window.audioStateManager.registerAudio(this.audioElement, this.options.pageId, true);
        }
    }

    await document.fonts.ready;
    const speechBubbleContainer = document.createElement('div');
    speechBubbleContainer.className = `speech-bubble-container`;

    // Apply positioning
    if (this.options.top) speechBubbleContainer.style.top = this.options.top;
    if (this.options.bottom) speechBubbleContainer.style.bottom = this.options.bottom;
    if (this.options.left) speechBubbleContainer.style.left = this.options.left;
    if (this.options.right) speechBubbleContainer.style.right = this.options.right;
    
    this.parentElement.appendChild(speechBubbleContainer);
    speechBubbleContainer.innerHTML = this._getBubbleHtml();
    this.container = speechBubbleContainer;

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
  }

  show() {
    console.log('SpeechBubble.show() called for:', this.options.id, 'Text:', this.options.text);
    if (this.container) {
      this.container.classList.add('visible');

    // Dispatch event when the speech bubble is shown
    const shownEvent = new CustomEvent('SpeechBubbleShown', {
      bubbles: true,
      composed: true,
      detail: { dialogueItem: this.options }
    });
    this.container.dispatchEvent(shownEvent);

      if (this.audioElement) {
        this.audioElement.currentTime = 0; // Reset audio to start
        // Audio playback is now managed by SceneManager
        // try {
        //   this.audioElement.play().catch(e => console.error(`SpeechBubble audio play failed for ${this.audioElement.src}:`, e));
        // } catch (e) {
        //   console.error(`Error trying to play SpeechBubble audio ${this.audioElement.src}:`, e);
        // }
      }
    }
  }

  hide() {
    console.log('SpeechBubble.hide() called for:', this.options.id, 'Text:', this.options.text);
    if (this.container) {
      this.container.classList.remove('visible');
      // New: Pause and reset audio
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0; // Reset to beginning for next play
      }
    }
  }

  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    if (this.audioElement && window.audioStateManager) {
      window.audioStateManager.unregisterAudio(this.audioElement);
    }
    this.container = null;
  }
}

// Helper function to remove expressive flags from text
function cleanExpressiveFlags(text) {
  const expressiveFlagRegex = /\[.*?\]/g;
  return text.replace(expressiveFlagRegex, '').trim();
}

/**
 * Calculates display duration for a speech bubble.
 * @param {string} text - The text inside the bubble.
 * @param {number} buffer - Extra time in ms for the user to react.
 * @returns {number} - Duration in milliseconds.
 */
function getBubbleDuration(text, buffer = 800) {
    // Calculate duration based on clean text
    const cleanText = cleanExpressiveFlags(text);
    const wordCount = cleanText.split(/\s+/).length;
    const msPerWord = 250; 
    
    // Ensure a minimum display time of at least 1.5 seconds 
    // so short words like "Hi!" don't flicker and disappear.
    return Math.max(1500, (wordCount * msPerWord) + buffer);
}

// Example: "Wait, what are you doing with that?!" (8 words)
// (8 * 250) + 800 = 2800ms (2.8 seconds)

export default SpeechBubble;