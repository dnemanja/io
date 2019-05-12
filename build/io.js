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

class IoProperties extends IoElement {
  static get style() {
    return html`<style>:host {display: flex;flex-direction: column;flex: 0 0;line-height: 1em;}:host > .io-property {display: flex !important;flex-direction: row;}:host > .io-property > .io-property-label {padding: 0 0.2em 0 0.5em;flex: 0 0 auto;color: var(--io-theme-color);}:host > .io-property > .io-property-editor {margin: 0;padding: 0;}:host > .io-property > io-object,:host > .io-property > io-object > io-boolean,:host > .io-property > io-object > io-properties {padding: 0 !important;border: none !important;background: none !important;}:host > .io-property > io-number,:host > .io-property > io-string,:host > .io-property > io-boolean {border: none;background: none;}:host > .io-property > io-number {color: var(--io-theme-number-color);}:host > .io-property > io-string {color: var(--io-theme-string-color);}:host > .io-property > io-boolean {color: var(--io-theme-boolean-color);}</style>`;
  }
  static get properties() {
    return {
      value: Object,
      config: Object,
      props: Array,
      labeled: true,
    };
  }
  get _config() {
    return this.__proto__.__config.getConfig(this.value, this.config);
  }
  _onValueSet(event) {
    const path = event.composedPath();
    if (path[0] === this) return;
    if (event.detail.object) return; // TODO: unhack
    event.stopPropagation();
    const key = path[0].id;
    if (key !== null) {
      this.value[key] = event.detail.value;
      const detail = Object.assign({object: this.value, key: key}, event.detail);
      this.dispatchEvent('object-mutated', detail, false, window); // TODO: test
      this.dispatchEvent('value-set', detail, false);
    }
  }
  // TODO: Consider valueMutated() instead
  changed() {
    const config = this._config;
    const elements = [];
    for (let c in config) {
      if (!this.props.length || this.props.indexOf(c) !== -1) {
        // if (config[c]) {
        const tag = config[c][0];
        const protoConfig = config[c][1];
        const label = config[c].label || c;
        const itemConfig = {className: 'io-property-editor', title: label, id: c, value: this.value[c], 'on-value-set': this._onValueSet};
        elements.push(
          ['div', {className: 'io-property'}, [
            this.labeled ? ['span', {className: 'io-property-label', title: label}, label + ':'] : null,
            [tag, Object.assign(itemConfig, protoConfig)]
          ]]);
        // }
      }
    }
    this.template(elements);
  }
  static get config() {
    return {
      'type:string': ['io-string', {}],
      'type:number': ['io-number', {step: 0.01}],
      'type:boolean': ['io-boolean', {true: '☑ true', false: '☐ false'}],
      'type:object': ['io-object', {}],
      'type:null': ['io-string', {}],
      'type:undefined': ['io-string', {}],
    };
  }
}

class Config {
  constructor(prototypes) {
    for (let i = 0; i < prototypes.length; i++) {
      this.registerConfig(prototypes[i].constructor.config || {});
    }
  }
  registerConfig(config) {
    for (let c in config) {
      this[c] = this[c] || [];
      this[c] = [config[c][0] || this[c][0], Object.assign(this[c][1] || {}, config[c][1] || {})];
    }
  }
  getConfig(object, customConfig) {
    const keys = Object.keys(object);
    const prototypes = [];

    let proto = object.__proto__;
    while (proto) {
      if (proto.constructor !== HTMLElement
          && proto.constructor !== Element
          && proto.constructor !== Node
          && proto.constructor !== EventTarget
          && proto.constructor !== Object) {
        keys.push(...Object.keys(proto));
      }
      prototypes.push(proto.constructor.name);
      proto = proto.__proto__;
    }

    const protoConfigs = {};

    for (let i in this) {
      const cfg = i.split('|');
      if (cfg.length === 1) cfg.splice(0, 0, 'Object');
      if (prototypes.indexOf(cfg[0]) !== -1) protoConfigs[cfg[1]] = this[i];
    }

    for (let i in customConfig) {
      const cfg = i.split('|');
      if (cfg.length === 1) cfg.splice(0, 0, 'Object');
      if (prototypes.indexOf(cfg[0]) !== -1) protoConfigs[cfg[1]] = customConfig[i];
    }

    const config = {};

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const value = object[k];
      const type = value === null ? 'null' : typeof value;
      const cstr = (value != undefined && value.constructor) ? value.constructor.name : 'null';

      if (type == 'function') continue;

      const typeStr = 'type:' + type;
      const cstrStr = 'constructor:' + cstr;
      const keyStr = k;

      config[k] = {};

      if (protoConfigs[typeStr]) config[k] = protoConfigs[typeStr];
      if (protoConfigs[cstrStr]) config[k] = protoConfigs[cstrStr];
      if (protoConfigs[keyStr]) config[k] = protoConfigs[keyStr];
    }

    return config;
  }
}

IoProperties.Register = function() {
  IoElement.Register.call(this);
  Object.defineProperty(this.prototype, '__config', {value: new Config(this.prototype.__protochain)});
};

IoProperties.Register();
IoProperties.RegisterConfig = function(config) {
  this.prototype.__config.registerConfig(config);
};

class IoArray extends IoProperties {
  static get style() {
    return html`<style>:host {display: grid;grid-row-gap: var(--io-theme-spacing);grid-column-gap: var(--io-theme-spacing);}:host[columns="2"] {grid-template-columns: auto auto;}:host[columns="3"] {grid-template-columns: auto auto auto;}:host[columns="4"] {grid-template-columns: auto auto auto auto;}</style>`;
  }
  changed() {
    const elements = [];
    this.setAttribute('columns', this.columns || Math.sqrt(this.value.length) || 1);
    for (let i = 0; i < this.value.length; i++) {
      elements.push(['io-number', {id: i, value: this.value[i], 'on-value-set': this._onValueSet}]);
    }
    this.template(elements);
  }
}

IoArray.Register();

class IoButton extends IoElement {
  static get style() {
    return html`<style>:host {display: inline-block;cursor: pointer;white-space: nowrap;-webkit-tap-highlight-color: transparent;overflow: hidden;text-overflow: ellipsis;line-height: 1em;border: var(--io-theme-button-border);border-radius: var(--io-theme-border-radius);padding: var(--io-theme-padding);padding-left: calc(3 * var(--io-theme-padding));padding-right: calc(3 * var(--io-theme-padding));background: var(--io-theme-button-bg);transition: background-color 0.4s;color: var(--io-theme-color);user-select: none;}:host:focus {outline: none;background: var(--io-theme-focus-bg);}:host:hover {background: var(--io-theme-hover-bg);}:host[pressed] {background: var(--io-theme-active-bg);}:host > span {text-align: center;}</style>`;
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

class IoBoolean extends IoButton {
  static get style() {
    return html`<style>:host {display: inline-block;background: none;}</style>`;
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
    this.action = this.toggle;
  }
  toggle() {
    this.set('value', !this.value);
  }
  changed() {
    this.innerText = this.value ? this.true : this.false;
  }
}

IoBoolean.Register();

// TODO: document, demo, test

const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl', {antialias: false, premultipliedAlpha: false});
gl.imageSmoothingEnabled = false;

gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.disable(gl.DEPTH_TEST);

const positionBuff = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuff);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,0.0,-1,-1,0.0,1,-1,0.0,1,1,0.0]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

const uvBuff = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuff);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1,0,0,1,0,1,1]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

const indexBuff = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuff);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([3,2,1,3,1,0]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

const vertCode = `
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main(void) {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;

const vertShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertShader, vertCode);
gl.compileShader(vertShader);

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuff);

const shadersCache = new WeakMap();

class IoCanvas extends IoElement {
  static get style() {
    return html`<style>:host {box-sizing: border-box;overflow: hidden;position: relative;border: 1px solid black;}:host > canvas {position: absolute;top: 0px;left: 0px;touch-action: none;user-select: none;image-rendering: pixelated;}</style>`;
  }
  static get properties() {
    return {
      bg: [0, 0, 0, 1],
      color: [1, 1, 1, 1],
      size: [1, 1],
    };
  }
  static get frag() {
    return `
    varying vec2 vUv;
    void main(void) {
      vec2 px = size * vUv;
      px = mod(px, 5.0);
      if (px.x > 1.0 && px.y > 1.0) discard;
      gl_FragColor = color;
    }`;
  }
  constructor(props) {
    super(props);

    let frag = 'precision mediump float;\n';

    for (let prop in this.__properties) {
      let type = this.__properties[prop].type;
      let value = this.__properties[prop].value;
      if (type === Number) {
        frag += 'uniform float ' + prop + ';\n';
      } else if (type === Array) {
        frag += 'uniform vec' + value.length + ' ' + prop + ';\n';
      }
      // TODO: implement bool and matrices.
    }

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, frag + this.constructor.frag);
    gl.compileShader(fragShader);

    if (shadersCache.has(this.constructor)) {
      this._shader = shadersCache.get(this.constructor);
    } else {
      this._shader = gl.createProgram();
      gl.attachShader(this._shader, vertShader);
      gl.attachShader(this._shader, fragShader);
      shadersCache.set(this.constructor, this._shader);
    }

    gl.linkProgram(this._shader);

    const position = gl.getAttribLocation(this._shader, "position");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuff);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(position);

    const uv = gl.getAttribLocation(this._shader, "uv");
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuff);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uv);

    this.template([['canvas', {id: 'canvas'}]]);
    this._context2d = this.$.canvas.getContext('2d');
    this._context2d.imageSmoothingEnabled = false;

    this.render();
  }
  resized() {
    const rect = this.getBoundingClientRect();
    this.size[0] = rect.width;
    this.size[1] = rect.height;
    this.changed();
  }
  changed() {
    requestAnimationFrame(() => {
      this.render();
    });
  }
  render() {
    if (!this._shader) return;

    canvas.width = this.size[0];
    canvas.height = this.size[1];

    gl.viewport(0, 0, this.size[0], this.size[1]);
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], this.bg[3]);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._shader);

    for (let prop in this.__properties) {
      let type = this.__properties[prop].type;
      let value = this.__properties[prop].value;
      if (type === Number) {
        const uniform = gl.getUniformLocation(this._shader, prop);
        gl.uniform1f(uniform, value);
      } else if (type === Array) {
        const uniform = gl.getUniformLocation(this._shader, prop);
        switch (value.length) {
          case 2:
            gl.uniform2f(uniform, value[0], value[1]);
            break;
          case 3:
            gl.uniform3f(uniform, value[0], value[1], value[2]);
            break;
          case 4:
            gl.uniform4f(uniform, value[0], value[1], value[2], value[3]);
            break;
          default:
        }
      }
    }

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    if (this._context2d && canvas.width && canvas.height) {
      this.$.canvas.width = canvas.width;
      this.$.canvas.height = canvas.height;
      this._context2d.drawImage(canvas, 0, 0, canvas.width, canvas.height);
    }
  }
}

IoCanvas.Register();

class IoCollapsable extends IoElement {
  static get style() {
    return html`<style>:host {display: flex;flex-direction: column;border: var(--io-theme-frame-border);border-radius: var(--io-theme-border-radius);padding: var(--io-theme-padding);background: var(--io-theme-frame-bg);}:host > io-boolean {border: none;border-radius: 0;background: none;}:host > io-boolean:focus {border: none;}:host > io-boolean::before {content: '▸';display: inline-block;width: 0.65em;margin: 0 0.25em;}:host[expanded] > io-boolean{margin-bottom: var(--io-theme-padding);}:host[expanded] > io-boolean::before{content: '▾';}:host > .io-collapsable-content {display: block;border: var(--io-theme-content-border);border-radius: var(--io-theme-border-radius);padding: var(--io-theme-padding);background: var(--io-theme-content-bg);}</style>`;
  }
  static get properties() {
    return {
      label: String,
      expanded: {
        type: Boolean,
        reflect: true
      },
      elements: Array,
    };
  }
  changed() {
    this.template([
      ['io-boolean', {true: this.label, false: this.label, value: this.bind('expanded')}],
      (this.expanded && this.elements.length) ? ['div', {className: 'io-collapsable-content'}, this.elements] : null
    ]);
  }
}

IoCollapsable.Register();

// TODO: document and test
// TODO: consider renaming

class IoElementCache extends IoElement {
  static get properties() {
    return {
      selected: String,
      elements:  Array,
      precache: Boolean,
      cache: Boolean,
      _cache: Object,
    };
  }
  constructor(props) {
    super(props);
    this.stagingElement = document.createElement('io-element-cache-staging');
    document.head.appendChild(this.stagingElement);
  }
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('readystatechange', this.readystatechange);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('readystatechange', this.readystatechange);
  }
  readystatechange() {
    this.precacheChanged();
  }
  precacheChanged() {
    if (this.precache && document.readyState === 'complete') {
      this.template(this.elements, this.stagingElement);
      for (let i = 0; i < this.stagingElement.childNodes.length; i++) {
        this._cache[i] = this.stagingElement.childNodes[i];
      }
    }
    this.stagingElement.innerHTML = '';
  }
  dispose() {
    super.dispose();
    this.innerHTML = '';
    this.stagingElement.innerHTML = '';
    delete this._cache;
  }
  changed() {
    const element = this.elements.find(element => {
      return element[1].label == this.selected;
    });

    if (!element) {
      this.template();
      return;
    }
    if ((this.precache || this.cache) && (element.cache !== false) && this._cache[this.selected]) {
      this.innerHTML = '';
      this.appendChild(this._cache[this.selected]);
    } else {
      if (this.cache) {
        this.innerHTML = '';
        this.template([element], this.stagingElement);
        this._cache[this.selected] = this.stagingElement.childNodes[0];
        this.appendChild(this._cache[this.selected]);
        this.stagingElement.innerHTML = '';
      } else {
        this.template([element]);
      }
    }
  }
}

IoElementCache.Register();

function isValueOfPropertyOf(prop, object) {
  for (let key in object) if (object[key] === prop) return key;
  return null;
}

class IoInspector extends IoElement {
  static get style() {
    return html`<style>
    :host {
      display: flex;
      flex-direction: column;
      border: var(--io-theme-content-border);
      border-radius: var(--io-theme-border-radius);
      padding: var(--io-theme-padding);
      background: var(--io-theme-content-bg);
    }
    :host > io-inspector-breadcrumbs {
      margin: var(--io-theme-spacing);
    }
    :host > io-collapsable {
      margin: var(--io-theme-spacing);
    }
    :host > io-collapsable > div io-properties > .io-property {
      overflow: hidden;
      padding: var(--io-theme-padding);
    }
    :host > io-collapsable > div io-properties > .io-property:not(:last-of-type) {
      border-bottom: var(--io-theme-border);
    }
    :host > io-collapsable > div io-properties > .io-property > :nth-child(1) {
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
      flex: 0 1 8em;
      min-width: 3em;
      padding: var(--io-theme-padding);
      margin: calc(0.25 * var(--io-theme-spacing));
    }
    :host > io-collapsable > div io-properties > .io-property > :nth-child(2) {
      flex: 1 0 8em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 2em;
    }

    :host div io-properties > .io-property > io-object,
    :host div io-properties > .io-property > io-number,
    :host div io-properties > .io-property > io-string,
    :host div io-properties > .io-property > io-boolean {
      border: 1px solid transparent;
      padding: var(--io-theme-padding) !important;
    }
    :host div io-properties > .io-property > io-boolean:not([value]) {
      opacity: 0.5;
    }
    :host div io-properties > .io-property > io-option {
      flex: 0 1 auto !important;
      padding: var(--io-theme-padding) !important;
    }
    :host div io-properties > .io-property > io-number,
    :host div io-properties > .io-property > io-string {
      border: var(--io-theme-field-border);
      color: var(--io-theme-field-color);
      background: var(--io-theme-field-bg);
    }

    :host io-properties > .io-property > io-properties {
      border: var(--io-theme-field-border);
      background: rgba(127, 127, 127, 0.125);
    }
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

class Config$1 {
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
  Object.defineProperty(this.prototype, '__config', {value: new Config$1(this.prototype.__protochain)});
};

IoInspector.Register();
IoInspector.RegisterConfig = function(config) {
  this.prototype.__config.registerConfig(config);
};

class IoInspectorBreadcrumbs extends IoElement {
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

class IoInspectorLink extends IoButton {
  static get style() {
    return html`<style>:host {border: none;overflow: hidden;text-overflow: ellipsis;background: none;padding: 0;border: 1px solid transparent;color: var(--io-theme-link-color);padding: var(--io-theme-padding) !important;}:host:focus {outline: none;background: none;text-decoration: underline;}:host:hover {background: none;text-decoration: underline;}:host[pressed] {background: none;}</style>`;
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

class IoLayoutDivider extends IoElement {
  static get style() {
    return html`<style>:host {background: #333;color: #ccc;z-index: 1;display: flex;flex: none;border: 1px outset #666;}:host[orientation=horizontal] {cursor: col-resize;width: 4px;}:host[orientation=vertical] {cursor: row-resize;height: 4px;}:host > .app-divider {flex: 1;margin: -0.4em;display: flex;align-items: center;justify-content: center;}</style>`;
  }
  static get properties() {
    return {
      orientation: {
        value: 'horizontal',
        reflect: true
      },
      index: Number,
      pointermode: 'relative'
    };
  }
  static get listeners() {
    return {
      'pointermove': '_onPointerMove'
    };
  }
  _onPointerMove(event) {
    if (event.buttons) {
      event.preventDefault();
      this.setPointerCapture(event.pointerId);
      this.dispatchEvent('io-layout-divider-move', {
        movement: this.orientation === 'horizontal' ? event.movementX : event.movementY,
        index: this.index
      }, true);
    }
  }
  changed() {
    this.template([
      ['div', {className: 'app-divider'}, this.orientation === 'horizontal' ? '⋮' : '⋯']
    ]);
  }
}

IoLayoutDivider.Register();

class IoLayout extends IoElement {
  static get style() {
    return html`<style>:host {flex: 1;display: flex;overflow: hidden;}:host[orientation=horizontal] {flex-direction: row;}:host[orientation=vertical] {flex-direction: column;}:host > io-tabbed-elements {margin-top: var(--io-theme-spacing);}</style>`;
  }
  static get properties() {
    return {
      elements: Array,
      splits: Array,
      editable: true,
      orientation: {
        value: 'horizontal',
        reflect: true
      }
    };
  }
  static get listeners() {
    return {
      'io-layout-divider-move': '_onDividerMove',
      // 'layout-changed': '_onAppBlockChanged'
    };
  }
  splitsMutated() {
    const $blocks = [].slice.call(this.children).filter(element => element.localName !== 'io-layout-divider');
    for (let i = 0; i < $blocks.length; i++) {
      if ($blocks[i].selected) {
        this.splits[i].selected = $blocks[i].selected;
      }
    }
  }
  changed() {
    // let dim = this.orientation === 'horizontal' ? 'width' : 'height';
    // let SPLIT_SIZE = 5;
    // let rectSize = this.getBoundingClientRect()[dim];
    // let maxFlex = rectSize - (this.splits.length - 1) * SPLIT_SIZE;
    let children = [];
    for (let i = 0; i < this.splits.length; i++) {
      const split = this.splits[i];
      const flexBasis = split.size !== undefined ? split.size + 'px' : null;
      const style = {
        'flex-basis': flexBasis ? flexBasis : 'auto',
        'flex-grow': flexBasis ? 0 : 1,
        'flex-shrink': 1 // flexBasis ? 1 : 0
      };
      if (split.tabs) {
        children.push(['io-tabbed-elements', {
          elements: this.elements,
          filter: split.tabs,
          selected: split.selected,
          editable: this.editable,
          style: style,
          'on-selected-changed': this.splitsMutated
        }]);
        // children.push(['div', {style: style}, ' ' + split.size]);
      } else if (split.splits) {
        children.push(['io-layout', {
          elements: this.elements,
          splits: split.splits,
          orientation: split.orientation,
          editable: this.editable,
          style: style,
        }]);
      } else {
        // TODO: Improve data validation.
        children.push(['p', 'Malformed layout data.']);
      }
      if (i < this.splits.length - 1) {
        children.push(['io-layout-divider', {
          orientation: this.orientation || 'horizontal',
          index: i
        }]);
      }
    }
    this.template([children]);
  }
  // splitsChanged(event) {
  //   // for (let i = this.splits.length; i--;) {
  //   //   if (this.splits[i][1].tabs == event.detail.tabs) {
  //   //     this.splits[i][1].selected = event.detail.selected;
  //   //     // if (event.detail.tabs.length === 0) {
  //   //     //   this.splits.splice(i, 1);
  //   //     //   console.log(event.detail.tabs);
  //   //     // }
  //   //   }
  //   // }
  // }
  // addSplit(elementID, srcBlock, target) {
  //   let hor = this.orientation === 'horizontal';
  //   let ver = this.orientation === 'vertical';
  //
  //   const $blocks = [].slice.call(this.children).filter(element => element.localName !== 'io-layout-divider');
  //   let spliceIndex = $blocks.indexOf(srcBlock);
  //   let divideIndex = -1;
  //
  //   if ((hor && target == 'right') || (ver && target == 'bottom')) spliceIndex += 1;
  //   else if ((hor && target == 'top') || (ver && target == 'left')) divideIndex = 0;
  //   else if ((hor && target == 'bottom') || (ver && target == 'right')) divideIndex = 1;
  //
  //   let newBlock = ['io-layout', {'tabs': [elementID], 'selected': 0}];
  //   if (divideIndex !== -1) {
  //     let split = this.splits[spliceIndex];
  //     this.splits.splice(spliceIndex, 1, ['io-layout', {'orientation': hor ? 'vertical' : 'horizontal', 'splits': [
  //       divideIndex ? split : newBlock,
  //       divideIndex ? newBlock : split
  //     ]}]);
  //   } else {
  //     this.splits.splice(spliceIndex, 0, newBlock);
  //   }
  //   this.changed();
  // }
  _onDividerMove(event) {
    event.stopPropagation();
    let pi = event.detail.index;
    let ni = event.detail.index + 1;

    let prev = this.splits[pi];
    let next = this.splits[ni];

    // TODO: better clipping and snapping
    let dp = prev.size === undefined ? undefined : (prev.size + event.detail.movement);
    let dn = next.size === undefined ? undefined : (next.size - event.detail.movement);

    // console.log(dp, dn);
    if ((dp !== undefined && dp >= 0) && (dn === undefined || dn >= 0)) {
      this.splits[pi].size = Math.max(0, dp);
    }
    if ((dn !== undefined && dn >= 0) && (dp === undefined || dp >= 0)) {
      this.splits[ni].size = Math.max(0, dn);
    }

    // TODO improve UX to work as expected in all edge cases.

    if (prev.size === undefined && next.size === undefined) {
      const $blocks = [].slice.call(this.children).filter(element => element.localName !== 'io-layout-divider');
      let dim = this.orientation === 'horizontal' ? 'width' : 'height';
      let ci = Math.floor(this.splits.length / 2);
      if (Math.abs(ci - pi) <= Math.abs(ci - ni)) {
        for (let j = ni; j < this.splits.length; j++) {
          this.splits[j].size = parseInt($blocks[j].getBoundingClientRect()[dim]);
        }
      } else {
        for (let j = pi; j >= 0; j--) {
          this.splits[j].size = parseInt($blocks[j].getBoundingClientRect()[dim]);
        }
      }
    }

    this.queue('splits', this.splits, this.splits);
    this.queueDispatch();
  }
}

IoLayout.Register();

/**
 * marked - a markdown parser
 * Copyright (c) 2011-2018, Christopher Jeffrey. (MIT Licensed)
 * https://github.com/markedjs/marked
 */
!function(e){var k={newline:/^\n+/,code:/^( {4}[^\n]+\n*)+/,fences:g,hr:/^ {0,3}((?:- *){3,}|(?:_ *){3,}|(?:\* *){3,})(?:\n+|$)/,heading:/^ *(#{1,6}) *([^\n]+?) *(?:#+ *)?(?:\n+|$)/,nptable:g,blockquote:/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/,list:/^( *)(bull) [\s\S]+?(?:hr|def|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,html:"^ {0,3}(?:<(script|pre|style)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?\\?>\\n*|<![A-Z][\\s\\S]*?>\\n*|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>\\n*|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:\\n{2,}|$)|<(?!script|pre|style)([a-z][\\w-]*)(?:attribute)*? */?>(?=\\h*\\n)[\\s\\S]*?(?:\\n{2,}|$)|</(?!script|pre|style)[a-z][\\w-]*\\s*>(?=\\h*\\n)[\\s\\S]*?(?:\\n{2,}|$))",def:/^ {0,3}\[(label)\]: *\n? *<?([^\s>]+)>?(?:(?: +\n? *| *\n *)(title))? *(?:\n+|$)/,table:g,lheading:/^([^\n]+)\n *(=|-){2,} *(?:\n+|$)/,paragraph:/^([^\n]+(?:\n(?!hr|heading|lheading| {0,3}>|<\/?(?:tag)(?: +|\n|\/?>)|<(?:script|pre|style|!--))[^\n]+)*)/,text:/^[^\n]+/};function a(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||d.defaults,this.rules=k.normal,this.options.pedantic?this.rules=k.pedantic:this.options.gfm&&(this.options.tables?this.rules=k.tables:this.rules=k.gfm);}k._label=/(?!\s*\])(?:\\[\[\]]|[^\[\]])+/,k._title=/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/,k.def=t(k.def).replace("label",k._label).replace("title",k._title).getRegex(),k.bullet=/(?:[*+-]|\d+\.)/,k.item=/^( *)(bull) [^\n]*(?:\n(?!\1bull )[^\n]*)*/,k.item=t(k.item,"gm").replace(/bull/g,k.bullet).getRegex(),k.list=t(k.list).replace(/bull/g,k.bullet).replace("hr","\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))").replace("def","\\n+(?="+k.def.source+")").getRegex(),k._tag="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",k._comment=/<!--(?!-?>)[\s\S]*?-->/,k.html=t(k.html,"i").replace("comment",k._comment).replace("tag",k._tag).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),k.paragraph=t(k.paragraph).replace("hr",k.hr).replace("heading",k.heading).replace("lheading",k.lheading).replace("tag",k._tag).getRegex(),k.blockquote=t(k.blockquote).replace("paragraph",k.paragraph).getRegex(),k.normal=f({},k),k.gfm=f({},k.normal,{fences:/^ *(`{3,}|~{3,})[ \.]*(\S+)? *\n([\s\S]*?)\n? *\1 *(?:\n+|$)/,paragraph:/^/,heading:/^ *(#{1,6}) +([^\n]+?) *#* *(?:\n+|$)/}),k.gfm.paragraph=t(k.paragraph).replace("(?!","(?!"+k.gfm.fences.source.replace("\\1","\\2")+"|"+k.list.source.replace("\\1","\\3")+"|").getRegex(),k.tables=f({},k.gfm,{nptable:/^ *([^|\n ].*\|.*)\n *([-:]+ *\|[-| :]*)(?:\n((?:.*[^>\n ].*(?:\n|$))*)\n*|$)/,table:/^ *\|(.+)\n *\|?( *[-:]+[-| :]*)(?:\n((?: *[^>\n ].*(?:\n|$))*)\n*|$)/}),k.pedantic=f({},k.normal,{html:t("^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:\"[^\"]*\"|'[^']*'|\\s[^'\"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))").replace("comment",k._comment).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/}),a.rules=k,a.lex=function(e,t){return new a(t).lex(e)},a.prototype.lex=function(e){return e=e.replace(/\r\n|\r/g,"\n").replace(/\t/g,"    ").replace(/\u00a0/g," ").replace(/\u2424/g,"\n"),this.token(e,!0)},a.prototype.token=function(e,t){var n,r,s,i,l,o,a,h,p,c,u,g,f,d,b,m;for(e=e.replace(/^ +$/gm,"");e;)if((s=this.rules.newline.exec(e))&&(e=e.substring(s[0].length),1<s[0].length&&this.tokens.push({type:"space"})),s=this.rules.code.exec(e))e=e.substring(s[0].length),s=s[0].replace(/^ {4}/gm,""),this.tokens.push({type:"code",text:this.options.pedantic?s:y(s,"\n")});else if(s=this.rules.fences.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"code",lang:s[2],text:s[3]||""});else if(s=this.rules.heading.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"heading",depth:s[1].length,text:s[2]});else if(t&&(s=this.rules.nptable.exec(e))&&(o={type:"table",header:x(s[1].replace(/^ *| *\| *$/g,"")),align:s[2].replace(/^ *|\| *$/g,"").split(/ *\| */),cells:s[3]?s[3].replace(/\n$/,"").split("\n"):[]}).header.length===o.align.length){for(e=e.substring(s[0].length),u=0;u<o.align.length;u++)/^ *-+: *$/.test(o.align[u])?o.align[u]="right":/^ *:-+: *$/.test(o.align[u])?o.align[u]="center":/^ *:-+ *$/.test(o.align[u])?o.align[u]="left":o.align[u]=null;for(u=0;u<o.cells.length;u++)o.cells[u]=x(o.cells[u],o.header.length);this.tokens.push(o);}else if(s=this.rules.hr.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"hr"});else if(s=this.rules.blockquote.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"blockquote_start"}),s=s[0].replace(/^ *> ?/gm,""),this.token(s,t),this.tokens.push({type:"blockquote_end"});else if(s=this.rules.list.exec(e)){for(e=e.substring(s[0].length),a={type:"list_start",ordered:d=1<(i=s[2]).length,start:d?+i:"",loose:!1},this.tokens.push(a),n=!(h=[]),f=(s=s[0].match(this.rules.item)).length,u=0;u<f;u++)c=(o=s[u]).length,~(o=o.replace(/^ *([*+-]|\d+\.) +/,"")).indexOf("\n ")&&(c-=o.length,o=this.options.pedantic?o.replace(/^ {1,4}/gm,""):o.replace(new RegExp("^ {1,"+c+"}","gm"),"")),this.options.smartLists&&u!==f-1&&(i===(l=k.bullet.exec(s[u+1])[0])||1<i.length&&1<l.length||(e=s.slice(u+1).join("\n")+e,u=f-1)),r=n||/\n\n(?!\s*$)/.test(o),u!==f-1&&(n="\n"===o.charAt(o.length-1),r||(r=n)),r&&(a.loose=!0),m=void 0,(b=/^\[[ xX]\] /.test(o))&&(m=" "!==o[1],o=o.replace(/^\[[ xX]\] +/,"")),p={type:"list_item_start",task:b,checked:m,loose:r},h.push(p),this.tokens.push(p),this.token(o,!1),this.tokens.push({type:"list_item_end"});if(a.loose)for(f=h.length,u=0;u<f;u++)h[u].loose=!0;this.tokens.push({type:"list_end"});}else if(s=this.rules.html.exec(e))e=e.substring(s[0].length),this.tokens.push({type:this.options.sanitize?"paragraph":"html",pre:!this.options.sanitizer&&("pre"===s[1]||"script"===s[1]||"style"===s[1]),text:s[0]});else if(t&&(s=this.rules.def.exec(e)))e=e.substring(s[0].length),s[3]&&(s[3]=s[3].substring(1,s[3].length-1)),g=s[1].toLowerCase().replace(/\s+/g," "),this.tokens.links[g]||(this.tokens.links[g]={href:s[2],title:s[3]});else if(t&&(s=this.rules.table.exec(e))&&(o={type:"table",header:x(s[1].replace(/^ *| *\| *$/g,"")),align:s[2].replace(/^ *|\| *$/g,"").split(/ *\| */),cells:s[3]?s[3].replace(/(?: *\| *)?\n$/,"").split("\n"):[]}).header.length===o.align.length){for(e=e.substring(s[0].length),u=0;u<o.align.length;u++)/^ *-+: *$/.test(o.align[u])?o.align[u]="right":/^ *:-+: *$/.test(o.align[u])?o.align[u]="center":/^ *:-+ *$/.test(o.align[u])?o.align[u]="left":o.align[u]=null;for(u=0;u<o.cells.length;u++)o.cells[u]=x(o.cells[u].replace(/^ *\| *| *\| *$/g,""),o.header.length);this.tokens.push(o);}else if(s=this.rules.lheading.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"heading",depth:"="===s[2]?1:2,text:s[1]});else if(t&&(s=this.rules.paragraph.exec(e)))e=e.substring(s[0].length),this.tokens.push({type:"paragraph",text:"\n"===s[1].charAt(s[1].length-1)?s[1].slice(0,-1):s[1]});else if(s=this.rules.text.exec(e))e=e.substring(s[0].length),this.tokens.push({type:"text",text:s[0]});else if(e)throw new Error("Infinite loop on byte: "+e.charCodeAt(0));return this.tokens};var n={escape:/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,autolink:/^<(scheme:[^\s\x00-\x1f<>]*|email)>/,url:g,tag:"^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>",link:/^!?\[(label)\]\(href(?:\s+(title))?\s*\)/,reflink:/^!?\[(label)\]\[(?!\s*\])((?:\\[\[\]]?|[^\[\]\\])+)\]/,nolink:/^!?\[(?!\s*\])((?:\[[^\[\]]*\]|\\[\[\]]|[^\[\]])*)\](?:\[\])?/,strong:/^__([^\s])__(?!_)|^\*\*([^\s])\*\*(?!\*)|^__([^\s][\s\S]*?[^\s])__(?!_)|^\*\*([^\s][\s\S]*?[^\s])\*\*(?!\*)/,em:/^_([^\s_])_(?!_)|^\*([^\s*"<\[])\*(?!\*)|^_([^\s][\s\S]*?[^\s_])_(?!_)|^_([^\s_][\s\S]*?[^\s])_(?!_)|^\*([^\s"<\[][\s\S]*?[^\s*])\*(?!\*)|^\*([^\s*"<\[][\s\S]*?[^\s])\*(?!\*)/,code:/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,br:/^( {2,}|\\)\n(?!\s*$)/,del:g,text:/^(`+|[^`])[\s\S]*?(?=[\\<!\[`*]|\b_| {2,}\n|$)/};function h(e,t){if(this.options=t||d.defaults,this.links=e,this.rules=n.normal,this.renderer=this.options.renderer||new r,this.renderer.options=this.options,!this.links)throw new Error("Tokens array requires a `links` property.");this.options.pedantic?this.rules=n.pedantic:this.options.gfm&&(this.options.breaks?this.rules=n.breaks:this.rules=n.gfm);}function r(e){this.options=e||d.defaults;}function s(){}function p(e){this.tokens=[],this.token=null,this.options=e||d.defaults,this.options.renderer=this.options.renderer||new r,this.renderer=this.options.renderer,this.renderer.options=this.options;}function c(e,t){if(t){if(c.escapeTest.test(e))return e.replace(c.escapeReplace,function(e){return c.replacements[e]})}else if(c.escapeTestNoEncode.test(e))return e.replace(c.escapeReplaceNoEncode,function(e){return c.replacements[e]});return e}function u(e){return e.replace(/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi,function(e,t){return "colon"===(t=t.toLowerCase())?":":"#"===t.charAt(0)?"x"===t.charAt(1)?String.fromCharCode(parseInt(t.substring(2),16)):String.fromCharCode(+t.substring(1)):""})}function t(n,e){return n=n.source||n,e=e||"",{replace:function(e,t){return t=(t=t.source||t).replace(/(^|[^\[])\^/g,"$1"),n=n.replace(e,t),this},getRegex:function(){return new RegExp(n,e)}}}function i(e,t){return l[" "+e]||(/^[^:]+:\/*[^/]*$/.test(e)?l[" "+e]=e+"/":l[" "+e]=y(e,"/",!0)),e=l[" "+e],"//"===t.slice(0,2)?e.replace(/:[\s\S]*/,":")+t:"/"===t.charAt(0)?e.replace(/(:\/*[^/]*)[\s\S]*/,"$1")+t:e+t}n._escapes=/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g,n._scheme=/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/,n._email=/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/,n.autolink=t(n.autolink).replace("scheme",n._scheme).replace("email",n._email).getRegex(),n._attribute=/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/,n.tag=t(n.tag).replace("comment",k._comment).replace("attribute",n._attribute).getRegex(),n._label=/(?:\[[^\[\]]*\]|\\[\[\]]?|`[^`]*`|[^\[\]\\])*?/,n._href=/\s*(<(?:\\[<>]?|[^\s<>\\])*>|(?:\\[()]?|\([^\s\x00-\x1f\\]*\)|[^\s\x00-\x1f()\\])*?)/,n._title=/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/,n.link=t(n.link).replace("label",n._label).replace("href",n._href).replace("title",n._title).getRegex(),n.reflink=t(n.reflink).replace("label",n._label).getRegex(),n.normal=f({},n),n.pedantic=f({},n.normal,{strong:/^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,em:/^_(?=\S)([\s\S]*?\S)_(?!_)|^\*(?=\S)([\s\S]*?\S)\*(?!\*)/,link:t(/^!?\[(label)\]\((.*?)\)/).replace("label",n._label).getRegex(),reflink:t(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",n._label).getRegex()}),n.gfm=f({},n.normal,{escape:t(n.escape).replace("])","~|])").getRegex(),_extended_email:/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/,url:/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,_backpedal:/(?:[^?!.,:;*_~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_~)]+(?!$))+/,del:/^~+(?=\S)([\s\S]*?\S)~+/,text:t(n.text).replace("]|","~]|").replace("|$","|https?://|ftp://|www\\.|[a-zA-Z0-9.!#$%&'*+/=?^_`{\\|}~-]+@|$").getRegex()}),n.gfm.url=t(n.gfm.url).replace("email",n.gfm._extended_email).getRegex(),n.breaks=f({},n.gfm,{br:t(n.br).replace("{2,}","*").getRegex(),text:t(n.gfm.text).replace("{2,}","*").getRegex()}),h.rules=n,h.output=function(e,t,n){return new h(t,n).output(e)},h.prototype.output=function(e){for(var t,n,r,s,i,l,o="";e;)if(i=this.rules.escape.exec(e))e=e.substring(i[0].length),o+=i[1];else if(i=this.rules.autolink.exec(e))e=e.substring(i[0].length),r="@"===i[2]?"mailto:"+(n=c(this.mangle(i[1]))):n=c(i[1]),o+=this.renderer.link(r,null,n);else if(this.inLink||!(i=this.rules.url.exec(e))){if(i=this.rules.tag.exec(e))!this.inLink&&/^<a /i.test(i[0])?this.inLink=!0:this.inLink&&/^<\/a>/i.test(i[0])&&(this.inLink=!1),!this.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(i[0])?this.inRawBlock=!0:this.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(i[0])&&(this.inRawBlock=!1),e=e.substring(i[0].length),o+=this.options.sanitize?this.options.sanitizer?this.options.sanitizer(i[0]):c(i[0]):i[0];else if(i=this.rules.link.exec(e))e=e.substring(i[0].length),this.inLink=!0,r=i[2],this.options.pedantic?(t=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(r))?(r=t[1],s=t[3]):s="":s=i[3]?i[3].slice(1,-1):"",r=r.trim().replace(/^<([\s\S]*)>$/,"$1"),o+=this.outputLink(i,{href:h.escapes(r),title:h.escapes(s)}),this.inLink=!1;else if((i=this.rules.reflink.exec(e))||(i=this.rules.nolink.exec(e))){if(e=e.substring(i[0].length),t=(i[2]||i[1]).replace(/\s+/g," "),!(t=this.links[t.toLowerCase()])||!t.href){o+=i[0].charAt(0),e=i[0].substring(1)+e;continue}this.inLink=!0,o+=this.outputLink(i,t),this.inLink=!1;}else if(i=this.rules.strong.exec(e))e=e.substring(i[0].length),o+=this.renderer.strong(this.output(i[4]||i[3]||i[2]||i[1]));else if(i=this.rules.em.exec(e))e=e.substring(i[0].length),o+=this.renderer.em(this.output(i[6]||i[5]||i[4]||i[3]||i[2]||i[1]));else if(i=this.rules.code.exec(e))e=e.substring(i[0].length),o+=this.renderer.codespan(c(i[2].trim(),!0));else if(i=this.rules.br.exec(e))e=e.substring(i[0].length),o+=this.renderer.br();else if(i=this.rules.del.exec(e))e=e.substring(i[0].length),o+=this.renderer.del(this.output(i[1]));else if(i=this.rules.text.exec(e))e=e.substring(i[0].length),this.inRawBlock?o+=this.renderer.text(i[0]):o+=this.renderer.text(c(this.smartypants(i[0])));else if(e)throw new Error("Infinite loop on byte: "+e.charCodeAt(0))}else{if("@"===i[2])r="mailto:"+(n=c(i[0]));else{for(;l=i[0],i[0]=this.rules._backpedal.exec(i[0])[0],l!==i[0];);n=c(i[0]),r="www."===i[1]?"http://"+n:n;}e=e.substring(i[0].length),o+=this.renderer.link(r,null,n);}return o},h.escapes=function(e){return e?e.replace(h.rules._escapes,"$1"):e},h.prototype.outputLink=function(e,t){var n=t.href,r=t.title?c(t.title):null;return "!"!==e[0].charAt(0)?this.renderer.link(n,r,this.output(e[1])):this.renderer.image(n,r,c(e[1]))},h.prototype.smartypants=function(e){return this.options.smartypants?e.replace(/---/g,"—").replace(/--/g,"–").replace(/(^|[-\u2014/(\[{"\s])'/g,"$1‘").replace(/'/g,"’").replace(/(^|[-\u2014/(\[{\u2018\s])"/g,"$1“").replace(/"/g,"”").replace(/\.{3}/g,"…"):e},h.prototype.mangle=function(e){if(!this.options.mangle)return e;for(var t,n="",r=e.length,s=0;s<r;s++)t=e.charCodeAt(s),.5<Math.random()&&(t="x"+t.toString(16)),n+="&#"+t+";";return n},r.prototype.code=function(e,t,n){if(this.options.highlight){var r=this.options.highlight(e,t);null!=r&&r!==e&&(n=!0,e=r);}return t?'<pre><code class="'+this.options.langPrefix+c(t,!0)+'">'+(n?e:c(e,!0))+"</code></pre>\n":"<pre><code>"+(n?e:c(e,!0))+"</code></pre>"},r.prototype.blockquote=function(e){return "<blockquote>\n"+e+"</blockquote>\n"},r.prototype.html=function(e){return e},r.prototype.heading=function(e,t,n){return this.options.headerIds?"<h"+t+' id="'+this.options.headerPrefix+n.toLowerCase().replace(/[^\w]+/g,"-")+'">'+e+"</h"+t+">\n":"<h"+t+">"+e+"</h"+t+">\n"},r.prototype.hr=function(){return this.options.xhtml?"<hr/>\n":"<hr>\n"},r.prototype.list=function(e,t,n){var r=t?"ol":"ul";return "<"+r+(t&&1!==n?' start="'+n+'"':"")+">\n"+e+"</"+r+">\n"},r.prototype.listitem=function(e){return "<li>"+e+"</li>\n"},r.prototype.checkbox=function(e){return "<input "+(e?'checked="" ':"")+'disabled="" type="checkbox"'+(this.options.xhtml?" /":"")+"> "},r.prototype.paragraph=function(e){return "<p>"+e+"</p>\n"},r.prototype.table=function(e,t){return t&&(t="<tbody>"+t+"</tbody>"),"<table>\n<thead>\n"+e+"</thead>\n"+t+"</table>\n"},r.prototype.tablerow=function(e){return "<tr>\n"+e+"</tr>\n"},r.prototype.tablecell=function(e,t){var n=t.header?"th":"td";return (t.align?"<"+n+' align="'+t.align+'">':"<"+n+">")+e+"</"+n+">\n"},r.prototype.strong=function(e){return "<strong>"+e+"</strong>"},r.prototype.em=function(e){return "<em>"+e+"</em>"},r.prototype.codespan=function(e){return "<code>"+e+"</code>"},r.prototype.br=function(){return this.options.xhtml?"<br/>":"<br>"},r.prototype.del=function(e){return "<del>"+e+"</del>"},r.prototype.link=function(e,t,n){if(this.options.sanitize){try{var r=decodeURIComponent(u(e)).replace(/[^\w:]/g,"").toLowerCase();}catch(e){return n}if(0===r.indexOf("javascript:")||0===r.indexOf("vbscript:")||0===r.indexOf("data:"))return n}this.options.baseUrl&&!o.test(e)&&(e=i(this.options.baseUrl,e));try{e=encodeURI(e).replace(/%25/g,"%");}catch(e){return n}var s='<a href="'+c(e)+'"';return t&&(s+=' title="'+t+'"'),s+=">"+n+"</a>"},r.prototype.image=function(e,t,n){this.options.baseUrl&&!o.test(e)&&(e=i(this.options.baseUrl,e));var r='<img src="'+e+'" alt="'+n+'"';return t&&(r+=' title="'+t+'"'),r+=this.options.xhtml?"/>":">"},r.prototype.text=function(e){return e},s.prototype.strong=s.prototype.em=s.prototype.codespan=s.prototype.del=s.prototype.text=function(e){return e},s.prototype.link=s.prototype.image=function(e,t,n){return ""+n},s.prototype.br=function(){return ""},p.parse=function(e,t){return new p(t).parse(e)},p.prototype.parse=function(e){this.inline=new h(e.links,this.options),this.inlineText=new h(e.links,f({},this.options,{renderer:new s})),this.tokens=e.reverse();for(var t="";this.next();)t+=this.tok();return t},p.prototype.next=function(){return this.token=this.tokens.pop()},p.prototype.peek=function(){return this.tokens[this.tokens.length-1]||0},p.prototype.parseText=function(){for(var e=this.token.text;"text"===this.peek().type;)e+="\n"+this.next().text;return this.inline.output(e)},p.prototype.tok=function(){switch(this.token.type){case"space":return "";case"hr":return this.renderer.hr();case"heading":return this.renderer.heading(this.inline.output(this.token.text),this.token.depth,u(this.inlineText.output(this.token.text)));case"code":return this.renderer.code(this.token.text,this.token.lang,this.token.escaped);case"table":var e,t,n,r,s="",i="";for(n="",e=0;e<this.token.header.length;e++)n+=this.renderer.tablecell(this.inline.output(this.token.header[e]),{header:!0,align:this.token.align[e]});for(s+=this.renderer.tablerow(n),e=0;e<this.token.cells.length;e++){for(t=this.token.cells[e],n="",r=0;r<t.length;r++)n+=this.renderer.tablecell(this.inline.output(t[r]),{header:!1,align:this.token.align[r]});i+=this.renderer.tablerow(n);}return this.renderer.table(s,i);case"blockquote_start":for(i="";"blockquote_end"!==this.next().type;)i+=this.tok();return this.renderer.blockquote(i);case"list_start":i="";for(var l=this.token.ordered,o=this.token.start;"list_end"!==this.next().type;)i+=this.tok();return this.renderer.list(i,l,o);case"list_item_start":i="";var a=this.token.loose;for(this.token.task&&(i+=this.renderer.checkbox(this.token.checked));"list_item_end"!==this.next().type;)i+=a||"text"!==this.token.type?this.tok():this.parseText();return this.renderer.listitem(i);case"html":return this.renderer.html(this.token.text);case"paragraph":return this.renderer.paragraph(this.inline.output(this.token.text));case"text":return this.renderer.paragraph(this.parseText())}},c.escapeTest=/[&<>"']/,c.escapeReplace=/[&<>"']/g,c.replacements={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},c.escapeTestNoEncode=/[<>"']|&(?!#?\w+;)/,c.escapeReplaceNoEncode=/[<>"']|&(?!#?\w+;)/g;var l={},o=/^$|^[a-z][a-z0-9+.-]*:|^[?#]/i;function g(){}function f(e){for(var t,n,r=1;r<arguments.length;r++)for(n in t=arguments[r])Object.prototype.hasOwnProperty.call(t,n)&&(e[n]=t[n]);return e}function x(e,t){var n=e.replace(/\|/g,function(e,t,n){for(var r=!1,s=t;0<=--s&&"\\"===n[s];)r=!r;return r?"|":" |"}).split(/ \|/),r=0;if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;r<n.length;r++)n[r]=n[r].trim().replace(/\\\|/g,"|");return n}function y(e,t,n){if(0===e.length)return "";for(var r=0;r<e.length;){var s=e.charAt(e.length-r-1);if(s!==t||n){if(s===t||!n)break;r++;}else r++;}return e.substr(0,e.length-r)}function d(e,n,r){if(null==e)throw new Error("marked(): input parameter is undefined or null");if("string"!=typeof e)throw new Error("marked(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected");if(r||"function"==typeof n){r||(r=n,n=null);var s,i,l=(n=f({},d.defaults,n||{})).highlight,t=0;try{s=a.lex(e,n);}catch(e){return r(e)}i=s.length;var o=function(t){if(t)return n.highlight=l,r(t);var e;try{e=p.parse(s,n);}catch(e){t=e;}return n.highlight=l,t?r(t):r(null,e)};if(!l||l.length<3)return o();if(delete n.highlight,!i)return o();for(;t<s.length;t++)!function(n){"code"!==n.type?--i||o():l(n.text,n.lang,function(e,t){return e?o(e):null==t||t===n.text?--i||o():(n.text=t,n.escaped=!0,void(--i||o()))});}(s[t]);}else try{return n&&(n=f({},d.defaults,n)),p.parse(a.lex(e,n),n)}catch(e){if(e.message+="\nPlease report this to https://github.com/markedjs/marked.",(n||d.defaults).silent)return "<p>An error occurred:</p><pre>"+c(e.message+"",!0)+"</pre>";throw e}}g.exec=g,d.options=d.setOptions=function(e){return f(d.defaults,e),d},d.getDefaults=function(){return {baseUrl:null,breaks:!1,gfm:!0,headerIds:!0,headerPrefix:"",highlight:null,langPrefix:"language-",mangle:!0,pedantic:!1,renderer:new r,sanitize:!1,sanitizer:null,silent:!1,smartLists:!1,smartypants:!1,tables:!0,xhtml:!1}},d.defaults=d.getDefaults(),d.Parser=p,d.parser=p.parse,d.Renderer=r,d.TextRenderer=s,d.Lexer=a,d.lexer=a.lex,d.InlineLexer=h,d.inlineLexer=h.output,d.parse=d,"undefined"!=typeof module&&"object"==typeof exports?module.exports=d:"function"==typeof define&&define.amd?define(function(){return d}):e.marked=d;}(undefined||("undefined"!=typeof window?window:global));

if (window.marked) window.marked.setOptions({sanitize: false});

class IoMdView extends IoElement {
  static get style() {
    return html`<style>:host {font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;letter-spacing: 0.04em;font-weight: 300;display: block;padding: 0.5em 1em;background: #fff;box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.3),0 15px 20px 0 rgba(0, 0, 0, 0.1);border-radius: var(--io-theme-border-radius);overflow: hidden;}:host p {line-height: 1.5em;}:host a {font-weight: bold;text-decoration: none;color: var(--io-theme-link-color);}:host code {background: rgba(0,0,0,0.05);overflow: auto;font-weight: bold;}:host code.language-html,:host code.language-javascript {padding: 1em;display: block;}:host blockquote {border: 1px solid rgba(0,0,0,0.25);margin: 0.5em 1em;padding: 0.5em 1em;}:host table{width: 100%;border: 1px solid black;border-collapse: collapse;}:host table td,:host table tr,:host table th {border: 1px solid gray;text-align: left;padding: 0.25em;}:host .videocontainer {width: 100%;height: 0;position: relative;padding-bottom: 56.25%;}:host .videocontainer > iframe {position: absolute;top: 0;left: 0;width: 100%;height: 100%;}</style>`;
  }
  static get properties() {
    return {
      path: {
        type: String,
        reflect: true
      },
      vars: Object,
      role: 'document',
    };
  }
  pathChanged() {
    const scope = this;
    fetch(this.path)
    .then(function(response) {
      return response.text();
    })
    .then(function(text) {
      if (window.marked) scope.innerHTML = window.marked(text);
    });
  }
}

IoMdView.Register();

let previousOption;
let previousParent;
let timeoutOpen;
let timeoutReset;
let WAIT_TIME = 1200;
// let lastFocus;

// TODO: implement search

class IoMenuLayer extends IoElement {
  static get style() {
    return html`<style>:host {display: block;visibility: hidden;position: fixed;top: 0;left: 0;bottom: 0;right: 0;z-index: 100000;background: rgba(0, 0, 0, 0.2);user-select: none;overflow: hidden;pointer-events: none;touch-action: none;}:host[expanded] {visibility: visible;pointer-events: all;}:host io-menu-options:not([expanded]) {display: none;}:host io-menu-options {position: absolute;transform: translateZ(0);top: 0;left: 0;min-width: 6em;}</style>`;
  }
  static get properties() {
    return {
      expanded: {
        type: Boolean,
        reflect: true,
      },
      $options: Array
    };
  }
  static get listeners() {
    return {
      'pointerup': 'onPointerup',
      'pointermove': 'onPointermove',
      'dragstart': 'preventDefault',
      'contextmenu': 'preventDefault',
    };
  }
  constructor(props) {
    super(props);
    this._hoveredItem = null;
    this._hoveredGroup = null;
    this._x = 0;
    this._y = 0;
    this._v = 0;
    window.addEventListener('scroll', this.onScroll);
    // window.addEventListener('focusin', this.onWindowFocus);
  }
  registerGroup(group) {
    this.$options.push(group);
    group.addEventListener('focusin', this.onMenuItemFocused);
    group.addEventListener('keydown', this.onKeydown);
    group.addEventListener('expanded-changed', this.onGroupExpandedChanged);
  }
  unregisterGroup(group) {
    this.$options.splice(this.$options.indexOf(group), 1);
    group.removeEventListener('focusin', this.onMenuItemFocused);
    group.removeEventListener('keydown', this.onKeydown);
    group.removeEventListener('expanded-changed', this.onGroupExpandedChanged);
  }
  collapseAllGroups() {
    for (let i = this.$options.length; i--;) {
      this.$options[i].expanded = false;
    }
  }
  runAction(option) {
    if (typeof option.action === 'function') {
      option.action.apply(null, [option.value]);
      this.collapseAllGroups();
      // if (lastFocus) {
      //   lastFocus.focus();
      // }
    } else if (option.button) {
      option.button.click(); // TODO: test
      this.collapseAllGroups();
      // if (lastFocus) {
      //   lastFocus.focus();
      // }
    }
  }
  onScroll() {
    if (this.expanded) {
      this.collapseAllGroups();
      // if (lastFocus) {
      //   lastFocus.focus();
      // }
    }
  }
  // onWindowFocus(event) {
  //   if (event.target.localName !== 'io-menu-item') lastFocus = event.target;
  // }
  onMenuItemFocused(event) {
    const path = event.composedPath();
    const item = path[0];
    const optionschain = item.optionschain;
    for (let i = this.$options.length; i--;) {
      if (optionschain.indexOf(this.$options[i]) === -1) {
        this.$options[i].expanded = false;
      }
    }
  }
  onPointermove(event) {
    event.preventDefault();
    this._x = event.clientX;
    this._y = event.clientY;
    this._v = (2 * this._v + Math.abs(event.movementY) - Math.abs(event.movementX)) / 3;
    let groups = this.$options;
    for (let i = groups.length; i--;) {
      if (groups[i].expanded) {
        let rect = groups[i].getBoundingClientRect();
        if (rect.top < this._y && rect.bottom > this._y && rect.left < this._x && rect.right > this._x) {
          this._hover(groups[i]);
          this._hoveredGroup = groups[i];
          return groups[i];
        }
      }
    }
    this._hoveredItem = null;
    this._hoveredGroup = null;
  }
  onPointerup(event) {
    event.stopPropagation();
    event.preventDefault();
    const path = event.composedPath();
    let elem = path[0];
    if (elem.localName === 'io-menu-item') {
      this.runAction(elem.option);
      elem.menuroot.dispatchEvent('io-menu-item-clicked', elem.option);
    } else if (elem === this) {
      if (this._hoveredItem) {
        this.runAction(this._hoveredItem.option);
        this._hoveredItem.menuroot.dispatchEvent('io-menu-item-clicked', this._hoveredItem.option);
      } else if (!this._hoveredGroup) {
        this.collapseAllGroups();
        // if (lastFocus) {
        //   lastFocus.focus();
        // }
      }
    }
  }
  onKeydown(event) {
    event.preventDefault();
    const path = event.composedPath();
    if (path[0].localName !== 'io-menu-item') return;

    let elem = path[0];
    let group = elem.$parent;
    let siblings = [...group.querySelectorAll('io-menu-item')] || [];
    let children = elem.$options ? [...elem.$options.querySelectorAll('io-menu-item')]  : [];
    let index = siblings.indexOf(elem);

    let command = '';

    if (!group.horizontal) {
      if (event.key == 'ArrowUp') command = 'prev';
      if (event.key == 'ArrowRight') command = 'in';
      if (event.key == 'ArrowDown') command = 'next';
      if (event.key == 'ArrowLeft') command = 'out';
    } else {
      if (event.key == 'ArrowUp') command = 'out';
      if (event.key == 'ArrowRight') command = 'next';
      if (event.key == 'ArrowDown') command = 'in';
      if (event.key == 'ArrowLeft') command = 'prev';
    }
    if (event.key == 'Tab') command = 'next';
    if (event.key == 'Escape') command = 'exit';
    if (event.key == 'Enter' || event.which == 32) command = 'action';

    switch (command) {
      case 'action':
        this.onPointerup(event); // TODO: test
        break;
      case 'prev':
        siblings[(index + siblings.length - 1) % (siblings.length)].focus();
        break;
      case 'next':
        siblings[(index + 1) % (siblings.length)].focus();
        break;
      case 'in':
        if (children.length) children[0].focus();
        break;
      case 'out':
        if (group && group.$parent) group.$parent.focus();
        break;
      case 'exit':
        this.collapseAllGroups();
        break;
      default:
        break;
    }
  }
  _hover(group) {
    let items = group.querySelectorAll('io-menu-item');
    for (let i = items.length; i--;) {
      let rect = items[i].getBoundingClientRect();
      if (rect.top < this._y && rect.bottom > this._y && rect.left < this._x && rect.right > this._x) {
        let force = group.horizontal;
        this._focus(items[i], force);
        this._hoveredItem = items[i];
        return items[i];
      }
    }
    this._hoveredItem = null;
    this._hoveredItem = null;
  }
  _focus(item, force) {
    if (item !== previousOption) {
      clearTimeout(timeoutOpen);
      clearTimeout(timeoutReset);
      if (this._v > 1 || item.parentNode !== previousParent || force) {
        previousOption = item;
        item.focus();
      } else {
        timeoutOpen = setTimeout(function() {
          previousOption = item;
          item.focus();
        }.bind(this), WAIT_TIME);
      }
      previousParent = item.parentNode;
      timeoutReset = setTimeout(function() {
        previousOption = null;
        previousParent = null;
      }.bind(this), WAIT_TIME + 1);
    }
  }
  onGroupExpandedChanged(event) {
    const path = event.composedPath();
    if (path[0].expanded) this._setGroupPosition(path[0]);
    for (let i = this.$options.length; i--;) {
      if (this.$options[i].expanded) {
        this.expanded = true;
        return;
      }
    }
    setTimeout(() => { this.expanded = false; });
  }
  _setGroupPosition(group) {
    if (!group.$parent) return;
    let rect = group.getBoundingClientRect();
    let pRect = group.$parent.getBoundingClientRect();
     // TODO: unhack horizontal long submenu bug.
    if (group.position === 'bottom' && rect.height > (window.innerHeight - this._y)) group.position = 'right';
    //
    switch (group.position) {
      case 'pointer':
        group._x = this._x - 2 || pRect.x;
        group._y = this._y - 2 || pRect.y;
        break;
      case 'bottom':
        group._x = pRect.x;
        group._y = pRect.bottom;
        break;
      case 'right':
      default:
        group._x = pRect.right;
        group._y = pRect.y;
        if (group._x + rect.width > window.innerWidth) {
          group._x = pRect.x - rect.width;
        }
        break;
    }
    group._x = Math.max(0, Math.min(group._x, window.innerWidth - rect.width));
    group._y = Math.min(group._y, window.innerHeight - rect.height);
    group.style.left = group._x + 'px';
    group.style.top = group._y + 'px';
  }
  expandedChanged() {
    if (!this.expanded) return;
    let group = this._hoveredGroup;
    if (group) {
      let rect = group.getBoundingClientRect();
      if (rect.height > window.innerHeight) {
        if (this._y < 100 && rect.top < 0) {
          let scrollSpeed = (100 - this._y) / 5000;
          let overflow = rect.top;
          group._y = group._y - Math.ceil(overflow * scrollSpeed) + 1;
        } else if (this._y > window.innerHeight - 100 && rect.bottom > window.innerHeight) {
          let scrollSpeed = (100 - (window.innerHeight - this._y)) / 5000;
          let overflow = (rect.bottom - window.innerHeight);
          group._y = group._y - Math.ceil(overflow * scrollSpeed) - 1;
        }
        group.style.left = group._x + 'px';
        group.style.top = group._y + 'px';
      }
    }
    requestAnimationFrame(this.expandedChanged);
  }
}

IoMenuLayer.Register();

IoMenuLayer.singleton = new IoMenuLayer();

document.body.appendChild(IoMenuLayer.singleton);

class IoMenuOptions extends IoElement {
  static get style() {
    return html`<style>:host {display: flex;flex-direction: column;white-space: nowrap;user-select: none;touch-action: none;background: white;color: black;padding: var(--io-theme-padding);border: var(--io-theme-menu-border);border-radius: var(--io-theme-border-radius);box-shadow: var(--io-theme-menu-shadow);}:host[horizontal] {flex-direction: row;}:host[horizontal] > io-menu-item {margin-left: 0.5em;margin-right: 0.5em;}:host[horizontal] > io-menu-item > :not(.menu-label) {display: none;}</style>`;
  }
  static get properties() {
    return {
      options: Array,
      expanded: {
        type: Boolean,
        reflect: true
      },
      position: 'right',
      horizontal: {
        type: Boolean,
        reflect: true
      },
      $parent: HTMLElement
    };
  }
  static get listeners() {
    return {
      'focusin': '_onFocus',
    };
  }
  optionsChanged() {
    const itemPosition = this.horizontal ? 'bottom' : 'right';
    this.template([this.options.map((elem, i) =>
      ['io-menu-item', {
        $parent: this,
        option: typeof this.options[i] === 'object' ? this.options[i] : {value: this.options[i], label: this.options[i]},
        position: itemPosition
      }]
    )]);
  }
  connectedCallback() {
    super.connectedCallback();
    IoMenuLayer.singleton.registerGroup(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    IoMenuLayer.singleton.unregisterGroup(this);
  }
  _onFocus(event) {
    const path = event.composedPath();
    const item = path[0];
    IoMenuLayer.singleton._hoveredGroup = this;
    if (item.localName === 'io-menu-item') {
      IoMenuLayer.singleton._hoveredItem = item;
      if (item.option.options) this.expanded = true;
    }
  }
}

IoMenuOptions.Register();

class IoMenuItem extends IoElement {
  static get style() {
    return html`<style>:host {display: flex;flex-direction: row;cursor: pointer;padding: var(--io-theme-padding);line-height: 1em;touch-action: none;}:host > * {pointer-events: none;padding: var(--io-theme-spacing);}:host > .menu-icon {width: 1.25em;line-height: 1em;}:host > .menu-label {flex: 1;}:host > .menu-hint {opacity: 0.5;padding: 0 0.5em;}:host > .menu-more {opacity: 0.25;}/* @media (-webkit-min-device-pixel-ratio: 2) {:host > * {padding: calc(2 * var(--io-theme-spacing));}} */</style>`;
  }
  static get properties() {
    return {
      option: Object,
      position: String,
      $parent: HTMLElement,
      tabindex: 1
    };
  }
  static get listeners() {
    return {
      'focus': 'onFocus',
      'pointerdown': 'onPointerdown',
    };
  }
  get menuroot() {
    let parent = this;
    while (parent && parent.$parent) {
      parent = parent.$parent;
    }
    return parent;
  }
  get optionschain() {
    const chain = [];
    if (this.$options) chain.push(this.$options);
    let parent = this.$parent;
    while (parent) {
      if (parent.localName == 'io-menu-options') chain.push(parent);
      parent = parent.$parent;
    }
    return chain;
  }
  changed() {
    if (this.option.options) {
      let grpProps = {options: this.option.options, $parent: this, position: this.position};
      if (!this.$options) {
        this.$options = new IoMenuOptions(grpProps);
      } else {
        this.$options.setProperties(grpProps); // TODO: test
      }
    }
    this.template([
      this.option.icon ? ['span', {className: 'menu-icon'}, this.option.icon] : null,
      ['span', {className: 'menu-label'}, this.option.label || this.option.value],
      this.option.hint ? ['span', {className: 'menu-hint'}] : null,
      this.option.options ? ['span', {className: 'menu-more'}, '▸'] : null,
    ]);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.$options) {
      if (this.$options.parentNode) {
        IoMenuLayer.singleton.removeChild(this.$options);
      }
    }
  }
  onPointerdown(event) {
    IoMenuLayer.singleton.setPointerCapture(event.pointerId);
    this.focus();
  }
  onFocus() {
    if (this.$options) {
      if (!this.$options.parentNode) {
        IoMenuLayer.singleton.appendChild(this.$options);
      }
      this.$options.expanded = true;
    }
  }
}

IoMenuItem.Register();

// TODO: implement working mousestart/touchstart UX
// TODO: implement keyboard modifiers maybe. Touch alternative?
class IoMenu extends IoElement {
  static get properties() {
    return {
      options: Array,
      expanded: Boolean,
      position: 'pointer',
      ondown: true,
      button: 0,
    };
  }
  constructor(props) {
    super(props);
    this.template([
      ['io-menu-options', {
        id: 'group',
        $parent: this,
        options: this.bind('options'),
        position: this.bind('position'),
        expanded: this.bind('expanded')
      }]
    ]);
    this.$.group.__parent = this;
  }
  connectedCallback() {
    super.connectedCallback();
    this._parent = this.parentElement;
    this._parent.addEventListener('pointerdown', this.onPointerdown);
    this._parent.addEventListener('contextmenu', this.onContextmenu);
    this._parent.style['touch-action'] = 'none';
    IoMenuLayer.singleton.appendChild(this.$['group']);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._parent.removeEventListener('pointerdown', this.onPointerdown);
    this._parent.removeEventListener('contextmenu', this.onContextmenu);
    if (this.$['group']) IoMenuLayer.singleton.removeChild(this.$['group']);
    // TODO: unhack
  }
  getBoundingClientRect() {
    return this._parent.getBoundingClientRect();
  }
  onContextmenu(event) {
    if (this.button === 2) {
      event.preventDefault();
      this.open(event);
    }
  }
  onPointerdown(event) {
    this._parent.setPointerCapture(event.pointerId);
    this._parent.addEventListener('pointerup', this.onPointerup);
    if (this.ondown && event.button === this.button) {
      this.open(event);
    }
  }
  onPointerup(event) {
    this._parent.removeEventListener('pointerup', this.onPointerup);
    if (!this.ondown && event.button === this.button) {
      this.open(event);
    }
  }
  open(event) {
    IoMenuLayer.singleton.collapseAllGroups();
    if (event.pointerId) IoMenuLayer.singleton.setPointerCapture(event.pointerId);
    IoMenuLayer.singleton._x = event.clientX;
    IoMenuLayer.singleton._y = event.clientY;
    this.expanded = true;
  }
}

IoMenu.Register();

const selection = window.getSelection();
const range = document.createRange();

class IoNumber extends IoElement {
  static get style() {
    return html`<style>:host {display: inline-block;overflow: hidden;text-overflow: ellipsis;white-space: nowrap;border: var(--io-theme-field-border);border-radius: var(--io-theme-border-radius);padding: var(--io-theme-padding);color: var(--io-theme-field-color);background: var(--io-theme-field-bg);}:host:focus {overflow: hidden;text-overflow: clip;outline: none;border: var(--io-theme-focus-border);background: var(--io-theme-focus-bg);}</style>`;
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

class IoObject extends IoCollapsable {
  static get properties() {
    return {
      value: Object,
      props: Array,
      config: null,
      labeled: true,
    };
  }
  changed() {
    const label = this.label || this.value.constructor.name;
    this.template([
      ['io-boolean', {true: label, false: label, value: this.bind('expanded')}],
      this.expanded ? [
        ['io-properties', {
          className: 'io-collapsable-content',
          value: this.value,
          props: this.props.length ? this.props : Object.keys(this.value),
          config: this.config,
          labeled: this.labeled,
        }]
      ] : null
    ]);
  }
}

IoObject.Register();

class IoOption extends IoButton {
  static get style() {
    return html`<style>:host {padding-left: calc(1.5 * var(--io-theme-padding));padding-right: calc(1.5 * var(--io-theme-padding));}</style>`;
  }
  static get properties() {
    return {
      options: Array,
      label: '',
    };
  }
  static get listeners() {
    return {
      'io-button-clicked': 'onClicked'
    };
  }
  onClicked() {
    this.$['menu'].expanded = true;
    let firstItem = this.$['menu'].$['group'].querySelector('io-menu-item');
    if (firstItem) firstItem.focus();
  }
  onMenu(event) {
    this.$['menu'].expanded = false;
    this.set('value', event.detail.value);
    if (this.action) this.action(this.value);
  }
  changed() {
    let label = this.value;
    if (label instanceof Object) label = label.__proto__.constructor.name;
    if (this.options) {
      for (let i = 0; i < this.options.length; i++) {
        if (this.options[i].value === this.value) {
          label = this.options[i].label || label;
          break;
        }
      }
    }
    this.template([
      ['span', this.label || '▾ ' + String(label)],
      ['io-menu', {
        id: 'menu',
        options: this.options,
        position: 'bottom',
        button: 0,
        ondown: false, // TODO: make open ondown and stay open with position:bottom
        'on-io-menu-item-clicked': this.onMenu}]
    ]);
  }
}

IoOption.Register();

class IoSlider extends IoElement {
  static get style() {
    return html`<style>
      :host {
        display: flex;
        flex-direction: row;
        min-width: 12em;
      }
      :host > io-number {
        flex: 0 0 3.75em;
      }
      :host > io-slider-knob {
        flex: 1 1 auto;
        margin-left: var(--io-theme-spacing);
        border-radius: 2px;
      }
    </style>`;
  }
  static get properties() {
    return {
      value: 0,
      step: 0.001,
      min: 0,
      max: 1,
      strict: true,
    };
  }
  _onValueSet(event) {
    this.dispatchEvent('value-set', event.detail, false);
    this.value = event.detail.value;
  }
  changed() {
    this.template([
      ['io-number', {value: this.value, step: this.step, min: this.min, max: this.max, strict: this.strict, id: 'number', 'on-value-set': this._onValueSet}],
      ['io-slider-knob', {value: this.value, step: this.step, minValue: this.min, maxValue: this.max, id: 'slider', 'on-value-set': this._onValueSet}]
    ]);
  }
}

IoSlider.Register();

class IoSliderKnob extends IoCanvas {
  static get style() {
    return html`<style>:host {display: flex;cursor: ew-resize;touch-action: none;}:host > canvas {pointer-events: none;touch-action: none;}</style>`;
  }
  static get properties() {
    return {
      value: 0,
      step: 0.01,
      minValue: 0,
      maxValue: 1000,
      startColor: [0.3, 0.9, 1, 1],
      endColor: [0.9, 1, 0.5, 1],
      lineColor: [0.3, 0.3, 0.3, 1],
      bg: [0.5, 0.5, 0.5, 1],
      snapWidth: 2,
      slotWidth: 2,
      handleWidth: 4,
    };
  }
  static get listeners() {
    return {
      'pointerdown': 'onPointerdown',
      'pointermove': 'onPointermove',
      'dragstart': 'preventDefault',
    };
  }
  onPointerdown(event) {
    this.setPointerCapture(event.pointerId);
  }
  onPointermove(event) {
    this.setPointerCapture(event.pointerId);
    if (event.buttons !== 0) {
      event.preventDefault();
      const rect = this.getBoundingClientRect();
      const x = (event.clientX - rect.x) / rect.width;
      const pos = Math.max(0,Math.min(1, x));
      let value = this.minValue + (this.maxValue - this.minValue) * pos;
      value = Math.round(value / this.step) * this.step;
      value = Math.min(this.maxValue, Math.max(this.minValue, (value)));
      this.set('value', value);
    }
  }
  // TODO: implement proper sdf shapes.
  static get frag() {
    return `
    varying vec2 vUv;
    void main(void) {

      vec4 finalColor = vec4(0.0, 0.0, 0.0, 0.0);

      float _range = maxValue - minValue;
      float _progress = (value - minValue) / _range;
      float _value = mix(minValue, maxValue, vUv.x);
      float _stepRange = size.x / (_range / step);

      if (_stepRange > snapWidth * 4.0) {
        float pxValue = _value * size.x / _range;
        float pxStep = step * size.x / _range;
        float snap0 = mod(pxValue, pxStep);
        float snap1 = pxStep - mod(pxValue, pxStep);
        float snap = min(snap0, snap1) * 2.0;
        snap -= snapWidth;
        snap = 1.0 - clamp(snap, 0.0, 1.0);
        finalColor = mix(finalColor, lineColor, snap);
      }

      float slot = (abs(0.5 - vUv.y) * 2.0) * size.y;
      slot = (1.0 - slot) + slotWidth;
      slot = clamp(slot, 0.0, 1.0);
      vec4 slotColor = mix(startColor, endColor, vUv.x);

      float progress = (vUv.x - _progress) * size.x;
      progress = clamp(progress, 0.0, 1.0);
      slotColor = mix(slotColor, lineColor, progress);

      float handle = abs(vUv.x - _progress) * size.x;
      handle = (1.0 - handle) + handleWidth;
      handle = clamp(handle, 0.0, 1.0);

      finalColor = mix(finalColor, slotColor, slot);
      finalColor = mix(finalColor, mix(startColor, endColor, _progress), handle);

      gl_FragColor = finalColor;
    }`;
  }
}

IoSliderKnob.Register();

const selection$1 = window.getSelection();
const range$1 = document.createRange();

class IoString extends IoElement {
  static get style() {
    return html`<style>:host {display: inline-block;overflow: hidden;text-overflow: ellipsis;white-space: nowrap;border: var(--io-theme-field-border);border-radius: var(--io-theme-border-radius);padding: var(--io-theme-padding);color: var(--io-theme-field-color);background: var(--io-theme-field-bg);}:host:focus {overflow: hidden;text-overflow: clip;outline: none;border: var(--io-theme-focus-border);background: var(--io-theme-focus-bg);}</style>`;
  }
  static get properties() {
    return {
      value: String,
      tabindex: 0,
      contenteditable: true
    };
  }
  static get listeners() {
    return {
      'focus': '_onFocus'
    };
  }
  _onFocus() {
    this.addEventListener('blur', this._onBlur);
    this.addEventListener('keydown', this._onKeydown);
    this._select();
  }
  _onBlur() {
    this.set('value', this.innerText);
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.removeEventListener('blur', this._onBlur);
    this.removeEventListener('keydown', this._onKeydown);
  }
  _onKeydown(event) {
    if (event.which == 13) {
      event.preventDefault();
      this.set('value', this.innerText);
    }
  }
  _select() {
    range$1.selectNodeContents(this);
    selection$1.removeAllRanges();
    selection$1.addRange(range$1);
  }
  valueChanged() {
    this.innerText = String(this.value).replace(new RegExp(' ', 'g'), '\u00A0');
  }
}

IoString.Register();

class IoTabbedElements extends IoElement {
  static get style() {
    return html`<style>
      :host {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        position: relative;
        overflow: auto;
      }
      :host > io-tabs {
        z-index: 2;
        flex: 0 0 auto;
        margin: 0 var(--io-theme-spacing);
        margin-bottom: calc(-1.1 * var(--io-theme-border-width));
      }
      :host[editable] > .new-tab-selector {
        position: absolute;
        top: 0;
        right: var(--io-theme-spacing);
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        z-index: 1;
        opacity: 0.4;
      }
      :host[editable] > io-tabs {
        margin-right: calc(2.2em + var(--io-theme-spacing)) !important;
      }
      :host > io-element-cache {
        flex: 1 1 auto;
        padding: var(--io-theme-padding);
        border: var(--io-theme-content-border);
        border-radius: var(--io-theme-border-radius);
        background: var(--io-theme-content-bg);
        overflow: auto;
      }
    </style>`;
  }
  static get properties() {
    return {
      elements: Array,
      filter: Array,
      selected: String,
      precache: false,
      cache: true,
      editable: {
        type: Boolean,
        reflect: true
      },
      role: {
        type: String,
        reflect: false
      }
    };
  }
  changed() {
    const _elements = this.elements.map(element => { return element[1].label; });
    const _filter = this.filter.length ? this.filter : _elements;

    // TODO: consider testing with large element collections and optimizing.
    const options = [];
    for (let i = 0; i < _elements.length; i++) {
      const added = this.filter.indexOf(_elements[i]) !== -1;
      options.push({
        icon: added ? '⌦' : '·',
        value: _elements[i],
        action: added ? this._onRemoveTab : this._onAddTab,
      });
    }

    this.template([
      this.editable ? ['io-option', {
        className: 'new-tab-selector',
        label: '🛠',
        options: options,
      }] : null,
      ['io-tabs', {
        id: 'tabs',
        selected: this.bind('selected'),
        tabs: _filter,
        role: 'navigation',
      }],
      ['io-element-cache', {
        elements: this.elements,
        selected: this.selected,
        cache: this.cache,
        precache: this.precache,
        role: this.role,
      }],
    ]);
  }
  _onAddTab(tabID) {
    if (this.filter.indexOf(tabID) !== -1) {
      this.filter.splice(this.filter.indexOf(tabID), 1);
    }
    this.filter.push(tabID);
    this.selected = tabID;
    this.$.tabs.resized();
    this.changed();
  }
  _onRemoveTab(tabID) {
    if (this.filter.indexOf(tabID) !== -1) {
      this.filter.splice(this.filter.indexOf(tabID), 1);
    }
    if (this.filter.indexOf(this.selected) == -1) {
      this.selected = this.filter[0];
    }
    this.$.tabs.resized();
    this.$.tabs.changed();
    this.changed();
  }
}

IoTabbedElements.Register();

class IoTabs extends IoElement {
  static get style() {
    return html`<style>:host {display: flex;flex-direction: row;flex-wrap: nowrap;font-style: italic;overflow: hidden;flex: 0 1 auto;}:host > * {flex: 0 0 auto;margin-right: var(--io-theme-spacing);border-bottom-left-radius: 0;border-bottom-right-radius: 0;background-image: linear-gradient(0deg, rgba(0, 0, 0, 0.125), transparent 0.75em);}:host > *.io-selected {border-bottom-color: var(--io-theme-content-bg);background-image: none;}:host[overflow] > :nth-child(n+3) {visibility: hidden;}:host > io-option {font-style: normal;}:host > io-button {letter-spacing: 0.145em;font-weight: 500;}:host > io-button:not(.io-selected) {color: rgba(0, 0, 0, 0.5);}:host > io-button.io-selected {background: var(--io-theme-content-bg);font-weight: 600;letter-spacing: 0.11em;}</style>`;
  }
  static get properties() {
    return {
      tabs: Array,
      selected: String,
      overflow: {
        type: Boolean,
        reflect: true,
      },
    };
  }
  select(id) {
    this.selected = id;
  }
  resized() {
    const rect = this.getBoundingClientRect();
    const lastButton = this.children[this.children.length-1];
    const rectButton = lastButton.getBoundingClientRect();
    this.overflow = rect.right < rectButton.right;
  }
  changed() {
    const buttons = [];
    let selectedButton;
    for (let i = 0; i < this.tabs.length; i++) {
      const selected = this.selected === this.tabs[i];
      const button = ['io-button', {
        label: this.tabs[i],
        value: this.tabs[i],
        action: this.select,
        className: selected ? 'io-selected' : ''
      }];
      if (selected) selectedButton = button;
      buttons.push(button);
    }
    const elements = [
      this.overflow ? [['io-option', {
        label: '☰',
        title: 'select tab menu',
        value: this.bind('selected'),
        options: this.tabs
      }],
      selectedButton] : null,
      ...buttons
    ];
    this.template(elements);
  }
}

IoTabs.Register();

class IoTheme extends IoElement {
  static get style() {
    return html`<style>body {--bg: #eee;--radius: 5px 5px 5px 5px;--spacing: 3px;--padding: 3px;--border-radius: 4px;--border-width: 1px;--border: var(--border-width) solid rgba(128, 128, 128, 0.25);--color: #000;--number-color: rgb(28, 0, 207);--string-color: rgb(196, 26, 22);--boolean-color: rgb(170, 13, 145);--link-color: #06a;--focus-border: 1px solid #09d;--focus-bg: #def;--active-bg: #ef8;--hover-bg: #fff;--frame-border: 1px solid #aaa;--frame-bg: #ccc;--content-border: 1px solid #aaa;--content-bg: #eee;--button-border: 1px solid #999;--button-bg: #bbb;--field-border: 1px solid #ccc;--field-color: #333;--field-bg: white;--menu-border: 1px solid #999;--menu-bg: #bbb;--menu-shadow: 2px 3px 5px rgba(0,0,0,0.2);}@media (-webkit-min-device-pixel-ratio: 2) {body {--radius: 7px 7px 7px 7px;--spacing: 4px;--padding: 4px;--border-radius: 4px;}}</style>`;
  }
}

IoTheme.Register();

/**
 * @author arodic / https://github.com/arodic
 */

/**
 * @author arodic / https://github.com/arodic
 */

export { IoNodeMixin, IoNode, IoElement, html, Binding, NodeBindings, IoServiceLoader, IoStorage, nodes as storageNodes, IoArray, IoBoolean, IoButton, IoCanvas, IoCollapsable, IoElementCache, IoInspector, IoLayout, IoMdView, IoMenuItem, IoMenuLayer, IoMenuOptions, IoMenu, IoNumber, IoObject, IoOption, IoProperties, IoSlider, IoString, IoTabbedElements, IoTheme };
