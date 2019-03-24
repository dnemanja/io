import {html, IoElement} from "../core/element.js";

export class IoButton extends IoElement {
  static get style() {
    return html`<style>
      :host {
        display: inline-block;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1em;
        border: var(--io-theme-button-border);
        border-radius: var(--io-theme-border-radius);
        padding: var(--io-theme-padding);
        padding-left: calc(3 * var(--io-theme-padding));
        padding-right: calc(3 * var(--io-theme-padding));
        background: var(--io-theme-button-bg);
        transition: background-color 0.4s;
        color: var(--io-theme-color);
        user-select: none;
      }
      :host:focus {
        outline: none;
        background: var(--io-theme-focus-bg);
      }
      :host:hover {
        background: var(--io-theme-hover-bg);
      }
      :host[pressed] {
        background: var(--io-theme-active-bg);
      }
      :host > span {
        text-align: center;
      }
    </style>`;
  }
  static get properties() {
    return {
      value: undefined,
      label: 'Button',
      pressed: {
        type: Boolean,
        reflect: true
      },
      action: Function,
      tabindex: 0
    };
  }
  static get listeners() {
    return {
      'keydown': 'onKeydown',
      'click': 'onClick',
    };
  }
  onKeydown(event) {
    if (!this.pressed && (event.which === 13 || event.which === 32)) {
      event.stopPropagation();
      this.pressed = true;
      this.addEventListener('keyup', this.onKeyup);
    }
  }
  onKeyup() {
    this.removeEventListener('keyup', this.onKeyup);
    this.pressed = false;
    if (this.action) this.action(this.value);
    this.dispatchEvent('io-button-clicked', {value: this.value, action: this.action});
  }
  onClick() {
    this.pressed = false;
    if (this.action) this.action(this.value);
    this.dispatchEvent('io-button-clicked', {value: this.value, action: this.action});
  }
  changed() {
    this.title = this.label;
    this.template([
      ['span', this.label]
    ]);
  }
}

IoButton.Register();
