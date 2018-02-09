import {html} from "../../io/ioutil.js"
import {Io} from "../../io/io.js"
import {UiLayoutBlock} from "./ui-layout-block.js"
import {UiLayoutSplit} from "./ui-layout-split.js"

var layout = JSON.parse(localStorage.getItem('io-layout-state'));

export class UiLayout extends Io {
  static get style() {
    return html`
      <style>
        :host  {
          display: flex;
          background: #999;
          flex: 1;
        }
      </style>
    `;
  }



  static get properties() {
    return {
      elements: {
        type: Object
      },
      value: {
        type: Object,
        value: layout || {'horizontal': [
          {'width': 300, 'vertical': [
            {'height': 100, 'tabs': ['object']},
            {'horizontal': [
              {'width': 50, 'tabs': ['option']},
              {'tabs': ['option']},
              {'tabs': ['option']},
              {'width': 50, 'tabs': ['option']}
            ]},
            {'tabs': ['option']},
          ]},
          {'tabs': ['option', 'object', 'inspector'], 'selected': 'inspector'},
          {'width': 400, 'tabs': ['inspector']}
        ]}
      },
      listeners: {
        'layout-changed': '_layoutChangedHandler'
      }
    }
  }
  _layoutChangedHandler(event) {
    localStorage.setItem('io-layout-state', JSON.stringify(this.value));
  }
  _update() {
    if (this.value.tabs) {
      this.render([
        ['ui-layout-block', {elements: this.elements, tabs: this.value.tabs}]
      ]);
    } else {
      this.render([
        ['ui-layout-split', {
            elements: this.elements,
            orientation: this.value.horizontal ? 'horizontal' : 'vertical',
            blocks: this.value.horizontal || this.value.vertical}]
      ]);
    }
  }
}

window.customElements.define('ui-layout', UiLayout);
