import {html, IoElement} from "../io-core.js";

const selection = window.getSelection();
const range = document.createRange();

export class IoNumber extends IoElement {
  static get style() {
    return html`<style>
      :host {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border: 1px solid #444;
        border-radius: 2px;
        padding: 0 0.25em;
        background: white;
      }
      :host:focus {
        overflow: hidden;
        text-overflow: clip;
        outline: none;
        border-color: #09d;
        background: #def;
      }
    </style>`;
  }
  static get properties() {
    return {
      value: Number,
      conversion: 1,
      step: 0.001,
      min: -Infinity,
      max: Infinity,
      strict: true,
      tabindex: 0,
      contenteditable: true
    };
  }
  static get listeners() {
    return {
      'focus': '_onFocus'
    };
  }
  constructor(props) {
    super(props);
    this.setAttribute('spellcheck', 'false');
  }
  _onFocus() {
    this.addEventListener('blur', this._onBlur);
    this.addEventListener('keydown', this._onKeydown);
    this._select();
  }
  _onBlur() {
    this.removeEventListener('blur', this._onBlur);
    this.removeEventListener('keydown', this._onKeydown);
    this.setFromText(this.innerText);
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
  _onKeydown(event) {
    if (event.which == 13) {
      event.preventDefault();
      this.setFromText(this.innerText);
    }
  }
  _select() {
    range.selectNodeContents(this);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  setFromText(text) {
    // TODO: test conversion
    let value = Math.round(Number(text) / this.step) * this.step / this.conversion;
    if (this.strict) {
      value = Math.min(this.max, Math.max(this.min, value));
    }
    if (!isNaN(value)) this.set('value', value);
  }
  changed() {
    let value = this.value;
    if (typeof value == 'number' && !isNaN(value)) {
      value *= this.conversion;
      value = value.toFixed(-Math.round(Math.log(this.step) / Math.LN10));
      this.innerText = String(value);
    } else {
      this.innerText = 'NaN';
    }
  }
}

IoNumber.Register();
