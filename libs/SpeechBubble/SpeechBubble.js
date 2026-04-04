import { loadCSS } from '/libs/Utility.js';

class SpeechBubble {
  static customTags = {}; // Cache tags per series

  constructor(parentElement, options) {
    this.parentElement = parentElement;
    this.options = {
      text: '',
      id: null,
      character: '',
      chapter: null,
      pageId: null,
      series: null, // Should be provided by context
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

  // Load custom tags and CSS for the series
  async _loadCustomTags() {
    const series = this.options.series;
    if (!series) return;
    
    // If a promise for this series is already running or completed, await that exact promise
    if (SpeechBubble.customTags[series]) {
        await SpeechBubble.customTags[series];
        return;
    }
    
    // Create the promise and store it in the cache immediately so subsequent bubbles wait for it
    SpeechBubble.customTags[series] = (async () => {
        try {
            const jsonUrl = `/Library/${series}/custom/speechBubble/tags.json`;
            const cssUrl = `/Library/${series}/custom/speechBubble/tags.css`;
            
            // Load custom styling dynamically and await it to prevent FOUC (Flash of Unstyled Content)
            await loadCSS(cssUrl).catch(e => console.log(`No custom speech bubble CSS found for ${series}`));
            
            const response = await fetch(jsonUrl);
            if (response.ok) {
                const data = await response.json();
                return data.tags || [];
            } else {
                return [];
            }
        } catch (e) {
            console.log(`No custom speech bubble tags found for ${series}`);
            return [];
        }
    })();

    // Await the promise we just created
    await SpeechBubble.customTags[series];
  }

  // Helper method to clean text and detect internal monologue or custom tags
  async _getParsedContent() {
    const text = this.options.text;
    const series = this.options.series;
    
    const expressiveFlagRegex = /\[.*?\]/g;
    const cleanText = text.replace(expressiveFlagRegex, '').trim();
    const isMonologue = text.includes('[internal]') || text.includes('[monologue]');

    let matchedTag = null;
    
    // Await the resolved array from the cache
    let seriesTags = [];
    if (SpeechBubble.customTags[series]) {
        seriesTags = await SpeechBubble.customTags[series];
    }
    
    for (const tag of seriesTags) {
        if (text.includes(tag.pattern)) {
            matchedTag = tag;
            break; // First match wins
        }
    }
    
    return { cleanText, isMonologue, matchedTag };
  }

  _getBubbleHtml(cleanText, isMonologue, matchedTag) {
    if (isMonologue) {
        return `<div class="super-bubble monologue-bubble">${cleanText}</div>`;
    }

    if (matchedTag) {
        return `
           <div class="super-bubble">
              <div class="system-header">[${matchedTag.headerText}]</div>
              <span class="speech-text">> ${cleanText}</span>
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
          <span class="speech-text">${cleanText}</span>
          <div class="tail-container ${tailClass}">
             <div class="tail-shape"></div>
          </div>
       </div>
    `;
  }

  async render() {
    await document.fonts.ready;
    await this._loadCustomTags();

    const speechBubbleContainer = document.createElement('div');
    speechBubbleContainer.className = `speech-bubble-container`;
    
    // Await the parsed content now that it relies on the tag Promise
    const { cleanText, isMonologue, matchedTag } = await this._getParsedContent();
    if (isMonologue) speechBubbleContainer.classList.add('monologue');
    
    if (matchedTag && matchedTag.cssClass) {
        const classes = matchedTag.cssClass.split(' ');
        classes.forEach(c => speechBubbleContainer.classList.add(c));
    }

    // 1. Physical Creation: Set HTML and Append to parent IMMEDIATELY
    // This ensures children are available for querySelector synchronously.
    speechBubbleContainer.innerHTML = this._getBubbleHtml(cleanText, isMonologue, matchedTag);
    this.parentElement.appendChild(speechBubbleContainer);
    this.container = speechBubbleContainer;

    // 2. Apply positioning
    if (this.options.top) speechBubbleContainer.style.top = this.options.top;
    if (this.options.bottom) speechBubbleContainer.style.bottom = this.options.bottom;
    if (this.options.left) speechBubbleContainer.style.left = this.options.left;
    if (this.options.right) speechBubbleContainer.style.right = this.options.right;
    
    // 3. Apply CSS Variables
    if (this.options.tailSkew) speechBubbleContainer.style.setProperty('--tail-skew', this.options.tailSkew);
    if (this.options.tailScale) speechBubbleContainer.style.setProperty('--tail-scale', this.options.tailScale);
    if (this.options.color) speechBubbleContainer.style.setProperty('--speech-text', this.options.color);
    
    // 4. Apply Font Size (Synchronously now that children exist)
    if (this.options.fontSize) {
        let fs = this.options.fontSize;
        if (!isNaN(fs) && fs !== '') fs = fs + 'rem';
        
        speechBubbleContainer.style.setProperty('--bubble-font-size', fs);
        const bubbleText = speechBubbleContainer.querySelector('.speech-text') || speechBubbleContainer.querySelector('.super-bubble');
        if (bubbleText) bubbleText.style.setProperty('font-size', fs, 'important');
    }
    
    if (this.options.outlineEnabled) {
        const size = this.options.outlineSize || '1.0';
        const color = this.options.outlineColor || '#000000';
        speechBubbleContainer.style.setProperty('--speech-text-stroke', `${size}px ${color}`);
    }

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
