import {html} from "../ioutil.js"
import {Io} from "../io.js"
import {IoObjectProperty} from "../io-object/io-object-prop.js"

export class IoVector extends Io {
  static get style() {
    return html`
      <style>
        :host {
          display: grid;
          grid-template-columns: 33.3% 33.3% 33.3%;
        }
        :host > io-object-prop > io-number {
          width: 100%;
        }
      </style>
    `;
  }
  static get properties() {
    return {
      value: {
        observer: '_update'
      }
    }
  }
  _update() {
    this.render([
      ['io-object-prop', {key: 'x', value: this.value, config: {tag: 'io-number'} }],
      ['io-object-prop', {key: 'y', value: this.value, config: {tag: 'io-number'} }],
      ['io-object-prop', {key: 'z', value: this.value, config: {tag: 'io-number'} }]
    ]);
  }
}

window.customElements.define('io-vector', IoVector);
