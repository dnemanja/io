import {IoElement, html} from "../core/element.js";
import {IoStorage} from "../utils/storage.js";
import {IoButton} from "./button.js";

function isValueOfPropertyOf(prop, object) {
  for (let key in object) if (object[key] === prop) return key;
  return null;
}

export class IoInspector extends IoElement {
  static get style() {
    return html`<style>

    </style>`;
  }
  static get properties() {
    return {
      value: Object,
      props: Array,
      config: Object,
      labeled: true,
      crumbs: Array,
    };
  }
  static get listeners() {
    return {
      'io-button-clicked': 'onLinkClicked',
    };
  }
  onLinkClicked(event) {
    event.stopPropagation();
    if (event.path[0].localName === 'io-inspector-link') {
      this.value = event.detail.value;
    }
  }
  get groups() {
    return this.__proto__.__config.getConfig(this.value, this.config);
  }
  valueChanged() {
    let crumb = this.crumbs.find((crumb) => { return crumb === this.value; });
    let lastrumb = this.crumbs[this.crumbs.length - 1];
    if (crumb) {
      this.crumbs.length = this.crumbs.indexOf(crumb) + 1;
    } else {
      if (!lastrumb || !isValueOfPropertyOf(this.value, lastrumb)) this.crumbs.length = 0;
      this.crumbs.push(this.value);
    }
    this.dispatchEvent('object-mutated', {object: this.crumbs}, false, window);
  }
  changed() {
    const elements = [
      ['io-inspector-breadcrumbs', {crumbs: this.crumbs}],
      // TODO: add search
    ];
    // TODO: rewise and document use of storage
    let uuid = this.value.constructor.name;
    uuid += this.value.guid || this.value.uuid || this.value.id || '';
    for (let group in this.groups) {
      elements.push(
        ['io-collapsable', {
          label: group,
          expanded: IoStorage('io-inspector-group-' + uuid + '-' + group, false),
          elements: [
            ['io-properties', {
              value: this.value,
              props: this.groups[group],
              config: {
                'type:object': ['io-inspector-link']
              },
              labeled: true,
            }]
          ]
        }],
      );
    }
    this.template(elements);
  }
  static get config() {
    return {
      'Object|hidden': [/^_/],
      'HTMLElement|hidden': [/^_/, 'innerText', 'outerText', 'innerHTML', 'outerHTML', 'textContent'],
    };
  }
}

export class Config {
  constructor(prototypes) {
    for (let i = 0; i < prototypes.length; i++) {
      this.registerConfig(prototypes[i].constructor.config || {});
    }
  }
  registerConfig(config) {
    for (let g in config) {
      this[g] = this[g] || [];
      this[g] = [...this[g], ...config[g]];
    }
  }
  getConfig(object, customGroups) {
    const keys = Object.keys(object);
    const prototypes = [];

    let proto = object.__proto__;
    while (proto) {
      keys.push(...Object.keys(proto));
      prototypes.push(proto.constructor.name);
      proto = proto.__proto__;
    }

    const protoGroups = {};

    for (let i in this) {
      const grp = i.split('|');
      if (grp.length === 1) grp.splice(0, 0, 'Object');
      if (prototypes.indexOf(grp[0]) !== -1) {
        protoGroups[grp[1]] = protoGroups[grp[1]] || [];
        protoGroups[grp[1]].push(...this[i]);
      }
    }

    for (let i in customGroups) {
      const grp = i.split('|');
      if (grp.length === 1) grp.splice(0, 0, 'Object');
      if (prototypes.indexOf(grp[0]) !== -1) {
        protoGroups[grp[1]] = protoGroups[grp[1]] || [];
        protoGroups[grp[1]].push(customGroups[i]);
      }
    }

    const groups = {};
    const assigned = [];

    for (let g in protoGroups) {
      groups[g] = groups[g] || [];
      for (let gg in protoGroups[g]) {
        const gKey = protoGroups[g][gg];
        const reg = new RegExp(gKey);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (typeof gKey === 'string') {
            if (k == gKey) {
              groups[g].push(k);
              assigned.push(k);
            }
          } else if (typeof gKey === 'object') {
            if (reg.exec(k)) {
              groups[g].push(k);
              assigned.push(k);
            }
          }
        }
      }
    }

    if (assigned.length === 0) {
      groups['properties'] = keys;
    } else {
      for (let i = 0; i < keys.length; i++) {
        groups['properties'] = groups['properties'] || [];
        if (assigned.indexOf(keys[i]) === -1) groups['properties'].push(keys[i]);
      }
    }

    for (let group in groups) { if (groups[group].length === 0) delete groups[group]; }
    delete groups.hidden;

    return groups;
  }
}

IoInspector.Register = function() {
  IoElement.Register.call(this);
  Object.defineProperty(this.prototype, '__config', {value: new Config(this.prototype.__protochain)});
};

IoInspector.Register();
IoInspector.RegisterConfig = function(config) {
  this.prototype.__config.registerConfig(config);
};

export class IoInspectorBreadcrumbs extends IoElement {
  static get style() {
    return html`<style>
      :host {
        display: flex;
        flex: 1 0;
        flex-direction: row;
        border: var(--io-theme-field-border);
        border-radius: var(--io-theme-border-radius);
        padding: var(--io-theme-padding);
        color: var(--io-theme-field-color);
        background: var(--io-theme-field-bg);
      }
      :host > io-inspector-link {
        border: none;
        overflow: hidden;
        text-overflow: ellipsis;
        background: none;
        padding: 0;
        padding: var(--io-theme-padding);
      }
      :host > io-inspector-link:first-of-type {
        color: var(--io-theme-color);
        overflow: visible;
        text-overflow: clip;
        margin-left: 0.5em;
      }
      :host > io-inspector-link:last-of-type {
        overflow: visible;
        text-overflow: clip;
        margin-right: 0.5em;
      }
      :host > io-inspector-link:not(:first-of-type):before {
        content: '>';
        margin: 0 0.5em;
        opacity: 0.25;
      }
    </style>`;
  }
  static get properties() {
    return {
      crumbs: Array,
    };
  }
  changed() {
    this.template([this.crumbs.map(i => ['io-inspector-link', {value: i}])]);
  }
}

IoInspectorBreadcrumbs.Register();

export class IoInspectorLink extends IoButton {
  static get style() {
    return html`<style>
      :host {
        border: none;
        overflow: hidden;
        text-overflow: ellipsis;
        background: none;
        padding: 0;
        border: 1px solid transparent;
        color: var(--io-theme-link-color);
        padding: var(--io-theme-padding) !important;
      }
      :host:focus {
        outline: none;
        background: none;
        text-decoration: underline;
      }
      :host:hover {
        background: none;
        text-decoration: underline;
      }
      :host[pressed] {
        background: none;
      }
    </style>`;
  }
  changed() {
    let name = this.value.constructor.name;
    if (this.value.name) name += ' (' + this.value.name + ')';
    else if (this.value.label) name += ' (' + this.value.label + ')';
    else if (this.value.title) name += ' (' + this.value.title + ')';
    else if (this.value.id) name += ' (' + this.value.id + ')';
    this.title = name;
    this.template([
      ['span', name]
    ]);
  }
}

IoInspectorLink.Register();
