class TextBlock {
  constructor(parentElement, options) {
    this.parentElement = parentElement;
    this.options = {
      text: '',
      id: null,
      volume: null,
      chapter: null,
      pageId: null,
      padding: 10,
      textBlockType: 'Narrator',
      pageIndex: 0,
      dialogueIndex: 0,
      top: null,
      bottom: null,
      left: null,
      right: null,
      audioSrc: null,
      ...options
    };
    this.container = null;
    this.audioElement = null;
    this.potentialAudioUrl = this.options.audioSrc || null;

    if (!this.parentElement) {
      console.error('TextBlock: parentElement not provided.');
      return;
    }
  }

  // Helper method to clean text
  _getCleanText() {
    const expressiveFlagRegex = /\[.*?\]/g;
    return this.options.text.replace(expressiveFlagRegex, '').trim();
  }

  _getTextBlockHtml() {
    const type = this.options.textBlockType || 'Narrator';
    const textBlockTypeClass = type.toLowerCase();
    const cleanText = this._getCleanText();
    return `
       <div class="text-block ${textBlockTypeClass}" style="padding: ${this.options.padding}px;">
          ${cleanText.toUpperCase()}
       </div>
    `;
  }

  async render() {
    await document.fonts.ready;
    const textBlockContainer = document.createElement('div');
    textBlockContainer.className = `text-block-container text-block-story-line-${this.options.pageIndex}-${this.options.dialogueIndex}`;

    // Apply positioning
    if (this.options.top) textBlockContainer.style.top = this.options.top;
    if (this.options.bottom) textBlockContainer.style.bottom = this.options.bottom;
    if (this.options.left) textBlockContainer.style.left = this.options.left;
    if (this.options.right) textBlockContainer.style.right = this.options.right;

    textBlockContainer.innerHTML = this._getTextBlockHtml();

    this.parentElement.appendChild(textBlockContainer);
    this.container = textBlockContainer;

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

  play() {
    if (this.container) {
      this.container.classList.add('visible');
    }
    if (this.audioElement) {
      this.audioElement.currentTime = 0;
      // Audio playback is now managed by SceneManager
      // try {
      //   this.audioElement.play().catch(e => console.error(`TextBlock audio play failed for ${this.audioElement.src}:`, e));
      // } catch (e) {
      //   console.error(`Error trying to play TextBlock audio ${this.audioElement.src}:`, e);
      // }
    }
  }

  pause() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    if (this.container) {
        this.container.classList.remove('visible');
    }
  }

  destroy() {
    if (this.audioElement && window.audioStateManager) {
        window.audioStateManager.unregisterAudio(this.audioElement);
    }
    if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
    }
  }
}

export default TextBlock;
