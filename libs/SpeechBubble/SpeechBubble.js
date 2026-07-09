import { loadCSS } from '/libs/Utility.js';

class SpeechBubble {
  static customTags = {}; // Cache tags per series (per document)

  /**
   * Drop the cached custom tags (and their stylesheet) so the next render
   * re-fetches the current tags.json/tags.css. The editor preview is a
   * long-lived document that re-renders in place, so without this it would
   * keep serving whatever tags it first loaded; the viewer, a fresh document
   * each visit, never needed it. Call before re-rendering a scene.
   */
  static refreshCustomTags(series = null) {
    if (series) delete SpeechBubble.customTags[series];
    else SpeechBubble.customTags = {};
    document.querySelectorAll('link[href*="/custom/speechBubble/tags.css"]')
      .forEach(link => link.remove());
  }

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
      width: null,
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
            // Cache-bust so an edited tags file is never served stale from the
            // browser HTTP cache (paired with refreshCustomTags on re-render)
            const bust = `?t=${Date.now()}`;
            const jsonUrl = `/Library/${series}/custom/speechBubble/tags.json${bust}`;
            const cssUrl = `/Library/${series}/custom/speechBubble/tags.css`;

            // Load custom styling dynamically and await it to prevent FOUC (Flash of Unstyled Content)
            await loadCSS(cssUrl, true).catch(e => console.log(`No custom speech bubble CSS found for ${series}`));

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
        const patternMatch = text.toLowerCase().includes(tag.pattern.toLowerCase());
        const characterMatch = this.options.character && `[${this.options.character.toLowerCase()}]` === tag.pattern.toLowerCase();
        
        if (patternMatch || characterMatch) {
            matchedTag = tag;
            break; // First match wins
        }
    }
    
    return { cleanText, isMonologue, matchedTag };
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

    // 1. Physical Creation: Construct DOM elements programmatically
    const superBubble = document.createElement('div');
    superBubble.classList.add('super-bubble');
    if (isMonologue) superBubble.classList.add('monologue-bubble');

    if (matchedTag) {
        const systemHeader = document.createElement('div');
        systemHeader.classList.add('system-header');
        systemHeader.textContent = `[${matchedTag.headerText}]`;
        superBubble.appendChild(systemHeader);

        const speechText = document.createElement('span');
        speechText.classList.add('speech-text');
        speechText.innerHTML = `> ${cleanText}`;
        superBubble.appendChild(speechText);

        const scanlines = document.createElement('div');
        scanlines.classList.add('scanlines');
        superBubble.appendChild(scanlines);

        const tailContainer = document.createElement('div');
        tailContainer.className = `tail-container rigid-tail tail-${this.options.tailPosition}`;
        const tailShape = document.createElement('div');
        tailShape.classList.add('tail-shape');
        tailContainer.appendChild(tailShape);
        superBubble.appendChild(tailContainer);
    } else if (isMonologue) {
        superBubble.innerHTML = cleanText;
    } else {
        const speechText = document.createElement('span');
        speechText.classList.add('speech-text');
        speechText.innerHTML = cleanText;
        superBubble.appendChild(speechText);

        const tailContainer = document.createElement('div');
        tailContainer.className = `tail-container tail-${this.options.tailPosition}`;
        const tailShape = document.createElement('div');
        tailShape.classList.add('tail-shape');
        tailContainer.appendChild(tailShape);
        superBubble.appendChild(tailContainer);
    }

    speechBubbleContainer.appendChild(superBubble);
    this.parentElement.appendChild(speechBubbleContainer);
    this.container = speechBubbleContainer;
    this.container.setAttribute('data-id', this.options.id || '');

    // 2. Apply positioning via CSS Variables
    if (this.options.top) speechBubbleContainer.style.setProperty('--bubble-top', this.options.top);
    if (this.options.bottom) speechBubbleContainer.style.setProperty('--bubble-bottom', this.options.bottom);
    if (this.options.left) speechBubbleContainer.style.setProperty('--bubble-left', this.options.left);
    if (this.options.right) speechBubbleContainer.style.setProperty('--bubble-right', this.options.right);
    if (this.options.width) speechBubbleContainer.style.setProperty('--bubble-width', this.options.width);
    
    // 3. Apply Visual Variables
    if (this.options.tailSkew) speechBubbleContainer.style.setProperty('--tail-skew', this.options.tailSkew);
    if (this.options.tailScale) speechBubbleContainer.style.setProperty('--tail-scale', this.options.tailScale);
    if (this.options.color) speechBubbleContainer.style.setProperty('--speech-text-color', this.options.color);
    
    // 4. Apply Font Size (Standardized to 1rem)
    let fs = this.options.fontSize;
    if (fs) {
        if (!isNaN(fs) && fs !== '') fs = fs + 'rem';
        speechBubbleContainer.style.setProperty('--bubble-font-size', fs);
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

  play() { this.show(); }

  hide() {
    if (this.container) {
      this.container.classList.remove('visible');
    }
  }

  pause() { this.hide(); }

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
