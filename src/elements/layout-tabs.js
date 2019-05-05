import {html, IoElement} from "../core/element.js";
import "./layout-tab.js";

export class IoLayoutTabs extends IoElement {
  static get style() {
    return html`<style>
      :host {
        flex: none;
        display: flex;
        flex-direction: row;
        background: #bbb;
        line-height: 1em;
        overflow: hidden;
      }
      :host > io-selector {
        flex-grow: 1;
        /* flex-shrink: 1; */
        /* cursor: pointer; */
        /* padding: 0.2em 1.6em; */
        /* border-right: 1px solid #999; */
        /* overflow: hidden; */
        /* text-overflow: ellipsis; */
        /* white-space: nowrap; */
      }
      /* :host > io-layout-tab {
        flex-grow: 0;
        flex-shrink: 1;
        cursor: pointer;
        padding: 0.2em 1.6em;
        border-right: 1px solid #999;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :host > io-layout-tab[selected] {
        background: #ccc;
      }
      :host > io-button {
        line-height: 1em;
        display: inline-block;
        padding: 0.05em 0.4em;
        margin-left: -1.5em;
      }
      :host > io-option {
        display: inline-block;
        padding: 0.2em 0.6em;
      }

      :host > io-option,
      :host > io-button {
        opacity: 0.2;
      }
      :host > io-option:hover,
      :host > io-button:hover {
        opacity: 1;
      } */
    </style>`;
  }
  static get properties() {
    return {
      elements: Object,
      tabs: Array,
      selected: Number
    };
  }
  changed() {
    // let tabs = [];
    // for (let i = 0; i < this.tabs.length; i++) {
    //   tabs.push(['io-layout-tab', {
    //     element: this.elements[this.selected],
    //     tabID: this.tabs[i],
    //     selected: this.selected === i}]);
    //   tabs.push(['io-button', {
    //     label: '⨯',
    //     action: this._onRemove,
    //     value: i}]);
    // }
    // tabs.push(
    //   ['io-option', {
    //     value: '+',
    //     // TODO: optimize - this runs on resize etc.
    //     options: Object.entries(this.elements).map((entry) => ({value: entry[0]})),
    //     action: this._onAddTab
    //   }]
    // );
    // this.template([tabs]);

    let tabs = [];
    for (let i = 0; i < this.tabs.length; i++) {
      tabs.push(this.elements[this.tabs[i]]);
    }
    this.template([
      ['io-selector', {
        elements: tabs,
        selected: this.selected || 0,
      }]
    ]);
  }
  // _onRemove(index) {
  //   this.dispatchEvent('layout-tabs-remove', {tabID: this.tabs[index]});
  // }
  // _onAddTab(tabID) {
  //   this.dispatchEvent('layout-tabs-add', {tabID: tabID, index: this.tabs.length});
  // }
}

IoLayoutTabs.Register();
