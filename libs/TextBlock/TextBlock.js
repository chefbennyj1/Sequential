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
      width: null,
      ...options
    };
    this.container = null;

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

  async render() {
    await document.fonts.ready;
    const textBlockContainer = document.createElement('div');
    textBlockContainer.className = `text-block-container text-block-story-line-${this.options.pageIndex}-${this.options.dialogueIndex}`;

    // Apply positioning
    if (this.options.top) textBlockContainer.style.top = this.options.top;
    if (this.options.bottom) textBlockContainer.style.bottom = this.options.bottom;
    if (this.options.left) textBlockContainer.style.left = this.options.left;
    if (this.options.right) textBlockContainer.style.right = this.options.right;
    if (this.options.width) textBlockContainer.style.width = this.options.width;

    // Construct DOM elements programmatically
    const type = this.options.textBlockType || 'Narrator';
    const textBlock = document.createElement('div');
    textBlock.className = `text-block ${type.toLowerCase()}`;
    textBlock.style.padding = `${this.options.padding}px`;
    textBlock.innerHTML = this._getCleanText().toUpperCase();

    textBlockContainer.appendChild(textBlock);
    this.parentElement.appendChild(textBlockContainer);
    this.container = textBlockContainer;
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
  }

  play() {
    if (this.container) {
      this.container.classList.add('visible');
    }
  }

  pause() {
    if (this.container) {
        this.container.classList.remove('visible');
    }
  }

  destroy() {
    if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
    }
  }
}

export default TextBlock;
