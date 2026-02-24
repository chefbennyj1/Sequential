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
      tailSkew: null,
      tailScale: null,
      ...options
    };
    this.container = null;
    this.duration = getBubbleDuration(this.options.text);

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
    const isSystemError = text.includes('[system-error]');
    const isVigilBlue = text.includes('[vigil-blue]');
    const isVigilPurple = text.includes('[vigil-purple]');
    const isVigilUnison = text.includes('[vigil-unison]');
    const isVigil = text.includes('[vigil]') || isVigilBlue || isVigilPurple || isVigilUnison;
    
    return { cleanText, isMonologue, isSystem, isSystemError, isVigil, isVigilBlue, isVigilPurple, isVigilUnison };
  }

  _getBubbleHtml(cleanText, isMonologue, isSystem, isSystemError, isVigil, isVigilBlue, isVigilPurple, isVigilUnison) {
    if (isMonologue) {
        return `<div class="super-bubble monologue-bubble">${cleanText}</div>`;
    }

    if (isSystem || isSystemError || isVigil) {
        let headerText = "SYSTEM_LINK";
        if (isSystemError) headerText = "SYSTEM_ERROR";
        else if (isVigilBlue) headerText = "VIGIL_ADMIN";
        else if (isVigilPurple) headerText = "VIGIL_ECHO";
        else if (isVigilUnison) headerText = "VIGIL_UNISON";
        else if (isVigil) headerText = "VIGIL_CORE";

        return `
           <div class="super-bubble system-bubble">
              <div class="system-header">[${headerText}]</div>
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
    await document.fonts.ready;
    const speechBubbleContainer = document.createElement('div');
    speechBubbleContainer.className = `speech-bubble-container`;
    
    const { cleanText, isMonologue, isSystem, isSystemError, isVigil, isVigilBlue, isVigilPurple, isVigilUnison } = this._getParsedContent();
    if (isMonologue) speechBubbleContainer.classList.add('monologue');
    if (isSystem) speechBubbleContainer.classList.add('system');
    if (isSystemError) speechBubbleContainer.classList.add('system-error');
    if (isVigil) speechBubbleContainer.classList.add('vigil');
    if (isVigilBlue) speechBubbleContainer.classList.add('vigil-blue');
    if (isVigilPurple) speechBubbleContainer.classList.add('vigil-purple');
    if (isVigilUnison) speechBubbleContainer.classList.add('vigil-unison');

    // Apply positioning
    if (this.options.top) speechBubbleContainer.style.top = this.options.top;
    if (this.options.bottom) speechBubbleContainer.style.bottom = this.options.bottom;
    if (this.options.left) speechBubbleContainer.style.left = this.options.left;
    if (this.options.right) speechBubbleContainer.style.right = this.options.right;
    
    if (this.options.tailSkew) speechBubbleContainer.style.setProperty('--tail-skew', this.options.tailSkew);
    if (this.options.tailScale) speechBubbleContainer.style.setProperty('--tail-scale', this.options.tailScale);

    this.parentElement.appendChild(speechBubbleContainer);
    speechBubbleContainer.innerHTML = this._getBubbleHtml(cleanText, isMonologue, isSystem, isSystemError, isVigil, isVigilBlue, isVigilPurple, isVigilUnison);
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
