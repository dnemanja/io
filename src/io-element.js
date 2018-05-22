import {Prototypes} from "./core/prototypes.js";
import {ProtoProperties} from "./core/protoProperties.js";
import {ProtoListeners} from "./core/protoListeners.js";
import {ProtoFunctions} from "./core/protoFunctions.js";
import {initStyle} from "./core/initStyle.js";
import {Node} from "./core/node.js";
import {renderNode, updateNode, buildTree} from "./core/vdom.js";

export class IoElement extends HTMLElement {
  static get properties() {
    return {
      id: String,
      tabindex: {
        type: String,
        reflect: true
      },
      contenteditable: {
        type: Boolean,
        reflect: true
      }
    };
  }
  constructor(initProps) {
    super();

    Object.defineProperty(this, '__props', { value: this.__proto__._properties.clone() } );
    Object.defineProperty(this, '__node', { value: new Node(initProps, this) } );
    Object.defineProperty(this, '$', { value: {} } ); // TODO: consider clearing on update

    this.__proto__._functions.bind(this);

    for (let prop in this.__props) {
      this.defineProperty(prop);
      this.reflectAttribute(prop);
    }
  }
  connectedCallback() {
    this.__proto__._listeners.connect(this);
    this.__node.connect();
  }
  disconnectedCallback() {
    this.__proto__._listeners.disconnect(this);
    this.__node.disconnect();
  }
  defineProperty(prop) {
    if (this.__proto__.hasOwnProperty(prop)) return;
    Object.defineProperty(this.__proto__, prop, {
      get: function() {
        return this.__props[prop].value;
      },
      set: function(value) {
        if (this.__props[prop].value === value) return;
        let oldValue = this.__props[prop].value;
        this.__props[prop].value = value;
        this.reflectAttribute(prop);
        if (this.__props[prop].observer) {
          this[this.__props[prop].observer](value, oldValue, prop);
        }
        this.update();
        if (this.__props[prop].notify) {
          this.fire(prop + '-changed', {value: value, oldValue: oldValue}, false);
        }
      },
      enumerable: true,
      configurable: true
    });
  }
  initAttribute(attr, value) {
    if (value === true) {
      this.setAttribute(attr, '');
    } else if (value === false || value === '') {
      this.removeAttribute(attr);
    } else if (typeof value == 'string' || typeof value == 'number') {
      this.setAttribute(attr, value);
    }
  }
  reflectAttribute(prop) {
    const config = this.__props[prop];
    if (config.reflect) {
      this.initAttribute(prop, config.value);
    }
  }
  render(children, host) {
    this.traverse(buildTree()(['root', children]).children, host || this);
  }
  traverse(vChildren, host) {
    const children = host.children;
    // remove trailing elements
    while (children.length > vChildren.length) host.removeChild(children[children.length - 1]);

    // create new elements after existing
    const frag = document.createDocumentFragment();
    for (let i = children.length; i < vChildren.length; i++) {
      frag.appendChild(renderNode(vChildren[i]));
    }
    host.appendChild(frag);

    for (let i = 0; i < children.length; i++) {

      // replace existing elements
      if (children[i].localName !== vChildren[i].name) {
        const oldElement = children[i];
        host.insertBefore(renderNode(vChildren[i]), oldElement);
        host.removeChild(oldElement);

      // update existing elements
      } else {
        // Io Elements
        if (children[i].hasOwnProperty('__node')) {
          children[i].__node.update(vChildren[i].props); // TODO: test
        // Native HTML Elements
        } else {
          updateNode(children[i], vChildren[i]);
        }
      }
    }

    for (let i = 0; i < vChildren.length; i++) {
      if (vChildren[i].props.id) {
        this.$[vChildren[i].props.id] = children[i];
      }
      if (vChildren[i].children && typeof vChildren[i].children === 'string') {
        children[i].innerText = vChildren[i].children;
      } else if (vChildren[i].children && typeof vChildren[i].children === 'object') {
        this.traverse(vChildren[i].children, children[i]);
      }
    }
  }
  update() {}
  set(prop, value) {
    let oldValue = this[prop];
    this[prop] = value;
    this.fire(prop + '-set', {value: value, oldValue: oldValue}, true);
  }
  fire(eventName, detail, bubbles = true, src = this) {
    src.dispatchEvent(new CustomEvent(eventName, {
      detail: detail,
      bubbles: bubbles,
      composed: true
    }));
  }
  bind(sourceProp) {
    return this.__node.bind(sourceProp);
  }
}

IoElement.Register = function() {
  const prototypes = new Prototypes(this);
  initStyle(prototypes);
  Object.defineProperty(this.prototype, '_properties', { value: new ProtoProperties(prototypes) });
  Object.defineProperty(this.prototype, '_listeners', { value: new ProtoListeners(prototypes) });
  Object.defineProperty(this.prototype, '_functions', { value: new ProtoFunctions(prototypes) });
  customElements.define(this.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(), this);
}
