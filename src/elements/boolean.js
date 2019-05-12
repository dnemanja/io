import {html} from "../core/element.js";
import {IoButton} from "./button.js";

export class IoBoolean extends IoButton {
  static get style() {
    return html`<style>
      :host {
        border: var(--io-theme-field-border);
        color: var(--io-theme-field-color);
        background: var(--io-theme-field-bg);
      }
    </style>`;
  }
  static get properties() {
    return {
      value: {
        type: Boolean,
        reflect: true
      },
      true: 'true',
      false: 'false'
    };
  }
  constructor(props) {
    super(props);
    this.__properties.action.value = this.toggle;
  }
  toggle() {
    this.set('value', !this.value);
  }
  changed() {
    this.innerText = this.value ? this.true : this.false;
  }
}

IoBoolean.Register();
