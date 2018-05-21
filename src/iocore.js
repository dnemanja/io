import {Prototypes} from "./core/prototypes.js";
import {Protochain} from "./core/protochain.js";
import {Listeners} from "./core/listeners.js";
import {Style} from "./core/style.js";
import {Node} from "./core/node.js";
import {Binding} from "./core/binding.js";
import {renderNode, updateNode, buildTree} from "./core/vdom.js";

// import {IoCoreMixin} from "./mixins/iocore.js";

window.html = window.html || function() { return arguments[0][0]; }

export class Io extends HTMLElement {
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

    Object.defineProperty(this, '$', { value: {} } ); // TODO: consider clearing on update
    Object.defineProperty(this, '__protochain', { value: this.__proto__.constructor._protochain } );
    Object.defineProperty(this, '__listeners', { value: this.__proto__.constructor._listeners } );
    Object.defineProperty(this, '__state', { value: this.__protochain.cloneProperties() } );
    Object.defineProperty(this, '__node', { value: new Node(initProps, this) } );
    Object.defineProperty(this, '__timeout', { value: new WeakMap() } );

    this.__protochain.bindMethods(this);

    for (let prop in this.__state) {
      this.defineProperty(prop);
      this.reflectAttribute(prop);
    }
  }
  connectedCallback() {
    this.__listeners.connect(this);
    this.__node.connect();
  }
  disconnectedCallback() {
    this.__listeners.disconnect(this);
    this.__node.disconnect();
  }
  defineProperty(prop) {
    if (this.__proto__.hasOwnProperty(prop)) return;
    Object.defineProperty(this.__proto__, prop, {
      get: function() {
        return this.__state[prop].value;
      },
      set: function(value) {
        if (this.__state[prop].value === value) return;
        let oldValue = this.__state[prop].value;
        this.__state[prop].value = value;
        this.reflectAttribute(prop);
        if (this.__state[prop].observer) {
          this[this.__state[prop].observer](value, oldValue, prop);
        }
        this.update();
        if (this.__state[prop].notify) {
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
    const config = this.__state[prop];
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
  fire(eventName, detail, bubbles = true) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail: detail,
      bubbles: bubbles,
      composed: true
    }));
  }
  bind(sourceProp) {
    return this.__node.bind(sourceProp);
  }
  debounce(func, wait) {
    clearTimeout(this.__timeout.get(func));
    this.__timeout.set(func, setTimeout(func, wait));
  }
}

Io.Register = function() {
  const prototypes = new Prototypes(this);
  this._protochain = new Protochain(prototypes);
  this._listeners = new Listeners(prototypes);
  this._style = new Style(prototypes);
  customElements.define(this.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(), this);
}
