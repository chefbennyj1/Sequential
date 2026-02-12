class SpeechBubble {
  constructor(parentElement, options) {
    this.parentElement = parentElement;
    this.options = {
      text: '',
      id: null,
      character: '',
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

  // Helper method to clean text and detect internal monologue
  _getParsedContent() {
    const expressiveFlagRegex = /\[.*?\]/g;
    const text = this.options.text;
    const cleanText = text.replace(expressiveFlagRegex, '').trim();
    const isMonologue = text.includes('[internal]') || text.includes('[monologue]');
    const isSystem = text.includes('[system]') || text.includes('[computer]');
    
    return { cleanText, isMonologue, isSystem };
  }

  _getBubbleHtml(cleanText, isMonologue, isSystem) {
    if (isMonologue) {
        return `<div class="super-bubble monologue-bubble">${cleanText}</div>`;
    }

    if (isSystem) {
        return `
           <div class="super-bubble system-bubble">
              <div class="system-header">[SYSTEM_LINK]</div>
              <span class="bubble-text">> ${cleanText}</span>
              <div class="scanlines"></div>
              <div class="tail-container rigid-tail tail-${this.options.tailPosition}">
                 <div class="tail-shape"></div>
              </div>
           </div>
        `;
    }

    const tailClass = `tail-${this.options.tailPosition}`;
    return `
       <div class="super-bubble">
          <span class="bubble-text">${cleanText}</span>
          <div class="tail-container ${tailClass}">
             <div class="tail-shape"></div>
          </div>
       </div>
    `;
  }

  async render() {
    if (this.potentialAudioUrl) {
        this.audioElement = new Audio(this.potentialAudioUrl);
        this.audioElement.preload = 'auto';
        this.audioElement.volume = 1.0;
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
    
    const { cleanText, isMonologue, isSystem } = this._getParsedContent();
    if (isMonologue) speechBubbleContainer.classList.add('monologue');
    if (isSystem) speechBubbleContainer.classList.add('system');

    // Apply positioning
    if (this.options.top) speechBubbleContainer.style.top = this.options.top;
    if (this.options.bottom) speechBubbleContainer.style.bottom = this.options.bottom;
    if (this.options.left) speechBubbleContainer.style.left = this.options.left;
    if (this.options.right) speechBubbleContainer.style.right = this.options.right;
    
    this.parentElement.appendChild(speechBubbleContainer);
    speechBubbleContainer.innerHTML = this._getBubbleHtml(cleanText, isMonologue, isSystem);
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
    if (this.container) {
      this.container.classList.add('visible');

      const shownEvent = new CustomEvent('SpeechBubbleShown', {
        bubbles: true,
        composed: true,
        detail: { dialogueItem: this.options }
      });
      this.container.dispatchEvent(shownEvent);

      if (this.audioElement) {
        this.audioElement.currentTime = 0;
      }
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.remove('visible');
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
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

function cleanExpressiveFlags(text) {
  const expressiveFlagRegex = /\[.*?\]/g;
  return text.replace(expressiveFlagRegex, '').trim();
}

function getBubbleDuration(text, buffer = 800) {
    const cleanText = cleanExpressiveFlags(text);
    const wordCount = cleanText.split(/\s+/).length;
    const msPerWord = 250; 
    return Math.max(1500, (wordCount * msPerWord) + buffer);
}

export default SpeechBubble;
