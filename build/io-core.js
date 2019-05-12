// TODO: Improve tests.

/** Manager for `IoNode` and `IoElement` bindings. */
class NodeBindings {
  /**
   * Creates binding manager for `IoNode`.
   * @param {IoNode|IoElement} node - Reference to the node/element itself.
   */
  constructor(node) {
    Object.defineProperty(this, 'node', {value: node, configurable: true});
  }
  /**
   * Returns a binding to the specified property.
   * @param {string} prop - property name.
   * @return {Binding} Property binding.
   */
  get(prop) {
    this[prop] = this[prop] || new Binding(this.node, prop);
    return this[prop];
  }
  /**
   * Disposes all bindings.
   * Use this when node is no longer needed.
   */
  dispose() {
    for (let b in this) {
      this[b].dispose();
      delete this[b];
    }
    delete this.node;
  }
}

/**
 * Binding object. It manages data binding between source and targets using `[prop]-changed` events.
 */
class Binding {
  /**
   * Creates a binding object with specified `sourceNode` and `sourceProp`.
   * @param {IoNode} sourceNode - Source node.
   * @param {string} sourceProp - Source property.
   */
  constructor(sourceNode, sourceProp) {
    this.source = sourceNode;
    this.sourceProp = sourceProp;
    this.targets = [];
    this.targetsMap = new WeakMap();
    this.updateSource = this.updateSource.bind(this);
    this.updateTargets = this.updateTargets.bind(this);
    this.source.addEventListener(this.sourceProp + '-changed', this.updateTargets);
  }
  /**
   * Adds a target `targetNode` and `targetProp` and corresponding `[prop]-changed` listener, unless already added.
   * @param {IoNode} targetNode - Target node.
   * @param {string} targetProp - Target property.
   */
  addTarget(targetNode, targetProp) {
    if (this.targets.indexOf(targetNode) === -1) this.targets.push(targetNode);
    if (this.targetsMap.has(targetNode)) {
      const targetProps = this.targetsMap.get(targetNode);
      if (targetProps.indexOf(targetProp) === -1) {
        targetProps.push(targetProp);
        targetNode.addEventListener(targetProp + '-changed', this.updateSource);
      }
    } else {
      this.targetsMap.set(targetNode, [targetProp]);
      targetNode.addEventListener(targetProp + '-changed', this.updateSource);
    }
  }
  /**
   * Removes target `targetNode` and `targetProp` and corresponding `[prop]-changed` listener.
   * If `targetProp` is not specified, it removes all target properties.
   * @param {IoNode} targetNode - Target node.
   * @param {string} targetProp - Target property.
   */
  removeTarget(targetNode, targetProp) {
    if (this.targetsMap.has(targetNode)) {
      const targetProps = this.targetsMap.get(targetNode);
      if (targetProp) {
        const index = targetProps.indexOf(targetProp);
        if (index !== -1) {
          targetProps.splice(index, 1);
        }
        targetNode.removeEventListener(targetProp + '-changed', this.updateSource);
      } else {
        for (let i = targetProps.length; i--;) {
          targetNode.removeEventListener(targetProps[i] + '-changed', this.updateSource);
        }
        targetProps.length = 0;
      }
      if (targetProps.length === 0) this.targets.splice(this.targets.indexOf(targetNode), 1);
    }
  }
  /**
   * Event handler that updates source property when one of the targets emits `[prop]-changed` event.
   * @param {Object} event - Event object.
   * @param {IoNode|HTMLElement} event.target - Event target (source node that emitted the event).
   * @param {Object} event.detail - Event detail.
   * @param {*} event.detail.value - New value.
   */
  updateSource(event) {
    if (this.targets.indexOf(event.target) === -1) {
      console.warn(
        `io error: updateSource() should never fire when target is removed from binding.
        Please file an issue at https://github.com/arodic/io/issues.`
      );
      return;
    }
    const value = event.detail.value;
    if (this.source[this.sourceProp] !== value) {
      this.source[this.sourceProp] = value;
    }
  }
  /**
   * Event handler that updates bound properties on target nodes when source node emits `[prop]-changed` event.
   * @param {Object} event - Event object.
   * @param {IoNode|HTMLElement} event.target - Event target (source node that emitted the event).
   * @param {Object} event.detail - Event detail.
   * @param {*} event.detail.value - New value.
   */
  updateTargets(event) {
    if (event.target != this.source) {
      console.warn(
        `io error: updateTargets() should always originate form source node.
        Please file an issue at https://github.com/arodic/io/issues.`
      );
      return;
    }
    const value = event.detail.value;
    for (let i = this.targets.length; i--;) {
      const targetProps = this.targetsMap.get(this.targets[i]);
      for (let j = targetProps.length; j--;) {
        let oldValue = this.targets[i][targetProps[j]];
        if (oldValue !== value) {
          // JavaScript is weird NaN != NaN
          if (typeof value == 'number' && typeof oldValue == 'number' && isNaN(value) && isNaN(oldValue)) continue;
          this.targets[i][targetProps[j]] = value;
        }
      }
    }
  }
  /**
   * Dispose of the binding by removing all targets and listeners.
   * Use this when node is no longer needed.
   */
  dispose() {
    this.source.removeEventListener(this.sourceProp + '-changed', this.updateTargets);
    for (let t in this.targets) {
      this.removeTarget(this.targets[t]);
      delete this.targets[t];
    }
  }
}

// TODO: Improve tests.

/** Manager for `IoNode` event queue and change handle functions. */
class NodeQueue extends Array {
  /**
   * Creates queue manager for `IoNode`.
   * @param {IoNode} node - Reference to the node/element itself.
   */
  constructor(node) {
    super();
    Object.defineProperty(this, 'node', {value: node, configurable: true});
  }
  /**
   * Add property change to the queue.
   * @param {string} prop - Property name.
   * @param {*} value Property value.
   * @param {*} oldValue Old property value.
   */
  queue(prop, value, oldValue) {
    const i = this.indexOf(prop);
    if (i === -1) {
      this.push(prop, {property: prop, value: value, oldValue: oldValue});
    } else {
      this[i + 1].value = value;
    }
  }
  /**
   * Dispatch the queue.
   */
  dispatch() {
    const node = this.node;
    if (this.length) {
      for (let j = 0; j < this.length; j += 2) {
        const prop = this[j];
        const detail = this[j + 1];
        const payload = {detail: detail};
        if (typeof detail.value === 'object' && detail.value === detail.oldValue) {
          if (node[prop + 'Mutated']) node[prop + 'Mutated'](payload);
          node.dispatchEvent(prop + '-mutated', payload.detail);
        } else {
          if (node[prop + 'Changed']) node[prop + 'Changed'](payload);
          node.dispatchEvent(prop + '-changed', payload.detail);
        }
      }
      // TODO: Evaluate performance and consider refactoring.
      if (node.isNode && !node.isElement) {
        node.dispatchEvent('object-mutated', {object: node}, false, window);
      }
      node.changed();
      this.length = 0;
    }
  }
  /**
   * Remove queue items and the node reference.
   * Use this when node is no longer needed.
   */
  dispose() {
    this.length = 0;
    delete this.node;
  }
}

// TODO: Improve tests.

/** Creates a map of all listeners defined in the prototype chain. */
class ProtoListeners {
  /**
   * @param {Array} protochain - Array of protochain constructors.
   */
  constructor(protochain) {
    for (let i = protochain.length; i--;) {
      const prop = protochain[i].constructor.listeners;
      for (let j in prop) this[j] = prop[j];
    }
  }
}

/** Manager for `IoNode` listeners. */
class Listeners {
  /**
   * Creates listener manager for `IoNode`.
   * @param {IoNode} node - Reference to the node/element itself.
   * @param {ProtoListeners} protoListeners - List of listeners defined in the protochain.
   */
  constructor(node, protoListeners) {
    // Copy listeners from protolisteners.
    Object.defineProperty(this, 'node', {value: node});
    Object.defineProperty(this, 'propListeners', {value: {}});
    Object.defineProperty(this, 'activeListeners', {value: {}});
    for (let prop in protoListeners) this[prop] = protoListeners[prop];
  }
  /**
   * Sets listeners from properties (filtered form properties map by 'on-' prefix).
   * @param {Object} props - Map of all properties.
   */
  setPropListeners(props) {
    for (let l in this.propListeners) delete this.propListeners[l];
    for (let l in props) {
      if (l.startsWith('on-')) {
        this.propListeners[l.slice(3, l.length)] = props[l];
      }
    }
  }
  /**
   * Adds event listeners.
   */
  connect() {
    const node = this.node;
    const propListeners = this.propListeners;
    for (let i in this) {
      const listener = typeof this[i] === 'function' ? this[i] : node[this[i]];
      node.addEventListener(i, listener);
    }
    for (let i in propListeners) {
      const listener = typeof propListeners[i] === 'function' ? propListeners[i] : node[propListeners[i]];
      node.addEventListener(i, listener);
    }
  }
  /**
   * Removes event listeners.
   */
  disconnect() {
    const node = this.node;
    const propListeners = this.propListeners;
    for (let i in this) {
      const listener = typeof this[i] === 'function' ? this[i] : node[this[i]];
      node.removeEventListener(i, listener);
    }
    for (let i in propListeners) {
      const listener = typeof propListeners[i] === 'function' ? propListeners[i] : node[propListeners[i]];
      node.removeEventListener(i, listener);
    }
  }
  /**
   * Removes all event listeners.
   * Use this when node is no longer needed.
   */
  dispose() {
    this.disconnect();
    const node = this.node;
    const active = this.activeListeners;
    for (let i in active) {
      for (let j = active[i].length; j--;) {
        if (node.isElement) HTMLElement.prototype.removeEventListener.call(node, i, active[i][j]);
        active[i].splice(j, 1);
      }
    }
  }
  /**
   * Adds an event listener.
   * @param {string} type - event name to listen to.
   * @param {function} listener - event handler function.
   */
  addEventListener(type, listener) {
    const node = this.node;
    const active = this.activeListeners;
    active[type] = active[type] || [];
    const i = active[type].indexOf(listener);
    if (i === - 1) {
      if (node.isElement) HTMLElement.prototype.addEventListener.call(node, type, listener);
      active[type].push(listener);
    }
  }
  /**
   * Removes an event listener.
   * @param {string} type - event name to listen to.
   * @param {function} listener - event handler function.
   */
  removeEventListener(type, listener) {
    const node = this.node;
    const active = this.activeListeners;
    if (active[type] !== undefined) {
      const i = active[type].indexOf(listener);
      if (i !== - 1) {
        if (node.isElement) HTMLElement.prototype.removeEventListener.call(node, type, listener);
        active[type].splice(i, 1);
      }
    }
  }
  /**
   * Shorthand for event dispatch.
   * @param {string} type - event name to dispatch.
   * @param {Object} detail - event detail.
   * @param {boolean} bubbles - event bubbles.
   * @param {HTMLElement|IoNode} src source node/element to dispatch event from.
   */
  dispatchEvent(type, detail = {}, bubbles = true, src = this.node) {
    if (src instanceof HTMLElement || src === window) {
      HTMLElement.prototype.dispatchEvent.call(src, new CustomEvent(type, {type: type, detail: detail, bubbles: bubbles, composed: true}));
    } else {
      const active = this.activeListeners;
      if (active[type] !== undefined) {
        const array = active[type].slice(0);
        for (let i = 0; i < array.length; i ++) {
          array[i].call(src, {detail: detail, target: src, path: [src]});
          // TODO: consider bubbling.
        }
      }
    }
  }
}

// TODO: Improve tests.

/** Creates a map of all property configurations defined in the prototype chain. */
class ProtoProperties {
  /**
   * @param {Array} protochain Array of protochain constructors.
   */
  constructor(protochain) {
    const propertyDefs = {};
    for (let i = protochain.length; i--;) {
      const props = protochain[i].constructor.properties;
      for (let key in props) {
        if (!propertyDefs[key]) propertyDefs[key] = new Property(props[key]);
        else propertyDefs[key].assign(new Property(props[key]));
      }
    }
    for (let key in propertyDefs) {
      this[key] = new Property(propertyDefs[key]);
    }
  }
  get(prop) {
    console.warn('Property', prop, 'cannot be get before instance is constructed.');
  }
  set(prop) {
    console.warn('Property', prop, 'cannot be set before instance is constructed.');
  }
}

/** Store for `IoNode` properties and their configurations. */
class Properties {
  /**
   * Creates properties object for `IoNode`.
   * @param {IoNode} node - Reference to the node/element itself.
   * @param {ProtoProperties} protoProperties - List of property configurations defined in the protochain.
   */
  constructor(node, protoProperties) {
    Object.defineProperty(this, 'node', {value: node});
    for (let prop in protoProperties) {
      this[prop] = protoProperties[prop].clone();
      if (typeof this[prop].value === 'object') {
        const value = this[prop].value;
        if (value && value.isNode) value.connect(node);
        node.queue(prop, value, undefined);
      }
    }
  }
  /**
   * Gets specified property value.
   * @param {string} prop - Property name.
   * @return {*} Property value.
   */
  get(prop) {
    return this[prop].value;
  }
  /**
   * Sets specified property value.
   * @param {string} prop - Property name.
   * @param {*} value Property value.
   */
  set(prop, value) {

    let oldBinding = this[prop].binding;
    let oldValue = this[prop].value;

    let binding = (value instanceof Binding) ? value : null;

    if (binding && oldBinding && binding !== oldBinding) {
      oldBinding.removeTarget(this.node, prop); // TODO: test extensively
    }
    if (binding) {
      binding.addTarget(this.node, prop);
      this[prop].binding = binding;
      this[prop].value = value.source[value.sourceProp];
      value = value.source[value.sourceProp];
    } else {
      this[prop].value = value;
    }

    if (value && value.isNode) {
      value.connect(this.node);
    }

    if (value !== oldValue && oldValue && oldValue.isNode) {
      oldValue.disconnect(this.node);
    }

    if (this[prop].reflect) this.node.setAttribute(prop, value);
  }
  // TODO: test dispose and disconnect for memory leaks!!
  // TODO: dispose bindings properly
  /**
   * Connects value bindings if defined.
   */
  connect() {
    for (let p in this) {
      if (this[p].binding) {
        this[p].binding.addTarget(this.node, p); //TODO: test
      }
    }
  }
  /**
   * Disonnects value bindings if defined.
   */
  disconnect() {
    for (let p in this) {
      if (this[p].binding) {
        this[p].binding.removeTarget(this.node, p);
      }
    }
  }
  /**
   * Disonnects bindings and removes all property configurations.
   * Use this when node is no longer needed.
   */
  dispose() {
    for (let p in this) {
      if (this[p].binding) {
        this[p].binding.removeTarget(this.node, p);
        delete this[p].binding;
      }
      delete this[p];
    }
  }
}

/**
 * Property configuration.
 */
class Property {
  /**
   * Creates a property configuration object with following properties:
   * @param {Object} config - Configuration object.
   * @param {*} config.value - Default value.
   * @param {function} config.type - Constructor of value.
   * @param {boolean} config.reflect - Reflects to HTML attribute
   * @param {Binding} config.binding - Binding object.
   * @param {boolean} config.enumerable - Makes property enumerable.
   */
  constructor(config) {
    if (config === null || config === undefined) {
      config = {value: config};
    } else if (typeof config === 'function') {
      config = {type: config};
    } else if (config instanceof Array) {
      config = {type: Array, value: [...config]};
    } else if (config instanceof Binding) {
      config = {binding: config, value: config.value};
    } else if (typeof config !== 'object') {
      config = {value: config, type: config.constructor};
    }
    this.assign(config);
  }
  /**
   * Helper function to assign new values as we walk up the inheritance chain.
   * @param {Object} config - Configuration object.
   */
  assign(config) {
    if (config.value !== undefined) this.value = config.value;
    if (config.type !== undefined) this.type = config.type;
    if (config.reflect !== undefined) this.reflect = config.reflect;
    if (config.binding !== undefined) this.binding = config.binding;
    this.enumerable = config.enumerable !== undefined ? config.enumerable : true;
  }
  /**
   * Clones the property. If property value is objects it does one level deep object clone.
   * @return {Property} - Property configuration.
   */
  clone() {
    const prop = new Property(this);
    if (prop.type === undefined && prop.value !== undefined && prop.value !== null) {
      prop.type = prop.value.constructor;
    }
    if (prop.type === Array && prop.value) {
      prop.value = [...prop.value];
    }
    // Set default values.
    if (prop.value === undefined && prop.type) {
      if (prop.type === Boolean) prop.value = false;
      else if (prop.type === String) prop.value = '';
      else if (prop.type === Number) prop.value = 0;
      else if (prop.type === Array) prop.value = [];
      else if (prop.type === Object) prop.value = {};
      else if (prop.type !== HTMLElement && prop.type !== Function) {
        prop.value = new prop.type();
      }
    }
    return prop;
  }
}

// TODO: Improve tests.

/**
  * Core mixin for `IoNode` and `IoElement` classes.
  * @param {function} superclass - Class to extend.
  * @return {IoNodeMixin} - Extended class with `IoNodeMixin` applied to it.
  */
const IoNodeMixin = (superclass) => {
  const classConstructor = class extends superclass {
    /**
     * Static properties getter. Node properties should be defined here.
     * @return {Object} properties - Properties configuration objects.
     * @return {Object|*} [properties.*] - Configuration object or one of the configuration parameters.
     * @return {*} [properties.*.value] - Default value.
     * @return {function} [properties.*.type] - Constructor of value.
     * @return {boolean} [properties.*.reflect] - Reflects to HTML attribute
     * @return {Binding} [properties.*.binding] - Binding object.
     * @return {boolean} [properties.*.enumerable] - Makes property enumerable.
     */
    static get properties() {
      return {};
    }
    // TODO: refactor?
    get bindings() {
      return;
    }
    /**
      * Creates `IoNode` instance and initializes internals.
      * @param {Object} initProps - Property values to inialize instance with.
      */
    constructor(initProps = {}) {
      super(initProps);

      if (!this.constructor.prototype.__registered) this.constructor.Register();

      Object.defineProperty(this, '__nodeBindings', {value: new NodeBindings(this)});
      Object.defineProperty(this, '__nodeQueue', {value: new NodeQueue(this)});

      Object.defineProperty(this, '__properties', {value: new Properties(this, this.__protoProperties)});
      Object.defineProperty(this, '__listeners', {value: new Listeners(this, this.__protoListeners)});

      for (let i = 0; i < this.__functions.length; i++) {
        this[this.__functions[i]] = this[this.__functions[i]].bind(this);
      }

      this.__listeners.setPropListeners(initProps, this);

      // TODO: Test and documentation.
      if (this.compose) this.applyCompose(this.compose);

      this.setProperties(initProps);
    }
    /**
      * Connects IoNode to the application.
      * @param {IoNode|IoElement} owner - Node or element `IoNode` is connected to.
      */
    connect(owner) {
      this._owner = this._owner || [];
      if (this._owner.indexOf(owner) === -1) {
        this._owner.push(owner);
        if (!this.__connected) this.connectedCallback();
      }
    }
    /**
      * Disconnects IoNode from the application.
      * @param {IoNode|IoElement} owner - Node or element `IoNode` is connected to.
      */
    disconnect(owner) {
      if (this._owner.indexOf(owner) !== -1) {
        this._owner.splice(this._owner.indexOf(owner), 1);
      }
      if (this._owner.length === 0 && this.__connected) {
        this.disconnectedCallback();
      }
    }
    /**
      * Shorthand for `event.preventDefault()`.
      * @param {Object} event - Event object.
      */
    preventDefault(event) {
      event.preventDefault();
    }
    /**
      * default change handler.
      */
    changed() {}
    /**
      * Returns a binding to a specified property`.
      * @param {string} prop - Property to bind to.
      * @return {Binding} Binding object.
      */
    bind(prop) {
      return this.__nodeBindings.get(prop);
    }
    /**
      * Sets a property and emits [property]-set` event.
      * Use this when property is set by user action (e.g. mouse click).
      * @param {string} prop - Property name.
      * @param {*} value - Property value.
      */
    set(prop, value) {
      if (this[prop] !== value) {
        const oldValue = this[prop];
        this[prop] = value;
        this.dispatchEvent(prop + '-set', {property: prop, value: value, oldValue: oldValue}, false);
      }
    }
    // TODO: consider renaming and simplifying `props` object structure.
    /**
      * Sets multiple properties in batch.
      * [property]-changed` events will be broadcast in the end.
      * @param {Object} props - Map of property names and values.
      */
    setProperties(props) {
      for (let p in props) {
        if (this.__properties[p] === undefined) continue;
        const oldValue = this.__properties[p].value;
        this.__properties.set(p, props[p]);
        const value = this.__properties[p].value;
        if (value !== oldValue) this.queue(p, value, oldValue);
      }

      this.className = props['className'] || '';

      if (props['style']) {
        for (let s in props['style']) {
          this.style[s] = props['style'][s];
          this.style.setProperty(s, props['style'][s]);
        }
      }
      if (this.__connected) this.queueDispatch();
    }
    // TODO: Document.
    // TODO: Refactor.
    // TODO: Test extensively.
    applyCompose(nodes) {
      for (let n in nodes) {
        const properties = nodes[n];
        this[n].setProperties(properties);
        this.addEventListener(n + '-changed', (event) => {
          // TODO: Test.
          if (event.detail.oldValue) event.detail.oldValue.dispose();
          event.detail.value.setProperties(properties);
        });
      }
    }
    /**
      * This function is called when `object-mutated` event is observed
      * and changed object is a property of the node.
      * @param {Object} event - Property change event.
      */
    onObjectMutation(event) {
      for (let i = this.__objectProps.length; i--;) {
        const prop = this.__objectProps[i];
        const value = this.__properties[prop].value;
        if (value === event.detail.object) {
          // TODO: consider optimizing
          // setTimeout(()=> {
            if (this[prop + 'Mutated']) this[prop + 'Mutated'](event);
            this.changed();
          // });
          return;
        }
      }
    }
    /**
      * Callback when `IoNode` is connected.
      */
    connectedCallback() {
      this.__listeners.connect();
      this.__properties.connect();
      this.__connected = true;
      if (this.__objectProps.length) {
        window.addEventListener('object-mutated', this.onObjectMutation);
      }
      this.queueDispatch();
    }
    /**
      * Callback when `IoNode` is disconnected.
      */
    disconnectedCallback() {
      this.__listeners.disconnect();
      this.__properties.disconnect();
      this.__connected = false;
      if (this.__objectProps.length) {
        window.removeEventListener('object-mutated', this.onObjectMutation);
      }
    }
    /**
      * Disposes all internals.
      * Use this when node is no longer needed.
      */
    dispose() {
      this.__nodeQueue.dispose();
      this.__nodeBindings.dispose();
      this.__listeners.dispose();
      this.__properties.dispose();
    }
    /**
      * Wrapper for addEventListener.
      * @param {string} type - listener name.
      * @param {function} listener - listener handler.
      */
    addEventListener(type, listener) {
      this.__listeners.addEventListener(type, listener);
    }
    /**
      * Wrapper for removeEventListener.
      * @param {string} type - event name to listen to.
      * @param {function} listener - listener handler.
      */
    removeEventListener(type, listener) {
      this.__listeners.removeEventListener(type, listener);
    }
    /**
      * Wrapper for dispatchEvent.
      * @param {string} type - event name to dispatch.
      * @param {Object} detail - event detail.
      * @param {boolean} bubbles - event bubbles.
      * @param {HTMLElement|IoNode} src source node/element to dispatch event from.
      */
    dispatchEvent(type, detail, bubbles = false, src) {
      this.__listeners.dispatchEvent(type, detail, bubbles, src);
    }
    /**
      * Adds property change to the queue.
      * @param {string} prop - Property name.
      * @param {*} value - Property value.
      * @param {*} oldValue - Old property value.
      */
    queue(prop, value, oldValue) {
      this.__nodeQueue.queue(prop, value, oldValue);
    }
    /**
      * Dispatches the queue.
      */
    queueDispatch() {
      this.__nodeQueue.dispatch();
    }
  };
  classConstructor.Register = Register;
  return classConstructor;
};

/**
  * Register function to be called once per class.
  * `IoNode` will self-register on first instance constructor.
  * `IoElement` classes should call Register manually before first instance is created.
  */
const Register = function () {
  Object.defineProperty(this.prototype, '__registered', {value: true});

  const protochain = [];
  let proto = this.prototype;
  while (proto && proto.constructor !== HTMLElement && proto.constructor !== Object) {
    protochain.push(proto); proto = proto.__proto__;
  }
  Object.defineProperty(this.prototype, 'isNode', {value: proto.constructor !== HTMLElement});
  Object.defineProperty(this.prototype, 'isElement', {value: proto.constructor === HTMLElement});

  Object.defineProperty(this.prototype, '__protochain', {value: protochain});
  Object.defineProperty(this.prototype, '__protoProperties', {value: new ProtoProperties(this.prototype.__protochain)});
  Object.defineProperty(this.prototype, '__protoListeners', {value: new ProtoListeners(this.prototype.__protochain)});

  // TODO: Unhack
  Object.defineProperty(this.prototype, '__properties', {value: this.prototype.__protoProperties});

  const functions = [];
  for (let i = this.prototype.__protochain.length; i--;) {
    const proto = this.prototype.__protochain[i];
    const names = Object.getOwnPropertyNames(proto);
    for (let j = 0; j < names.length; j++) {
      if (names[j] === 'constructor') continue;
      if (Object.getOwnPropertyDescriptor(proto, names[j]).get) continue;
      if (typeof proto[names[j]] !== 'function') continue;
      if (proto[names[j]].name === 'anonymous') continue;
      if (functions.indexOf(names[j]) === -1) functions.push(names[j]);
    }
  }
  Object.defineProperty(this.prototype, '__functions', {value: functions});

  Object.defineProperty(this.prototype, '__objectProps', {value: []});
  const ignore = [Boolean, String, Number, HTMLElement, Function, undefined];
  for (let prop in this.prototype.__protoProperties) {
    let type = this.prototype.__protoProperties[prop].type;
    if (prop !== '$') { // TODO: unhack
      if (ignore.indexOf(type) == -1) this.prototype.__objectProps.push(prop);
    }
  }

  for (let prop in this.prototype.__protoProperties) {
    const isPublic = prop.charAt(0) !== '_';
    const isEnumerable = !(this.prototype.__protoProperties[prop].enumerable === false);
    Object.defineProperty(this.prototype, prop, {
      get: function() {
        return this.__properties[prop].value;
      },
      set: function(value) {
        if (this.__properties[prop].value === value) return;
        const oldValue = this.__properties.get(prop);
        this.__properties.set(prop, value);
        value = this.__properties.get(prop);
        if (isPublic) {
          this.queue(prop, value, oldValue);
          if (this.__connected) {
            this.queueDispatch();
          }
        }
      },
      enumerable: isEnumerable && isPublic,
      configurable: true,
    });
  }
};

IoNodeMixin.Register = Register;

/**
  * IoNodeMixin applied to `Object` class.
  */
class IoNode extends IoNodeMixin(Object) {}

// TODO: Improve tests.
/**
  * Base class for custom elements.
  * `IoNodeMixin` applied to `HTMLElement` and a few custom functions.
  */
class IoElement extends IoNodeMixin(HTMLElement) {
  /**
   * See IoNode for more details.
   * @return {Object} properties - Properties configuration objects.
   */
  static get properties() {
    return {
      id: {
        type: String,
        enumerable: false
      },
      tabindex: {
        type: String,
        reflect: true,
        enumerable: false
      },
      contenteditable: {
        type: Boolean,
        reflect: true,
        enumerable: false
      },
      title: {
        type: String,
        reflect: true,
        enumerable: false
      },
      role: {
        type: String,
        reflect: true,
        enumerable: false
      },
      $: {
        type: Object,
      },
    };
  }
  /**
    * Callback when `IoElement` is connected.
    * Resize listener is added here if element class has `resized()` function defined.
    */
  connectedCallback() {
    super.connectedCallback();
    for (let prop in this.__properties) {
      if (this.__properties[prop].reflect) {
        this.setAttribute(prop, this.__properties[prop].value);
      }
    }
    if (typeof this.resized == 'function') {
      this.resized();
      if (ro) {
        ro.observe(this);
      } else {
        window.addEventListener('resize', this.resized);
      }
    }
  }
  /**
    * Callback when `IoElement` is connected.
    */
  disconnectedCallback() {
    super.disconnectedCallback();
    if (typeof this.resized == 'function') {
      if (ro) {
        ro.unobserve(this);
      } else {
        window.removeEventListener('resize', this.resized);
      }
    }
  }
  /**
    * Disposes all internals.
    * Use this when node is no longer needed.
    */
  dispose() {
    super.dispose();
    delete this.parent;
    this.children.lenght = 0;
    // this.__properties.$.value = {};
  }
  /**
    * Renders DOM from virtual DOM arrays.
    * @param {Array} children - Array of vDOM children.
    * @param {HTMLElement} [host] - Optional template target.
    */
  template(children, host) {
    // this.__properties.$.value = {};
    this.traverse(buildTree()(['root', children]).children, host || this);
  }
  /**
    * Recurively traverses vDOM.
    * @param {Array} vChildren - Array of vDOM children converted by `buildTree()` for easier parsing.
    * @param {HTMLElement} [host] - Optional template target.
    */
  traverse(vChildren, host) {
    const children = host.children;
    // remove trailing elements
    while (children.length > vChildren.length) {
      const child = children[children.length - 1];
      let nodes = Array.from(child.querySelectorAll('*'));
      host.removeChild(child);
      for (let i = nodes.length; i--;) {
        if (nodes[i].dispose) nodes[i].dispose();
      }
      if (child.dispose) child.dispose();
    }
    // create new elements after existing
    if (children.length < vChildren.length) {
      const frag = document.createDocumentFragment();
      for (let i = children.length; i < vChildren.length; i++) {
        frag.appendChild(constructElement(vChildren[i]));
      }
      host.appendChild(frag);
    }

    for (let i = 0; i < children.length; i++) {
      // replace existing elements
      if (children[i].localName !== vChildren[i].name) {
        const oldElement = children[i];
        host.insertBefore(constructElement(vChildren[i]), oldElement);
        let nodes = Array.from(oldElement.querySelectorAll('*'));
        host.removeChild(oldElement);
        for (let i = nodes.length; i--;) {
          if (nodes[i].dispose) nodes[i].dispose();
        }
        if (oldElement.dispose) oldElement.dispose();

      // update existing elements
      } else {
        children[i].className = '';
        // Io Elements
        if (children[i].hasOwnProperty('__properties')) {
          // WARNING TODO: Better property and listeners reset.
          // WARNING TODO: Test property and listeners reset.
          children[i].setProperties(vChildren[i].props);
          // TODO: Test and remove. Redundant with setProperties().
          // children[i].queueDispatch();
          children[i].__listeners.setPropListeners(vChildren[i].props, children[i]);
          children[i].__listeners.connect();
        // Native HTML Elements
        } else {
          for (let prop in vChildren[i].props) {
            if (prop === 'style') {
              for (let s in vChildren[i].props['style']) {
                // children[i].style[s] = vChildren[i].props[prop][s];
                children[i].style.setProperty(s, vChildren[i].props[prop][s]);
              }
            }
            else children[i][prop] = vChildren[i].props[prop];
          }
          // TODO: Refactor for native elements.
          children[i].__listeners.setPropListeners(vChildren[i].props, children[i]);
          children[i].__listeners.connect();
          ///
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
  // fixup for HTMLElement setAttribute
  setAttribute(attr, value) {
    if (value === true) {
      HTMLElement.prototype.setAttribute.call(this, attr, '');
    } else if (value === false || value === '') {
      this.removeAttribute(attr);
    } else if (typeof value == 'string' || typeof value == 'number') {
      if (this.getAttribute(attr) !== String(value)) HTMLElement.prototype.setAttribute.call(this, attr, value);
    }
  }
}

const warning = document.createElement('div');
warning.innerHTML = `
No support for custom elements detected! <br />
Sorry, modern browser is required to view this page.<br />
Please try <a href="https://www.mozilla.org/en-US/firefox/new/">Firefox</a>,
<a href="https://www.google.com/chrome/">Chrome</a> or
<a href="https://www.apple.com/lae/safari/">Safari</a>`;

/**
  * Register function for `IoElement`. Registers custom element.
  */
IoElement.Register = function() {

  IoNodeMixin.Register.call(this);

  const localName = this.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

  Object.defineProperty(this, 'localName', {value: localName});
  Object.defineProperty(this.prototype, 'localName', {value: localName});

  if (window.customElements !== undefined) {
    window.customElements.define(localName, this);
  } else {

    document.body.insertBefore(warning, document.body.children[0]);
    return;
  }

  initStyle(this.prototype.__protochain);

};

let ro;
if (window.ResizeObserver !== undefined) {
  ro = new ResizeObserver(entries => {
    for (let entry of entries) entry.target.resized();
  });
}

// TODO: refactor and make more powerful.
/**
  * Template literal handler for HTML strings.
  * @param {Array} parts - Template literal array argument.
  * @return {string} - Created HTML code.
  */
function html(parts) {
  let result = {
    string: '',
    vars: {},
  };
  for (let i = 0; i < parts.length; i++) {
    result.string += parts[i] + (arguments[i + 1] || '');
  }
  let vars = result.string.match(/-{2}?([a-z][a-z0-9]*)\b[^;]*;?/gi);
  if (vars) {
    for (let i = 0; i < vars.length; i++) {
      let v = vars[i].split(':');
      if (v.length === 2) {
        result.vars[v[0].trim()] = v[1].trim();
      }
    }
  }
  return result;
}

/**
  * Creates an element from virtual dom array.
  * @param {Array} vDOMNode - Virtual dom array.
  * @return {HTMLElement} - Created element.
  */
const constructElement = function(vDOMNode) {
 let ConstructorClass = window.customElements ? window.customElements.get(vDOMNode.name) : null;
 if (ConstructorClass) return new ConstructorClass(vDOMNode.props);

 let element = document.createElement(vDOMNode.name);
 for (let prop in vDOMNode.props) {
   if (prop === 'style') {
     for (let s in vDOMNode.props[prop]) {
       element.style[s] = vDOMNode.props[prop][s];
     }
   } else element[prop] = vDOMNode.props[prop];
 }
 // TODO: Refactor for native elements
 Object.defineProperty(element, '__listeners', {value: new Listeners(element)});
 element.__listeners.setPropListeners(vDOMNode.props, element);
 element.__listeners.connect();

 return element;
};

// https://github.com/lukejacksonn/ijk
const clense = (a, b) => !b ? a : typeof b[0] === 'string' ? [...a, b] : [...a, ...b];
const buildTree = () => node => !!node && typeof node[1] === 'object' && !Array.isArray(node[1]) ? {
   ['name']: node[0],
   ['props']: node[1],
   ['children']: Array.isArray(node[2]) ? node[2].reduce(clense, []).map(buildTree()) : node[2] || ''
 } : buildTree()([node[0], {}, node[1] || '']);

const _stagingElement = document.createElement('div');

/**
  * Initializes the element style.
  * @param {Array} prototypes - An array of prototypes to ge the styles from.
  */
function initStyle(prototypes) {
  let localName = prototypes[0].constructor.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  for (let i = prototypes.length; i--;) {
    let style = prototypes[i].constructor.style;
    if (style) {
      style.string = style.string.replace(new RegExp(':host', 'g'), localName);
      for (let v in style.vars) {
        style.string = style.string.replace(new RegExp(v, 'g'), v.replace('--', '--' + localName + '-'));
      }
      _stagingElement.innerHTML = style.string;
      let element = _stagingElement.querySelector('style');
      element.setAttribute('id', 'io-style-' + localName + '-' + i);
      document.head.appendChild(element);
    }

  }
}

if (!("serviceWorker" in navigator)) { console.warn("No Service Worker support!"); }
if (!("PushManager" in window)) { console.warn("No Push API Support!"); }

class IoServiceLoader extends IoNode {
  static get properties() {
    return {
      path: 'service.js',
      serviceWorker: undefined,
      granted: window.Notification && window.Notification.permission === 'granted',
      subscription: '',
    };

  }
  constructor(props) {
    super(props);
    if ("serviceWorker" in navigator) this.init();
  }
  async init() {
    const serviceWorkerRegistration = await navigator.serviceWorker.register(this.path);
    serviceWorkerRegistration.update();
    navigator.serviceWorker.addEventListener('message', this.onServiceWorkerMessage);
    if (serviceWorkerRegistration.active) {
      this.serviceWorker = serviceWorkerRegistration;
    } else {
      serviceWorkerRegistration.addEventListener('activate', () => { this.serviceWorker = serviceWorkerRegistration; });
    }
  }
  serviceWorkerChanged() {
    if (this.granted) this.subscribe();
  }
  subscribe() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({command: 'subscribe'});
    }
  }
  async requestNotification() {
    this.granted = await window.Notification.requestPermission() === 'granted';
    if (this.granted) this.subscribe();
  }
  onServiceWorkerMessage(event) {
    const data = JSON.parse(event.data);
    if (data.subscription) this.subscription = JSON.stringify(data.subscription);
  }
}

const nodes = {};
let hashes = {};

const parseHashes = function() {
  return window.location.hash.substr(1).split('&').reduce(function (result, item) {
    const parts = item.split('=');
    result[parts[0]] = parts[1];
    return result;
  }, {});
};

const getHashes = function() {
  hashes = parseHashes();
  for (let hash in hashes) {
    if (nodes[hash]) {
      if (nodes[hash] !== '') {
        if (!isNaN(hashes[hash])) {
          nodes[hash].value = JSON.parse(hashes[hash]);
        } else if (hashes[hash] === 'true' || hashes[hash] === 'false') {
          nodes[hash].value = JSON.parse(hashes[hash]);
        } else {
          nodes[hash].value = hashes[hash];
        }
      }
    }
  }
};

const setHashes = function(force) {
  let hashString = '';
  for (let node in nodes) {
    if ((nodes[node].hash || force) && nodes[node].value !== undefined && nodes[node].value !== '' && nodes[node].value !== nodes[node].defValue) {
      if (typeof nodes[node].value === 'string') {
        hashString += node + '=' + nodes[node].value + '&';
      } else {
        hashString += node + '=' + JSON.stringify(nodes[node].value) + '&';
      }
    }
  }
  hashString = hashString.slice(0, -1);
  window.location.hash = hashString;
  if (!window.location.hash) history.replaceState({}, document.title, ".");
};

window.addEventListener("hashchange", getHashes, false);
getHashes();

class IoStorageNode extends IoNode {
  static get properties() {
    return {
      key: String,
      value: undefined,
      defValue: undefined,
      hash: Boolean,
    };
  }
  constructor(props, defValue) {
    super(props);
    this.defValue = defValue;
    const hashValue = hashes[this.key];
    const key = window.location.pathname !== '/' ? window.location.pathname + this.key : this.key;
    const localValue = localStorage.getItem(key);
    if (hashValue !== undefined) {
      try {
        this.value = JSON.parse(hashValue);
      } catch (e) {
        this.value = hashValue;
      }
    } else {
      if (localValue !== null && localValue !== undefined) {
        this.value = JSON.parse(localValue);
      } else {
        this.value = defValue;
      }
    }
  }
  valueChanged() {
    setHashes();
    const key = window.location.pathname !== '/' ? window.location.pathname + this.key : this.key;
    if (this.value === null || this.value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(this.value));
    }
  }
}

function IoStorage(key, defValue, hash) {
  if (!nodes[key]) {
    nodes[key] = new IoStorageNode({key: key, hash: hash}, defValue);
    nodes[key].binding = nodes[key].bind('value');
    nodes[key].connect(window);
    nodes[key].valueChanged();
  }
  return nodes[key].binding;
}

/**
 * @author arodic / https://github.com/arodic
 */

export { IoNodeMixin, IoNode, IoElement, html, Binding, NodeBindings, IoServiceLoader, IoStorage, nodes as storageNodes };
