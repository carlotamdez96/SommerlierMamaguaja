function cloneProps(props) {
    const propKeys = Object.keys(props);
    return propKeys.reduce((memo, k) => {
      const prop = props[k];
      memo[k] = Object.assign({}, prop);
      if (isObject(prop.value) && !isFunction(prop.value) && !Array.isArray(prop.value)) memo[k].value = Object.assign({}, prop.value);
      if (Array.isArray(prop.value)) memo[k].value = prop.value.slice(0);
      return memo;
    }, {});
  }
  
  function normalizePropDefs(props) {
    if (!props) return {};
    const propKeys = Object.keys(props);
    return propKeys.reduce((memo, k) => {
      const v = props[k];
      memo[k] = !(isObject(v) && "value" in v) ? {
        value: v
      } : v;
      memo[k].attribute || (memo[k].attribute = toAttribute(k));
      memo[k].parse = "parse" in memo[k] ? memo[k].parse : typeof memo[k].value !== "string";
      return memo;
    }, {});
  }
  function propValues(props) {
    const propKeys = Object.keys(props);
    return propKeys.reduce((memo, k) => {
      memo[k] = props[k].value;
      return memo;
    }, {});
  }
  function initializeProps(element, propDefinition) {
    const props = cloneProps(propDefinition),
          propKeys = Object.keys(propDefinition);
    propKeys.forEach(key => {
      const prop = props[key],
            attr = element.getAttribute(prop.attribute),
            value = element[key];
      if (attr) prop.value = prop.parse ? parseAttributeValue(attr) : attr;
      if (value != null) prop.value = Array.isArray(value) ? value.slice(0) : value;
      prop.reflect && reflect(element, prop.attribute, prop.value);
      Object.defineProperty(element, key, {
        get() {
          return prop.value;
        },
  
        set(val) {
          const oldValue = prop.value;
          prop.value = val;
          prop.reflect && reflect(this, prop.attribute, prop.value);
  
          for (let i = 0, l = this.__propertyChangedCallbacks.length; i < l; i++) {
            this.__propertyChangedCallbacks[i](key, val, oldValue);
          }
        },
  
        enumerable: true,
        configurable: true
      });
    });
    return props;
  }
  function parseAttributeValue(value) {
    if (!value) return;
  
    try {
      return JSON.parse(value);
    } catch (err) {
      return value;
    }
  }
  function reflect(node, attribute, value) {
    if (value == null || value === false) return node.removeAttribute(attribute);
    let reflect = JSON.stringify(value);
    node.__updating[attribute] = true;
    if (reflect === "true") reflect = "";
    node.setAttribute(attribute, reflect);
    Promise.resolve().then(() => delete node.__updating[attribute]);
  }
  function toAttribute(propName) {
    return propName.replace(/\.?([A-Z]+)/g, (x, y) => "-" + y.toLowerCase()).replace("_", "-").replace(/^-/, "");
  }
  function isObject(obj) {
    return obj != null && (typeof obj === "object" || typeof obj === "function");
  }
  function isFunction(val) {
    return Object.prototype.toString.call(val) === "[object Function]";
  }
  function isConstructor(f) {
    return typeof f === "function" && f.toString().indexOf("class") === 0;
  }
  
  let currentElement;
  function createElementType(BaseElement, propDefinition) {
    const propKeys = Object.keys(propDefinition);
    return class CustomElement extends BaseElement {
      static get observedAttributes() {
        return propKeys.map(k => propDefinition[k].attribute);
      }
  
      constructor() {
        super();
        this.__initialized = false;
        this.__released = false;
        this.__releaseCallbacks = [];
        this.__propertyChangedCallbacks = [];
        this.__updating = {};
        this.props = {};
      }
  
      connectedCallback() {
        if (this.__initialized) return;
        this.__releaseCallbacks = [];
        this.__propertyChangedCallbacks = [];
        this.__updating = {};
        this.props = initializeProps(this, propDefinition);
        const props = propValues(this.props),
              ComponentType = this.Component,
              outerElement = currentElement;
  
        try {
          currentElement = this;
          this.__initialized = true;
          if (isConstructor(ComponentType)) new ComponentType(props, {
            element: this
          });else ComponentType(props, {
            element: this
          });
        } finally {
          currentElement = outerElement;
        }
      }
  
      async disconnectedCallback() {
        // prevent premature releasing when element is only temporarely removed from DOM
        await Promise.resolve();
        if (this.isConnected) return;
        this.__propertyChangedCallbacks.length = 0;
        let callback = null;
  
        while (callback = this.__releaseCallbacks.pop()) callback(this);
  
        delete this.__initialized;
        this.__released = true;
      }
  
      attributeChangedCallback(name, oldVal, newVal) {
        if (!this.__initialized) return;
        if (this.__updating[name]) return;
        name = this.lookupProp(name);
  
        if (name in propDefinition) {
          if (newVal == null && !this[name]) return;
          this[name] = propDefinition[name].parse ? parseAttributeValue(newVal) : newVal;
        }
      }
  
      lookupProp(attrName) {
        if (!propDefinition) return;
        return propKeys.find(k => attrName === k || attrName === propDefinition[k].attribute);
      }
  
      get renderRoot() {
        return this.shadowRoot || this.attachShadow({
          mode: "open"
        });
      }
  
      addReleaseCallback(fn) {
        this.__releaseCallbacks.push(fn);
      }
  
      addPropertyChangedCallback(fn) {
        this.__propertyChangedCallbacks.push(fn);
      }
  
    };
  }
  
  function register(tag, props = {}, options = {}) {
    const {
      BaseElement = HTMLElement,
      extension
    } = options;
    return ComponentType => {
      if (!tag) throw new Error("tag is required to register a Component");
      let ElementType = customElements.get(tag);
  
      if (ElementType) {
        // Consider disabling this in a production mode
        ElementType.prototype.Component = ComponentType;
        return ElementType;
      }
  
      ElementType = createElementType(BaseElement, normalizePropDefs(props));
      ElementType.prototype.Component = ComponentType;
      ElementType.prototype.registeredTag = tag;
      customElements.define(tag, ElementType, extension);
      return ElementType;
    };
  }
  
  const sharedConfig = {
    context: undefined,
    registry: undefined
  };
  
  const equalFn = (a, b) => a === b;
  const $PROXY = Symbol("solid-proxy");
  const $TRACK = Symbol("solid-track");
  const signalOptions = {
    equals: equalFn
  };
  let runEffects = runQueue;
  const STALE = 1;
  const PENDING = 2;
  const UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  let Transition = null;
  let Listener = null;
  let Updates = null;
  let Effects = null;
  let ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener,
      owner = Owner,
      unowned = fn.length === 0,
      root = unowned ? UNOWNED : {
        owned: null,
        cleanups: null,
        context: null,
        owner: detachedOwner === undefined ? owner : detachedOwner
      },
      updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = value => {
      if (typeof value === "function") {
        value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE);
    if (!options || !options.render) c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || undefined;
    updateComputation(c);
    return readSignal.bind(c);
  }
  function untrack(fn) {
    if (Listener === null) return fn();
    const listener = Listener;
    Listener = null;
    try {
      return fn();
    } finally {
      Listener = listener;
    }
  }
  function onMount(fn) {
    createEffect(() => untrack(fn));
  }
  function onCleanup(fn) {
    if (Owner === null) ;else if (Owner.cleanups === null) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
    return fn;
  }
  function getOwner() {
    return Owner;
  }
  function children(fn) {
    const children = createMemo(fn);
    const memo = createMemo(() => resolveChildren(children()));
    memo.toArray = () => {
      const c = memo();
      return Array.isArray(c) ? c : c != null ? [c] : [];
    };
    return memo;
  }
  function readSignal() {
    if (this.sources && (this.state)) {
      if ((this.state) === STALE) updateComputation(this);else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!Listener.sources) {
        Listener.sources = [this];
        Listener.sourceSlots = [sSlot];
      } else {
        Listener.sources.push(this);
        Listener.sourceSlots.push(sSlot);
      }
      if (!this.observers) {
        this.observers = [Listener];
        this.observerSlots = [Listener.sources.length - 1];
      } else {
        this.observers.push(Listener);
        this.observerSlots.push(Listener.sources.length - 1);
      }
    }
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) ;
            if (TransitionRunning ? !o.tState : !o.state) {
              if (o.pure) Updates.push(o);else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (!TransitionRunning) o.state = STALE;
          }
          if (Updates.length > 10e5) {
            Updates = [];
            if (false) ;
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const owner = Owner,
      listener = Listener,
      time = ExecCount;
    Listener = Owner = node;
    runComputation(node, node.value, time);
    Listener = listener;
    Owner = owner;
  }
  function runComputation(node, value, time) {
    let nextValue;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      node.updatedAt = time + 1;
      return handleError(err);
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue);
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init, pure, state = STALE, options) {
    const c = {
      fn,
      state: state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init,
      owner: Owner,
      context: null,
      pure
    };
    if (Owner === null) ;else if (Owner !== UNOWNED) {
      {
        if (!Owner.owned) Owner.owned = [c];else Owner.owned.push(c);
      }
    }
    return c;
  }
  function runTop(node) {
    if ((node.state) === 0) return;
    if ((node.state) === PENDING) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (node.state) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if ((node.state) === STALE) {
        updateComputation(node);
      } else if ((node.state) === PENDING) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates) return fn();
    let wait = false;
    if (!init) Updates = [];
    if (Effects) wait = true;else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait) Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function runUserEffects(queue) {
    let i,
      userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);else queue[userLength++] = e;
    }
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        const state = source.state;
        if (state === STALE) {
          if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
        } else if (state === PENDING) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (!o.state) {
        o.state = PENDING;
        if (o.pure) Updates.push(o);else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(),
          index = node.sourceSlots.pop(),
          obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(),
            s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.owned) {
      for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
      node.cleanups = null;
    }
    node.state = 0;
    node.context = null;
  }
  function castError(err) {
    if (err instanceof Error) return err;
    return new Error(typeof err === "string" ? err : "Unknown error", {
      cause: err
    });
  }
  function handleError(err, owner = Owner) {
    const error = castError(err);
    throw error;
  }
  function resolveChildren(children) {
    if (typeof children === "function" && !children.length) return resolveChildren(children());
    if (Array.isArray(children)) {
      const results = [];
      for (let i = 0; i < children.length; i++) {
        const result = resolveChildren(children[i]);
        Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
      }
      return results;
    }
    return children;
  }
  
  const FALLBACK = Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [],
      mapped = [],
      disposers = [],
      len = 0,
      indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [],
        i,
        j;
      newItems[$TRACK];
      return untrack(() => {
        let newLen = newItems.length,
          newIndices,
          newIndicesNext,
          temp,
          tempdisposers,
          tempIndexes,
          start,
          end,
          newEnd,
          item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot(disposer => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        }
        else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++);
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === undefined ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== undefined && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  function createComponent(Comp, props) {
    return untrack(() => Comp(props || {}));
  }
  function trueFn() {
    return true;
  }
  const propTraps = {
    get(_, property, receiver) {
      if (property === $PROXY) return receiver;
      return _.get(property);
    },
    has(_, property) {
      if (property === $PROXY) return true;
      return _.has(property);
    },
    set: trueFn,
    deleteProperty: trueFn,
    getOwnPropertyDescriptor(_, property) {
      return {
        configurable: true,
        enumerable: true,
        get() {
          return _.get(property);
        },
        set: trueFn,
        deleteProperty: trueFn
      };
    },
    ownKeys(_) {
      return _.keys();
    }
  };
  function resolveSource(s) {
    return !(s = typeof s === "function" ? s() : s) ? {} : s;
  }
  function resolveSources() {
    for (let i = 0, length = this.length; i < length; ++i) {
      const v = this[i]();
      if (v !== undefined) return v;
    }
  }
  function mergeProps(...sources) {
    let proxy = false;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      proxy = proxy || !!s && $PROXY in s;
      sources[i] = typeof s === "function" ? (proxy = true, createMemo(s)) : s;
    }
    if (proxy) {
      return new Proxy({
        get(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            const v = resolveSource(sources[i])[property];
            if (v !== undefined) return v;
          }
        },
        has(property) {
          for (let i = sources.length - 1; i >= 0; i--) {
            if (property in resolveSource(sources[i])) return true;
          }
          return false;
        },
        keys() {
          const keys = [];
          for (let i = 0; i < sources.length; i++) keys.push(...Object.keys(resolveSource(sources[i])));
          return [...new Set(keys)];
        }
      }, propTraps);
    }
    const target = {};
    const sourcesMap = {};
    const defined = new Set();
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i];
      if (!source) continue;
      const sourceKeys = Object.getOwnPropertyNames(source);
      for (let i = 0, length = sourceKeys.length; i < length; i++) {
        const key = sourceKeys[i];
        if (key === "__proto__" || key === "constructor") continue;
        const desc = Object.getOwnPropertyDescriptor(source, key);
        if (!defined.has(key)) {
          if (desc.get) {
            defined.add(key);
            Object.defineProperty(target, key, {
              enumerable: true,
              configurable: true,
              get: resolveSources.bind(sourcesMap[key] = [desc.get.bind(source)])
            });
          } else {
            if (desc.value !== undefined) defined.add(key);
            target[key] = desc.value;
          }
        } else {
          const sources = sourcesMap[key];
          if (sources) {
            if (desc.get) {
              sources.push(desc.get.bind(source));
            } else if (desc.value !== undefined) {
              sources.push(() => desc.value);
            }
          } else if (target[key] === undefined) target[key] = desc.value;
        }
      }
    }
    return target;
  }
  function splitProps(props, ...keys) {
    if ($PROXY in props) {
      const blocked = new Set(keys.length > 1 ? keys.flat() : keys[0]);
      const res = keys.map(k => {
        return new Proxy({
          get(property) {
            return k.includes(property) ? props[property] : undefined;
          },
          has(property) {
            return k.includes(property) && property in props;
          },
          keys() {
            return k.filter(property => property in props);
          }
        }, propTraps);
      });
      res.push(new Proxy({
        get(property) {
          return blocked.has(property) ? undefined : props[property];
        },
        has(property) {
          return blocked.has(property) ? false : property in props;
        },
        keys() {
          return Object.keys(props).filter(k => !blocked.has(k));
        }
      }, propTraps));
      return res;
    }
    const otherObject = {};
    const objects = keys.map(() => ({}));
    for (const propName of Object.getOwnPropertyNames(props)) {
      const desc = Object.getOwnPropertyDescriptor(props, propName);
      const isDefaultDesc = !desc.get && !desc.set && desc.enumerable && desc.writable && desc.configurable;
      let blocked = false;
      let objectIndex = 0;
      for (const k of keys) {
        if (k.includes(propName)) {
          blocked = true;
          isDefaultDesc ? objects[objectIndex][propName] = desc.value : Object.defineProperty(objects[objectIndex], propName, desc);
        }
        ++objectIndex;
      }
      if (!blocked) {
        isDefaultDesc ? otherObject[propName] = desc.value : Object.defineProperty(otherObject, propName, desc);
      }
    }
    return [...objects, otherObject];
  }
  let counter = 0;
  function createUniqueId() {
    const ctx = sharedConfig.context;
    return ctx ? `${ctx.id}${ctx.count++}` : `cl-${counter++}`;
  }
  
  const narrowedError = name => `Stale read from <${name}>.`;
  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback || undefined));
  }
  function Show(props) {
    const keyed = props.keyed;
    const condition = createMemo(() => props.when, undefined, {
      equals: (a, b) => keyed ? a === b : !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        const fn = typeof child === "function" && child.length > 0;
        return fn ? untrack(() => child(keyed ? c : () => {
          if (!untrack(condition)) throw narrowedError("Show");
          return props.when;
        })) : child;
      }
      return props.fallback;
    }, undefined, undefined);
  }
  function Switch(props) {
    let keyed = false;
    const equals = (a, b) => a[0] === b[0] && (keyed ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2];
    const conditions = children(() => props.children),
      evalConditions = createMemo(() => {
        let conds = conditions();
        if (!Array.isArray(conds)) conds = [conds];
        for (let i = 0; i < conds.length; i++) {
          const c = conds[i].when;
          if (c) {
            keyed = !!conds[i].keyed;
            return [i, c, conds[i]];
          }
        }
        return [-1];
      }, undefined, {
        equals
      });
    return createMemo(() => {
      const [index, when, cond] = evalConditions();
      if (index < 0) return props.fallback;
      const c = cond.children;
      const fn = typeof c === "function" && c.length > 0;
      return fn ? untrack(() => c(keyed ? when : () => {
        if (untrack(evalConditions)[0] !== index) throw narrowedError("Match");
        return cond.when;
      })) : c;
    }, undefined, undefined);
  }
  function Match(props) {
    return props;
  }
  
  const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
  const Properties = /*#__PURE__*/new Set(["className", "value", "readOnly", "formNoValidate", "isMap", "noModule", "playsInline", ...booleans]);
  const ChildProperties = /*#__PURE__*/new Set(["innerHTML", "textContent", "innerText", "children"]);
  const Aliases = /*#__PURE__*/Object.assign(Object.create(null), {
    className: "class",
    htmlFor: "for"
  });
  const PropAliases = /*#__PURE__*/Object.assign(Object.create(null), {
    class: "className",
    formnovalidate: {
      $: "formNoValidate",
      BUTTON: 1,
      INPUT: 1
    },
    ismap: {
      $: "isMap",
      IMG: 1
    },
    nomodule: {
      $: "noModule",
      SCRIPT: 1
    },
    playsinline: {
      $: "playsInline",
      VIDEO: 1
    },
    readonly: {
      $: "readOnly",
      INPUT: 1,
      TEXTAREA: 1
    }
  });
  function getPropAlias(prop, tagName) {
    const a = PropAliases[prop];
    return typeof a === "object" ? a[tagName] ? a["$"] : undefined : a;
  }
  const DelegatedEvents = /*#__PURE__*/new Set(["beforeinput", "click", "dblclick", "contextmenu", "focusin", "focusout", "input", "keydown", "keyup", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup", "touchend", "touchmove", "touchstart"]);
  const SVGNamespace = {
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace"
  };
  
  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length,
      aEnd = a.length,
      bEnd = bLength,
      aStart = 0,
      bStart = 0,
      after = a[aEnd - 1].nextSibling,
      map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart,
              sequence = 1,
              t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }
  
  const $$EVENTS = "_$DX_DELEGATE";
  function template(html, isCE, isSVG) {
    let node;
    const create = () => {
      const t = document.createElement("template");
      t.innerHTML = html;
      return isSVG ? t.content.firstChild.firstChild : t.content.firstChild;
    };
    const fn = isCE ? () => untrack(() => document.importNode(node || (node = create()), true)) : () => (node || (node = create())).cloneNode(true);
    fn.cloneNode = fn;
    return fn;
  }
  function delegateEvents(eventNames, document = window.document) {
    const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
  }
  function setAttributeNS(node, namespace, name, value) {
    if (value == null) node.removeAttributeNS(namespace, name);else node.setAttributeNS(namespace, name, value);
  }
  function className(node, value) {
    if (value == null) node.removeAttribute("class");else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler);
  }
  function classList(node, value, prev = {}) {
    const classKeys = Object.keys(value || {}),
      prevKeys = Object.keys(prev);
    let i, len;
    for (i = 0, len = prevKeys.length; i < len; i++) {
      const key = prevKeys[i];
      if (!key || key === "undefined" || value[key]) continue;
      toggleClassKey(node, key, false);
      delete prev[key];
    }
    for (i = 0, len = classKeys.length; i < len; i++) {
      const key = classKeys[i],
        classValue = !!value[key];
      if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
      toggleClassKey(node, key, true);
      prev[key] = classValue;
    }
    return prev;
  }
  function style(node, value, prev) {
    if (!value) return prev ? setAttribute(node, "style") : value;
    const nodeStyle = node.style;
    if (typeof value === "string") return nodeStyle.cssText = value;
    typeof prev === "string" && (nodeStyle.cssText = prev = undefined);
    prev || (prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function spread(node, props = {}, isSVG, skipChildren) {
    const prevProps = {};
    if (!skipChildren) {
      createRenderEffect(() => prevProps.children = insertExpression(node, props.children, prevProps.children));
    }
    createRenderEffect(() => props.ref && props.ref(node));
    createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
    return prevProps;
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect(current => insertExpression(parent, accessor(), current, marker), initial);
  }
  function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
    props || (props = {});
    for (const prop in prevProps) {
      if (!(prop in props)) {
        if (prop === "children") continue;
        prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef);
      }
    }
    for (const prop in props) {
      if (prop === "children") {
        if (!skipChildren) insertExpression(node, props.children);
        continue;
      }
      const value = props[prop];
      prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef);
    }
  }
  function toPropertyName(name) {
    return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
  }
  function toggleClassKey(node, key, value) {
    const classNames = key.trim().split(/\s+/);
    for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
  }
  function assignProp(node, prop, value, prev, isSVG, skipRef) {
    let isCE, isProp, isChildProp, propAlias, forceProp;
    if (prop === "style") return style(node, value, prev);
    if (prop === "classList") return classList(node, value, prev);
    if (value === prev) return prev;
    if (prop === "ref") {
      if (!skipRef) value(node);
    } else if (prop.slice(0, 3) === "on:") {
      const e = prop.slice(3);
      prev && node.removeEventListener(e, prev);
      value && node.addEventListener(e, value);
    } else if (prop.slice(0, 10) === "oncapture:") {
      const e = prop.slice(10);
      prev && node.removeEventListener(e, prev, true);
      value && node.addEventListener(e, value, true);
    } else if (prop.slice(0, 2) === "on") {
      const name = prop.slice(2).toLowerCase();
      const delegate = DelegatedEvents.has(name);
      if (!delegate && prev) {
        const h = Array.isArray(prev) ? prev[0] : prev;
        node.removeEventListener(name, h);
      }
      if (delegate || value) {
        addEventListener(node, name, value, delegate);
        delegate && delegateEvents([name]);
      }
    } else if (prop.slice(0, 5) === "attr:") {
      setAttribute(node, prop.slice(5), value);
    } else if ((forceProp = prop.slice(0, 5) === "prop:") || (isChildProp = ChildProperties.has(prop)) || !isSVG && ((propAlias = getPropAlias(prop, node.tagName)) || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-"))) {
      if (forceProp) {
        prop = prop.slice(5);
        isProp = true;
      }
      if (prop === "class" || prop === "className") className(node, value);else if (isCE && !isProp && !isChildProp) node[toPropertyName(prop)] = value;else node[propAlias || prop] = value;
    } else {
      const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
      if (ns) setAttributeNS(node, ns, prop, value);else setAttribute(node, Aliases[prop] || prop, value);
    }
    return value;
  }
  function eventHandler(e) {
    const key = `$$${e.type}`;
    let node = e.composedPath && e.composedPath()[0] || e.target;
    if (e.target !== node) {
      Object.defineProperty(e, "target", {
        configurable: true,
        value: node
      });
    }
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    while (node) {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node = node._$host || node.parentNode || node.host;
    }
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value,
      multi = marker !== undefined;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (t === "number") value = value.toString();
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data = value;
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value.nodeType) {
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else console.warn(`Unrecognized value. Skipped inserting`, value);
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i],
        prev = current && current[i],
        t;
      if (item == null || item === true || item === false) ; else if ((t = typeof item) === "object" && item.nodeType) {
        normalized.push(item);
      } else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if (t === "function") {
        if (unwrap) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker = null) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === undefined) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }
  
  function createProps(raw) {
      const keys = Object.keys(raw);
      const props = {};
      for (let i = 0; i < keys.length; i++) {
          const [get, set] = createSignal(raw[keys[i]]);
          Object.defineProperty(props, keys[i], {
              get,
              set(v) {
                  set(() => v);
              }
          });
      }
      return props;
  }
  function lookupContext(el) {
      if (el.assignedSlot && el.assignedSlot._$owner)
          return el.assignedSlot._$owner;
      let next = el.parentNode;
      while (next &&
          !next._$owner &&
          !(next.assignedSlot && next.assignedSlot._$owner))
          next = next.parentNode;
      return next && next.assignedSlot
          ? next.assignedSlot._$owner
          : el._$owner;
  }
  function withSolid(ComponentType) {
      return (rawProps, options) => {
          const { element } = options;
          return createRoot((dispose) => {
              const props = createProps(rawProps);
              element.addPropertyChangedCallback((key, val) => (props[key] = val));
              element.addReleaseCallback(() => {
                  element.renderRoot.textContent = "";
                  dispose();
              });
              const comp = ComponentType(props, options);
              return insert(element.renderRoot, comp);
          }, lookupContext(element));
      };
  }
  function customElement(tag, props, ComponentType) {
      if (arguments.length === 2) {
          ComponentType = props;
          props = {};
      }
      return register(tag, props)(withSolid(ComponentType));
  }
  
  const defaultBotProps = {
    agentName: undefined,
    onNewInputBlock: undefined,
    onAnswer: undefined,
    onEnd: undefined,
    onInit: undefined,
    onNewLogs: undefined,
    isPreview: undefined,
    startGroupId: undefined,
    prefilledVariables: undefined,
    apiHost: undefined,
    resultId: undefined
  };
  const defaultPopupProps = {
    ...defaultBotProps,
    onClose: undefined,
    onOpen: undefined,
    theme: undefined,
    autoShowDelay: undefined,
    isOpen: undefined,
    defaultOpen: undefined
  };
  const defaultBubbleProps = {
    ...defaultBotProps,
    onClose: undefined,
    onOpen: undefined,
    theme: undefined,
    previewMessage: undefined,
    onPreviewMessageClick: undefined,
    autoShowDelay: undefined
  };
  
  var css_248z$1 = "/*! tailwindcss v3.3.3 | MIT License | https://tailwindcss.com*/*,:after,:before{border:0 solid #e5e7eb;box-sizing:border-box}:after,:before{--tw-content:\"\"}html{-webkit-text-size-adjust:100%;font-feature-settings:normal;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;font-variation-settings:normal;line-height:1.5;-moz-tab-size:4;-o-tab-size:4;tab-size:4}body{line-height:inherit;margin:0}hr{border-top-width:1px;color:inherit;height:0}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,pre,samp{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;font-size:1em}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-.25em}sup{top:-.5em}table{border-collapse:collapse;border-color:inherit;text-indent:0}button,input,optgroup,select,textarea{font-feature-settings:inherit;color:inherit;font-family:inherit;font-size:100%;font-variation-settings:inherit;font-weight:inherit;line-height:inherit;margin:0;padding:0}button,select{text-transform:none}[type=button],[type=reset],[type=submit],button{-webkit-appearance:button;background-color:transparent;background-image:none}:-moz-focusring{outline:auto}:-moz-ui-invalid{box-shadow:none}progress{vertical-align:baseline}::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}[type=search]{-webkit-appearance:textfield;outline-offset:-2px}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}summary{display:list-item}blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre{margin:0}fieldset{margin:0}fieldset,legend{padding:0}menu,ol,ul{list-style:none;margin:0;padding:0}dialog{padding:0}textarea{resize:vertical}input::-moz-placeholder,textarea::-moz-placeholder{color:#9ca3af;opacity:1}input::placeholder,textarea::placeholder{color:#9ca3af;opacity:1}[role=button],button{cursor:pointer}:disabled{cursor:default}audio,canvas,embed,iframe,img,object,svg,video{display:block;vertical-align:middle}img,video{height:auto;max-width:100%}[hidden]{display:none}*,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: }::backdrop{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: }.container{width:100%}@media (min-width:640px){.container{max-width:640px}}@media (min-width:768px){.container{max-width:768px}}@media (min-width:1024px){.container{max-width:1024px}}@media (min-width:1280px){.container{max-width:1280px}}@media (min-width:1536px){.container{max-width:1536px}}.pointer-events-none{pointer-events:none}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.-right-1{right:-4px}.-right-2{right:-8px}.-top-2{top:-8px}.bottom-20{bottom:80px}.bottom-24{bottom:96px}.bottom-5{bottom:20px}.left-0{left:0}.left-5{left:20px}.right-0{right:0}.right-5{right:20px}.top-0{top:0}.z-10{z-index:10}.z-20{z-index:20}.m-2{margin:8px}.m-auto{margin:auto}.mx-4{margin-left:16px;margin-right:16px}.my-2{margin-bottom:8px;margin-top:8px}.-mr-1{margin-right:-4px}.-mt-1{margin-top:-4px}.mb-3{margin-bottom:12px}.ml-2{margin-left:8px}.mt-1{margin-top:4px}.mt-4{margin-top:16px}.\\!block{display:block!important}.block{display:block}.flex{display:flex}.inline-flex{display:inline-flex}.contents{display:contents}.hidden{display:none}.h-10{height:40px}.h-12{height:48px}.h-16{height:64px}.h-2{height:8px}.h-2\\.5{height:10px}.h-3{height:12px}.h-32{height:128px}.h-4{height:16px}.h-5{height:20px}.h-6{height:24px}.h-7{height:28px}.h-8{height:32px}.h-9{height:36px}.h-\\[80vh\\]{height:80vh}.h-\\[90\\%\\]{height:90%}.h-full{height:100%}.max-h-80{max-height:320px}.max-h-\\[464px\\]{max-height:464px}.max-h-\\[704px\\]{max-height:704px}.min-h-full{min-height:100%}.w-10{width:40px}.w-12{width:48px}.w-16{width:64px}.w-2{width:8px}.w-3{width:12px}.w-4{width:16px}.w-5{width:20px}.w-6{width:24px}.w-7{width:28px}.w-8{width:32px}.w-9{width:36px}.w-\\[90\\%\\]{width:90%}.w-full{width:100%}.min-w-0{min-width:0}.max-w-\\[256px\\]{max-width:256px}.max-w-full{max-width:100%}.max-w-lg{max-width:512px}.max-w-xs{max-width:320px}.flex-1{flex:1 1 0%}.flex-shrink-0{flex-shrink:0}.-rotate-180{--tw-rotate:-180deg}.-rotate-180,.rotate-0{transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}.rotate-0{--tw-rotate:0deg}.scale-0{--tw-scale-x:0;--tw-scale-y:0}.scale-0,.scale-100{transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}.scale-100{--tw-scale-x:1;--tw-scale-y:1}.transform{transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}@keyframes fade-in{0%{opacity:0}to{opacity:1}}.animate-fade-in{animation:fade-in .3s ease-out}@keyframes ping{75%,to{opacity:0;transform:scale(2)}}.animate-ping{animation:ping 1s cubic-bezier(0,0,.2,1) infinite}@keyframes spin{to{transform:rotate(1turn)}}.animate-spin{animation:spin 1s linear infinite}.cursor-pointer{cursor:pointer}.select-none{-webkit-user-select:none;-moz-user-select:none;user-select:none}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-start{align-items:flex-start}.items-end{align-items:flex-end}.items-center{align-items:center}.justify-end{justify-content:flex-end}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.gap-1{gap:4px}.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.overflow-y-scroll{overflow-y:scroll}.scroll-smooth{scroll-behavior:smooth}.text-ellipsis{text-overflow:ellipsis}.whitespace-pre-wrap{white-space:pre-wrap}.rounded-full{border-radius:9999px}.rounded-lg{border-radius:8px}.rounded-md{border-radius:6px}.border{border-width:1px}.border-2{border-width:2px}.border-dashed{border-style:dashed}.border-gray-300{--tw-border-opacity:1;border-color:rgb(209 213 219/var(--tw-border-opacity))}.bg-black{--tw-bg-opacity:1;background-color:rgb(0 0 0/var(--tw-bg-opacity))}.bg-gray-200{--tw-bg-opacity:1;background-color:rgb(229 231 235/var(--tw-bg-opacity))}.bg-gray-50{--tw-bg-opacity:1;background-color:rgb(249 250 251/var(--tw-bg-opacity))}.bg-transparent{background-color:transparent}.bg-white{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity))}.bg-opacity-50{--tw-bg-opacity:0.5}.bg-cover{background-size:cover}.bg-center{background-position:50%}.fill-transparent{fill:transparent}.stroke-2{stroke-width:2}.object-cover{-o-object-fit:cover;object-fit:cover}.p-1{padding:4px}.p-4{padding:16px}.px-1{padding-left:4px;padding-right:4px}.px-3{padding-left:12px;padding-right:12px}.px-4{padding-left:16px;padding-right:16px}.px-8{padding-left:32px;padding-right:32px}.py-1{padding-bottom:4px;padding-top:4px}.py-2{padding-bottom:8px;padding-top:8px}.py-4{padding-bottom:16px;padding-top:16px}.py-6{padding-bottom:24px;padding-top:24px}.pb-0{padding-bottom:0}.pl-2{padding-left:8px}.pl-4{padding-left:16px}.pr-1{padding-right:4px}.pr-2{padding-right:8px}.pr-4{padding-right:16px}.pt-10{padding-top:40px}.text-left{text-align:left}.text-center{text-align:center}.text-right{text-align:right}.text-2xl{font-size:24px;line-height:32px}.text-4xl{font-size:36px;line-height:40px}.text-base{font-size:16px;line-height:24px}.text-sm{font-size:14px;line-height:20px}.text-xl{font-size:20px;line-height:28px}.font-normal{font-weight:400}.font-semibold{font-weight:600}.italic{font-style:italic}.text-gray-500{--tw-text-opacity:1;color:rgb(107 114 128/var(--tw-text-opacity))}.text-gray-900{--tw-text-opacity:1;color:rgb(17 24 39/var(--tw-text-opacity))}.text-red-500{--tw-text-opacity:1;color:rgb(239 68 68/var(--tw-text-opacity))}.text-white{--tw-text-opacity:1;color:rgb(255 255 255/var(--tw-text-opacity))}.underline{text-decoration-line:underline}.opacity-0{opacity:0}.opacity-100{opacity:1}.opacity-25{opacity:.25}.opacity-75{opacity:.75}.shadow{--tw-shadow:0 1px 3px 0 rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1);--tw-shadow-colored:0 1px 3px 0 var(--tw-shadow-color),0 1px 2px -1px var(--tw-shadow-color)}.shadow,.shadow-md{box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.shadow-md{--tw-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1);--tw-shadow-colored:0 4px 6px -1px var(--tw-shadow-color),0 2px 4px -2px var(--tw-shadow-color)}.shadow-xl{--tw-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1);--tw-shadow-colored:0 20px 25px -5px var(--tw-shadow-color),0 8px 10px -6px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.brightness-150{--tw-brightness:brightness(1.5)}.brightness-150,.brightness-200{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.brightness-200{--tw-brightness:brightness(2)}.filter{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.transition{transition-duration:.15s;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;transition-timing-function:cubic-bezier(.4,0,.2,1)}.transition-all{transition-duration:.15s;transition-property:all;transition-timing-function:cubic-bezier(.4,0,.2,1)}.transition-opacity{transition-duration:.15s;transition-property:opacity;transition-timing-function:cubic-bezier(.4,0,.2,1)}.transition-transform{transition-duration:.15s;transition-property:transform;transition-timing-function:cubic-bezier(.4,0,.2,1)}.duration-200{transition-duration:.2s}.ease-out{transition-timing-function:cubic-bezier(0,0,.2,1)}:host{--agent-widget-container-bg-image:none;--agent-widget-container-bg-color:transparent;--agent-widget-container-font-family:\"Open Sans\";--agent-widget-container-color:#303235;--agent-button-bg-color:#0042da;--agent-button-bg-color-rgb:0,66,218;--agent-button-color:#fff;--agent-checkbox-bg-color:#fff;--agent-host-bubble-bg-color:#f7f8ff;--agent-host-bubble-color:#303235;--agent-guest-bubble-bg-color:#ff8e21;--agent-guest-bubble-color:#fff;--agent-input-bg-color:#fff;--agent-input-color:#303235;--agent-input-placeholder-color:#9095a0;--agent-header-bg-color:#fff;--agent-header-color:#303235;--selectable-base-alpha:0;--agent-border-radius:6px;--PhoneInputCountryFlag-borderColor:transparent;--PhoneInput-color--focus:transparent}.scrollable-container::-webkit-scrollbar{display:none}.scrollable-container{-ms-overflow-style:none;scrollbar-width:none}.text-fade-in{transition:opacity .4s ease-in .2s}.bubble-typing{transition:width .4s ease-out,height .4s ease-out}.bubble1,.bubble2,.bubble3{background-color:var(--agent-host-bubble-color);opacity:.5}.bubble1,.bubble2{animation:chatBubbles 1s ease-in-out infinite}.bubble2{animation-delay:.3s}.bubble3{animation:chatBubbles 1s ease-in-out infinite;animation-delay:.5s}@keyframes chatBubbles{0%{transform:translateY(2.5)}50%{transform:translateY(-2.5px)}to{transform:translateY(0)}}button,input,textarea{font-weight:300}.slate-a{text-decoration:underline}.slate-html-container>div{min-height:24px}.slate-bold{font-weight:700}.slate-italic{font-style:oblique}.slate-underline{text-decoration:underline}.text-input::-moz-placeholder{color:var(--agent-input-placeholder-color)!important;opacity:1!important}.text-input::placeholder{color:var(--agent-input-placeholder-color)!important;opacity:1!important}.agent-widget-container{background-color:var(--agent-widget-container-bg-color);background-image:var(--agent-widget-container-bg-image);font-family:var(--agent-widget-container-font-family),-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\",\"Segoe UI Symbol\"}.agent-button{background-color:var(--agent-button-bg-color);border:1px solid var(--agent-button-bg-color);border-radius:var(--agent-border-radius);color:var(--agent-button-color);transition:all .3s ease}.agent-button.selectable{background-color:var(--agent-host-bubble-bg-color);border:1px solid var(--agent-button-bg-color);color:var(--agent-host-bubble-color)}.agent-selectable{-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .08));border:1px solid rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .25));border-radius:var(--agent-border-radius);color:var(--agent-widget-container-color);transition:all .3s ease}.agent-selectable:hover{background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .12));border-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .3))}.agent-selectable.selected{background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .18));border-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .35))}.agent-checkbox{background-color:var(--agent-checkbox-bg-color);border:1px solid var(--agent-button-bg-color);border-radius:var(--agent-border-radius);border-radius:2px;color:var(--agent-button-color);padding:1px;transition:all .3s ease}.agent-checkbox.checked{background-color:var(--agent-button-bg-color)}.agent-host-bubble{color:var(--agent-host-bubble-color)}.agent-host-bubble>.bubble-typing{background-color:var(--agent-host-bubble-bg-color);border:var(--agent-host-bubble-border);border-radius:6px}.agent-host-bubble iframe,.agent-host-bubble img,.agent-host-bubble video{border-radius:var(--agent-border-radius)}.agent-guest-bubble{background-color:var(--agent-guest-bubble-bg-color);border-radius:6px;color:var(--agent-guest-bubble-color)}.agent-input{background-color:var(--agent-input-bg-color);border-radius:var(--agent-border-radius);box-shadow:0 2px 6px -1px rgba(0,0,0,.1)}.agent-input,.agent-input-error-message{color:var(--agent-input-color)}.agent-button>.send-icon{fill:var(--agent-button-color)}.agent-chat-view{max-width:800px}.ping span{background-color:var(--agent-button-bg-color)}.rating-icon-container svg{stroke:var(--agent-button-bg-color);fill:var(--agent-host-bubble-bg-color);height:42px;transition:fill .1s ease-out;width:42px}.rating-icon-container.selected svg{fill:var(--agent-button-bg-color)}.rating-icon-container:hover svg{filter:brightness(.9)}.rating-icon-container:active svg{filter:brightness(.75)}.upload-progress-bar{border-radius:var(--agent-border-radius)}.total-files-indicator,.upload-progress-bar{background-color:var(--agent-button-bg-color)}.total-files-indicator{color:var(--agent-button-color);font-size:10px}.agent-upload-input{border-radius:var(--agent-border-radius);transition:border-color .1s ease-out}.agent-upload-input.dragging-over{border-color:var(--agent-button-bg-color)}.secondary-button{background-color:var(--agent-host-bubble-bg-color);border-radius:var(--agent-border-radius);color:var(--agent-host-bubble-color)}.agent-country-select{color:var(--agent-input-color)}.agent-country-select,.agent-date-input{background-color:var(--agent-input-bg-color);border-radius:var(--agent-border-radius)}.agent-date-input{color:var(--agent-input-color);color-scheme:light}.agent-popup-blocked-toast{border-radius:var(--agent-border-radius)}.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}.agent-picture-button{background-color:var(--agent-button-bg-color);border-radius:var(--agent-border-radius);color:var(--agent-button-color);transition:all .3s ease;width:236px}.agent-picture-button>img,.agent-selectable-picture>img{border-radius:var(--agent-border-radius) var(--agent-border-radius) 0 0;height:100%;max-height:200px;min-width:200px;-o-object-fit:cover;object-fit:cover;width:100%}.agent-picture-button.has-svg>img,.agent-selectable-picture.has-svg>img{max-height:128px;-o-object-fit:contain;object-fit:contain;padding:1rem}.agent-selectable-picture{background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .08));border:1px solid rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .25));border-radius:var(--agent-border-radius);color:var(--agent-widget-container-color);transition:all .3s ease;width:236px}.agent-selectable-picture:hover{background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .12));border-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .3))}.agent-selectable-picture.selected{background-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .18));border-color:rgba(var(--agent-button-bg-color-rgb),calc(var(--selectable-base-alpha) + .35))}select option{background-color:var(--agent-input-bg-color);color:var(--agent-input-color)}.hover\\:scale-110:hover{--tw-scale-x:1.1;--tw-scale-y:1.1;transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}.hover\\:bg-gray-100:hover{--tw-bg-opacity:1;background-color:rgb(243 244 246/var(--tw-bg-opacity))}.hover\\:shadow-lg:hover{--tw-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);--tw-shadow-colored:0 10px 15px -3px var(--tw-shadow-color),0 4px 6px -4px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.hover\\:brightness-90:hover{--tw-brightness:brightness(.9)}.hover\\:brightness-90:hover,.hover\\:brightness-95:hover{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.hover\\:brightness-95:hover{--tw-brightness:brightness(.95)}.focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}.active\\:scale-95:active{--tw-scale-x:.95;--tw-scale-y:.95;transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}.active\\:brightness-75:active{--tw-brightness:brightness(.75)}.active\\:brightness-75:active,.active\\:brightness-90:active{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.active\\:brightness-90:active{--tw-brightness:brightness(.9)}.disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}.disabled\\:opacity-50:disabled{opacity:.5}.disabled\\:brightness-100:disabled{--tw-brightness:brightness(1);filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}@media (min-width:640px){.sm\\:left-5{left:20px}.sm\\:right-5{right:20px}.sm\\:my-8{margin-bottom:32px;margin-top:32px}.sm\\:w-\\[400px\\]{width:400px}.sm\\:w-full{width:100%}.sm\\:max-w-lg{max-width:512px}.sm\\:p-0{padding:0}}";
  
  const sendRequest = async params => {
    try {
      const url = typeof params === 'string' ? params : params.url;
      const response = await fetch(url, {
        method: typeof params === 'string' ? 'GET' : params.method,
        mode: 'cors',
        credentials: 'include',
        headers: typeof params !== 'string' && isDefined(params.body) ? {
          'Content-Type': 'application/json'
        } : undefined,
        body: typeof params !== 'string' && isDefined(params.body) ? JSON.stringify(params.body) : undefined
      });
      const data = await response.json();
      if (!response.ok) throw 'error' in data ? data.error : data;
      return {
        data
      };
    } catch (e) {
      console.error(e);
      return {
        error: e
      };
    }
  };
  const isDefined = value => value !== undefined && value !== null;
  const isNotDefined = value => value === undefined || value === null;
  const isEmpty = value => value === undefined || value === null || value === '';
  const isNotEmpty = value => value !== undefined && value !== null && value !== '';
  const uploadFiles = async ({
    sessionId,
    basePath = '/api',
    files,
    onUploadProgress
  }) => {
    const urls = [];
    const urlKeys = [];
    let i = 0;
    for (const {
      file,
      path
    } of files) {
      onUploadProgress && onUploadProgress(i / files.length * 100);
      i += 1;
      const {
        data
      } = await sendRequest(
      // `${basePath}/storage/upload-url?filePath=${encodeURIComponent(
      //   path
      // )}&fileType=${file.type}`
      `${basePath}?filePath=${encodeURIComponent(path)}&fileType=${file.type}`);
      if (!data?.presignedUrl) continue;
      const {
        url,
        fields
      } = data.presignedUrl;
      if (data.hasReachedStorageLimit) urls.push(null);else {
        const formData = new FormData();
        Object.entries({
          ...fields,
          file
        }).forEach(([key, value]) => {
          formData.append(key, value);
        });
        let upload;
        try {
          upload = await fetch(url, {
            method: 'POST',
            body: formData
          });
          if (!upload.ok) continue;
        } catch (error) {
          console.log("An error occurred: ", error);
        }
        urlKeys.push(fields.key);
        urls.push(`${url.split('?')[0]}/${path}`);
      }
    }
    try {
      let result = await fetch(`${basePath}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          keys: urlKeys
        }),
        credentials: 'include'
      });
    } catch (error) {
      console.log(`error fetching: ${JSON.stringify(error)}`);
    }
    return urlKeys;
  };
  const env = (key = '') => {
    if (typeof window === 'undefined') return isEmpty(process.env['NEXT_PUBLIC_' + key]) ? undefined : process.env['NEXT_PUBLIC_' + key];
    if (typeof window !== 'undefined' && window.__env) return isEmpty(window.__env[key]) ? undefined : window.__env[key];
  };
  const injectCustomHeadCode = customHeadCode => {
    const headCodes = customHeadCode.split('</noscript>');
    headCodes.forEach(headCode => {
      const [codeToInject, noScriptContentToInject] = headCode.split('<noscript>');
      const fragment = document.createRange().createContextualFragment(codeToInject);
      document.head.append(fragment);
      if (isNotDefined(noScriptContentToInject)) return;
      const noScriptElement = document.createElement('noscript');
      const noScriptContentFragment = document.createRange().createContextualFragment(noScriptContentToInject);
      noScriptElement.append(noScriptContentFragment);
      document.head.append(noScriptElement);
    });
  };
  const isSvgSrc = src => src?.startsWith('data:image/svg') || src?.endsWith('.svg');
  
  const hexToRgb = hex => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (_m, r, g, b) => {
      return r + r + g + g + b + b;
    });
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
  };
  const isLight = hexColor => (([r, g, b]) => (r * 299 + g * 587 + b * 114) / 1000 > 155)(hexToRgb(hexColor));
  
  function r(e){var t,f,n="";if("string"==typeof e||"number"==typeof e)n+=e;else if("object"==typeof e)if(Array.isArray(e))for(t=0;t<e.length;t++)e[t]&&(f=r(e[t]))&&(n&&(n+=" "),n+=f);else for(t in e)e[t]&&(n&&(n+=" "),n+=t);return n}function clsx(){for(var e,t,f=0,n="";f<arguments.length;)(e=arguments[f++])&&(t=r(e))&&(n&&(n+=" "),n+=t);return n}
  
  const _tmpl$$P = /*#__PURE__*/template(`<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z">`),
    _tmpl$2$k = /*#__PURE__*/template(`<img part="button-icon" alt="Bubble button icon">`),
    _tmpl$3$b = /*#__PURE__*/template(`<span>`),
    _tmpl$4$6 = /*#__PURE__*/template(`<svg viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.601 8.39897C18.269 8.06702 17.7309 8.06702 17.3989 8.39897L12 13.7979L6.60099 8.39897C6.26904 8.06702 5.73086 8.06702 5.39891 8.39897C5.06696 8.73091 5.06696 9.2691 5.39891 9.60105L11.3989 15.601C11.7309 15.933 12.269 15.933 12.601 15.601L18.601 9.60105C18.9329 9.2691 18.9329 8.73091 18.601 8.39897Z">`),
    _tmpl$5$2 = /*#__PURE__*/template(`<img part="button-icon" alt="Bubble button close icon">`),
    _tmpl$6$2 = /*#__PURE__*/template(`<button part="button">`);
  const defaultButtonColor = '#0042DA';
  const defaultDarkIconColor = '#27272A';
  const defaultLightIconColor = '#fff';
  const isImageSrc = src => src.startsWith('http') || src.startsWith('data:image/svg+xml');
  const BubbleButton = props => (() => {
    const _el$ = _tmpl$6$2();
    _el$.$$click = () => props.toggleBot();
    _el$.style.setProperty("z-index", "42424242");
    insert(_el$, createComponent(Show, {
      get when() {
        return isNotDefined(props.customIconSrc);
      },
      keyed: true,
      get children() {
        const _el$2 = _tmpl$$P();
        createRenderEffect(_p$ => {
          const _v$ = props.iconColor ?? (isLight(props.backgroundColor ?? defaultButtonColor) ? defaultDarkIconColor : defaultLightIconColor),
            _v$2 = clsx('stroke-2 fill-transparent absolute duration-200 transition', props.isBotOpened ? 'scale-0 opacity-0' : 'scale-100 opacity-100', props.size === 'large' ? 'w-9' : 'w-7');
          _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$2.style.setProperty("stroke", _v$) : _el$2.style.removeProperty("stroke"));
          _v$2 !== _p$._v$2 && setAttribute(_el$2, "class", _p$._v$2 = _v$2);
          return _p$;
        }, {
          _v$: undefined,
          _v$2: undefined
        });
        return _el$2;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return createMemo(() => !!props.customIconSrc)() && isImageSrc(props.customIconSrc);
      },
      get children() {
        const _el$3 = _tmpl$2$k();
        createRenderEffect(_p$ => {
          const _v$3 = props.customIconSrc,
            _v$4 = clsx('duration-200 transition', props.isBotOpened ? 'scale-0 opacity-0' : 'scale-100 opacity-100', isSvgSrc(props.customIconSrc) ? props.size === 'large' ? 'w-9 h-9' : 'w-7 h-7' : 'w-[90%] h-[90%]', isSvgSrc(props.customIconSrc) ? '' : 'object-cover rounded-full');
          _v$3 !== _p$._v$3 && setAttribute(_el$3, "src", _p$._v$3 = _v$3);
          _v$4 !== _p$._v$4 && className(_el$3, _p$._v$4 = _v$4);
          return _p$;
        }, {
          _v$3: undefined,
          _v$4: undefined
        });
        return _el$3;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return createMemo(() => !!props.customIconSrc)() && !isImageSrc(props.customIconSrc);
      },
      get children() {
        const _el$4 = _tmpl$3$b();
        _el$4.style.setProperty("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'");
        insert(_el$4, () => props.customIconSrc);
        createRenderEffect(() => className(_el$4, clsx('text-4xl duration-200 transition', props.isBotOpened ? 'scale-0 opacity-0' : 'scale-100 opacity-100')));
        return _el$4;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return isNotDefined(props.customCloseIconSrc);
      },
      get children() {
        const _el$5 = _tmpl$4$6();
        createRenderEffect(_p$ => {
          const _v$5 = props.iconColor ?? (isLight(props.backgroundColor ?? defaultButtonColor) ? defaultDarkIconColor : defaultLightIconColor),
            _v$6 = clsx('absolute duration-200 transition', props.isBotOpened ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-180 opacity-0', props.size === 'large' ? ' w-9' : ' w-7');
          _v$5 !== _p$._v$5 && ((_p$._v$5 = _v$5) != null ? _el$5.style.setProperty("fill", _v$5) : _el$5.style.removeProperty("fill"));
          _v$6 !== _p$._v$6 && setAttribute(_el$5, "class", _p$._v$6 = _v$6);
          return _p$;
        }, {
          _v$5: undefined,
          _v$6: undefined
        });
        return _el$5;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return createMemo(() => !!props.customCloseIconSrc)() && isImageSrc(props.customCloseIconSrc);
      },
      get children() {
        const _el$6 = _tmpl$5$2();
        createRenderEffect(_p$ => {
          const _v$7 = props.customCloseIconSrc,
            _v$8 = clsx('absolute duration-200 transition', props.isBotOpened ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-180 opacity-0', isSvgSrc(props.customCloseIconSrc) ? props.size === 'large' ? 'w-9 h-9' : 'w-7 h-7' : 'w-[90%] h-[90%]', isSvgSrc(props.customCloseIconSrc) ? '' : 'object-cover rounded-full');
          _v$7 !== _p$._v$7 && setAttribute(_el$6, "src", _p$._v$7 = _v$7);
          _v$8 !== _p$._v$8 && className(_el$6, _p$._v$8 = _v$8);
          return _p$;
        }, {
          _v$7: undefined,
          _v$8: undefined
        });
        return _el$6;
      }
    }), null);
    insert(_el$, createComponent(Show, {
      get when() {
        return createMemo(() => !!props.customCloseIconSrc)() && !isImageSrc(props.customCloseIconSrc);
      },
      get children() {
        const _el$7 = _tmpl$3$b();
        _el$7.style.setProperty("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'");
        insert(_el$7, () => props.customCloseIconSrc);
        createRenderEffect(() => className(_el$7, clsx('absolute text-4xl duration-200 transition', props.isBotOpened ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-180 opacity-0')));
        return _el$7;
      }
    }), null);
    createRenderEffect(_p$ => {
      const _v$9 = clsx('fixed bottom-5 shadow-md  rounded-full hover:scale-110 active:scale-95 transition-transform duration-200 flex justify-center items-center animate-fade-in', props.size === 'large' ? ' w-16 h-16' : ' w-12 h-12', props.placement === 'left' ? ' left-5' : ' right-5'),
        _v$10 = props.backgroundColor ?? defaultButtonColor;
      _v$9 !== _p$._v$9 && className(_el$, _p$._v$9 = _v$9);
      _v$10 !== _p$._v$10 && ((_p$._v$10 = _v$10) != null ? _el$.style.setProperty("background-color", _v$10) : _el$.style.removeProperty("background-color"));
      return _p$;
    }, {
      _v$9: undefined,
      _v$10: undefined
    });
    return _el$;
  })();
  delegateEvents(["click"]);
  
  const _tmpl$$O = /*#__PURE__*/template(`<div part="preview-message"><p>`),
    _tmpl$2$j = /*#__PURE__*/template(`<img class="rounded-full w-8 h-8 object-cover" alt="Bot avatar" elementtiming="Bot avatar" fetchpriority="high">`),
    _tmpl$3$a = /*#__PURE__*/template(`<button><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18">`);
  const defaultBackgroundColor = '#F7F8FF';
  const defaultTextColor = '#303235';
  const PreviewMessage = props => {
    const [isPreviewMessageHovered, setIsPreviewMessageHovered] = createSignal(false);
    return (() => {
      const _el$ = _tmpl$$O(),
        _el$2 = _el$.firstChild;
      _el$.addEventListener("mouseleave", () => setIsPreviewMessageHovered(false));
      _el$.addEventListener("mouseenter", () => setIsPreviewMessageHovered(true));
      _el$.$$click = () => props.onClick();
      _el$.style.setProperty("z-index", "42424242");
      insert(_el$, createComponent(CloseButton, {
        get isHovered() {
          return isPreviewMessageHovered();
        },
        get previewMessageTheme() {
          return props.previewMessageTheme;
        },
        get onClick() {
          return props.onCloseClick;
        }
      }), _el$2);
      insert(_el$, createComponent(Show, {
        get when() {
          return props.avatarUrl;
        },
        keyed: true,
        children: avatarUrl => (() => {
          const _el$3 = _tmpl$2$j();
          setAttribute(_el$3, "src", avatarUrl);
          return _el$3;
        })()
      }), _el$2);
      insert(_el$2, () => props.message);
      createRenderEffect(_p$ => {
        const _v$ = 'fixed max-w-[256px] rounded-md duration-200 flex items-center gap-4 shadow-md animate-fade-in cursor-pointer hover:shadow-lg p-4' + (props.buttonSize === 'large' ? ' bottom-24' : ' bottom-20') + (props.placement === 'left' ? ' left-5' : ' right-5'),
          _v$2 = props.previewMessageTheme?.backgroundColor ?? defaultBackgroundColor,
          _v$3 = props.previewMessageTheme?.textColor ?? defaultTextColor;
        _v$ !== _p$._v$ && className(_el$, _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$.style.setProperty("background-color", _v$2) : _el$.style.removeProperty("background-color"));
        _v$3 !== _p$._v$3 && ((_p$._v$3 = _v$3) != null ? _el$.style.setProperty("color", _v$3) : _el$.style.removeProperty("color"));
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });
      return _el$;
    })();
  };
  const CloseButton = props => (() => {
    const _el$4 = _tmpl$3$a();
    _el$4.$$click = e => {
      e.stopPropagation();
      return props.onClick();
    };
    createRenderEffect(_p$ => {
      const _v$4 = `absolute -top-2 -right-2 rounded-full w-6 h-6 p-1 hover:brightness-95 active:brightness-90 transition-all border ` + (props.isHovered ? 'opacity-100' : 'opacity-0'),
        _v$5 = props.previewMessageTheme?.closeButtonBackgroundColor ?? defaultBackgroundColor,
        _v$6 = props.previewMessageTheme?.closeButtonIconColor ?? defaultTextColor;
      _v$4 !== _p$._v$4 && className(_el$4, _p$._v$4 = _v$4);
      _v$5 !== _p$._v$5 && ((_p$._v$5 = _v$5) != null ? _el$4.style.setProperty("background-color", _v$5) : _el$4.style.removeProperty("background-color"));
      _v$6 !== _p$._v$6 && ((_p$._v$6 = _v$6) != null ? _el$4.style.setProperty("color", _v$6) : _el$4.style.removeProperty("color"));
      return _p$;
    }, {
      _v$4: undefined,
      _v$5: undefined,
      _v$6: undefined
    });
    return _el$4;
  })();
  delegateEvents(["click"]);
  
  const _tmpl$$N = /*#__PURE__*/template(`<svg fill="#000000" width="15.000000pt" height="15.300000pt" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><title>OpenAI icon</title><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z">`);
  const OpenAiLogo = () => {
    return _tmpl$$N();
  };
  
  const _tmpl$$M = /*#__PURE__*/template(`<a href="https://openai.com/chatgpt" target="_blank" rel="noopener noreferrer" class="lite-badge" id="lite-badge"><span>Powered By ChatGPT`);
  const LiteBadge = props => {
    let liteBadge;
    let observer;
    const appendBadgeIfNecessary = mutations => {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(removedNode => {
          if ('id' in removedNode && liteBadge && removedNode.id == 'lite-badge') {
            console.log("Sorry, you can't remove the brand 😅");
            props.botContainer?.append(liteBadge);
          }
        });
      });
    };
    onMount(() => {
      if (!document || !props.botContainer) return;
      observer = new MutationObserver(appendBadgeIfNecessary);
      observer.observe(props.botContainer, {
        subtree: false,
        childList: true
      });
    });
    onCleanup(() => {
      if (observer) observer.disconnect();
    });
    return (() => {
      const _el$ = _tmpl$$M(),
        _el$2 = _el$.firstChild;
      const _ref$ = liteBadge;
      typeof _ref$ === "function" ? use(_ref$, _el$) : liteBadge = _el$;
      insert(_el$, createComponent(OpenAiLogo, {}), _el$2);
      return _el$;
    })();
  };
  
  // const cloudViewerUrl = 'https://app.apimagic.ai'
  const cloudViewerUrl = 'http://localhost:8001/web/incoming';
  const guessApiHost = () => env('Web')?.split(',')[0] ?? cloudViewerUrl;
  
  const setPaymentInProgressInStorage = state => {
    sessionStorage.setItem('agentPaymentInProgress', JSON.stringify(state));
  };
  const getPaymentInProgressInStorage = () => sessionStorage.getItem('agentPaymentInProgress');
  const removePaymentInProgressFromStorage = () => {
    sessionStorage.removeItem('agentPaymentInProgress');
  };
  
  async function getInitialChatReplyQuery({
    agentName,
    isPreview,
    apiHost,
    prefilledVariables,
    startGroupId,
    resultId,
    stripeRedirectStatus
  }) {
    if (isNotDefined(agentName)) throw new Error('Agent name is required to get initial messages');
    const paymentInProgressStateStr = getPaymentInProgressInStorage() ?? undefined;
    const paymentInProgressState = paymentInProgressStateStr ? JSON.parse(paymentInProgressStateStr) : undefined;
    if (paymentInProgressState) removePaymentInProgressFromStorage();
    const {
      data,
      error
    } = await sendRequest({
      method: 'POST',
      // url: `${isNotEmpty(apiHost) ? apiHost : guessApiHost()}/api/v1/sendMessage`,
      url: `${isNotEmpty(apiHost) ? apiHost : guessApiHost()}`,
      body: {
        startParams: paymentInProgressState ? undefined : {
          isPreview,
          agentName,
          prefilledVariables,
          startGroupId,
          resultId,
          isStreamEnabled: true
        },
        sessionId: paymentInProgressState?.sessionId,
        message: paymentInProgressState ? stripeRedirectStatus === 'failed' ? 'fail' : 'Success' : undefined
      }
    });
    return {
      data: data ? {
        ...data,
        ...(paymentInProgressState ? {
          agentConfig: paymentInProgressState.agentConfig
        } : {})
      } : undefined,
      error
    };
  }
  
  var InputBlockType;
  (function (InputBlockType) {
    InputBlockType["TEXT"] = "text input";
    InputBlockType["NUMBER"] = "number input";
    InputBlockType["EMAIL"] = "email input";
    InputBlockType["URL"] = "url input";
    InputBlockType["DATE"] = "date input";
    InputBlockType["PHONE"] = "phone number input";
    InputBlockType["CHOICE"] = "choice input";
    InputBlockType["PICTURE_CHOICE"] = "picture choice input";
    InputBlockType["PAYMENT"] = "payment input";
    InputBlockType["RATING"] = "rating input";
    InputBlockType["FILE"] = "file input";
  })(InputBlockType || (InputBlockType = {}));
  
  const sendMessageQuery = ({
    apiHost,
    ...body
  }) => sendRequest({
    method: 'POST',
    // url: `${isNotEmpty(apiHost) ? apiHost : guessApiHost()}/api/v1/sendMessage`,
    url: `${isNotEmpty(apiHost) ? apiHost : guessApiHost()}`,
    body
  });
  
  const [isMobile, setIsMobile] = createSignal();
  
  const _tmpl$$L = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="19px" color="white"><path d="M476.59 227.05l-.16-.07L49.35 49.84A23.56 23.56 0 0027.14 52 24.65 24.65 0 0016 72.59v113.29a24 24 0 0019.52 23.57l232.93 43.07a4 4 0 010 7.86L35.53 303.45A24 24 0 0016 327v113.31A23.57 23.57 0 0026.59 460a23.94 23.94 0 0013.22 4 24.55 24.55 0 009.52-1.93L476.4 285.94l.19-.09a32 32 0 000-58.8z">`);
  const SendIcon = props => (() => {
    const _el$ = _tmpl$$L();
    spread(_el$, props, true, true);
    return _el$;
  })();
  
  const _tmpl$$K = /*#__PURE__*/template(`<svg><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">`);
  const Spinner = props => (() => {
    const _el$ = _tmpl$$K();
    spread(_el$, mergeProps(props, {
      get ["class"]() {
        return 'animate-spin h-6 w-6 ' + props.class;
      },
      "xmlns": "http://www.w3.org/2000/svg",
      "fill": "none",
      "viewBox": "0 0 24 24",
      "data-testid": "loading-spinner"
    }), true, true);
    return _el$;
  })();
  
  const _tmpl$$J = /*#__PURE__*/template(`<button>`);
  const Button = props => {
    const childrenReturn = children(() => props.children);
    const [local, buttonProps] = splitProps(props, ['disabled', 'class']);
    return (() => {
      const _el$ = _tmpl$$J();
      spread(_el$, mergeProps(buttonProps, {
        get disabled() {
          return props.isDisabled || props.isLoading;
        },
        get ["class"]() {
          return 'py-2 px-4 font-semibold focus:outline-none filter hover:brightness-90 active:brightness-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:brightness-100 flex justify-center' + (props.variant === 'secondary' ? ' secondary-button' : ' agent-button') + ' ' + local.class;
        }
      }), false, true);
      insert(_el$, createComponent(Show, {
        get when() {
          return !props.isLoading;
        },
        get fallback() {
          return createComponent(Spinner, {});
        },
        get children() {
          return childrenReturn();
        }
      }));
      return _el$;
    })();
  };
  
  const SendButton = props => {
    const [local, others] = splitProps(props, ['disableIcon']);
    return createComponent(Button, mergeProps({
      type: "submit"
    }, others, {
      get children() {
        return createMemo(() => !!(isMobile() && !local.disableIcon))() ? createComponent(SendIcon, {
          get ["class"]() {
            return 'send-icon flex ' + (local.disableIcon ? 'hidden' : '');
          }
        }) : props.children;
      }
    }));
  };
  
  const _tmpl$$I = /*#__PURE__*/template(`<div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bubble1"></div><div class="w-2 h-2 rounded-full bubble2"></div><div class="w-2 h-2 rounded-full bubble3">`);
  const TypingBubble = () => _tmpl$$I();
  
  const _tmpl$$H = /*#__PURE__*/template(`<input class="focus:outline-none bg-transparent px-4 py-4 flex-1 w-full text-input" type="text">`);
  const ShortTextInput = props => {
    const [local, others] = splitProps(props, ['ref', 'onInput']);
    return (() => {
      const _el$ = _tmpl$$H();
      _el$.$$input = e => local.onInput(e.currentTarget.value);
      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;
      _el$.style.setProperty("font-size", "16px");
      spread(_el$, others, false, false);
      return _el$;
    })();
  };
  delegateEvents(["input"]);
  
  const _tmpl$$G = /*#__PURE__*/template(`<textarea class="focus:outline-none bg-transparent px-4 py-4 flex-1 w-full text-input" rows="6" data-testid="textarea" required>`);
  const Textarea = props => {
    const [local, others] = splitProps(props, ['ref', 'onInput']);
    return (() => {
      const _el$ = _tmpl$$G();
      _el$.$$input = e => local.onInput(e.currentTarget.value);
      const _ref$ = local.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : local.ref = _el$;
      _el$.style.setProperty("font-size", "16px");
      spread(_el$, mergeProps({
        get autofocus() {
          return !isMobile();
        }
      }, others), false, false);
      return _el$;
    })();
  };
  delegateEvents(["input"]);
  
  const _tmpl$$F = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative z-10 items-start agent-host-bubble"><div class="flex items-center absolute px-4 py-2 bubble-typing z-10 "></div><audio autoplay controls>`);
  const showAnimationDuration$4 = 400;
  const typingDuration = 100;
  let typingTimeout$4;
  const AudioBubble = props => {
    let isPlayed = false;
    let ref;
    let audioElement;
    const [isTyping, setIsTyping] = createSignal(true);
    onMount(() => {
      typingTimeout$4 = setTimeout(() => {
        if (isPlayed) return;
        isPlayed = true;
        setIsTyping(false);
        setTimeout(() => props.onTransitionEnd(ref?.offsetTop), showAnimationDuration$4);
      }, typingDuration);
    });
    onCleanup(() => {
      if (typingTimeout$4) clearTimeout(typingTimeout$4);
    });
    return (() => {
      const _el$ = _tmpl$$F(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling;
      const _ref$ = ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
      insert(_el$4, (() => {
        const _c$ = createMemo(() => !!isTyping());
        return () => _c$() && createComponent(TypingBubble, {});
      })());
      const _ref$2 = audioElement;
      typeof _ref$2 === "function" ? use(_ref$2, _el$5) : audioElement = _el$5;
      createRenderEffect(_p$ => {
        const _v$ = isTyping() ? '64px' : '100%',
          _v$2 = isTyping() ? '32px' : '100%',
          _v$3 = props.url,
          _v$4 = 'z-10 text-fade-in ' + (isTyping() ? 'opacity-0' : 'opacity-100 m-2'),
          _v$5 = isTyping() ? isMobile() ? '32px' : '36px' : 'revert';
        _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$4.style.setProperty("width", _v$) : _el$4.style.removeProperty("width"));
        _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$4.style.setProperty("height", _v$2) : _el$4.style.removeProperty("height"));
        _v$3 !== _p$._v$3 && setAttribute(_el$5, "src", _p$._v$3 = _v$3);
        _v$4 !== _p$._v$4 && className(_el$5, _p$._v$4 = _v$4);
        _v$5 !== _p$._v$5 && ((_p$._v$5 = _v$5) != null ? _el$5.style.setProperty("height", _v$5) : _el$5.style.removeProperty("height"));
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined,
        _v$4: undefined,
        _v$5: undefined
      });
      return _el$;
    })();
  };
  
  const _tmpl$$E = /*#__PURE__*/template(`<div class="flex flex-col w-full animate-fade-in"><div class="flex w-full items-center"><div class="flex relative z-10 items-start agent-host-bubble w-full"><div class="flex items-center absolute px-4 py-2 bubble-typing z-10 "></div><div><iframe id="embed-bubble-content" class="w-full h-full ">`);
  let typingTimeout$3;
  const showAnimationDuration$3 = 400;
  const EmbedBubble = props => {
    let ref;
    const [isTyping, setIsTyping] = createSignal(true);
    onMount(() => {
      typingTimeout$3 = setTimeout(() => {
        setIsTyping(false);
        setTimeout(() => {
          props.onTransitionEnd(ref?.offsetTop);
        }, showAnimationDuration$3);
      }, 2000);
    });
    onCleanup(() => {
      if (typingTimeout$3) clearTimeout(typingTimeout$3);
    });
    return (() => {
      const _el$ = _tmpl$$E(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling,
        _el$6 = _el$5.firstChild;
      const _ref$ = ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
      insert(_el$4, (() => {
        const _c$ = createMemo(() => !!isTyping());
        return () => _c$() && createComponent(TypingBubble, {});
      })());
      createRenderEffect(_p$ => {
        const _v$ = isTyping() ? '64px' : '100%',
          _v$2 = isTyping() ? '32px' : '100%',
          _v$3 = clsx('p-4 z-20 text-fade-in w-full', isTyping() ? 'opacity-0' : 'opacity-100 p-4'),
          _v$4 = isTyping() ? isMobile() ? '32px' : '36px' : `${props.content.height}px`,
          _v$5 = props.content.url;
        _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$4.style.setProperty("width", _v$) : _el$4.style.removeProperty("width"));
        _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$4.style.setProperty("height", _v$2) : _el$4.style.removeProperty("height"));
        _v$3 !== _p$._v$3 && className(_el$5, _p$._v$3 = _v$3);
        _v$4 !== _p$._v$4 && ((_p$._v$4 = _v$4) != null ? _el$5.style.setProperty("height", _v$4) : _el$5.style.removeProperty("height"));
        _v$5 !== _p$._v$5 && setAttribute(_el$6, "src", _p$._v$5 = _v$5);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined,
        _v$4: undefined,
        _v$5: undefined
      });
      return _el$;
    })();
  };
  
  const _tmpl$$D = /*#__PURE__*/template(`<img elementtiming="Bubble image" fetchpriority="high">`),
    _tmpl$2$i = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative z-10 items-start agent-host-bubble"><div class="flex items-center absolute px-4 py-2 bubble-typing z-10 ">`),
    _tmpl$3$9 = /*#__PURE__*/template(`<a target="_blank">`),
    _tmpl$4$5 = /*#__PURE__*/template(`<figure>`);
  const showAnimationDuration$2 = 400;
  const mediaLoadingFallbackTimeout = 5000;
  let typingTimeout$2;
  const ImageBubble = props => {
    let ref;
    let image;
    const [isTyping, setIsTyping] = createSignal(true);
    const onTypingEnd = () => {
      if (!isTyping()) return;
      setIsTyping(false);
      setTimeout(() => {
        props.onTransitionEnd(ref?.offsetTop);
      }, showAnimationDuration$2);
    };
    onMount(() => {
      if (!image) return;
      typingTimeout$2 = setTimeout(onTypingEnd, mediaLoadingFallbackTimeout);
      image.onload = () => {
        clearTimeout(typingTimeout$2);
        onTypingEnd();
      };
    });
    onCleanup(() => {
      if (typingTimeout$2) clearTimeout(typingTimeout$2);
    });
    const Image = (() => {
      const _el$ = _tmpl$$D();
      const _ref$ = image;
      typeof _ref$ === "function" ? use(_ref$, _el$) : image = _el$;
      _el$.style.setProperty("max-height", "512px");
      createRenderEffect(_p$ => {
        const _v$ = props.content.url,
          _v$2 = props.content.clickLink?.alt ?? 'Bubble image',
          _v$3 = 'text-fade-in w-full ' + (isTyping() ? 'opacity-0' : 'opacity-100'),
          _v$4 = isTyping() ? '32px' : 'auto';
        _v$ !== _p$._v$ && setAttribute(_el$, "src", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && setAttribute(_el$, "alt", _p$._v$2 = _v$2);
        _v$3 !== _p$._v$3 && className(_el$, _p$._v$3 = _v$3);
        _v$4 !== _p$._v$4 && ((_p$._v$4 = _v$4) != null ? _el$.style.setProperty("height", _v$4) : _el$.style.removeProperty("height"));
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined,
        _v$4: undefined
      });
      return _el$;
    })();
    return (() => {
      const _el$2 = _tmpl$2$i(),
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild;
      const _ref$2 = ref;
      typeof _ref$2 === "function" ? use(_ref$2, _el$2) : ref = _el$2;
      insert(_el$5, (() => {
        const _c$ = createMemo(() => !!isTyping());
        return () => _c$() ? createComponent(TypingBubble, {}) : null;
      })());
      insert(_el$4, (() => {
        const _c$2 = createMemo(() => !!props.content.clickLink);
        return () => _c$2() ? (() => {
          const _el$6 = _tmpl$3$9();
          insert(_el$6, Image);
          createRenderEffect(_p$ => {
            const _v$7 = props.content.clickLink.url,
              _v$8 = clsx('z-10', isTyping() ? 'h-8' : 'p-4');
            _v$7 !== _p$._v$7 && setAttribute(_el$6, "href", _p$._v$7 = _v$7);
            _v$8 !== _p$._v$8 && className(_el$6, _p$._v$8 = _v$8);
            return _p$;
          }, {
            _v$7: undefined,
            _v$8: undefined
          });
          return _el$6;
        })() : (() => {
          const _el$7 = _tmpl$4$5();
          insert(_el$7, Image);
          createRenderEffect(() => className(_el$7, clsx('z-10', !isTyping() && 'p-4', isTyping() ? isMobile() ? 'h-8' : 'h-9' : '')));
          return _el$7;
        })();
      })(), null);
      createRenderEffect(_p$ => {
        const _v$5 = isTyping() ? '64px' : '100%',
          _v$6 = isTyping() ? '32px' : '100%';
        _v$5 !== _p$._v$5 && ((_p$._v$5 = _v$5) != null ? _el$5.style.setProperty("width", _v$5) : _el$5.style.removeProperty("width"));
        _v$6 !== _p$._v$6 && ((_p$._v$6 = _v$6) != null ? _el$5.style.setProperty("height", _v$6) : _el$5.style.removeProperty("height"));
        return _p$;
      }, {
        _v$5: undefined,
        _v$6: undefined
      });
      return _el$2;
    })();
  };
  
  const computeTypingDuration = (bubbleContent, typingSettings) => {
    let wordCount = bubbleContent.match(/(\w+)/g)?.length ?? 0;
    if (wordCount === 0) wordCount = bubbleContent.length;
    const typedWordsPerMinute = typingSettings.speed;
    let typingTimeout = typingSettings.enabled ? wordCount / typedWordsPerMinute * 60000 : 0;
    if (typingTimeout > typingSettings.maxDelay * 1000) typingTimeout = typingSettings.maxDelay * 1000;
    return typingTimeout;
  };
  
  const _tmpl$$C = /*#__PURE__*/template(`<span>`);
  const computeClassNames = (bold, italic, underline) => {
    let className = '';
    if (bold) className += 'slate-bold';
    if (italic) className += ' slate-italic';
    if (underline) className += ' slate-underline';
    return className;
  };
  const PlateText = props => createComponent(Show, {
    get when() {
      return computeClassNames(props.bold, props.italic, props.underline);
    },
    keyed: true,
    get fallback() {
      return createMemo(() => props.text);
    },
    children: className$1 => (() => {
      const _el$ = _tmpl$$C();
      className(_el$, className$1);
      insert(_el$, () => props.text);
      return _el$;
    })()
  });
  
  const _tmpl$$B = /*#__PURE__*/template(`<a target="_blank" class="slate-a">`),
    _tmpl$2$h = /*#__PURE__*/template(`<div>`);
  const PlateBlock = props => createComponent(Show, {
    get when() {
      return !props.element.text;
    },
    get fallback() {
      return createComponent(PlateText, mergeProps(() => props.element));
    },
    get children() {
      return createComponent(Switch, {
        get fallback() {
          return (() => {
            const _el$2 = _tmpl$2$h();
            insert(_el$2, createComponent(For, {
              get each() {
                return props.element.children;
              },
              children: child => createComponent(PlateBlock, {
                element: child
              })
            }));
            return _el$2;
          })();
        },
        get children() {
          return createComponent(Match, {
            get when() {
              return props.element.type === 'a';
            },
            get children() {
              const _el$ = _tmpl$$B();
              insert(_el$, createComponent(For, {
                get each() {
                  return props.element.children;
                },
                children: child => createComponent(PlateBlock, {
                  element: child
                })
              }));
              createRenderEffect(() => setAttribute(_el$, "href", props.element.url));
              return _el$;
            }
          });
        }
      });
    }
  });
  
  const computePlainText = elements => elements.map(element => element.text ?? computePlainText(element.children)).join('');
  
  const _tmpl$$A = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative items-start agent-host-bubble"><div class="flex items-center absolute px-4 py-2 bubble-typing " data-testid="host-bubble"></div><div>`);
  const showAnimationDuration$1 = 400;
  const defaultTypingEmulation = {
    enabled: true,
    speed: 300,
    maxDelay: 1.5
  };
  let typingTimeout$1;
  const TextBubble = props => {
    let ref;
    const [isTyping, setIsTyping] = createSignal(true);
    const onTypingEnd = () => {
      if (!isTyping()) return;
      setIsTyping(false);
      setTimeout(() => {
        props.onTransitionEnd(ref?.offsetTop);
      }, showAnimationDuration$1);
    };
    onMount(() => {
      if (!isTyping) return;
      const plainText = computePlainText(props.content.richText);
      const typingDuration = props.typingEmulation?.enabled === false ? 0 : computeTypingDuration(plainText, props.typingEmulation ?? defaultTypingEmulation);
      typingTimeout$1 = setTimeout(onTypingEnd, typingDuration);
    });
    onCleanup(() => {
      if (typingTimeout$1) clearTimeout(typingTimeout$1);
    });
    return (() => {
      const _el$ = _tmpl$$A(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling;
      const _ref$ = ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
      insert(_el$4, (() => {
        const _c$ = createMemo(() => !!isTyping());
        return () => _c$() && createComponent(TypingBubble, {});
      })());
      insert(_el$5, createComponent(For, {
        get each() {
          return props.content.richText;
        },
        children: element => createComponent(PlateBlock, {
          element: element
        })
      }));
      createRenderEffect(_p$ => {
        const _v$ = isTyping() ? '64px' : '100%',
          _v$2 = isTyping() ? '32px' : '100%',
          _v$3 = clsx('overflow-hidden text-fade-in mx-4 my-2 whitespace-pre-wrap slate-html-container relative text-ellipsis', isTyping() ? 'opacity-0' : 'opacity-100'),
          _v$4 = isTyping() ? isMobile() ? '16px' : '20px' : '100%';
        _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$4.style.setProperty("width", _v$) : _el$4.style.removeProperty("width"));
        _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$4.style.setProperty("height", _v$2) : _el$4.style.removeProperty("height"));
        _v$3 !== _p$._v$3 && className(_el$5, _p$._v$3 = _v$3);
        _v$4 !== _p$._v$4 && ((_p$._v$4 = _v$4) != null ? _el$5.style.setProperty("height", _v$4) : _el$5.style.removeProperty("height"));
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined,
        _v$4: undefined
      });
      return _el$;
    })();
  };
  
  var VideoBubbleContentType;
  (function (VideoBubbleContentType) {
    VideoBubbleContentType["URL"] = "url";
    VideoBubbleContentType["YOUTUBE"] = "youtube";
    VideoBubbleContentType["VIMEO"] = "vimeo";
  })(VideoBubbleContentType || (VideoBubbleContentType = {}));
  
  const _tmpl$$z = /*#__PURE__*/template(`<video autoplay controls>`),
    _tmpl$2$g = /*#__PURE__*/template(`<div><iframe class="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>`),
    _tmpl$3$8 = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative z-10 items-start agent-host-bubble overflow-hidden"><div class="flex items-center absolute px-4 py-2 bubble-typing z-10 ">`);
  const showAnimationDuration = 400;
  let typingTimeout;
  const VideoBubble = props => {
    let ref;
    const [isTyping, setIsTyping] = createSignal(true);
    onMount(() => {
      const typingDuration = props.content?.type && [VideoBubbleContentType.VIMEO, VideoBubbleContentType.YOUTUBE].includes(props.content?.type) ? 2000 : 100;
      typingTimeout = setTimeout(() => {
        if (!isTyping()) return;
        setIsTyping(false);
        setTimeout(() => {
          props.onTransitionEnd(ref?.offsetTop);
        }, showAnimationDuration);
      }, typingDuration);
    });
    onCleanup(() => {
      if (typingTimeout) clearTimeout(typingTimeout);
    });
    return (() => {
      const _el$ = _tmpl$3$8(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild;
      const _ref$ = ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
      insert(_el$4, (() => {
        const _c$ = createMemo(() => !!isTyping());
        return () => _c$() && createComponent(TypingBubble, {});
      })());
      insert(_el$3, createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return props.content?.type && props.content.type === VideoBubbleContentType.URL;
            },
            get children() {
              const _el$5 = _tmpl$$z();
              createRenderEffect(_p$ => {
                const _v$ = props.content.url,
                  _v$2 = 'p-4 focus:outline-none w-full z-10 text-fade-in rounded-md ' + (isTyping() ? 'opacity-0' : 'opacity-100'),
                  _v$3 = isTyping() ? isMobile() ? '32px' : '36px' : 'auto';
                _v$ !== _p$._v$ && setAttribute(_el$5, "src", _p$._v$ = _v$);
                _v$2 !== _p$._v$2 && className(_el$5, _p$._v$2 = _v$2);
                _v$3 !== _p$._v$3 && ((_p$._v$3 = _v$3) != null ? _el$5.style.setProperty("height", _v$3) : _el$5.style.removeProperty("height"));
                return _p$;
              }, {
                _v$: undefined,
                _v$2: undefined,
                _v$3: undefined
              });
              return _el$5;
            }
          }), createComponent(Match, {
            get when() {
              return createMemo(() => !!props.content?.type)() && [VideoBubbleContentType.VIMEO, VideoBubbleContentType.YOUTUBE].includes(props.content.type);
            },
            get children() {
              const _el$6 = _tmpl$2$g(),
                _el$7 = _el$6.firstChild;
              createRenderEffect(_p$ => {
                const _v$4 = clsx('p-4 z-10 text-fade-in w-full', isTyping() ? 'opacity-0' : 'opacity-100 p-4'),
                  _v$5 = isTyping() ? isMobile() ? '32px' : '36px' : '200px',
                  _v$6 = `${props.content.type === VideoBubbleContentType.VIMEO ? 'https://player.vimeo.com/video' : 'https://www.youtube.com/embed'}/${props.content.id}`;
                _v$4 !== _p$._v$4 && className(_el$6, _p$._v$4 = _v$4);
                _v$5 !== _p$._v$5 && ((_p$._v$5 = _v$5) != null ? _el$6.style.setProperty("height", _v$5) : _el$6.style.removeProperty("height"));
                _v$6 !== _p$._v$6 && setAttribute(_el$7, "src", _p$._v$6 = _v$6);
                return _p$;
              }, {
                _v$4: undefined,
                _v$5: undefined,
                _v$6: undefined
              });
              return _el$6;
            }
          })];
        }
      }), null);
      createRenderEffect(_p$ => {
        const _v$7 = isTyping() ? '64px' : '100%',
          _v$8 = isTyping() ? '32px' : '100%';
        _v$7 !== _p$._v$7 && ((_p$._v$7 = _v$7) != null ? _el$4.style.setProperty("width", _v$7) : _el$4.style.removeProperty("width"));
        _v$8 !== _p$._v$8 && ((_p$._v$8 = _v$8) != null ? _el$4.style.setProperty("height", _v$8) : _el$4.style.removeProperty("height"));
        return _p$;
      }, {
        _v$7: undefined,
        _v$8: undefined
      });
      return _el$;
    })();
  };
  
  var BubbleBlockType;
  (function (BubbleBlockType) {
    BubbleBlockType["TEXT"] = "text";
    BubbleBlockType["IMAGE"] = "image";
    BubbleBlockType["VIDEO"] = "video";
    BubbleBlockType["EMBED"] = "embed";
    BubbleBlockType["AUDIO"] = "audio";
  })(BubbleBlockType || (BubbleBlockType = {}));
  
  const HostBubble = props => {
    const onTransitionEnd = offsetTop => {
      props.onTransitionEnd(offsetTop);
    };
    return createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return props.message.type === BubbleBlockType.TEXT;
          },
          get children() {
            return createComponent(TextBubble, {
              get content() {
                return props.message.content;
              },
              get typingEmulation() {
                return props.typingEmulation;
              },
              onTransitionEnd: onTransitionEnd
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.message.type === BubbleBlockType.IMAGE;
          },
          get children() {
            return createComponent(ImageBubble, {
              get content() {
                return props.message.content;
              },
              onTransitionEnd: onTransitionEnd
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.message.type === BubbleBlockType.VIDEO;
          },
          get children() {
            return createComponent(VideoBubble, {
              get content() {
                return props.message.content;
              },
              onTransitionEnd: onTransitionEnd
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.message.type === BubbleBlockType.EMBED;
          },
          get children() {
            return createComponent(EmbedBubble, {
              get content() {
                return props.message.content;
              },
              onTransitionEnd: onTransitionEnd
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.message.type === BubbleBlockType.AUDIO;
          },
          get children() {
            return createComponent(AudioBubble, {
              get url() {
                return props.message.content.url;
              },
              onTransitionEnd: onTransitionEnd
            });
          }
        })];
      }
    });
  };
  
  const _tmpl$$y = /*#__PURE__*/template(`<figure data-testid="default-avatar"><svg width="75" height="75" viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="mask0" x="0" y="0" mask-type="alpha"><circle cx="37.5" cy="37.5" r="37.5" fill="#0042DA"></circle></mask><g mask="url(#mask0)"><rect x="-30" y="-43" width="131" height="154" fill="#0042DA"></rect><rect x="2.50413" y="120.333" width="81.5597" height="86.4577" rx="2.5" transform="rotate(-52.6423 2.50413 120.333)" stroke="#FED23D" stroke-width="5"></rect><circle cx="76.5" cy="-1.5" r="29" stroke="#FF8E20" stroke-width="5"></circle><path d="M-49.8224 22L-15.5 -40.7879L18.8224 22H-49.8224Z" stroke="#F7F8FF" stroke-width="5">`);
  const DefaultAvatar = () => {
    return (() => {
      const _el$ = _tmpl$$y(),
        _el$2 = _el$.firstChild;
      createRenderEffect(_p$ => {
        const _v$ = 'flex justify-center items-center rounded-full text-white relative ' + (isMobile() ? 'w-6 h-6 text-sm' : 'w-10 h-10 text-xl'),
          _v$2 = 'absolute top-0 left-0 ' + (isMobile() ? ' w-6 h-6 text-sm' : 'w-full h-full text-xl');
        _v$ !== _p$._v$ && className(_el$, _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && setAttribute(_el$2, "class", _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });
      return _el$;
    })();
  };
  
  const _tmpl$$x = /*#__PURE__*/template(`<figure><img alt="Bot avatar" class="rounded-full object-cover w-full h-full" elementtiming="Bot avatar" fetchpriority="high">`);
  const Avatar = props => {
    const [avatarSrc, setAvatarSrc] = createSignal(props.initialAvatarSrc);
    createEffect(() => {
      if (avatarSrc()?.startsWith('{{') && props.initialAvatarSrc?.startsWith('http')) setAvatarSrc(props.initialAvatarSrc);
    });
    return createComponent(Show, {
      get when() {
        return isNotEmpty(avatarSrc());
      },
      keyed: true,
      get fallback() {
        return createComponent(DefaultAvatar, {});
      },
      get children() {
        const _el$ = _tmpl$$x(),
          _el$2 = _el$.firstChild;
        createRenderEffect(_p$ => {
          const _v$ = 'flex justify-center items-center rounded-full text-white relative animate-fade-in flex-shrink-0 ' + (isMobile() ? 'w-6 h-6 text-sm' : 'w-10 h-10 text-xl'),
            _v$2 = avatarSrc();
          _v$ !== _p$._v$ && className(_el$, _p$._v$ = _v$);
          _v$2 !== _p$._v$2 && setAttribute(_el$2, "src", _p$._v$2 = _v$2);
          return _p$;
        }, {
          _v$: undefined,
          _v$2: undefined
        });
        return _el$;
      }
    });
  };
  
  const _tmpl$$w = /*#__PURE__*/template(`<div class="flex justify-end items-end animate-fade-in gap-2 guest-container"><span class="px-4 py-2 whitespace-pre-wrap max-w-full agent-guest-bubble" data-testid="guest-bubble">`);
  const GuestBubble = props => (() => {
    const _el$ = _tmpl$$w(),
      _el$2 = _el$.firstChild;
    _el$.style.setProperty("margin-left", "50px");
    insert(_el$2, () => props.message);
    insert(_el$, createComponent(Show, {
      get when() {
        return props.showAvatar;
      },
      get children() {
        return createComponent(Avatar, {
          get initialAvatarSrc() {
            return props.avatarSrc;
          }
        });
      }
    }), null);
    return _el$;
  })();
  
  const _tmpl$$v = /*#__PURE__*/template(`<div class="flex items-end justify-between pr-2 agent-input w-full" data-testid="input">`);
  const TextInput = props => {
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
    let inputRef;
    const handleInput = inputValue => setInputValue(inputValue);
    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();
    const submit = () => {
      if (checkIfInputIsValid()) props.onSubmit({
        value: inputValue()
      });
    };
    const submitWhenEnter = e => {
      if (props.block.options.isLong) return;
      if (e.key === 'Enter') submit();
    };
    const submitIfCtrlEnter = e => {
      if (!props.block.options.isLong) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    };
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
      window.addEventListener('message', processIncomingEvent);
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'setInputValue') setInputValue(data.value);
    };
    return (() => {
      const _el$ = _tmpl$$v();
      _el$.$$keydown = submitWhenEnter;
      insert(_el$, (() => {
        const _c$ = createMemo(() => !!props.block.options.isLong);
        return () => _c$() ? createComponent(Textarea, {
          ref(r$) {
            const _ref$ = inputRef;
            typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
          },
          onInput: handleInput,
          onKeyDown: submitIfCtrlEnter,
          get value() {
            return inputValue();
          },
          get placeholder() {
            return props.block.options?.labels?.placeholder ?? 'Type your answer...';
          }
        }) : createComponent(ShortTextInput, {
          ref(r$) {
            const _ref$2 = inputRef;
            typeof _ref$2 === "function" ? _ref$2(r$) : inputRef = r$;
          },
          onInput: handleInput,
          get value() {
            return inputValue();
          },
          get placeholder() {
            return props.block.options?.labels?.placeholder ?? 'Type your answer...';
          }
        });
      })(), null);
      insert(_el$, createComponent(SendButton, {
        type: "button",
        get isDisabled() {
          return inputValue() === '';
        },
        "class": "my-2 ml-2",
        "on:click": submit,
        get children() {
          return props.block.options?.labels?.button ?? 'Send';
        }
      }), null);
      createRenderEffect(() => (props.block.options.isLong ? undefined : '350px') != null ? _el$.style.setProperty("max-width", props.block.options.isLong ? undefined : '350px') : _el$.style.removeProperty("max-width"));
      return _el$;
    })();
  };
  delegateEvents(["keydown"]);
  
  const _tmpl$$u = /*#__PURE__*/template(`<div class="flex items-end justify-between pr-2 agent-input w-full" data-testid="input">`);
  const NumberInput = props => {
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
    let inputRef;
    const handleInput = inputValue => setInputValue(inputValue);
    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();
    const submit = () => {
      if (checkIfInputIsValid()) props.onSubmit({
        value: inputValue()
      });
    };
    const submitWhenEnter = e => {
      if (e.key === 'Enter') submit();
    };
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
      window.addEventListener('message', processIncomingEvent);
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'setInputValue') setInputValue(data.value);
    };
    return (() => {
      const _el$ = _tmpl$$u();
      _el$.$$keydown = submitWhenEnter;
      _el$.style.setProperty("max-width", "350px");
      insert(_el$, createComponent(ShortTextInput, {
        ref(r$) {
          const _ref$ = inputRef;
          typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
        },
        get value() {
          return inputValue();
        },
        get placeholder() {
          return props.block.options?.labels?.placeholder ?? 'Type your answer...';
        },
        onInput: handleInput,
        type: "number",
        style: {
          appearance: 'auto'
        },
        get min() {
          return props.block.options?.min;
        },
        get max() {
          return props.block.options?.max;
        },
        get step() {
          return props.block.options?.step ?? 'any';
        }
      }), null);
      insert(_el$, createComponent(SendButton, {
        type: "button",
        get isDisabled() {
          return inputValue() === '';
        },
        "class": "my-2 ml-2",
        "on:click": submit,
        get children() {
          return props.block.options?.labels?.button ?? 'Send';
        }
      }), null);
      return _el$;
    })();
  };
  delegateEvents(["keydown"]);
  
  const _tmpl$$t = /*#__PURE__*/template(`<div class="flex items-end justify-between pr-2 agent-input w-full" data-testid="input">`);
  const EmailInput = props => {
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
    let inputRef;
    const handleInput = inputValue => setInputValue(inputValue);
    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();
    const submit = () => {
      if (checkIfInputIsValid()) props.onSubmit({
        value: inputValue()
      });
    };
    const submitWhenEnter = e => {
      if (e.key === 'Enter') submit();
    };
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
      window.addEventListener('message', processIncomingEvent);
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'setInputValue') setInputValue(data.value);
    };
    return (() => {
      const _el$ = _tmpl$$t();
      _el$.$$keydown = submitWhenEnter;
      _el$.style.setProperty("max-width", "350px");
      insert(_el$, createComponent(ShortTextInput, {
        ref(r$) {
          const _ref$ = inputRef;
          typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
        },
        get value() {
          return inputValue();
        },
        get placeholder() {
          return props.block.options?.labels?.placeholder ?? 'Type your email...';
        },
        onInput: handleInput,
        type: "email",
        autocomplete: "email"
      }), null);
      insert(_el$, createComponent(SendButton, {
        type: "button",
        get isDisabled() {
          return inputValue() === '';
        },
        "class": "my-2 ml-2",
        "on:click": submit,
        get children() {
          return props.block.options?.labels?.button ?? 'Send';
        }
      }), null);
      return _el$;
    })();
  };
  delegateEvents(["keydown"]);
  
  const _tmpl$$s = /*#__PURE__*/template(`<div class="flex items-end justify-between pr-2 agent-input w-full" data-testid="input">`);
  const UrlInput = props => {
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
    let inputRef;
    const handleInput = inputValue => {
      if (!inputValue.startsWith('https://')) return inputValue === 'https:/' ? undefined : setInputValue(`https://${inputValue}`);
      setInputValue(inputValue);
    };
    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();
    const submit = () => {
      if (checkIfInputIsValid()) props.onSubmit({
        value: inputValue()
      });
    };
    const submitWhenEnter = e => {
      if (e.key === 'Enter') submit();
    };
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
      window.addEventListener('message', processIncomingEvent);
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'setInputValue') setInputValue(data.value);
    };
    return (() => {
      const _el$ = _tmpl$$s();
      _el$.$$keydown = submitWhenEnter;
      _el$.style.setProperty("max-width", "350px");
      insert(_el$, createComponent(ShortTextInput, {
        ref(r$) {
          const _ref$ = inputRef;
          typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
        },
        get value() {
          return inputValue();
        },
        get placeholder() {
          return props.block.options?.labels?.placeholder ?? 'Type your URL...';
        },
        onInput: handleInput,
        type: "url",
        autocomplete: "url"
      }), null);
      insert(_el$, createComponent(SendButton, {
        type: "button",
        get isDisabled() {
          return inputValue() === '';
        },
        "class": "my-2 ml-2",
        "on:click": submit,
        get children() {
          return props.block.options?.labels?.button ?? 'Send';
        }
      }), null);
      return _el$;
    })();
  };
  delegateEvents(["keydown"]);
  
  const _tmpl$$r = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2px" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9">`);
  const ChevronDownIcon = props => (() => {
    const _el$ = _tmpl$$r();
    spread(_el$, props, true, true);
    return _el$;
  })();
  
  const phoneCountries = [{
    name: 'International',
    flag: '🌐',
    code: 'INT',
    dial_code: null
  }, {
    name: 'Afghanistan',
    flag: '🇦🇫',
    code: 'AF',
    dial_code: '+93'
  }, {
    name: 'Åland Islands',
    flag: '🇦🇽',
    code: 'AX',
    dial_code: '+358'
  }, {
    name: 'Albania',
    flag: '🇦🇱',
    code: 'AL',
    dial_code: '+355'
  }, {
    name: 'Algeria',
    flag: '🇩🇿',
    code: 'DZ',
    dial_code: '+213'
  }, {
    name: 'American Samoa',
    flag: '🇦🇸',
    code: 'AS',
    dial_code: '+1684'
  }, {
    name: 'Andorra',
    flag: '🇦🇩',
    code: 'AD',
    dial_code: '+376'
  }, {
    name: 'Angola',
    flag: '🇦🇴',
    code: 'AO',
    dial_code: '+244'
  }, {
    name: 'Anguilla',
    flag: '🇦🇮',
    code: 'AI',
    dial_code: '+1264'
  }, {
    name: 'Antarctica',
    flag: '🇦🇶',
    code: 'AQ',
    dial_code: '+672'
  }, {
    name: 'Antigua and Barbuda',
    flag: '🇦🇬',
    code: 'AG',
    dial_code: '+1268'
  }, {
    name: 'Argentina',
    flag: '🇦🇷',
    code: 'AR',
    dial_code: '+54'
  }, {
    name: 'Armenia',
    flag: '🇦🇲',
    code: 'AM',
    dial_code: '+374'
  }, {
    name: 'Aruba',
    flag: '🇦🇼',
    code: 'AW',
    dial_code: '+297'
  }, {
    name: 'Australia',
    flag: '🇦🇺',
    code: 'AU',
    dial_code: '+61'
  }, {
    name: 'Austria',
    flag: '🇦🇹',
    code: 'AT',
    dial_code: '+43'
  }, {
    name: 'Azerbaijan',
    flag: '🇦🇿',
    code: 'AZ',
    dial_code: '+994'
  }, {
    name: 'Bahamas',
    flag: '🇧🇸',
    code: 'BS',
    dial_code: '+1242'
  }, {
    name: 'Bahrain',
    flag: '🇧🇭',
    code: 'BH',
    dial_code: '+973'
  }, {
    name: 'Bangladesh',
    flag: '🇧🇩',
    code: 'BD',
    dial_code: '+880'
  }, {
    name: 'Barbados',
    flag: '🇧🇧',
    code: 'BB',
    dial_code: '+1246'
  }, {
    name: 'Belarus',
    flag: '🇧🇾',
    code: 'BY',
    dial_code: '+375'
  }, {
    name: 'Belgium',
    flag: '🇧🇪',
    code: 'BE',
    dial_code: '+32'
  }, {
    name: 'Belize',
    flag: '🇧🇿',
    code: 'BZ',
    dial_code: '+501'
  }, {
    name: 'Benin',
    flag: '🇧🇯',
    code: 'BJ',
    dial_code: '+229'
  }, {
    name: 'Bermuda',
    flag: '🇧🇲',
    code: 'BM',
    dial_code: '+1441'
  }, {
    name: 'Bhutan',
    flag: '🇧🇹',
    code: 'BT',
    dial_code: '+975'
  }, {
    name: 'Bolivia, Plurinational State of bolivia',
    flag: '🇧🇴',
    code: 'BO',
    dial_code: '+591'
  }, {
    name: 'Bosnia and Herzegovina',
    flag: '🇧🇦',
    code: 'BA',
    dial_code: '+387'
  }, {
    name: 'Botswana',
    flag: '🇧🇼',
    code: 'BW',
    dial_code: '+267'
  }, {
    name: 'Bouvet Island',
    flag: '🇧🇻',
    code: 'BV',
    dial_code: '+47'
  }, {
    name: 'Brazil',
    flag: '🇧🇷',
    code: 'BR',
    dial_code: '+55'
  }, {
    name: 'British Indian Ocean Territory',
    flag: '🇮🇴',
    code: 'IO',
    dial_code: '+246'
  }, {
    name: 'Brunei Darussalam',
    flag: '🇧🇳',
    code: 'BN',
    dial_code: '+673'
  }, {
    name: 'Bulgaria',
    flag: '🇧🇬',
    code: 'BG',
    dial_code: '+359'
  }, {
    name: 'Burkina Faso',
    flag: '🇧🇫',
    code: 'BF',
    dial_code: '+226'
  }, {
    name: 'Burundi',
    flag: '🇧🇮',
    code: 'BI',
    dial_code: '+257'
  }, {
    name: 'Cambodia',
    flag: '🇰🇭',
    code: 'KH',
    dial_code: '+855'
  }, {
    name: 'Cameroon',
    flag: '🇨🇲',
    code: 'CM',
    dial_code: '+237'
  }, {
    name: 'Canada',
    flag: '🇨🇦',
    code: 'CA',
    dial_code: '+1'
  }, {
    name: 'Cape Verde',
    flag: '🇨🇻',
    code: 'CV',
    dial_code: '+238'
  }, {
    name: 'Cayman Islands',
    flag: '🇰🇾',
    code: 'KY',
    dial_code: '+345'
  }, {
    name: 'Central African Republic',
    flag: '🇨🇫',
    code: 'CF',
    dial_code: '+236'
  }, {
    name: 'Chad',
    flag: '🇹🇩',
    code: 'TD',
    dial_code: '+235'
  }, {
    name: 'Chile',
    flag: '🇨🇱',
    code: 'CL',
    dial_code: '+56'
  }, {
    name: 'China',
    flag: '🇨🇳',
    code: 'CN',
    dial_code: '+86'
  }, {
    name: 'Christmas Island',
    flag: '🇨🇽',
    code: 'CX',
    dial_code: '+61'
  }, {
    name: 'Cocos (Keeling) Islands',
    flag: '🇨🇨',
    code: 'CC',
    dial_code: '+61'
  }, {
    name: 'Colombia',
    flag: '🇨🇴',
    code: 'CO',
    dial_code: '+57'
  }, {
    name: 'Comoros',
    flag: '🇰🇲',
    code: 'KM',
    dial_code: '+269'
  }, {
    name: 'Congo',
    flag: '🇨🇬',
    code: 'CG',
    dial_code: '+242'
  }, {
    name: 'Congo, The Democratic Republic of the Congo',
    flag: '🇨🇩',
    code: 'CD',
    dial_code: '+243'
  }, {
    name: 'Cook Islands',
    flag: '🇨🇰',
    code: 'CK',
    dial_code: '+682'
  }, {
    name: 'Costa Rica',
    flag: '🇨🇷',
    code: 'CR',
    dial_code: '+506'
  }, {
    name: "Cote d'Ivoire",
    flag: '🇨🇮',
    code: 'CI',
    dial_code: '+225'
  }, {
    name: 'Croatia',
    flag: '🇭🇷',
    code: 'HR',
    dial_code: '+385'
  }, {
    name: 'Cuba',
    flag: '🇨🇺',
    code: 'CU',
    dial_code: '+53'
  }, {
    name: 'Cyprus',
    flag: '🇨🇾',
    code: 'CY',
    dial_code: '+357'
  }, {
    name: 'Czech Republic',
    flag: '🇨🇿',
    code: 'CZ',
    dial_code: '+420'
  }, {
    name: 'Denmark',
    flag: '🇩🇰',
    code: 'DK',
    dial_code: '+45'
  }, {
    name: 'Djibouti',
    flag: '🇩🇯',
    code: 'DJ',
    dial_code: '+253'
  }, {
    name: 'Dominica',
    flag: '🇩🇲',
    code: 'DM',
    dial_code: '+1767'
  }, {
    name: 'Dominican Republic',
    flag: '🇩🇴',
    code: 'DO',
    dial_code: '+1849'
  }, {
    name: 'Ecuador',
    flag: '🇪🇨',
    code: 'EC',
    dial_code: '+593'
  }, {
    name: 'Egypt',
    flag: '🇪🇬',
    code: 'EG',
    dial_code: '+20'
  }, {
    name: 'El Salvador',
    flag: '🇸🇻',
    code: 'SV',
    dial_code: '+503'
  }, {
    name: 'Equatorial Guinea',
    flag: '🇬🇶',
    code: 'GQ',
    dial_code: '+240'
  }, {
    name: 'Eritrea',
    flag: '🇪🇷',
    code: 'ER',
    dial_code: '+291'
  }, {
    name: 'Estonia',
    flag: '🇪🇪',
    code: 'EE',
    dial_code: '+372'
  }, {
    name: 'Ethiopia',
    flag: '🇪🇹',
    code: 'ET',
    dial_code: '+251'
  }, {
    name: 'Falkland Islands (Malvinas)',
    flag: '🇫🇰',
    code: 'FK',
    dial_code: '+500'
  }, {
    name: 'Faroe Islands',
    flag: '🇫🇴',
    code: 'FO',
    dial_code: '+298'
  }, {
    name: 'Fiji',
    flag: '🇫🇯',
    code: 'FJ',
    dial_code: '+679'
  }, {
    name: 'Finland',
    flag: '🇫🇮',
    code: 'FI',
    dial_code: '+358'
  }, {
    name: 'France',
    flag: '🇫🇷',
    code: 'FR',
    dial_code: '+33'
  }, {
    name: 'French Guiana',
    flag: '🇬🇫',
    code: 'GF',
    dial_code: '+594'
  }, {
    name: 'French Polynesia',
    flag: '🇵🇫',
    code: 'PF',
    dial_code: '+689'
  }, {
    name: 'French Southern Territories',
    flag: '🇹🇫',
    code: 'TF',
    dial_code: '+262'
  }, {
    name: 'Gabon',
    flag: '🇬🇦',
    code: 'GA',
    dial_code: '+241'
  }, {
    name: 'Gambia',
    flag: '🇬🇲',
    code: 'GM',
    dial_code: '+220'
  }, {
    name: 'Georgia',
    flag: '🇬🇪',
    code: 'GE',
    dial_code: '+995'
  }, {
    name: 'Germany',
    flag: '🇩🇪',
    code: 'DE',
    dial_code: '+49'
  }, {
    name: 'Ghana',
    flag: '🇬🇭',
    code: 'GH',
    dial_code: '+233'
  }, {
    name: 'Gibraltar',
    flag: '🇬🇮',
    code: 'GI',
    dial_code: '+350'
  }, {
    name: 'Greece',
    flag: '🇬🇷',
    code: 'GR',
    dial_code: '+30'
  }, {
    name: 'Greenland',
    flag: '🇬🇱',
    code: 'GL',
    dial_code: '+299'
  }, {
    name: 'Grenada',
    flag: '🇬🇩',
    code: 'GD',
    dial_code: '+1473'
  }, {
    name: 'Guadeloupe',
    flag: '🇬🇵',
    code: 'GP',
    dial_code: '+590'
  }, {
    name: 'Guam',
    flag: '🇬🇺',
    code: 'GU',
    dial_code: '+1671'
  }, {
    name: 'Guatemala',
    flag: '🇬🇹',
    code: 'GT',
    dial_code: '+502'
  }, {
    name: 'Guernsey',
    flag: '🇬🇬',
    code: 'GG',
    dial_code: '+44'
  }, {
    name: 'Guinea',
    flag: '🇬🇳',
    code: 'GN',
    dial_code: '+224'
  }, {
    name: 'Guinea-Bissau',
    flag: '🇬🇼',
    code: 'GW',
    dial_code: '+245'
  }, {
    name: 'Guyana',
    flag: '🇬🇾',
    code: 'GY',
    dial_code: '+592'
  }, {
    name: 'Haiti',
    flag: '🇭🇹',
    code: 'HT',
    dial_code: '+509'
  }, {
    name: 'Heard Island and Mcdonald Islands',
    flag: '🇭🇲',
    code: 'HM',
    dial_code: '+672'
  }, {
    name: 'Holy See (Vatican City State)',
    flag: '🇻🇦',
    code: 'VA',
    dial_code: '+379'
  }, {
    name: 'Honduras',
    flag: '🇭🇳',
    code: 'HN',
    dial_code: '+504'
  }, {
    name: 'Hong Kong',
    flag: '🇭🇰',
    code: 'HK',
    dial_code: '+852'
  }, {
    name: 'Hungary',
    flag: '🇭🇺',
    code: 'HU',
    dial_code: '+36'
  }, {
    name: 'Iceland',
    flag: '🇮🇸',
    code: 'IS',
    dial_code: '+354'
  }, {
    name: 'India',
    flag: '🇮🇳',
    code: 'IN',
    dial_code: '+91'
  }, {
    name: 'Indonesia',
    flag: '🇮🇩',
    code: 'ID',
    dial_code: '+62'
  }, {
    name: 'Iran, Islamic Republic of Persian Gulf',
    flag: '🇮🇷',
    code: 'IR',
    dial_code: '+98'
  }, {
    name: 'Iraq',
    flag: '🇮🇶',
    code: 'IQ',
    dial_code: '+964'
  }, {
    name: 'Ireland',
    flag: '🇮🇪',
    code: 'IE',
    dial_code: '+353'
  }, {
    name: 'Isle of Man',
    flag: '🇮🇲',
    code: 'IM',
    dial_code: '+44'
  }, {
    name: 'Israel',
    flag: '🇮🇱',
    code: 'IL',
    dial_code: '+972'
  }, {
    name: 'Italy',
    flag: '🇮🇹',
    code: 'IT',
    dial_code: '+39'
  }, {
    name: 'Jamaica',
    flag: '🇯🇲',
    code: 'JM',
    dial_code: '+1876'
  }, {
    name: 'Japan',
    flag: '🇯🇵',
    code: 'JP',
    dial_code: '+81'
  }, {
    name: 'Jersey',
    flag: '🇯🇪',
    code: 'JE',
    dial_code: '+44'
  }, {
    name: 'Jordan',
    flag: '🇯🇴',
    code: 'JO',
    dial_code: '+962'
  }, {
    name: 'Kazakhstan',
    flag: '🇰🇿',
    code: 'KZ',
    dial_code: '+7'
  }, {
    name: 'Kenya',
    flag: '🇰🇪',
    code: 'KE',
    dial_code: '+254'
  }, {
    name: 'Kiribati',
    flag: '🇰🇮',
    code: 'KI',
    dial_code: '+686'
  }, {
    name: "Korea, Democratic People's Republic of Korea",
    flag: '🇰🇵',
    code: 'KP',
    dial_code: '+850'
  }, {
    name: 'Korea, Republic of South Korea',
    flag: '🇰🇷',
    code: 'KR',
    dial_code: '+82'
  }, {
    name: 'Kosovo',
    flag: '🇽🇰',
    code: 'XK',
    dial_code: '+383'
  }, {
    name: 'Kuwait',
    flag: '🇰🇼',
    code: 'KW',
    dial_code: '+965'
  }, {
    name: 'Kyrgyzstan',
    flag: '🇰🇬',
    code: 'KG',
    dial_code: '+996'
  }, {
    name: 'Laos',
    flag: '🇱🇦',
    code: 'LA',
    dial_code: '+856'
  }, {
    name: 'Latvia',
    flag: '🇱🇻',
    code: 'LV',
    dial_code: '+371'
  }, {
    name: 'Lebanon',
    flag: '🇱🇧',
    code: 'LB',
    dial_code: '+961'
  }, {
    name: 'Lesotho',
    flag: '🇱🇸',
    code: 'LS',
    dial_code: '+266'
  }, {
    name: 'Liberia',
    flag: '🇱🇷',
    code: 'LR',
    dial_code: '+231'
  }, {
    name: 'Libyan Arab Jamahiriya',
    flag: '🇱🇾',
    code: 'LY',
    dial_code: '+218'
  }, {
    name: 'Liechtenstein',
    flag: '🇱🇮',
    code: 'LI',
    dial_code: '+423'
  }, {
    name: 'Lithuania',
    flag: '🇱🇹',
    code: 'LT',
    dial_code: '+370'
  }, {
    name: 'Luxembourg',
    flag: '🇱🇺',
    code: 'LU',
    dial_code: '+352'
  }, {
    name: 'Macao',
    flag: '🇲🇴',
    code: 'MO',
    dial_code: '+853'
  }, {
    name: 'Macedonia',
    flag: '🇲🇰',
    code: 'MK',
    dial_code: '+389'
  }, {
    name: 'Madagascar',
    flag: '🇲🇬',
    code: 'MG',
    dial_code: '+261'
  }, {
    name: 'Malawi',
    flag: '🇲🇼',
    code: 'MW',
    dial_code: '+265'
  }, {
    name: 'Malaysia',
    flag: '🇲🇾',
    code: 'MY',
    dial_code: '+60'
  }, {
    name: 'Maldives',
    flag: '🇲🇻',
    code: 'MV',
    dial_code: '+960'
  }, {
    name: 'Mali',
    flag: '🇲🇱',
    code: 'ML',
    dial_code: '+223'
  }, {
    name: 'Malta',
    flag: '🇲🇹',
    code: 'MT',
    dial_code: '+356'
  }, {
    name: 'Marshall Islands',
    flag: '🇲🇭',
    code: 'MH',
    dial_code: '+692'
  }, {
    name: 'Martinique',
    flag: '🇲🇶',
    code: 'MQ',
    dial_code: '+596'
  }, {
    name: 'Mauritania',
    flag: '🇲🇷',
    code: 'MR',
    dial_code: '+222'
  }, {
    name: 'Mauritius',
    flag: '🇲🇺',
    code: 'MU',
    dial_code: '+230'
  }, {
    name: 'Mayotte',
    flag: '🇾🇹',
    code: 'YT',
    dial_code: '+262'
  }, {
    name: 'Mexico',
    flag: '🇲🇽',
    code: 'MX',
    dial_code: '+52'
  }, {
    name: 'Micronesia, Federated States of Micronesia',
    flag: '🇫🇲',
    code: 'FM',
    dial_code: '+691'
  }, {
    name: 'Moldova',
    flag: '🇲🇩',
    code: 'MD',
    dial_code: '+373'
  }, {
    name: 'Monaco',
    flag: '🇲🇨',
    code: 'MC',
    dial_code: '+377'
  }, {
    name: 'Mongolia',
    flag: '🇲🇳',
    code: 'MN',
    dial_code: '+976'
  }, {
    name: 'Montenegro',
    flag: '🇲🇪',
    code: 'ME',
    dial_code: '+382'
  }, {
    name: 'Montserrat',
    flag: '🇲🇸',
    code: 'MS',
    dial_code: '+1664'
  }, {
    name: 'Morocco',
    flag: '🇲🇦',
    code: 'MA',
    dial_code: '+212'
  }, {
    name: 'Mozambique',
    flag: '🇲🇿',
    code: 'MZ',
    dial_code: '+258'
  }, {
    name: 'Myanmar',
    flag: '🇲🇲',
    code: 'MM',
    dial_code: '+95'
  }, {
    name: 'Namibia',
    flag: '🇳🇦',
    code: 'NA',
    dial_code: '+264'
  }, {
    name: 'Nauru',
    flag: '🇳🇷',
    code: 'NR',
    dial_code: '+674'
  }, {
    name: 'Nepal',
    flag: '🇳🇵',
    code: 'NP',
    dial_code: '+977'
  }, {
    name: 'Netherlands',
    flag: '🇳🇱',
    code: 'NL',
    dial_code: '+31'
  }, {
    name: 'Netherlands Antilles',
    flag: '',
    code: 'AN',
    dial_code: '+599'
  }, {
    name: 'New Caledonia',
    flag: '🇳🇨',
    code: 'NC',
    dial_code: '+687'
  }, {
    name: 'New Zealand',
    flag: '🇳🇿',
    code: 'NZ',
    dial_code: '+64'
  }, {
    name: 'Nicaragua',
    flag: '🇳🇮',
    code: 'NI',
    dial_code: '+505'
  }, {
    name: 'Niger',
    flag: '🇳🇪',
    code: 'NE',
    dial_code: '+227'
  }, {
    name: 'Nigeria',
    flag: '🇳🇬',
    code: 'NG',
    dial_code: '+234'
  }, {
    name: 'Niue',
    flag: '🇳🇺',
    code: 'NU',
    dial_code: '+683'
  }, {
    name: 'Norfolk Island',
    flag: '🇳🇫',
    code: 'NF',
    dial_code: '+672'
  }, {
    name: 'Northern Mariana Islands',
    flag: '🇲🇵',
    code: 'MP',
    dial_code: '+1670'
  }, {
    name: 'Norway',
    flag: '🇳🇴',
    code: 'NO',
    dial_code: '+47'
  }, {
    name: 'Oman',
    flag: '🇴🇲',
    code: 'OM',
    dial_code: '+968'
  }, {
    name: 'Pakistan',
    flag: '🇵🇰',
    code: 'PK',
    dial_code: '+92'
  }, {
    name: 'Palau',
    flag: '🇵🇼',
    code: 'PW',
    dial_code: '+680'
  }, {
    name: 'Palestinian Territory, Occupied',
    flag: '🇵🇸',
    code: 'PS',
    dial_code: '+970'
  }, {
    name: 'Panama',
    flag: '🇵🇦',
    code: 'PA',
    dial_code: '+507'
  }, {
    name: 'Papua New Guinea',
    flag: '🇵🇬',
    code: 'PG',
    dial_code: '+675'
  }, {
    name: 'Paraguay',
    flag: '🇵🇾',
    code: 'PY',
    dial_code: '+595'
  }, {
    name: 'Peru',
    flag: '🇵🇪',
    code: 'PE',
    dial_code: '+51'
  }, {
    name: 'Philippines',
    flag: '🇵🇭',
    code: 'PH',
    dial_code: '+63'
  }, {
    name: 'Pitcairn',
    flag: '🇵🇳',
    code: 'PN',
    dial_code: '+64'
  }, {
    name: 'Poland',
    flag: '🇵🇱',
    code: 'PL',
    dial_code: '+48'
  }, {
    name: 'Portugal',
    flag: '🇵🇹',
    code: 'PT',
    dial_code: '+351'
  }, {
    name: 'Puerto Rico',
    flag: '🇵🇷',
    code: 'PR',
    dial_code: '+1939'
  }, {
    name: 'Qatar',
    flag: '🇶🇦',
    code: 'QA',
    dial_code: '+974'
  }, {
    name: 'Romania',
    flag: '🇷🇴',
    code: 'RO',
    dial_code: '+40'
  }, {
    name: 'Russia',
    flag: '🇷🇺',
    code: 'RU',
    dial_code: '+7'
  }, {
    name: 'Rwanda',
    flag: '🇷🇼',
    code: 'RW',
    dial_code: '+250'
  }, {
    name: 'Reunion',
    flag: '🇷🇪',
    code: 'RE',
    dial_code: '+262'
  }, {
    name: 'Saint Barthelemy',
    flag: '🇧🇱',
    code: 'BL',
    dial_code: '+590'
  }, {
    name: 'Saint Helena, Ascension and Tristan Da Cunha',
    flag: '🇸🇭',
    code: 'SH',
    dial_code: '+290'
  }, {
    name: 'Saint Kitts and Nevis',
    flag: '🇰🇳',
    code: 'KN',
    dial_code: '+1869'
  }, {
    name: 'Saint Lucia',
    flag: '🇱🇨',
    code: 'LC',
    dial_code: '+1758'
  }, {
    name: 'Saint Martin',
    flag: '🇲🇫',
    code: 'MF',
    dial_code: '+590'
  }, {
    name: 'Saint Pierre and Miquelon',
    flag: '🇵🇲',
    code: 'PM',
    dial_code: '+508'
  }, {
    name: 'Saint Vincent and the Grenadines',
    flag: '🇻🇨',
    code: 'VC',
    dial_code: '+1784'
  }, {
    name: 'Samoa',
    flag: '🇼🇸',
    code: 'WS',
    dial_code: '+685'
  }, {
    name: 'San Marino',
    flag: '🇸🇲',
    code: 'SM',
    dial_code: '+378'
  }, {
    name: 'Sao Tome and Principe',
    flag: '🇸🇹',
    code: 'ST',
    dial_code: '+239'
  }, {
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    code: 'SA',
    dial_code: '+966'
  }, {
    name: 'Senegal',
    flag: '🇸🇳',
    code: 'SN',
    dial_code: '+221'
  }, {
    name: 'Serbia',
    flag: '🇷🇸',
    code: 'RS',
    dial_code: '+381'
  }, {
    name: 'Seychelles',
    flag: '🇸🇨',
    code: 'SC',
    dial_code: '+248'
  }, {
    name: 'Sierra Leone',
    flag: '🇸🇱',
    code: 'SL',
    dial_code: '+232'
  }, {
    name: 'Singapore',
    flag: '🇸🇬',
    code: 'SG',
    dial_code: '+65'
  }, {
    name: 'Slovakia',
    flag: '🇸🇰',
    code: 'SK',
    dial_code: '+421'
  }, {
    name: 'Slovenia',
    flag: '🇸🇮',
    code: 'SI',
    dial_code: '+386'
  }, {
    name: 'Solomon Islands',
    flag: '🇸🇧',
    code: 'SB',
    dial_code: '+677'
  }, {
    name: 'Somalia',
    flag: '🇸🇴',
    code: 'SO',
    dial_code: '+252'
  }, {
    name: 'South Africa',
    flag: '🇿🇦',
    code: 'ZA',
    dial_code: '+27'
  }, {
    name: 'South Sudan',
    flag: '🇸🇸',
    code: 'SS',
    dial_code: '+211'
  }, {
    name: 'South Georgia and the South Sandwich Islands',
    flag: '🇬🇸',
    code: 'GS',
    dial_code: '+500'
  }, {
    name: 'Spain',
    flag: '🇪🇸',
    code: 'ES',
    dial_code: '+34'
  }, {
    name: 'Sri Lanka',
    flag: '🇱🇰',
    code: 'LK',
    dial_code: '+94'
  }, {
    name: 'Sudan',
    flag: '🇸🇩',
    code: 'SD',
    dial_code: '+249'
  }, {
    name: 'Suriname',
    flag: '🇸🇷',
    code: 'SR',
    dial_code: '+597'
  }, {
    name: 'Svalbard and Jan Mayen',
    flag: '🇸🇯',
    code: 'SJ',
    dial_code: '+47'
  }, {
    name: 'Swaziland',
    flag: '🇸🇿',
    code: 'SZ',
    dial_code: '+268'
  }, {
    name: 'Sweden',
    flag: '🇸🇪',
    code: 'SE',
    dial_code: '+46'
  }, {
    name: 'Switzerland',
    flag: '🇨🇭',
    code: 'CH',
    dial_code: '+41'
  }, {
    name: 'Syrian Arab Republic',
    flag: '🇸🇾',
    code: 'SY',
    dial_code: '+963'
  }, {
    name: 'Taiwan',
    flag: '🇹🇼',
    code: 'TW',
    dial_code: '+886'
  }, {
    name: 'Tajikistan',
    flag: '🇹🇯',
    code: 'TJ',
    dial_code: '+992'
  }, {
    name: 'Tanzania, United Republic of Tanzania',
    flag: '🇹🇿',
    code: 'TZ',
    dial_code: '+255'
  }, {
    name: 'Thailand',
    flag: '🇹🇭',
    code: 'TH',
    dial_code: '+66'
  }, {
    name: 'Timor-Leste',
    flag: '🇹🇱',
    code: 'TL',
    dial_code: '+670'
  }, {
    name: 'Togo',
    flag: '🇹🇬',
    code: 'TG',
    dial_code: '+228'
  }, {
    name: 'Tokelau',
    flag: '🇹🇰',
    code: 'TK',
    dial_code: '+690'
  }, {
    name: 'Tonga',
    flag: '🇹🇴',
    code: 'TO',
    dial_code: '+676'
  }, {
    name: 'Trinidad and Tobago',
    flag: '🇹🇹',
    code: 'TT',
    dial_code: '+1868'
  }, {
    name: 'Tunisia',
    flag: '🇹🇳',
    code: 'TN',
    dial_code: '+216'
  }, {
    name: 'Turkey',
    flag: '🇹🇷',
    code: 'TR',
    dial_code: '+90'
  }, {
    name: 'Turkmenistan',
    flag: '🇹🇲',
    code: 'TM',
    dial_code: '+993'
  }, {
    name: 'Turks and Caicos Islands',
    flag: '🇹🇨',
    code: 'TC',
    dial_code: '+1649'
  }, {
    name: 'Tuvalu',
    flag: '🇹🇻',
    code: 'TV',
    dial_code: '+688'
  }, {
    name: 'Uganda',
    flag: '🇺🇬',
    code: 'UG',
    dial_code: '+256'
  }, {
    name: 'Ukraine',
    flag: '🇺🇦',
    code: 'UA',
    dial_code: '+380'
  }, {
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    code: 'AE',
    dial_code: '+971'
  }, {
    name: 'United Kingdom',
    flag: '🇬🇧',
    code: 'GB',
    dial_code: '+44'
  }, {
    name: 'United States',
    flag: '🇺🇸',
    code: 'US',
    dial_code: '+1'
  }, {
    name: 'Uruguay',
    flag: '🇺🇾',
    code: 'UY',
    dial_code: '+598'
  }, {
    name: 'Uzbekistan',
    flag: '🇺🇿',
    code: 'UZ',
    dial_code: '+998'
  }, {
    name: 'Vanuatu',
    flag: '🇻🇺',
    code: 'VU',
    dial_code: '+678'
  }, {
    name: 'Venezuela, Bolivarian Republic of Venezuela',
    flag: '🇻🇪',
    code: 'VE',
    dial_code: '+58'
  }, {
    name: 'Vietnam',
    flag: '🇻🇳',
    code: 'VN',
    dial_code: '+84'
  }, {
    name: 'Virgin Islands, British',
    flag: '🇻🇬',
    code: 'VG',
    dial_code: '+1284'
  }, {
    name: 'Virgin Islands, U.S.',
    flag: '🇻🇮',
    code: 'VI',
    dial_code: '+1340'
  }, {
    name: 'Wallis and Futuna',
    flag: '🇼🇫',
    code: 'WF',
    dial_code: '+681'
  }, {
    name: 'Yemen',
    flag: '🇾🇪',
    code: 'YE',
    dial_code: '+967'
  }, {
    name: 'Zambia',
    flag: '🇿🇲',
    code: 'ZM',
    dial_code: '+260'
  }, {
    name: 'Zimbabwe',
    flag: '🇿🇼',
    code: 'ZW',
    dial_code: '+263'
  }];
  
  const _tmpl$$q = /*#__PURE__*/template(`<div class="flex items-end justify-between pr-2 agent-input" data-testid="input"><div class="flex"><div class="relative agent-country-select flex justify-center items-center"><div class="pl-2 pr-1 flex items-center gap-2"><span></span></div><select class="absolute top-0 left-0 w-full h-full cursor-pointer opacity-0">`),
    _tmpl$2$f = /*#__PURE__*/template(`<option> `);
  const PhoneInput = props => {
    const [selectedCountryCode, setSelectedCountryCode] = createSignal(isEmpty(props.defaultCountryCode) ? 'INT' : props.defaultCountryCode);
    const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '');
    let inputRef;
    const handleInput = inputValue => {
      setInputValue(inputValue);
      if ((inputValue === '' || inputValue === '+') && selectedCountryCode() !== 'INT') setSelectedCountryCode('INT');
      const matchedCountry = inputValue?.startsWith('+') && inputValue.length > 2 && phoneCountries.reduce((matchedCountry, country) => {
        if (!country?.dial_code || matchedCountry !== null && !matchedCountry.dial_code) {
          return matchedCountry;
        }
        if (inputValue?.startsWith(country.dial_code) && country.dial_code.length > (matchedCountry?.dial_code.length ?? 0)) {
          return country;
        }
        return matchedCountry;
      }, null);
      if (matchedCountry) setSelectedCountryCode(matchedCountry.code);
    };
    const checkIfInputIsValid = () => inputValue() !== '' && inputRef?.reportValidity();
    const submit = () => {
      const selectedCountryDialCode = phoneCountries.find(country => country.code === selectedCountryCode())?.dial_code;
      if (checkIfInputIsValid()) props.onSubmit({
        value: inputValue().startsWith('+') ? inputValue() : `${selectedCountryDialCode ?? ''}${inputValue()}`
      });
    };
    const submitWhenEnter = e => {
      if (e.key === 'Enter') submit();
    };
    const selectNewCountryCode = event => {
      const code = event.currentTarget.value;
      setSelectedCountryCode(code);
      const dial_code = phoneCountries.find(country => country.code === code)?.dial_code;
      if (inputValue() === '' && dial_code) setInputValue(dial_code);
      inputRef?.focus();
    };
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
      window.addEventListener('message', processIncomingEvent);
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'setInputValue') setInputValue(data.value);
    };
    return (() => {
      const _el$ = _tmpl$$q(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$4.nextSibling;
      _el$.$$keydown = submitWhenEnter;
      _el$.style.setProperty("max-width", "400px");
      insert(_el$5, () => phoneCountries.find(country => selectedCountryCode() === country.code)?.flag);
      insert(_el$4, createComponent(ChevronDownIcon, {
        "class": "w-3"
      }), null);
      _el$6.addEventListener("change", selectNewCountryCode);
      insert(_el$6, createComponent(For, {
        each: phoneCountries,
        children: country => (() => {
          const _el$7 = _tmpl$2$f(),
            _el$8 = _el$7.firstChild;
          insert(_el$7, () => country.name, _el$8);
          insert(_el$7, () => country.dial_code ? `(${country.dial_code})` : '', null);
          createRenderEffect(() => _el$7.selected = country.code === selectedCountryCode());
          createRenderEffect(() => _el$7.value = country.code);
          return _el$7;
        })()
      }));
      insert(_el$2, createComponent(ShortTextInput, {
        type: "tel",
        ref(r$) {
          const _ref$ = inputRef;
          typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
        },
        get value() {
          return inputValue();
        },
        onInput: handleInput,
        get placeholder() {
          return props.labels.placeholder ?? 'Your phone number...';
        },
        get autofocus() {
          return !isMobile();
        }
      }), null);
      insert(_el$, createComponent(SendButton, {
        type: "button",
        get isDisabled() {
          return inputValue() === '';
        },
        "class": "my-2 ml-2",
        "on:click": submit,
        get children() {
          return props.labels?.button ?? 'Send';
        }
      }), null);
      return _el$;
    })();
  };
  delegateEvents(["keydown"]);
  
  const parseReadableDate = ({
    from,
    to,
    hasTime,
    isRange
  }) => {
    const currentLocale = window.navigator.language;
    const formatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: hasTime ? '2-digit' : undefined,
      minute: hasTime ? '2-digit' : undefined
    };
    const fromReadable = new Date(hasTime ? from : from.replace(/-/g, '/')).toLocaleString(currentLocale, formatOptions);
    const toReadable = new Date(hasTime ? to : to.replace(/-/g, '/')).toLocaleString(currentLocale, formatOptions);
    return `${fromReadable}${isRange ? ` to ${toReadable}` : ''}`;
  };
  
  const _tmpl$$p = /*#__PURE__*/template(`<div class="flex flex-col"><div class="flex items-center"><form class="flex justify-between agent-input pr-2 items-end"><div class="flex flex-col"><div><input class="focus:outline-none flex-1 w-full text-input agent-date-input" data-testid="from-date">`),
    _tmpl$2$e = /*#__PURE__*/template(`<p class="font-semibold">`),
    _tmpl$3$7 = /*#__PURE__*/template(`<div class="flex items-center p-4"><input class="focus:outline-none flex-1 w-full text-input ml-2 agent-date-input" data-testid="to-date">`);
  const DateForm = props => {
    const [inputValues, setInputValues] = createSignal(parseDefaultValue(props.defaultValue ?? ''));
    return (() => {
      const _el$ = _tmpl$$p(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.firstChild,
        _el$6 = _el$5.firstChild;
      _el$3.addEventListener("submit", e => {
        if (inputValues().from === '' && inputValues().to === '') return;
        e.preventDefault();
        props.onSubmit({
          value: parseReadableDate({
            ...inputValues(),
            hasTime: props.options?.hasTime,
            isRange: props.options?.isRange
          })
        });
      });
      insert(_el$5, (() => {
        const _c$ = createMemo(() => !!props.options?.isRange);
        return () => _c$() && (() => {
          const _el$7 = _tmpl$2$e();
          insert(_el$7, () => props.options.labels?.from ?? 'From:');
          return _el$7;
        })();
      })(), _el$6);
      _el$6.addEventListener("change", e => setInputValues({
        ...inputValues(),
        from: e.currentTarget.value
      }));
      _el$6.style.setProperty("min-height", "32px");
      _el$6.style.setProperty("min-width", "100px");
      _el$6.style.setProperty("font-size", "16px");
      insert(_el$4, (() => {
        const _c$2 = createMemo(() => !!props.options?.isRange);
        return () => _c$2() && (() => {
          const _el$8 = _tmpl$3$7(),
            _el$9 = _el$8.firstChild;
          insert(_el$8, (() => {
            const _c$3 = createMemo(() => !!props.options.isRange);
            return () => _c$3() && (() => {
              const _el$10 = _tmpl$2$e();
              insert(_el$10, () => props.options.labels?.to ?? 'To:');
              return _el$10;
            })();
          })(), _el$9);
          _el$9.addEventListener("change", e => setInputValues({
            ...inputValues(),
            to: e.currentTarget.value
          }));
          _el$9.style.setProperty("min-height", "32px");
          _el$9.style.setProperty("min-width", "100px");
          _el$9.style.setProperty("font-size", "16px");
          createRenderEffect(() => setAttribute(_el$9, "type", props.options.hasTime ? 'datetime-local' : 'date'));
          createRenderEffect(() => _el$9.value = inputValues().to);
          return _el$8;
        })();
      })(), null);
      insert(_el$3, createComponent(SendButton, {
        get isDisabled() {
          return createMemo(() => inputValues().to === '')() && inputValues().from === '';
        },
        "class": "my-2 ml-2",
        get children() {
          return props.options?.labels?.button ?? 'Send';
        }
      }), null);
      createRenderEffect(_p$ => {
        const _v$ = 'flex items-center p-4 ' + (props.options?.isRange ? 'pb-0 gap-2' : ''),
          _v$2 = props.options?.hasTime ? 'datetime-local' : 'date';
        _v$ !== _p$._v$ && className(_el$5, _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && setAttribute(_el$6, "type", _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });
      createRenderEffect(() => _el$6.value = inputValues().from);
      return _el$;
    })();
  };
  const parseDefaultValue = defaultValue => {
    if (!defaultValue.includes('to')) return {
      from: defaultValue,
      to: ''
    };
    const [from, to] = defaultValue.split(' to ');
    return {
      from,
      to
    };
  };
  
  const _tmpl$$o = /*#__PURE__*/template(`<form class="flex flex-col gap-2"><div class="flex flex-wrap justify-center gap-2"></div><div class="flex justify-end">`),
    _tmpl$2$d = /*#__PURE__*/template(`<span class="text-sm w-full rating-label">`),
    _tmpl$3$6 = /*#__PURE__*/template(`<span class="text-sm w-full text-right pr-2 rating-label">`),
    _tmpl$4$4 = /*#__PURE__*/template(`<div>`);
  const RatingForm = props => {
    const [rating, setRating] = createSignal(props.defaultValue ? Number(props.defaultValue) : undefined);
    const handleSubmit = e => {
      e.preventDefault();
      const selectedRating = rating();
      if (isNotDefined(selectedRating)) return;
      props.onSubmit({
        value: selectedRating.toString()
      });
    };
    const handleClick = rating => {
      if (props.block.options.isOneClickSubmitEnabled) props.onSubmit({
        value: rating.toString()
      });
      setRating(rating);
    };
    return (() => {
      const _el$ = _tmpl$$o(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;
      _el$.addEventListener("submit", handleSubmit);
      insert(_el$, (() => {
        const _c$ = createMemo(() => !!props.block.options.labels.left);
        return () => _c$() && (() => {
          const _el$4 = _tmpl$2$d();
          insert(_el$4, () => props.block.options.labels.left);
          return _el$4;
        })();
      })(), _el$2);
      insert(_el$2, createComponent(For, {
        get each() {
          return Array.from(Array(props.block.options.length + (props.block.options.buttonType === 'Numbers' ? 1 : 0)));
        },
        children: (_, idx) => createComponent(RatingButton, mergeProps(() => props.block.options, {
          get rating() {
            return rating();
          },
          get idx() {
            return idx() + (props.block.options.buttonType === 'Numbers' ? 0 : 1);
          },
          onClick: handleClick
        }))
      }));
      insert(_el$, (() => {
        const _c$2 = createMemo(() => !!props.block.options.labels.right);
        return () => _c$2() && (() => {
          const _el$5 = _tmpl$3$6();
          insert(_el$5, () => props.block.options.labels.right);
          return _el$5;
        })();
      })(), _el$3);
      insert(_el$3, (() => {
        const _c$3 = createMemo(() => !!isDefined(rating()));
        return () => _c$3() && createComponent(SendButton, {
          disableIcon: true,
          get children() {
            return props.block.options?.labels?.button ?? 'Send';
          }
        });
      })());
      return _el$;
    })();
  };
  const RatingButton = props => {
    const handleClick = e => {
      e.preventDefault();
      props.onClick(props.idx);
    };
    return createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return props.buttonType === 'Numbers';
          },
          get children() {
            return createComponent(Button, {
              "on:click": handleClick,
              get ["class"]() {
                return props.isOneClickSubmitEnabled || isDefined(props.rating) && props.idx <= props.rating ? '' : 'selectable';
              },
              get children() {
                return props.idx;
              }
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.buttonType !== 'Numbers';
          },
          get children() {
            const _el$6 = _tmpl$4$4();
            _el$6.addEventListener("click", () => props.onClick(props.idx));
            createRenderEffect(_p$ => {
              const _v$ = 'flex justify-center items-center rating-icon-container cursor-pointer ' + (isDefined(props.rating) && props.idx <= props.rating ? 'selected' : ''),
                _v$2 = props.customIcon.isEnabled && !isEmpty(props.customIcon.svg) ? props.customIcon.svg : defaultIcon;
              _v$ !== _p$._v$ && className(_el$6, _p$._v$ = _v$);
              _v$2 !== _p$._v$2 && (_el$6.innerHTML = _p$._v$2 = _v$2);
              return _p$;
            }, {
              _v$: undefined,
              _v$2: undefined
            });
            return _el$6;
          }
        })];
      }
    });
  };
  const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  
  var util;
  (function (util) {
      util.assertEqual = (val) => val;
      function assertIs(_arg) { }
      util.assertIs = assertIs;
      function assertNever(_x) {
          throw new Error();
      }
      util.assertNever = assertNever;
      util.arrayToEnum = (items) => {
          const obj = {};
          for (const item of items) {
              obj[item] = item;
          }
          return obj;
      };
      util.getValidEnumValues = (obj) => {
          const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
          const filtered = {};
          for (const k of validKeys) {
              filtered[k] = obj[k];
          }
          return util.objectValues(filtered);
      };
      util.objectValues = (obj) => {
          return util.objectKeys(obj).map(function (e) {
              return obj[e];
          });
      };
      util.objectKeys = typeof Object.keys === "function" // eslint-disable-line ban/ban
          ? (obj) => Object.keys(obj) // eslint-disable-line ban/ban
          : (object) => {
              const keys = [];
              for (const key in object) {
                  if (Object.prototype.hasOwnProperty.call(object, key)) {
                      keys.push(key);
                  }
              }
              return keys;
          };
      util.find = (arr, checker) => {
          for (const item of arr) {
              if (checker(item))
                  return item;
          }
          return undefined;
      };
      util.isInteger = typeof Number.isInteger === "function"
          ? (val) => Number.isInteger(val) // eslint-disable-line ban/ban
          : (val) => typeof val === "number" && isFinite(val) && Math.floor(val) === val;
      function joinValues(array, separator = " | ") {
          return array
              .map((val) => (typeof val === "string" ? `'${val}'` : val))
              .join(separator);
      }
      util.joinValues = joinValues;
      util.jsonStringifyReplacer = (_, value) => {
          if (typeof value === "bigint") {
              return value.toString();
          }
          return value;
      };
  })(util || (util = {}));
  var objectUtil;
  (function (objectUtil) {
      objectUtil.mergeShapes = (first, second) => {
          return {
              ...first,
              ...second, // second overwrites first
          };
      };
  })(objectUtil || (objectUtil = {}));
  const ZodParsedType = util.arrayToEnum([
      "string",
      "nan",
      "number",
      "integer",
      "float",
      "boolean",
      "date",
      "bigint",
      "symbol",
      "function",
      "undefined",
      "null",
      "array",
      "object",
      "unknown",
      "promise",
      "void",
      "never",
      "map",
      "set",
  ]);
  const getParsedType = (data) => {
      const t = typeof data;
      switch (t) {
          case "undefined":
              return ZodParsedType.undefined;
          case "string":
              return ZodParsedType.string;
          case "number":
              return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
          case "boolean":
              return ZodParsedType.boolean;
          case "function":
              return ZodParsedType.function;
          case "bigint":
              return ZodParsedType.bigint;
          case "symbol":
              return ZodParsedType.symbol;
          case "object":
              if (Array.isArray(data)) {
                  return ZodParsedType.array;
              }
              if (data === null) {
                  return ZodParsedType.null;
              }
              if (data.then &&
                  typeof data.then === "function" &&
                  data.catch &&
                  typeof data.catch === "function") {
                  return ZodParsedType.promise;
              }
              if (typeof Map !== "undefined" && data instanceof Map) {
                  return ZodParsedType.map;
              }
              if (typeof Set !== "undefined" && data instanceof Set) {
                  return ZodParsedType.set;
              }
              if (typeof Date !== "undefined" && data instanceof Date) {
                  return ZodParsedType.date;
              }
              return ZodParsedType.object;
          default:
              return ZodParsedType.unknown;
      }
  };
  
  const ZodIssueCode = util.arrayToEnum([
      "invalid_type",
      "invalid_literal",
      "custom",
      "invalid_union",
      "invalid_union_discriminator",
      "invalid_enum_value",
      "unrecognized_keys",
      "invalid_arguments",
      "invalid_return_type",
      "invalid_date",
      "invalid_string",
      "too_small",
      "too_big",
      "invalid_intersection_types",
      "not_multiple_of",
      "not_finite",
  ]);
  const quotelessJson = (obj) => {
      const json = JSON.stringify(obj, null, 2);
      return json.replace(/"([^"]+)":/g, "$1:");
  };
  class ZodError extends Error {
      constructor(issues) {
          super();
          this.issues = [];
          this.addIssue = (sub) => {
              this.issues = [...this.issues, sub];
          };
          this.addIssues = (subs = []) => {
              this.issues = [...this.issues, ...subs];
          };
          const actualProto = new.target.prototype;
          if (Object.setPrototypeOf) {
              // eslint-disable-next-line ban/ban
              Object.setPrototypeOf(this, actualProto);
          }
          else {
              this.__proto__ = actualProto;
          }
          this.name = "ZodError";
          this.issues = issues;
      }
      get errors() {
          return this.issues;
      }
      format(_mapper) {
          const mapper = _mapper ||
              function (issue) {
                  return issue.message;
              };
          const fieldErrors = { _errors: [] };
          const processError = (error) => {
              for (const issue of error.issues) {
                  if (issue.code === "invalid_union") {
                      issue.unionErrors.map(processError);
                  }
                  else if (issue.code === "invalid_return_type") {
                      processError(issue.returnTypeError);
                  }
                  else if (issue.code === "invalid_arguments") {
                      processError(issue.argumentsError);
                  }
                  else if (issue.path.length === 0) {
                      fieldErrors._errors.push(mapper(issue));
                  }
                  else {
                      let curr = fieldErrors;
                      let i = 0;
                      while (i < issue.path.length) {
                          const el = issue.path[i];
                          const terminal = i === issue.path.length - 1;
                          if (!terminal) {
                              curr[el] = curr[el] || { _errors: [] };
                              // if (typeof el === "string") {
                              //   curr[el] = curr[el] || { _errors: [] };
                              // } else if (typeof el === "number") {
                              //   const errorArray: any = [];
                              //   errorArray._errors = [];
                              //   curr[el] = curr[el] || errorArray;
                              // }
                          }
                          else {
                              curr[el] = curr[el] || { _errors: [] };
                              curr[el]._errors.push(mapper(issue));
                          }
                          curr = curr[el];
                          i++;
                      }
                  }
              }
          };
          processError(this);
          return fieldErrors;
      }
      toString() {
          return this.message;
      }
      get message() {
          return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
      }
      get isEmpty() {
          return this.issues.length === 0;
      }
      flatten(mapper = (issue) => issue.message) {
          const fieldErrors = {};
          const formErrors = [];
          for (const sub of this.issues) {
              if (sub.path.length > 0) {
                  fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
                  fieldErrors[sub.path[0]].push(mapper(sub));
              }
              else {
                  formErrors.push(mapper(sub));
              }
          }
          return { formErrors, fieldErrors };
      }
      get formErrors() {
          return this.flatten();
      }
  }
  ZodError.create = (issues) => {
      const error = new ZodError(issues);
      return error;
  };
  
  const errorMap = (issue, _ctx) => {
      let message;
      switch (issue.code) {
          case ZodIssueCode.invalid_type:
              if (issue.received === ZodParsedType.undefined) {
                  message = "Required";
              }
              else {
                  message = `Expected ${issue.expected}, received ${issue.received}`;
              }
              break;
          case ZodIssueCode.invalid_literal:
              message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
              break;
          case ZodIssueCode.unrecognized_keys:
              message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
              break;
          case ZodIssueCode.invalid_union:
              message = `Invalid input`;
              break;
          case ZodIssueCode.invalid_union_discriminator:
              message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
              break;
          case ZodIssueCode.invalid_enum_value:
              message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
              break;
          case ZodIssueCode.invalid_arguments:
              message = `Invalid function arguments`;
              break;
          case ZodIssueCode.invalid_return_type:
              message = `Invalid function return type`;
              break;
          case ZodIssueCode.invalid_date:
              message = `Invalid date`;
              break;
          case ZodIssueCode.invalid_string:
              if (typeof issue.validation === "object") {
                  if ("includes" in issue.validation) {
                      message = `Invalid input: must include "${issue.validation.includes}"`;
                      if (typeof issue.validation.position === "number") {
                          message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
                      }
                  }
                  else if ("startsWith" in issue.validation) {
                      message = `Invalid input: must start with "${issue.validation.startsWith}"`;
                  }
                  else if ("endsWith" in issue.validation) {
                      message = `Invalid input: must end with "${issue.validation.endsWith}"`;
                  }
                  else {
                      util.assertNever(issue.validation);
                  }
              }
              else if (issue.validation !== "regex") {
                  message = `Invalid ${issue.validation}`;
              }
              else {
                  message = "Invalid";
              }
              break;
          case ZodIssueCode.too_small:
              if (issue.type === "array")
                  message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
              else if (issue.type === "string")
                  message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
              else if (issue.type === "number")
                  message = `Number must be ${issue.exact
                      ? `exactly equal to `
                      : issue.inclusive
                          ? `greater than or equal to `
                          : `greater than `}${issue.minimum}`;
              else if (issue.type === "date")
                  message = `Date must be ${issue.exact
                      ? `exactly equal to `
                      : issue.inclusive
                          ? `greater than or equal to `
                          : `greater than `}${new Date(Number(issue.minimum))}`;
              else
                  message = "Invalid input";
              break;
          case ZodIssueCode.too_big:
              if (issue.type === "array")
                  message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
              else if (issue.type === "string")
                  message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
              else if (issue.type === "number")
                  message = `Number must be ${issue.exact
                      ? `exactly`
                      : issue.inclusive
                          ? `less than or equal to`
                          : `less than`} ${issue.maximum}`;
              else if (issue.type === "bigint")
                  message = `BigInt must be ${issue.exact
                      ? `exactly`
                      : issue.inclusive
                          ? `less than or equal to`
                          : `less than`} ${issue.maximum}`;
              else if (issue.type === "date")
                  message = `Date must be ${issue.exact
                      ? `exactly`
                      : issue.inclusive
                          ? `smaller than or equal to`
                          : `smaller than`} ${new Date(Number(issue.maximum))}`;
              else
                  message = "Invalid input";
              break;
          case ZodIssueCode.custom:
              message = `Invalid input`;
              break;
          case ZodIssueCode.invalid_intersection_types:
              message = `Intersection results could not be merged`;
              break;
          case ZodIssueCode.not_multiple_of:
              message = `Number must be a multiple of ${issue.multipleOf}`;
              break;
          case ZodIssueCode.not_finite:
              message = "Number must be finite";
              break;
          default:
              message = _ctx.defaultError;
              util.assertNever(issue);
      }
      return { message };
  };
  
  let overrideErrorMap = errorMap;
  function setErrorMap(map) {
      overrideErrorMap = map;
  }
  function getErrorMap() {
      return overrideErrorMap;
  }
  
  const makeIssue = (params) => {
      const { data, path, errorMaps, issueData } = params;
      const fullPath = [...path, ...(issueData.path || [])];
      const fullIssue = {
          ...issueData,
          path: fullPath,
      };
      let errorMessage = "";
      const maps = errorMaps
          .filter((m) => !!m)
          .slice()
          .reverse();
      for (const map of maps) {
          errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
      }
      return {
          ...issueData,
          path: fullPath,
          message: issueData.message || errorMessage,
      };
  };
  const EMPTY_PATH = [];
  function addIssueToContext(ctx, issueData) {
      const issue = makeIssue({
          issueData: issueData,
          data: ctx.data,
          path: ctx.path,
          errorMaps: [
              ctx.common.contextualErrorMap,
              ctx.schemaErrorMap,
              getErrorMap(),
              errorMap, // then global default map
          ].filter((x) => !!x),
      });
      ctx.common.issues.push(issue);
  }
  class ParseStatus {
      constructor() {
          this.value = "valid";
      }
      dirty() {
          if (this.value === "valid")
              this.value = "dirty";
      }
      abort() {
          if (this.value !== "aborted")
              this.value = "aborted";
      }
      static mergeArray(status, results) {
          const arrayValue = [];
          for (const s of results) {
              if (s.status === "aborted")
                  return INVALID;
              if (s.status === "dirty")
                  status.dirty();
              arrayValue.push(s.value);
          }
          return { status: status.value, value: arrayValue };
      }
      static async mergeObjectAsync(status, pairs) {
          const syncPairs = [];
          for (const pair of pairs) {
              syncPairs.push({
                  key: await pair.key,
                  value: await pair.value,
              });
          }
          return ParseStatus.mergeObjectSync(status, syncPairs);
      }
      static mergeObjectSync(status, pairs) {
          const finalObject = {};
          for (const pair of pairs) {
              const { key, value } = pair;
              if (key.status === "aborted")
                  return INVALID;
              if (value.status === "aborted")
                  return INVALID;
              if (key.status === "dirty")
                  status.dirty();
              if (value.status === "dirty")
                  status.dirty();
              if (key.value !== "__proto__" &&
                  (typeof value.value !== "undefined" || pair.alwaysSet)) {
                  finalObject[key.value] = value.value;
              }
          }
          return { status: status.value, value: finalObject };
      }
  }
  const INVALID = Object.freeze({
      status: "aborted",
  });
  const DIRTY = (value) => ({ status: "dirty", value });
  const OK = (value) => ({ status: "valid", value });
  const isAborted = (x) => x.status === "aborted";
  const isDirty = (x) => x.status === "dirty";
  const isValid = (x) => x.status === "valid";
  const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
  
  var errorUtil;
  (function (errorUtil) {
      errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
      errorUtil.toString = (message) => typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
  })(errorUtil || (errorUtil = {}));
  
  class ParseInputLazyPath {
      constructor(parent, value, path, key) {
          this._cachedPath = [];
          this.parent = parent;
          this.data = value;
          this._path = path;
          this._key = key;
      }
      get path() {
          if (!this._cachedPath.length) {
              if (this._key instanceof Array) {
                  this._cachedPath.push(...this._path, ...this._key);
              }
              else {
                  this._cachedPath.push(...this._path, this._key);
              }
          }
          return this._cachedPath;
      }
  }
  const handleResult = (ctx, result) => {
      if (isValid(result)) {
          return { success: true, data: result.value };
      }
      else {
          if (!ctx.common.issues.length) {
              throw new Error("Validation failed but no issues detected.");
          }
          return {
              success: false,
              get error() {
                  if (this._error)
                      return this._error;
                  const error = new ZodError(ctx.common.issues);
                  this._error = error;
                  return this._error;
              },
          };
      }
  };
  function processCreateParams(params) {
      if (!params)
          return {};
      const { errorMap, invalid_type_error, required_error, description } = params;
      if (errorMap && (invalid_type_error || required_error)) {
          throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
      }
      if (errorMap)
          return { errorMap: errorMap, description };
      const customMap = (iss, ctx) => {
          if (iss.code !== "invalid_type")
              return { message: ctx.defaultError };
          if (typeof ctx.data === "undefined") {
              return { message: required_error !== null && required_error !== void 0 ? required_error : ctx.defaultError };
          }
          return { message: invalid_type_error !== null && invalid_type_error !== void 0 ? invalid_type_error : ctx.defaultError };
      };
      return { errorMap: customMap, description };
  }
  class ZodType {
      constructor(def) {
          /** Alias of safeParseAsync */
          this.spa = this.safeParseAsync;
          this._def = def;
          this.parse = this.parse.bind(this);
          this.safeParse = this.safeParse.bind(this);
          this.parseAsync = this.parseAsync.bind(this);
          this.safeParseAsync = this.safeParseAsync.bind(this);
          this.spa = this.spa.bind(this);
          this.refine = this.refine.bind(this);
          this.refinement = this.refinement.bind(this);
          this.superRefine = this.superRefine.bind(this);
          this.optional = this.optional.bind(this);
          this.nullable = this.nullable.bind(this);
          this.nullish = this.nullish.bind(this);
          this.array = this.array.bind(this);
          this.promise = this.promise.bind(this);
          this.or = this.or.bind(this);
          this.and = this.and.bind(this);
          this.transform = this.transform.bind(this);
          this.brand = this.brand.bind(this);
          this.default = this.default.bind(this);
          this.catch = this.catch.bind(this);
          this.describe = this.describe.bind(this);
          this.pipe = this.pipe.bind(this);
          this.readonly = this.readonly.bind(this);
          this.isNullable = this.isNullable.bind(this);
          this.isOptional = this.isOptional.bind(this);
      }
      get description() {
          return this._def.description;
      }
      _getType(input) {
          return getParsedType(input.data);
      }
      _getOrReturnCtx(input, ctx) {
          return (ctx || {
              common: input.parent.common,
              data: input.data,
              parsedType: getParsedType(input.data),
              schemaErrorMap: this._def.errorMap,
              path: input.path,
              parent: input.parent,
          });
      }
      _processInputParams(input) {
          return {
              status: new ParseStatus(),
              ctx: {
                  common: input.parent.common,
                  data: input.data,
                  parsedType: getParsedType(input.data),
                  schemaErrorMap: this._def.errorMap,
                  path: input.path,
                  parent: input.parent,
              },
          };
      }
      _parseSync(input) {
          const result = this._parse(input);
          if (isAsync(result)) {
              throw new Error("Synchronous parse encountered promise.");
          }
          return result;
      }
      _parseAsync(input) {
          const result = this._parse(input);
          return Promise.resolve(result);
      }
      parse(data, params) {
          const result = this.safeParse(data, params);
          if (result.success)
              return result.data;
          throw result.error;
      }
      safeParse(data, params) {
          var _a;
          const ctx = {
              common: {
                  issues: [],
                  async: (_a = params === null || params === void 0 ? void 0 : params.async) !== null && _a !== void 0 ? _a : false,
                  contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
              },
              path: (params === null || params === void 0 ? void 0 : params.path) || [],
              schemaErrorMap: this._def.errorMap,
              parent: null,
              data,
              parsedType: getParsedType(data),
          };
          const result = this._parseSync({ data, path: ctx.path, parent: ctx });
          return handleResult(ctx, result);
      }
      async parseAsync(data, params) {
          const result = await this.safeParseAsync(data, params);
          if (result.success)
              return result.data;
          throw result.error;
      }
      async safeParseAsync(data, params) {
          const ctx = {
              common: {
                  issues: [],
                  contextualErrorMap: params === null || params === void 0 ? void 0 : params.errorMap,
                  async: true,
              },
              path: (params === null || params === void 0 ? void 0 : params.path) || [],
              schemaErrorMap: this._def.errorMap,
              parent: null,
              data,
              parsedType: getParsedType(data),
          };
          const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
          const result = await (isAsync(maybeAsyncResult)
              ? maybeAsyncResult
              : Promise.resolve(maybeAsyncResult));
          return handleResult(ctx, result);
      }
      refine(check, message) {
          const getIssueProperties = (val) => {
              if (typeof message === "string" || typeof message === "undefined") {
                  return { message };
              }
              else if (typeof message === "function") {
                  return message(val);
              }
              else {
                  return message;
              }
          };
          return this._refinement((val, ctx) => {
              const result = check(val);
              const setError = () => ctx.addIssue({
                  code: ZodIssueCode.custom,
                  ...getIssueProperties(val),
              });
              if (typeof Promise !== "undefined" && result instanceof Promise) {
                  return result.then((data) => {
                      if (!data) {
                          setError();
                          return false;
                      }
                      else {
                          return true;
                      }
                  });
              }
              if (!result) {
                  setError();
                  return false;
              }
              else {
                  return true;
              }
          });
      }
      refinement(check, refinementData) {
          return this._refinement((val, ctx) => {
              if (!check(val)) {
                  ctx.addIssue(typeof refinementData === "function"
                      ? refinementData(val, ctx)
                      : refinementData);
                  return false;
              }
              else {
                  return true;
              }
          });
      }
      _refinement(refinement) {
          return new ZodEffects({
              schema: this,
              typeName: ZodFirstPartyTypeKind.ZodEffects,
              effect: { type: "refinement", refinement },
          });
      }
      superRefine(refinement) {
          return this._refinement(refinement);
      }
      optional() {
          return ZodOptional.create(this, this._def);
      }
      nullable() {
          return ZodNullable.create(this, this._def);
      }
      nullish() {
          return this.nullable().optional();
      }
      array() {
          return ZodArray.create(this, this._def);
      }
      promise() {
          return ZodPromise.create(this, this._def);
      }
      or(option) {
          return ZodUnion.create([this, option], this._def);
      }
      and(incoming) {
          return ZodIntersection.create(this, incoming, this._def);
      }
      transform(transform) {
          return new ZodEffects({
              ...processCreateParams(this._def),
              schema: this,
              typeName: ZodFirstPartyTypeKind.ZodEffects,
              effect: { type: "transform", transform },
          });
      }
      default(def) {
          const defaultValueFunc = typeof def === "function" ? def : () => def;
          return new ZodDefault({
              ...processCreateParams(this._def),
              innerType: this,
              defaultValue: defaultValueFunc,
              typeName: ZodFirstPartyTypeKind.ZodDefault,
          });
      }
      brand() {
          return new ZodBranded({
              typeName: ZodFirstPartyTypeKind.ZodBranded,
              type: this,
              ...processCreateParams(this._def),
          });
      }
      catch(def) {
          const catchValueFunc = typeof def === "function" ? def : () => def;
          return new ZodCatch({
              ...processCreateParams(this._def),
              innerType: this,
              catchValue: catchValueFunc,
              typeName: ZodFirstPartyTypeKind.ZodCatch,
          });
      }
      describe(description) {
          const This = this.constructor;
          return new This({
              ...this._def,
              description,
          });
      }
      pipe(target) {
          return ZodPipeline.create(this, target);
      }
      readonly() {
          return ZodReadonly.create(this);
      }
      isOptional() {
          return this.safeParse(undefined).success;
      }
      isNullable() {
          return this.safeParse(null).success;
      }
  }
  const cuidRegex = /^c[^\s-]{8,}$/i;
  const cuid2Regex = /^[a-z][a-z0-9]*$/;
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  // const uuidRegex =
  //   /^([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000)$/i;
  const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  // from https://stackoverflow.com/a/46181/1550155
  // old version: too slow, didn't support unicode
  // const emailRegex = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
  //old email regex
  // const emailRegex = /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@((?!-)([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{1,})[^-<>()[\].,;:\s@"]$/i;
  // eslint-disable-next-line
  // const emailRegex =
  //   /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\])|(\[IPv6:(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))\])|([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])*(\.[A-Za-z]{2,})+))$/;
  // const emailRegex =
  //   /^[a-zA-Z0-9\.\!\#\$\%\&\'\*\+\/\=\?\^\_\`\{\|\}\~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  // const emailRegex =
  //   /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
  const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_+-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  // const emailRegex =
  //   /^[a-z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9\-]+)*$/i;
  // from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
  const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  let emojiRegex;
  const ipv4Regex = /^(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))$/;
  const ipv6Regex = /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/;
  // Adapted from https://stackoverflow.com/a/3143231
  const datetimeRegex = (args) => {
      if (args.precision) {
          if (args.offset) {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{${args.precision}}(([+-]\\d{2}(:?\\d{2})?)|Z)$`);
          }
          else {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{${args.precision}}Z$`);
          }
      }
      else if (args.precision === 0) {
          if (args.offset) {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(([+-]\\d{2}(:?\\d{2})?)|Z)$`);
          }
          else {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$`);
          }
      }
      else {
          if (args.offset) {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(([+-]\\d{2}(:?\\d{2})?)|Z)$`);
          }
          else {
              return new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$`);
          }
      }
  };
  function isValidIP(ip, version) {
      if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
          return true;
      }
      if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
          return true;
      }
      return false;
  }
  class ZodString extends ZodType {
      _parse(input) {
          if (this._def.coerce) {
              input.data = String(input.data);
          }
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.string) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.string,
                  received: ctx.parsedType,
              }
              //
              );
              return INVALID;
          }
          const status = new ParseStatus();
          let ctx = undefined;
          for (const check of this._def.checks) {
              if (check.kind === "min") {
                  if (input.data.length < check.value) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_small,
                          minimum: check.value,
                          type: "string",
                          inclusive: true,
                          exact: false,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "max") {
                  if (input.data.length > check.value) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_big,
                          maximum: check.value,
                          type: "string",
                          inclusive: true,
                          exact: false,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "length") {
                  const tooBig = input.data.length > check.value;
                  const tooSmall = input.data.length < check.value;
                  if (tooBig || tooSmall) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      if (tooBig) {
                          addIssueToContext(ctx, {
                              code: ZodIssueCode.too_big,
                              maximum: check.value,
                              type: "string",
                              inclusive: true,
                              exact: true,
                              message: check.message,
                          });
                      }
                      else if (tooSmall) {
                          addIssueToContext(ctx, {
                              code: ZodIssueCode.too_small,
                              minimum: check.value,
                              type: "string",
                              inclusive: true,
                              exact: true,
                              message: check.message,
                          });
                      }
                      status.dirty();
                  }
              }
              else if (check.kind === "email") {
                  if (!emailRegex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "email",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "emoji") {
                  if (!emojiRegex) {
                      emojiRegex = new RegExp(_emojiRegex, "u");
                  }
                  if (!emojiRegex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "emoji",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "uuid") {
                  if (!uuidRegex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "uuid",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "cuid") {
                  if (!cuidRegex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "cuid",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "cuid2") {
                  if (!cuid2Regex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "cuid2",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "ulid") {
                  if (!ulidRegex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "ulid",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "url") {
                  try {
                      new URL(input.data);
                  }
                  catch (_a) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "url",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "regex") {
                  check.regex.lastIndex = 0;
                  const testResult = check.regex.test(input.data);
                  if (!testResult) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "regex",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "trim") {
                  input.data = input.data.trim();
              }
              else if (check.kind === "includes") {
                  if (!input.data.includes(check.value, check.position)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.invalid_string,
                          validation: { includes: check.value, position: check.position },
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "toLowerCase") {
                  input.data = input.data.toLowerCase();
              }
              else if (check.kind === "toUpperCase") {
                  input.data = input.data.toUpperCase();
              }
              else if (check.kind === "startsWith") {
                  if (!input.data.startsWith(check.value)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.invalid_string,
                          validation: { startsWith: check.value },
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "endsWith") {
                  if (!input.data.endsWith(check.value)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.invalid_string,
                          validation: { endsWith: check.value },
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "datetime") {
                  const regex = datetimeRegex(check);
                  if (!regex.test(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.invalid_string,
                          validation: "datetime",
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "ip") {
                  if (!isValidIP(input.data, check.version)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          validation: "ip",
                          code: ZodIssueCode.invalid_string,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else {
                  util.assertNever(check);
              }
          }
          return { status: status.value, value: input.data };
      }
      _regex(regex, validation, message) {
          return this.refinement((data) => regex.test(data), {
              validation,
              code: ZodIssueCode.invalid_string,
              ...errorUtil.errToObj(message),
          });
      }
      _addCheck(check) {
          return new ZodString({
              ...this._def,
              checks: [...this._def.checks, check],
          });
      }
      email(message) {
          return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
      }
      url(message) {
          return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
      }
      emoji(message) {
          return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
      }
      uuid(message) {
          return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
      }
      cuid(message) {
          return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
      }
      cuid2(message) {
          return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
      }
      ulid(message) {
          return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
      }
      ip(options) {
          return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
      }
      datetime(options) {
          var _a;
          if (typeof options === "string") {
              return this._addCheck({
                  kind: "datetime",
                  precision: null,
                  offset: false,
                  message: options,
              });
          }
          return this._addCheck({
              kind: "datetime",
              precision: typeof (options === null || options === void 0 ? void 0 : options.precision) === "undefined" ? null : options === null || options === void 0 ? void 0 : options.precision,
              offset: (_a = options === null || options === void 0 ? void 0 : options.offset) !== null && _a !== void 0 ? _a : false,
              ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message),
          });
      }
      regex(regex, message) {
          return this._addCheck({
              kind: "regex",
              regex: regex,
              ...errorUtil.errToObj(message),
          });
      }
      includes(value, options) {
          return this._addCheck({
              kind: "includes",
              value: value,
              position: options === null || options === void 0 ? void 0 : options.position,
              ...errorUtil.errToObj(options === null || options === void 0 ? void 0 : options.message),
          });
      }
      startsWith(value, message) {
          return this._addCheck({
              kind: "startsWith",
              value: value,
              ...errorUtil.errToObj(message),
          });
      }
      endsWith(value, message) {
          return this._addCheck({
              kind: "endsWith",
              value: value,
              ...errorUtil.errToObj(message),
          });
      }
      min(minLength, message) {
          return this._addCheck({
              kind: "min",
              value: minLength,
              ...errorUtil.errToObj(message),
          });
      }
      max(maxLength, message) {
          return this._addCheck({
              kind: "max",
              value: maxLength,
              ...errorUtil.errToObj(message),
          });
      }
      length(len, message) {
          return this._addCheck({
              kind: "length",
              value: len,
              ...errorUtil.errToObj(message),
          });
      }
      /**
       * @deprecated Use z.string().min(1) instead.
       * @see {@link ZodString.min}
       */
      nonempty(message) {
          return this.min(1, errorUtil.errToObj(message));
      }
      trim() {
          return new ZodString({
              ...this._def,
              checks: [...this._def.checks, { kind: "trim" }],
          });
      }
      toLowerCase() {
          return new ZodString({
              ...this._def,
              checks: [...this._def.checks, { kind: "toLowerCase" }],
          });
      }
      toUpperCase() {
          return new ZodString({
              ...this._def,
              checks: [...this._def.checks, { kind: "toUpperCase" }],
          });
      }
      get isDatetime() {
          return !!this._def.checks.find((ch) => ch.kind === "datetime");
      }
      get isEmail() {
          return !!this._def.checks.find((ch) => ch.kind === "email");
      }
      get isURL() {
          return !!this._def.checks.find((ch) => ch.kind === "url");
      }
      get isEmoji() {
          return !!this._def.checks.find((ch) => ch.kind === "emoji");
      }
      get isUUID() {
          return !!this._def.checks.find((ch) => ch.kind === "uuid");
      }
      get isCUID() {
          return !!this._def.checks.find((ch) => ch.kind === "cuid");
      }
      get isCUID2() {
          return !!this._def.checks.find((ch) => ch.kind === "cuid2");
      }
      get isULID() {
          return !!this._def.checks.find((ch) => ch.kind === "ulid");
      }
      get isIP() {
          return !!this._def.checks.find((ch) => ch.kind === "ip");
      }
      get minLength() {
          let min = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "min") {
                  if (min === null || ch.value > min)
                      min = ch.value;
              }
          }
          return min;
      }
      get maxLength() {
          let max = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "max") {
                  if (max === null || ch.value < max)
                      max = ch.value;
              }
          }
          return max;
      }
  }
  ZodString.create = (params) => {
      var _a;
      return new ZodString({
          checks: [],
          typeName: ZodFirstPartyTypeKind.ZodString,
          coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
          ...processCreateParams(params),
      });
  };
  // https://stackoverflow.com/questions/3966484/why-does-modulus-operator-return-fractional-number-in-javascript/31711034#31711034
  function floatSafeRemainder(val, step) {
      const valDecCount = (val.toString().split(".")[1] || "").length;
      const stepDecCount = (step.toString().split(".")[1] || "").length;
      const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
      const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
      const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
      return (valInt % stepInt) / Math.pow(10, decCount);
  }
  class ZodNumber extends ZodType {
      constructor() {
          super(...arguments);
          this.min = this.gte;
          this.max = this.lte;
          this.step = this.multipleOf;
      }
      _parse(input) {
          if (this._def.coerce) {
              input.data = Number(input.data);
          }
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.number) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.number,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          let ctx = undefined;
          const status = new ParseStatus();
          for (const check of this._def.checks) {
              if (check.kind === "int") {
                  if (!util.isInteger(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.invalid_type,
                          expected: "integer",
                          received: "float",
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "min") {
                  const tooSmall = check.inclusive
                      ? input.data < check.value
                      : input.data <= check.value;
                  if (tooSmall) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_small,
                          minimum: check.value,
                          type: "number",
                          inclusive: check.inclusive,
                          exact: false,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "max") {
                  const tooBig = check.inclusive
                      ? input.data > check.value
                      : input.data >= check.value;
                  if (tooBig) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_big,
                          maximum: check.value,
                          type: "number",
                          inclusive: check.inclusive,
                          exact: false,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "multipleOf") {
                  if (floatSafeRemainder(input.data, check.value) !== 0) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.not_multiple_of,
                          multipleOf: check.value,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "finite") {
                  if (!Number.isFinite(input.data)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.not_finite,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else {
                  util.assertNever(check);
              }
          }
          return { status: status.value, value: input.data };
      }
      gte(value, message) {
          return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
          return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
          return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
          return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
          return new ZodNumber({
              ...this._def,
              checks: [
                  ...this._def.checks,
                  {
                      kind,
                      value,
                      inclusive,
                      message: errorUtil.toString(message),
                  },
              ],
          });
      }
      _addCheck(check) {
          return new ZodNumber({
              ...this._def,
              checks: [...this._def.checks, check],
          });
      }
      int(message) {
          return this._addCheck({
              kind: "int",
              message: errorUtil.toString(message),
          });
      }
      positive(message) {
          return this._addCheck({
              kind: "min",
              value: 0,
              inclusive: false,
              message: errorUtil.toString(message),
          });
      }
      negative(message) {
          return this._addCheck({
              kind: "max",
              value: 0,
              inclusive: false,
              message: errorUtil.toString(message),
          });
      }
      nonpositive(message) {
          return this._addCheck({
              kind: "max",
              value: 0,
              inclusive: true,
              message: errorUtil.toString(message),
          });
      }
      nonnegative(message) {
          return this._addCheck({
              kind: "min",
              value: 0,
              inclusive: true,
              message: errorUtil.toString(message),
          });
      }
      multipleOf(value, message) {
          return this._addCheck({
              kind: "multipleOf",
              value: value,
              message: errorUtil.toString(message),
          });
      }
      finite(message) {
          return this._addCheck({
              kind: "finite",
              message: errorUtil.toString(message),
          });
      }
      safe(message) {
          return this._addCheck({
              kind: "min",
              inclusive: true,
              value: Number.MIN_SAFE_INTEGER,
              message: errorUtil.toString(message),
          })._addCheck({
              kind: "max",
              inclusive: true,
              value: Number.MAX_SAFE_INTEGER,
              message: errorUtil.toString(message),
          });
      }
      get minValue() {
          let min = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "min") {
                  if (min === null || ch.value > min)
                      min = ch.value;
              }
          }
          return min;
      }
      get maxValue() {
          let max = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "max") {
                  if (max === null || ch.value < max)
                      max = ch.value;
              }
          }
          return max;
      }
      get isInt() {
          return !!this._def.checks.find((ch) => ch.kind === "int" ||
              (ch.kind === "multipleOf" && util.isInteger(ch.value)));
      }
      get isFinite() {
          let max = null, min = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "finite" ||
                  ch.kind === "int" ||
                  ch.kind === "multipleOf") {
                  return true;
              }
              else if (ch.kind === "min") {
                  if (min === null || ch.value > min)
                      min = ch.value;
              }
              else if (ch.kind === "max") {
                  if (max === null || ch.value < max)
                      max = ch.value;
              }
          }
          return Number.isFinite(min) && Number.isFinite(max);
      }
  }
  ZodNumber.create = (params) => {
      return new ZodNumber({
          checks: [],
          typeName: ZodFirstPartyTypeKind.ZodNumber,
          coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
          ...processCreateParams(params),
      });
  };
  class ZodBigInt extends ZodType {
      constructor() {
          super(...arguments);
          this.min = this.gte;
          this.max = this.lte;
      }
      _parse(input) {
          if (this._def.coerce) {
              input.data = BigInt(input.data);
          }
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.bigint) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.bigint,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          let ctx = undefined;
          const status = new ParseStatus();
          for (const check of this._def.checks) {
              if (check.kind === "min") {
                  const tooSmall = check.inclusive
                      ? input.data < check.value
                      : input.data <= check.value;
                  if (tooSmall) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_small,
                          type: "bigint",
                          minimum: check.value,
                          inclusive: check.inclusive,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "max") {
                  const tooBig = check.inclusive
                      ? input.data > check.value
                      : input.data >= check.value;
                  if (tooBig) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_big,
                          type: "bigint",
                          maximum: check.value,
                          inclusive: check.inclusive,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "multipleOf") {
                  if (input.data % check.value !== BigInt(0)) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.not_multiple_of,
                          multipleOf: check.value,
                          message: check.message,
                      });
                      status.dirty();
                  }
              }
              else {
                  util.assertNever(check);
              }
          }
          return { status: status.value, value: input.data };
      }
      gte(value, message) {
          return this.setLimit("min", value, true, errorUtil.toString(message));
      }
      gt(value, message) {
          return this.setLimit("min", value, false, errorUtil.toString(message));
      }
      lte(value, message) {
          return this.setLimit("max", value, true, errorUtil.toString(message));
      }
      lt(value, message) {
          return this.setLimit("max", value, false, errorUtil.toString(message));
      }
      setLimit(kind, value, inclusive, message) {
          return new ZodBigInt({
              ...this._def,
              checks: [
                  ...this._def.checks,
                  {
                      kind,
                      value,
                      inclusive,
                      message: errorUtil.toString(message),
                  },
              ],
          });
      }
      _addCheck(check) {
          return new ZodBigInt({
              ...this._def,
              checks: [...this._def.checks, check],
          });
      }
      positive(message) {
          return this._addCheck({
              kind: "min",
              value: BigInt(0),
              inclusive: false,
              message: errorUtil.toString(message),
          });
      }
      negative(message) {
          return this._addCheck({
              kind: "max",
              value: BigInt(0),
              inclusive: false,
              message: errorUtil.toString(message),
          });
      }
      nonpositive(message) {
          return this._addCheck({
              kind: "max",
              value: BigInt(0),
              inclusive: true,
              message: errorUtil.toString(message),
          });
      }
      nonnegative(message) {
          return this._addCheck({
              kind: "min",
              value: BigInt(0),
              inclusive: true,
              message: errorUtil.toString(message),
          });
      }
      multipleOf(value, message) {
          return this._addCheck({
              kind: "multipleOf",
              value,
              message: errorUtil.toString(message),
          });
      }
      get minValue() {
          let min = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "min") {
                  if (min === null || ch.value > min)
                      min = ch.value;
              }
          }
          return min;
      }
      get maxValue() {
          let max = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "max") {
                  if (max === null || ch.value < max)
                      max = ch.value;
              }
          }
          return max;
      }
  }
  ZodBigInt.create = (params) => {
      var _a;
      return new ZodBigInt({
          checks: [],
          typeName: ZodFirstPartyTypeKind.ZodBigInt,
          coerce: (_a = params === null || params === void 0 ? void 0 : params.coerce) !== null && _a !== void 0 ? _a : false,
          ...processCreateParams(params),
      });
  };
  class ZodBoolean extends ZodType {
      _parse(input) {
          if (this._def.coerce) {
              input.data = Boolean(input.data);
          }
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.boolean) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.boolean,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return OK(input.data);
      }
  }
  ZodBoolean.create = (params) => {
      return new ZodBoolean({
          typeName: ZodFirstPartyTypeKind.ZodBoolean,
          coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
          ...processCreateParams(params),
      });
  };
  class ZodDate extends ZodType {
      _parse(input) {
          if (this._def.coerce) {
              input.data = new Date(input.data);
          }
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.date) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.date,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          if (isNaN(input.data.getTime())) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_date,
              });
              return INVALID;
          }
          const status = new ParseStatus();
          let ctx = undefined;
          for (const check of this._def.checks) {
              if (check.kind === "min") {
                  if (input.data.getTime() < check.value) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_small,
                          message: check.message,
                          inclusive: true,
                          exact: false,
                          minimum: check.value,
                          type: "date",
                      });
                      status.dirty();
                  }
              }
              else if (check.kind === "max") {
                  if (input.data.getTime() > check.value) {
                      ctx = this._getOrReturnCtx(input, ctx);
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.too_big,
                          message: check.message,
                          inclusive: true,
                          exact: false,
                          maximum: check.value,
                          type: "date",
                      });
                      status.dirty();
                  }
              }
              else {
                  util.assertNever(check);
              }
          }
          return {
              status: status.value,
              value: new Date(input.data.getTime()),
          };
      }
      _addCheck(check) {
          return new ZodDate({
              ...this._def,
              checks: [...this._def.checks, check],
          });
      }
      min(minDate, message) {
          return this._addCheck({
              kind: "min",
              value: minDate.getTime(),
              message: errorUtil.toString(message),
          });
      }
      max(maxDate, message) {
          return this._addCheck({
              kind: "max",
              value: maxDate.getTime(),
              message: errorUtil.toString(message),
          });
      }
      get minDate() {
          let min = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "min") {
                  if (min === null || ch.value > min)
                      min = ch.value;
              }
          }
          return min != null ? new Date(min) : null;
      }
      get maxDate() {
          let max = null;
          for (const ch of this._def.checks) {
              if (ch.kind === "max") {
                  if (max === null || ch.value < max)
                      max = ch.value;
              }
          }
          return max != null ? new Date(max) : null;
      }
  }
  ZodDate.create = (params) => {
      return new ZodDate({
          checks: [],
          coerce: (params === null || params === void 0 ? void 0 : params.coerce) || false,
          typeName: ZodFirstPartyTypeKind.ZodDate,
          ...processCreateParams(params),
      });
  };
  class ZodSymbol extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.symbol) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.symbol,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return OK(input.data);
      }
  }
  ZodSymbol.create = (params) => {
      return new ZodSymbol({
          typeName: ZodFirstPartyTypeKind.ZodSymbol,
          ...processCreateParams(params),
      });
  };
  class ZodUndefined extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.undefined) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.undefined,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return OK(input.data);
      }
  }
  ZodUndefined.create = (params) => {
      return new ZodUndefined({
          typeName: ZodFirstPartyTypeKind.ZodUndefined,
          ...processCreateParams(params),
      });
  };
  class ZodNull extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.null) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.null,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return OK(input.data);
      }
  }
  ZodNull.create = (params) => {
      return new ZodNull({
          typeName: ZodFirstPartyTypeKind.ZodNull,
          ...processCreateParams(params),
      });
  };
  class ZodAny extends ZodType {
      constructor() {
          super(...arguments);
          // to prevent instances of other classes from extending ZodAny. this causes issues with catchall in ZodObject.
          this._any = true;
      }
      _parse(input) {
          return OK(input.data);
      }
  }
  ZodAny.create = (params) => {
      return new ZodAny({
          typeName: ZodFirstPartyTypeKind.ZodAny,
          ...processCreateParams(params),
      });
  };
  class ZodUnknown extends ZodType {
      constructor() {
          super(...arguments);
          // required
          this._unknown = true;
      }
      _parse(input) {
          return OK(input.data);
      }
  }
  ZodUnknown.create = (params) => {
      return new ZodUnknown({
          typeName: ZodFirstPartyTypeKind.ZodUnknown,
          ...processCreateParams(params),
      });
  };
  class ZodNever extends ZodType {
      _parse(input) {
          const ctx = this._getOrReturnCtx(input);
          addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: ZodParsedType.never,
              received: ctx.parsedType,
          });
          return INVALID;
      }
  }
  ZodNever.create = (params) => {
      return new ZodNever({
          typeName: ZodFirstPartyTypeKind.ZodNever,
          ...processCreateParams(params),
      });
  };
  class ZodVoid extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.undefined) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.void,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return OK(input.data);
      }
  }
  ZodVoid.create = (params) => {
      return new ZodVoid({
          typeName: ZodFirstPartyTypeKind.ZodVoid,
          ...processCreateParams(params),
      });
  };
  class ZodArray extends ZodType {
      _parse(input) {
          const { ctx, status } = this._processInputParams(input);
          const def = this._def;
          if (ctx.parsedType !== ZodParsedType.array) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.array,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          if (def.exactLength !== null) {
              const tooBig = ctx.data.length > def.exactLength.value;
              const tooSmall = ctx.data.length < def.exactLength.value;
              if (tooBig || tooSmall) {
                  addIssueToContext(ctx, {
                      code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
                      minimum: (tooSmall ? def.exactLength.value : undefined),
                      maximum: (tooBig ? def.exactLength.value : undefined),
                      type: "array",
                      inclusive: true,
                      exact: true,
                      message: def.exactLength.message,
                  });
                  status.dirty();
              }
          }
          if (def.minLength !== null) {
              if (ctx.data.length < def.minLength.value) {
                  addIssueToContext(ctx, {
                      code: ZodIssueCode.too_small,
                      minimum: def.minLength.value,
                      type: "array",
                      inclusive: true,
                      exact: false,
                      message: def.minLength.message,
                  });
                  status.dirty();
              }
          }
          if (def.maxLength !== null) {
              if (ctx.data.length > def.maxLength.value) {
                  addIssueToContext(ctx, {
                      code: ZodIssueCode.too_big,
                      maximum: def.maxLength.value,
                      type: "array",
                      inclusive: true,
                      exact: false,
                      message: def.maxLength.message,
                  });
                  status.dirty();
              }
          }
          if (ctx.common.async) {
              return Promise.all([...ctx.data].map((item, i) => {
                  return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
              })).then((result) => {
                  return ParseStatus.mergeArray(status, result);
              });
          }
          const result = [...ctx.data].map((item, i) => {
              return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
          });
          return ParseStatus.mergeArray(status, result);
      }
      get element() {
          return this._def.type;
      }
      min(minLength, message) {
          return new ZodArray({
              ...this._def,
              minLength: { value: minLength, message: errorUtil.toString(message) },
          });
      }
      max(maxLength, message) {
          return new ZodArray({
              ...this._def,
              maxLength: { value: maxLength, message: errorUtil.toString(message) },
          });
      }
      length(len, message) {
          return new ZodArray({
              ...this._def,
              exactLength: { value: len, message: errorUtil.toString(message) },
          });
      }
      nonempty(message) {
          return this.min(1, message);
      }
  }
  ZodArray.create = (schema, params) => {
      return new ZodArray({
          type: schema,
          minLength: null,
          maxLength: null,
          exactLength: null,
          typeName: ZodFirstPartyTypeKind.ZodArray,
          ...processCreateParams(params),
      });
  };
  function deepPartialify(schema) {
      if (schema instanceof ZodObject) {
          const newShape = {};
          for (const key in schema.shape) {
              const fieldSchema = schema.shape[key];
              newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
          }
          return new ZodObject({
              ...schema._def,
              shape: () => newShape,
          });
      }
      else if (schema instanceof ZodArray) {
          return new ZodArray({
              ...schema._def,
              type: deepPartialify(schema.element),
          });
      }
      else if (schema instanceof ZodOptional) {
          return ZodOptional.create(deepPartialify(schema.unwrap()));
      }
      else if (schema instanceof ZodNullable) {
          return ZodNullable.create(deepPartialify(schema.unwrap()));
      }
      else if (schema instanceof ZodTuple) {
          return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
      }
      else {
          return schema;
      }
  }
  class ZodObject extends ZodType {
      constructor() {
          super(...arguments);
          this._cached = null;
          /**
           * @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
           * If you want to pass through unknown properties, use `.passthrough()` instead.
           */
          this.nonstrict = this.passthrough;
          // extend<
          //   Augmentation extends ZodRawShape,
          //   NewOutput extends util.flatten<{
          //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
          //       ? Augmentation[k]["_output"]
          //       : k extends keyof Output
          //       ? Output[k]
          //       : never;
          //   }>,
          //   NewInput extends util.flatten<{
          //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
          //       ? Augmentation[k]["_input"]
          //       : k extends keyof Input
          //       ? Input[k]
          //       : never;
          //   }>
          // >(
          //   augmentation: Augmentation
          // ): ZodObject<
          //   extendShape<T, Augmentation>,
          //   UnknownKeys,
          //   Catchall,
          //   NewOutput,
          //   NewInput
          // > {
          //   return new ZodObject({
          //     ...this._def,
          //     shape: () => ({
          //       ...this._def.shape(),
          //       ...augmentation,
          //     }),
          //   }) as any;
          // }
          /**
           * @deprecated Use `.extend` instead
           *  */
          this.augment = this.extend;
      }
      _getCached() {
          if (this._cached !== null)
              return this._cached;
          const shape = this._def.shape();
          const keys = util.objectKeys(shape);
          return (this._cached = { shape, keys });
      }
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.object) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.object,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const { status, ctx } = this._processInputParams(input);
          const { shape, keys: shapeKeys } = this._getCached();
          const extraKeys = [];
          if (!(this._def.catchall instanceof ZodNever &&
              this._def.unknownKeys === "strip")) {
              for (const key in ctx.data) {
                  if (!shapeKeys.includes(key)) {
                      extraKeys.push(key);
                  }
              }
          }
          const pairs = [];
          for (const key of shapeKeys) {
              const keyValidator = shape[key];
              const value = ctx.data[key];
              pairs.push({
                  key: { status: "valid", value: key },
                  value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
                  alwaysSet: key in ctx.data,
              });
          }
          if (this._def.catchall instanceof ZodNever) {
              const unknownKeys = this._def.unknownKeys;
              if (unknownKeys === "passthrough") {
                  for (const key of extraKeys) {
                      pairs.push({
                          key: { status: "valid", value: key },
                          value: { status: "valid", value: ctx.data[key] },
                      });
                  }
              }
              else if (unknownKeys === "strict") {
                  if (extraKeys.length > 0) {
                      addIssueToContext(ctx, {
                          code: ZodIssueCode.unrecognized_keys,
                          keys: extraKeys,
                      });
                      status.dirty();
                  }
              }
              else if (unknownKeys === "strip") ;
              else {
                  throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
              }
          }
          else {
              // run catchall validation
              const catchall = this._def.catchall;
              for (const key of extraKeys) {
                  const value = ctx.data[key];
                  pairs.push({
                      key: { status: "valid", value: key },
                      value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key) //, ctx.child(key), value, getParsedType(value)
                      ),
                      alwaysSet: key in ctx.data,
                  });
              }
          }
          if (ctx.common.async) {
              return Promise.resolve()
                  .then(async () => {
                  const syncPairs = [];
                  for (const pair of pairs) {
                      const key = await pair.key;
                      syncPairs.push({
                          key,
                          value: await pair.value,
                          alwaysSet: pair.alwaysSet,
                      });
                  }
                  return syncPairs;
              })
                  .then((syncPairs) => {
                  return ParseStatus.mergeObjectSync(status, syncPairs);
              });
          }
          else {
              return ParseStatus.mergeObjectSync(status, pairs);
          }
      }
      get shape() {
          return this._def.shape();
      }
      strict(message) {
          errorUtil.errToObj;
          return new ZodObject({
              ...this._def,
              unknownKeys: "strict",
              ...(message !== undefined
                  ? {
                      errorMap: (issue, ctx) => {
                          var _a, _b, _c, _d;
                          const defaultError = (_c = (_b = (_a = this._def).errorMap) === null || _b === void 0 ? void 0 : _b.call(_a, issue, ctx).message) !== null && _c !== void 0 ? _c : ctx.defaultError;
                          if (issue.code === "unrecognized_keys")
                              return {
                                  message: (_d = errorUtil.errToObj(message).message) !== null && _d !== void 0 ? _d : defaultError,
                              };
                          return {
                              message: defaultError,
                          };
                      },
                  }
                  : {}),
          });
      }
      strip() {
          return new ZodObject({
              ...this._def,
              unknownKeys: "strip",
          });
      }
      passthrough() {
          return new ZodObject({
              ...this._def,
              unknownKeys: "passthrough",
          });
      }
      // const AugmentFactory =
      //   <Def extends ZodObjectDef>(def: Def) =>
      //   <Augmentation extends ZodRawShape>(
      //     augmentation: Augmentation
      //   ): ZodObject<
      //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
      //     Def["unknownKeys"],
      //     Def["catchall"]
      //   > => {
      //     return new ZodObject({
      //       ...def,
      //       shape: () => ({
      //         ...def.shape(),
      //         ...augmentation,
      //       }),
      //     }) as any;
      //   };
      extend(augmentation) {
          return new ZodObject({
              ...this._def,
              shape: () => ({
                  ...this._def.shape(),
                  ...augmentation,
              }),
          });
      }
      /**
       * Prior to zod@1.0.12 there was a bug in the
       * inferred type of merged objects. Please
       * upgrade if you are experiencing issues.
       */
      merge(merging) {
          const merged = new ZodObject({
              unknownKeys: merging._def.unknownKeys,
              catchall: merging._def.catchall,
              shape: () => ({
                  ...this._def.shape(),
                  ...merging._def.shape(),
              }),
              typeName: ZodFirstPartyTypeKind.ZodObject,
          });
          return merged;
      }
      // merge<
      //   Incoming extends AnyZodObject,
      //   Augmentation extends Incoming["shape"],
      //   NewOutput extends {
      //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
      //       ? Augmentation[k]["_output"]
      //       : k extends keyof Output
      //       ? Output[k]
      //       : never;
      //   },
      //   NewInput extends {
      //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
      //       ? Augmentation[k]["_input"]
      //       : k extends keyof Input
      //       ? Input[k]
      //       : never;
      //   }
      // >(
      //   merging: Incoming
      // ): ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"],
      //   NewOutput,
      //   NewInput
      // > {
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      setKey(key, schema) {
          return this.augment({ [key]: schema });
      }
      // merge<Incoming extends AnyZodObject>(
      //   merging: Incoming
      // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
      // ZodObject<
      //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      //   Incoming["_def"]["unknownKeys"],
      //   Incoming["_def"]["catchall"]
      // > {
      //   // const mergedShape = objectUtil.mergeShapes(
      //   //   this._def.shape(),
      //   //   merging._def.shape()
      //   // );
      //   const merged: any = new ZodObject({
      //     unknownKeys: merging._def.unknownKeys,
      //     catchall: merging._def.catchall,
      //     shape: () =>
      //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      //     typeName: ZodFirstPartyTypeKind.ZodObject,
      //   }) as any;
      //   return merged;
      // }
      catchall(index) {
          return new ZodObject({
              ...this._def,
              catchall: index,
          });
      }
      pick(mask) {
          const shape = {};
          util.objectKeys(mask).forEach((key) => {
              if (mask[key] && this.shape[key]) {
                  shape[key] = this.shape[key];
              }
          });
          return new ZodObject({
              ...this._def,
              shape: () => shape,
          });
      }
      omit(mask) {
          const shape = {};
          util.objectKeys(this.shape).forEach((key) => {
              if (!mask[key]) {
                  shape[key] = this.shape[key];
              }
          });
          return new ZodObject({
              ...this._def,
              shape: () => shape,
          });
      }
      /**
       * @deprecated
       */
      deepPartial() {
          return deepPartialify(this);
      }
      partial(mask) {
          const newShape = {};
          util.objectKeys(this.shape).forEach((key) => {
              const fieldSchema = this.shape[key];
              if (mask && !mask[key]) {
                  newShape[key] = fieldSchema;
              }
              else {
                  newShape[key] = fieldSchema.optional();
              }
          });
          return new ZodObject({
              ...this._def,
              shape: () => newShape,
          });
      }
      required(mask) {
          const newShape = {};
          util.objectKeys(this.shape).forEach((key) => {
              if (mask && !mask[key]) {
                  newShape[key] = this.shape[key];
              }
              else {
                  const fieldSchema = this.shape[key];
                  let newField = fieldSchema;
                  while (newField instanceof ZodOptional) {
                      newField = newField._def.innerType;
                  }
                  newShape[key] = newField;
              }
          });
          return new ZodObject({
              ...this._def,
              shape: () => newShape,
          });
      }
      keyof() {
          return createZodEnum(util.objectKeys(this.shape));
      }
  }
  ZodObject.create = (shape, params) => {
      return new ZodObject({
          shape: () => shape,
          unknownKeys: "strip",
          catchall: ZodNever.create(),
          typeName: ZodFirstPartyTypeKind.ZodObject,
          ...processCreateParams(params),
      });
  };
  ZodObject.strictCreate = (shape, params) => {
      return new ZodObject({
          shape: () => shape,
          unknownKeys: "strict",
          catchall: ZodNever.create(),
          typeName: ZodFirstPartyTypeKind.ZodObject,
          ...processCreateParams(params),
      });
  };
  ZodObject.lazycreate = (shape, params) => {
      return new ZodObject({
          shape,
          unknownKeys: "strip",
          catchall: ZodNever.create(),
          typeName: ZodFirstPartyTypeKind.ZodObject,
          ...processCreateParams(params),
      });
  };
  class ZodUnion extends ZodType {
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          const options = this._def.options;
          function handleResults(results) {
              // return first issue-free validation if it exists
              for (const result of results) {
                  if (result.result.status === "valid") {
                      return result.result;
                  }
              }
              for (const result of results) {
                  if (result.result.status === "dirty") {
                      // add issues from dirty option
                      ctx.common.issues.push(...result.ctx.common.issues);
                      return result.result;
                  }
              }
              // return invalid
              const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_union,
                  unionErrors,
              });
              return INVALID;
          }
          if (ctx.common.async) {
              return Promise.all(options.map(async (option) => {
                  const childCtx = {
                      ...ctx,
                      common: {
                          ...ctx.common,
                          issues: [],
                      },
                      parent: null,
                  };
                  return {
                      result: await option._parseAsync({
                          data: ctx.data,
                          path: ctx.path,
                          parent: childCtx,
                      }),
                      ctx: childCtx,
                  };
              })).then(handleResults);
          }
          else {
              let dirty = undefined;
              const issues = [];
              for (const option of options) {
                  const childCtx = {
                      ...ctx,
                      common: {
                          ...ctx.common,
                          issues: [],
                      },
                      parent: null,
                  };
                  const result = option._parseSync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: childCtx,
                  });
                  if (result.status === "valid") {
                      return result;
                  }
                  else if (result.status === "dirty" && !dirty) {
                      dirty = { result, ctx: childCtx };
                  }
                  if (childCtx.common.issues.length) {
                      issues.push(childCtx.common.issues);
                  }
              }
              if (dirty) {
                  ctx.common.issues.push(...dirty.ctx.common.issues);
                  return dirty.result;
              }
              const unionErrors = issues.map((issues) => new ZodError(issues));
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_union,
                  unionErrors,
              });
              return INVALID;
          }
      }
      get options() {
          return this._def.options;
      }
  }
  ZodUnion.create = (types, params) => {
      return new ZodUnion({
          options: types,
          typeName: ZodFirstPartyTypeKind.ZodUnion,
          ...processCreateParams(params),
      });
  };
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  //////////                                 //////////
  //////////      ZodDiscriminatedUnion      //////////
  //////////                                 //////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  const getDiscriminator = (type) => {
      if (type instanceof ZodLazy) {
          return getDiscriminator(type.schema);
      }
      else if (type instanceof ZodEffects) {
          return getDiscriminator(type.innerType());
      }
      else if (type instanceof ZodLiteral) {
          return [type.value];
      }
      else if (type instanceof ZodEnum) {
          return type.options;
      }
      else if (type instanceof ZodNativeEnum) {
          // eslint-disable-next-line ban/ban
          return Object.keys(type.enum);
      }
      else if (type instanceof ZodDefault) {
          return getDiscriminator(type._def.innerType);
      }
      else if (type instanceof ZodUndefined) {
          return [undefined];
      }
      else if (type instanceof ZodNull) {
          return [null];
      }
      else {
          return null;
      }
  };
  class ZodDiscriminatedUnion extends ZodType {
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.object) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.object,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const discriminator = this.discriminator;
          const discriminatorValue = ctx.data[discriminator];
          const option = this.optionsMap.get(discriminatorValue);
          if (!option) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_union_discriminator,
                  options: Array.from(this.optionsMap.keys()),
                  path: [discriminator],
              });
              return INVALID;
          }
          if (ctx.common.async) {
              return option._parseAsync({
                  data: ctx.data,
                  path: ctx.path,
                  parent: ctx,
              });
          }
          else {
              return option._parseSync({
                  data: ctx.data,
                  path: ctx.path,
                  parent: ctx,
              });
          }
      }
      get discriminator() {
          return this._def.discriminator;
      }
      get options() {
          return this._def.options;
      }
      get optionsMap() {
          return this._def.optionsMap;
      }
      /**
       * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
       * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
       * have a different value for each object in the union.
       * @param discriminator the name of the discriminator property
       * @param types an array of object schemas
       * @param params
       */
      static create(discriminator, options, params) {
          // Get all the valid discriminator values
          const optionsMap = new Map();
          // try {
          for (const type of options) {
              const discriminatorValues = getDiscriminator(type.shape[discriminator]);
              if (!discriminatorValues) {
                  throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
              }
              for (const value of discriminatorValues) {
                  if (optionsMap.has(value)) {
                      throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
                  }
                  optionsMap.set(value, type);
              }
          }
          return new ZodDiscriminatedUnion({
              typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
              discriminator,
              options,
              optionsMap,
              ...processCreateParams(params),
          });
      }
  }
  function mergeValues(a, b) {
      const aType = getParsedType(a);
      const bType = getParsedType(b);
      if (a === b) {
          return { valid: true, data: a };
      }
      else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
          const bKeys = util.objectKeys(b);
          const sharedKeys = util
              .objectKeys(a)
              .filter((key) => bKeys.indexOf(key) !== -1);
          const newObj = { ...a, ...b };
          for (const key of sharedKeys) {
              const sharedValue = mergeValues(a[key], b[key]);
              if (!sharedValue.valid) {
                  return { valid: false };
              }
              newObj[key] = sharedValue.data;
          }
          return { valid: true, data: newObj };
      }
      else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
          if (a.length !== b.length) {
              return { valid: false };
          }
          const newArray = [];
          for (let index = 0; index < a.length; index++) {
              const itemA = a[index];
              const itemB = b[index];
              const sharedValue = mergeValues(itemA, itemB);
              if (!sharedValue.valid) {
                  return { valid: false };
              }
              newArray.push(sharedValue.data);
          }
          return { valid: true, data: newArray };
      }
      else if (aType === ZodParsedType.date &&
          bType === ZodParsedType.date &&
          +a === +b) {
          return { valid: true, data: a };
      }
      else {
          return { valid: false };
      }
  }
  class ZodIntersection extends ZodType {
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          const handleParsed = (parsedLeft, parsedRight) => {
              if (isAborted(parsedLeft) || isAborted(parsedRight)) {
                  return INVALID;
              }
              const merged = mergeValues(parsedLeft.value, parsedRight.value);
              if (!merged.valid) {
                  addIssueToContext(ctx, {
                      code: ZodIssueCode.invalid_intersection_types,
                  });
                  return INVALID;
              }
              if (isDirty(parsedLeft) || isDirty(parsedRight)) {
                  status.dirty();
              }
              return { status: status.value, value: merged.data };
          };
          if (ctx.common.async) {
              return Promise.all([
                  this._def.left._parseAsync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: ctx,
                  }),
                  this._def.right._parseAsync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: ctx,
                  }),
              ]).then(([left, right]) => handleParsed(left, right));
          }
          else {
              return handleParsed(this._def.left._parseSync({
                  data: ctx.data,
                  path: ctx.path,
                  parent: ctx,
              }), this._def.right._parseSync({
                  data: ctx.data,
                  path: ctx.path,
                  parent: ctx,
              }));
          }
      }
  }
  ZodIntersection.create = (left, right, params) => {
      return new ZodIntersection({
          left: left,
          right: right,
          typeName: ZodFirstPartyTypeKind.ZodIntersection,
          ...processCreateParams(params),
      });
  };
  class ZodTuple extends ZodType {
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.array) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.array,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          if (ctx.data.length < this._def.items.length) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.too_small,
                  minimum: this._def.items.length,
                  inclusive: true,
                  exact: false,
                  type: "array",
              });
              return INVALID;
          }
          const rest = this._def.rest;
          if (!rest && ctx.data.length > this._def.items.length) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.too_big,
                  maximum: this._def.items.length,
                  inclusive: true,
                  exact: false,
                  type: "array",
              });
              status.dirty();
          }
          const items = [...ctx.data]
              .map((item, itemIndex) => {
              const schema = this._def.items[itemIndex] || this._def.rest;
              if (!schema)
                  return null;
              return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
          })
              .filter((x) => !!x); // filter nulls
          if (ctx.common.async) {
              return Promise.all(items).then((results) => {
                  return ParseStatus.mergeArray(status, results);
              });
          }
          else {
              return ParseStatus.mergeArray(status, items);
          }
      }
      get items() {
          return this._def.items;
      }
      rest(rest) {
          return new ZodTuple({
              ...this._def,
              rest,
          });
      }
  }
  ZodTuple.create = (schemas, params) => {
      if (!Array.isArray(schemas)) {
          throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
      }
      return new ZodTuple({
          items: schemas,
          typeName: ZodFirstPartyTypeKind.ZodTuple,
          rest: null,
          ...processCreateParams(params),
      });
  };
  class ZodRecord extends ZodType {
      get keySchema() {
          return this._def.keyType;
      }
      get valueSchema() {
          return this._def.valueType;
      }
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.object) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.object,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const pairs = [];
          const keyType = this._def.keyType;
          const valueType = this._def.valueType;
          for (const key in ctx.data) {
              pairs.push({
                  key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
                  value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
              });
          }
          if (ctx.common.async) {
              return ParseStatus.mergeObjectAsync(status, pairs);
          }
          else {
              return ParseStatus.mergeObjectSync(status, pairs);
          }
      }
      get element() {
          return this._def.valueType;
      }
      static create(first, second, third) {
          if (second instanceof ZodType) {
              return new ZodRecord({
                  keyType: first,
                  valueType: second,
                  typeName: ZodFirstPartyTypeKind.ZodRecord,
                  ...processCreateParams(third),
              });
          }
          return new ZodRecord({
              keyType: ZodString.create(),
              valueType: first,
              typeName: ZodFirstPartyTypeKind.ZodRecord,
              ...processCreateParams(second),
          });
      }
  }
  class ZodMap extends ZodType {
      get keySchema() {
          return this._def.keyType;
      }
      get valueSchema() {
          return this._def.valueType;
      }
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.map) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.map,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const keyType = this._def.keyType;
          const valueType = this._def.valueType;
          const pairs = [...ctx.data.entries()].map(([key, value], index) => {
              return {
                  key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
                  value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"])),
              };
          });
          if (ctx.common.async) {
              const finalMap = new Map();
              return Promise.resolve().then(async () => {
                  for (const pair of pairs) {
                      const key = await pair.key;
                      const value = await pair.value;
                      if (key.status === "aborted" || value.status === "aborted") {
                          return INVALID;
                      }
                      if (key.status === "dirty" || value.status === "dirty") {
                          status.dirty();
                      }
                      finalMap.set(key.value, value.value);
                  }
                  return { status: status.value, value: finalMap };
              });
          }
          else {
              const finalMap = new Map();
              for (const pair of pairs) {
                  const key = pair.key;
                  const value = pair.value;
                  if (key.status === "aborted" || value.status === "aborted") {
                      return INVALID;
                  }
                  if (key.status === "dirty" || value.status === "dirty") {
                      status.dirty();
                  }
                  finalMap.set(key.value, value.value);
              }
              return { status: status.value, value: finalMap };
          }
      }
  }
  ZodMap.create = (keyType, valueType, params) => {
      return new ZodMap({
          valueType,
          keyType,
          typeName: ZodFirstPartyTypeKind.ZodMap,
          ...processCreateParams(params),
      });
  };
  class ZodSet extends ZodType {
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.set) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.set,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const def = this._def;
          if (def.minSize !== null) {
              if (ctx.data.size < def.minSize.value) {
                  addIssueToContext(ctx, {
                      code: ZodIssueCode.too_small,
                      minimum: def.minSize.value,
                      type: "set",
                      inclusive: true,
                      exact: false,
                      message: def.minSize.message,
                  });
                  status.dirty();
              }
          }
          if (def.maxSize !== null) {
              if (ctx.data.size > def.maxSize.value) {
                  addIssueToContext(ctx, {
                      code: ZodIssueCode.too_big,
                      maximum: def.maxSize.value,
                      type: "set",
                      inclusive: true,
                      exact: false,
                      message: def.maxSize.message,
                  });
                  status.dirty();
              }
          }
          const valueType = this._def.valueType;
          function finalizeSet(elements) {
              const parsedSet = new Set();
              for (const element of elements) {
                  if (element.status === "aborted")
                      return INVALID;
                  if (element.status === "dirty")
                      status.dirty();
                  parsedSet.add(element.value);
              }
              return { status: status.value, value: parsedSet };
          }
          const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
          if (ctx.common.async) {
              return Promise.all(elements).then((elements) => finalizeSet(elements));
          }
          else {
              return finalizeSet(elements);
          }
      }
      min(minSize, message) {
          return new ZodSet({
              ...this._def,
              minSize: { value: minSize, message: errorUtil.toString(message) },
          });
      }
      max(maxSize, message) {
          return new ZodSet({
              ...this._def,
              maxSize: { value: maxSize, message: errorUtil.toString(message) },
          });
      }
      size(size, message) {
          return this.min(size, message).max(size, message);
      }
      nonempty(message) {
          return this.min(1, message);
      }
  }
  ZodSet.create = (valueType, params) => {
      return new ZodSet({
          valueType,
          minSize: null,
          maxSize: null,
          typeName: ZodFirstPartyTypeKind.ZodSet,
          ...processCreateParams(params),
      });
  };
  class ZodFunction extends ZodType {
      constructor() {
          super(...arguments);
          this.validate = this.implement;
      }
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.function) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.function,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          function makeArgsIssue(args, error) {
              return makeIssue({
                  data: args,
                  path: ctx.path,
                  errorMaps: [
                      ctx.common.contextualErrorMap,
                      ctx.schemaErrorMap,
                      getErrorMap(),
                      errorMap,
                  ].filter((x) => !!x),
                  issueData: {
                      code: ZodIssueCode.invalid_arguments,
                      argumentsError: error,
                  },
              });
          }
          function makeReturnsIssue(returns, error) {
              return makeIssue({
                  data: returns,
                  path: ctx.path,
                  errorMaps: [
                      ctx.common.contextualErrorMap,
                      ctx.schemaErrorMap,
                      getErrorMap(),
                      errorMap,
                  ].filter((x) => !!x),
                  issueData: {
                      code: ZodIssueCode.invalid_return_type,
                      returnTypeError: error,
                  },
              });
          }
          const params = { errorMap: ctx.common.contextualErrorMap };
          const fn = ctx.data;
          if (this._def.returns instanceof ZodPromise) {
              // Would love a way to avoid disabling this rule, but we need
              // an alias (using an arrow function was what caused 2651).
              // eslint-disable-next-line @typescript-eslint/no-this-alias
              const me = this;
              return OK(async function (...args) {
                  const error = new ZodError([]);
                  const parsedArgs = await me._def.args
                      .parseAsync(args, params)
                      .catch((e) => {
                      error.addIssue(makeArgsIssue(args, e));
                      throw error;
                  });
                  const result = await Reflect.apply(fn, this, parsedArgs);
                  const parsedReturns = await me._def.returns._def.type
                      .parseAsync(result, params)
                      .catch((e) => {
                      error.addIssue(makeReturnsIssue(result, e));
                      throw error;
                  });
                  return parsedReturns;
              });
          }
          else {
              // Would love a way to avoid disabling this rule, but we need
              // an alias (using an arrow function was what caused 2651).
              // eslint-disable-next-line @typescript-eslint/no-this-alias
              const me = this;
              return OK(function (...args) {
                  const parsedArgs = me._def.args.safeParse(args, params);
                  if (!parsedArgs.success) {
                      throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
                  }
                  const result = Reflect.apply(fn, this, parsedArgs.data);
                  const parsedReturns = me._def.returns.safeParse(result, params);
                  if (!parsedReturns.success) {
                      throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
                  }
                  return parsedReturns.data;
              });
          }
      }
      parameters() {
          return this._def.args;
      }
      returnType() {
          return this._def.returns;
      }
      args(...items) {
          return new ZodFunction({
              ...this._def,
              args: ZodTuple.create(items).rest(ZodUnknown.create()),
          });
      }
      returns(returnType) {
          return new ZodFunction({
              ...this._def,
              returns: returnType,
          });
      }
      implement(func) {
          const validatedFunc = this.parse(func);
          return validatedFunc;
      }
      strictImplement(func) {
          const validatedFunc = this.parse(func);
          return validatedFunc;
      }
      static create(args, returns, params) {
          return new ZodFunction({
              args: (args
                  ? args
                  : ZodTuple.create([]).rest(ZodUnknown.create())),
              returns: returns || ZodUnknown.create(),
              typeName: ZodFirstPartyTypeKind.ZodFunction,
              ...processCreateParams(params),
          });
      }
  }
  class ZodLazy extends ZodType {
      get schema() {
          return this._def.getter();
      }
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          const lazySchema = this._def.getter();
          return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
      }
  }
  ZodLazy.create = (getter, params) => {
      return new ZodLazy({
          getter: getter,
          typeName: ZodFirstPartyTypeKind.ZodLazy,
          ...processCreateParams(params),
      });
  };
  class ZodLiteral extends ZodType {
      _parse(input) {
          if (input.data !== this._def.value) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  received: ctx.data,
                  code: ZodIssueCode.invalid_literal,
                  expected: this._def.value,
              });
              return INVALID;
          }
          return { status: "valid", value: input.data };
      }
      get value() {
          return this._def.value;
      }
  }
  ZodLiteral.create = (value, params) => {
      return new ZodLiteral({
          value: value,
          typeName: ZodFirstPartyTypeKind.ZodLiteral,
          ...processCreateParams(params),
      });
  };
  function createZodEnum(values, params) {
      return new ZodEnum({
          values,
          typeName: ZodFirstPartyTypeKind.ZodEnum,
          ...processCreateParams(params),
      });
  }
  class ZodEnum extends ZodType {
      _parse(input) {
          if (typeof input.data !== "string") {
              const ctx = this._getOrReturnCtx(input);
              const expectedValues = this._def.values;
              addIssueToContext(ctx, {
                  expected: util.joinValues(expectedValues),
                  received: ctx.parsedType,
                  code: ZodIssueCode.invalid_type,
              });
              return INVALID;
          }
          if (this._def.values.indexOf(input.data) === -1) {
              const ctx = this._getOrReturnCtx(input);
              const expectedValues = this._def.values;
              addIssueToContext(ctx, {
                  received: ctx.data,
                  code: ZodIssueCode.invalid_enum_value,
                  options: expectedValues,
              });
              return INVALID;
          }
          return OK(input.data);
      }
      get options() {
          return this._def.values;
      }
      get enum() {
          const enumValues = {};
          for (const val of this._def.values) {
              enumValues[val] = val;
          }
          return enumValues;
      }
      get Values() {
          const enumValues = {};
          for (const val of this._def.values) {
              enumValues[val] = val;
          }
          return enumValues;
      }
      get Enum() {
          const enumValues = {};
          for (const val of this._def.values) {
              enumValues[val] = val;
          }
          return enumValues;
      }
      extract(values) {
          return ZodEnum.create(values);
      }
      exclude(values) {
          return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)));
      }
  }
  ZodEnum.create = createZodEnum;
  class ZodNativeEnum extends ZodType {
      _parse(input) {
          const nativeEnumValues = util.getValidEnumValues(this._def.values);
          const ctx = this._getOrReturnCtx(input);
          if (ctx.parsedType !== ZodParsedType.string &&
              ctx.parsedType !== ZodParsedType.number) {
              const expectedValues = util.objectValues(nativeEnumValues);
              addIssueToContext(ctx, {
                  expected: util.joinValues(expectedValues),
                  received: ctx.parsedType,
                  code: ZodIssueCode.invalid_type,
              });
              return INVALID;
          }
          if (nativeEnumValues.indexOf(input.data) === -1) {
              const expectedValues = util.objectValues(nativeEnumValues);
              addIssueToContext(ctx, {
                  received: ctx.data,
                  code: ZodIssueCode.invalid_enum_value,
                  options: expectedValues,
              });
              return INVALID;
          }
          return OK(input.data);
      }
      get enum() {
          return this._def.values;
      }
  }
  ZodNativeEnum.create = (values, params) => {
      return new ZodNativeEnum({
          values: values,
          typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
          ...processCreateParams(params),
      });
  };
  class ZodPromise extends ZodType {
      unwrap() {
          return this._def.type;
      }
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          if (ctx.parsedType !== ZodParsedType.promise &&
              ctx.common.async === false) {
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.promise,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          const promisified = ctx.parsedType === ZodParsedType.promise
              ? ctx.data
              : Promise.resolve(ctx.data);
          return OK(promisified.then((data) => {
              return this._def.type.parseAsync(data, {
                  path: ctx.path,
                  errorMap: ctx.common.contextualErrorMap,
              });
          }));
      }
  }
  ZodPromise.create = (schema, params) => {
      return new ZodPromise({
          type: schema,
          typeName: ZodFirstPartyTypeKind.ZodPromise,
          ...processCreateParams(params),
      });
  };
  class ZodEffects extends ZodType {
      innerType() {
          return this._def.schema;
      }
      sourceType() {
          return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects
              ? this._def.schema.sourceType()
              : this._def.schema;
      }
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          const effect = this._def.effect || null;
          const checkCtx = {
              addIssue: (arg) => {
                  addIssueToContext(ctx, arg);
                  if (arg.fatal) {
                      status.abort();
                  }
                  else {
                      status.dirty();
                  }
              },
              get path() {
                  return ctx.path;
              },
          };
          checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
          if (effect.type === "preprocess") {
              const processed = effect.transform(ctx.data, checkCtx);
              if (ctx.common.issues.length) {
                  return {
                      status: "dirty",
                      value: ctx.data,
                  };
              }
              if (ctx.common.async) {
                  return Promise.resolve(processed).then((processed) => {
                      return this._def.schema._parseAsync({
                          data: processed,
                          path: ctx.path,
                          parent: ctx,
                      });
                  });
              }
              else {
                  return this._def.schema._parseSync({
                      data: processed,
                      path: ctx.path,
                      parent: ctx,
                  });
              }
          }
          if (effect.type === "refinement") {
              const executeRefinement = (acc
              // effect: RefinementEffect<any>
              ) => {
                  const result = effect.refinement(acc, checkCtx);
                  if (ctx.common.async) {
                      return Promise.resolve(result);
                  }
                  if (result instanceof Promise) {
                      throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
                  }
                  return acc;
              };
              if (ctx.common.async === false) {
                  const inner = this._def.schema._parseSync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: ctx,
                  });
                  if (inner.status === "aborted")
                      return INVALID;
                  if (inner.status === "dirty")
                      status.dirty();
                  // return value is ignored
                  executeRefinement(inner.value);
                  return { status: status.value, value: inner.value };
              }
              else {
                  return this._def.schema
                      ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
                      .then((inner) => {
                      if (inner.status === "aborted")
                          return INVALID;
                      if (inner.status === "dirty")
                          status.dirty();
                      return executeRefinement(inner.value).then(() => {
                          return { status: status.value, value: inner.value };
                      });
                  });
              }
          }
          if (effect.type === "transform") {
              if (ctx.common.async === false) {
                  const base = this._def.schema._parseSync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: ctx,
                  });
                  if (!isValid(base))
                      return base;
                  const result = effect.transform(base.value, checkCtx);
                  if (result instanceof Promise) {
                      throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
                  }
                  return { status: status.value, value: result };
              }
              else {
                  return this._def.schema
                      ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
                      .then((base) => {
                      if (!isValid(base))
                          return base;
                      return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({ status: status.value, value: result }));
                  });
              }
          }
          util.assertNever(effect);
      }
  }
  ZodEffects.create = (schema, effect, params) => {
      return new ZodEffects({
          schema,
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          effect,
          ...processCreateParams(params),
      });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
      return new ZodEffects({
          schema,
          effect: { type: "preprocess", transform: preprocess },
          typeName: ZodFirstPartyTypeKind.ZodEffects,
          ...processCreateParams(params),
      });
  };
  class ZodOptional extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType === ZodParsedType.undefined) {
              return OK(undefined);
          }
          return this._def.innerType._parse(input);
      }
      unwrap() {
          return this._def.innerType;
      }
  }
  ZodOptional.create = (type, params) => {
      return new ZodOptional({
          innerType: type,
          typeName: ZodFirstPartyTypeKind.ZodOptional,
          ...processCreateParams(params),
      });
  };
  class ZodNullable extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType === ZodParsedType.null) {
              return OK(null);
          }
          return this._def.innerType._parse(input);
      }
      unwrap() {
          return this._def.innerType;
      }
  }
  ZodNullable.create = (type, params) => {
      return new ZodNullable({
          innerType: type,
          typeName: ZodFirstPartyTypeKind.ZodNullable,
          ...processCreateParams(params),
      });
  };
  class ZodDefault extends ZodType {
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          let data = ctx.data;
          if (ctx.parsedType === ZodParsedType.undefined) {
              data = this._def.defaultValue();
          }
          return this._def.innerType._parse({
              data,
              path: ctx.path,
              parent: ctx,
          });
      }
      removeDefault() {
          return this._def.innerType;
      }
  }
  ZodDefault.create = (type, params) => {
      return new ZodDefault({
          innerType: type,
          typeName: ZodFirstPartyTypeKind.ZodDefault,
          defaultValue: typeof params.default === "function"
              ? params.default
              : () => params.default,
          ...processCreateParams(params),
      });
  };
  class ZodCatch extends ZodType {
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          // newCtx is used to not collect issues from inner types in ctx
          const newCtx = {
              ...ctx,
              common: {
                  ...ctx.common,
                  issues: [],
              },
          };
          const result = this._def.innerType._parse({
              data: newCtx.data,
              path: newCtx.path,
              parent: {
                  ...newCtx,
              },
          });
          if (isAsync(result)) {
              return result.then((result) => {
                  return {
                      status: "valid",
                      value: result.status === "valid"
                          ? result.value
                          : this._def.catchValue({
                              get error() {
                                  return new ZodError(newCtx.common.issues);
                              },
                              input: newCtx.data,
                          }),
                  };
              });
          }
          else {
              return {
                  status: "valid",
                  value: result.status === "valid"
                      ? result.value
                      : this._def.catchValue({
                          get error() {
                              return new ZodError(newCtx.common.issues);
                          },
                          input: newCtx.data,
                      }),
              };
          }
      }
      removeCatch() {
          return this._def.innerType;
      }
  }
  ZodCatch.create = (type, params) => {
      return new ZodCatch({
          innerType: type,
          typeName: ZodFirstPartyTypeKind.ZodCatch,
          catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
          ...processCreateParams(params),
      });
  };
  class ZodNaN extends ZodType {
      _parse(input) {
          const parsedType = this._getType(input);
          if (parsedType !== ZodParsedType.nan) {
              const ctx = this._getOrReturnCtx(input);
              addIssueToContext(ctx, {
                  code: ZodIssueCode.invalid_type,
                  expected: ZodParsedType.nan,
                  received: ctx.parsedType,
              });
              return INVALID;
          }
          return { status: "valid", value: input.data };
      }
  }
  ZodNaN.create = (params) => {
      return new ZodNaN({
          typeName: ZodFirstPartyTypeKind.ZodNaN,
          ...processCreateParams(params),
      });
  };
  const BRAND = Symbol("zod_brand");
  class ZodBranded extends ZodType {
      _parse(input) {
          const { ctx } = this._processInputParams(input);
          const data = ctx.data;
          return this._def.type._parse({
              data,
              path: ctx.path,
              parent: ctx,
          });
      }
      unwrap() {
          return this._def.type;
      }
  }
  class ZodPipeline extends ZodType {
      _parse(input) {
          const { status, ctx } = this._processInputParams(input);
          if (ctx.common.async) {
              const handleAsync = async () => {
                  const inResult = await this._def.in._parseAsync({
                      data: ctx.data,
                      path: ctx.path,
                      parent: ctx,
                  });
                  if (inResult.status === "aborted")
                      return INVALID;
                  if (inResult.status === "dirty") {
                      status.dirty();
                      return DIRTY(inResult.value);
                  }
                  else {
                      return this._def.out._parseAsync({
                          data: inResult.value,
                          path: ctx.path,
                          parent: ctx,
                      });
                  }
              };
              return handleAsync();
          }
          else {
              const inResult = this._def.in._parseSync({
                  data: ctx.data,
                  path: ctx.path,
                  parent: ctx,
              });
              if (inResult.status === "aborted")
                  return INVALID;
              if (inResult.status === "dirty") {
                  status.dirty();
                  return {
                      status: "dirty",
                      value: inResult.value,
                  };
              }
              else {
                  return this._def.out._parseSync({
                      data: inResult.value,
                      path: ctx.path,
                      parent: ctx,
                  });
              }
          }
      }
      static create(a, b) {
          return new ZodPipeline({
              in: a,
              out: b,
              typeName: ZodFirstPartyTypeKind.ZodPipeline,
          });
      }
  }
  class ZodReadonly extends ZodType {
      _parse(input) {
          const result = this._def.innerType._parse(input);
          if (isValid(result)) {
              result.value = Object.freeze(result.value);
          }
          return result;
      }
  }
  ZodReadonly.create = (type, params) => {
      return new ZodReadonly({
          innerType: type,
          typeName: ZodFirstPartyTypeKind.ZodReadonly,
          ...processCreateParams(params),
      });
  };
  const custom = (check, params = {}, 
  /**
   * @deprecated
   *
   * Pass `fatal` into the params object instead:
   *
   * ```ts
   * z.string().custom((val) => val.length > 5, { fatal: false })
   * ```
   *
   */
  fatal) => {
      if (check)
          return ZodAny.create().superRefine((data, ctx) => {
              var _a, _b;
              if (!check(data)) {
                  const p = typeof params === "function"
                      ? params(data)
                      : typeof params === "string"
                          ? { message: params }
                          : params;
                  const _fatal = (_b = (_a = p.fatal) !== null && _a !== void 0 ? _a : fatal) !== null && _b !== void 0 ? _b : true;
                  const p2 = typeof p === "string" ? { message: p } : p;
                  ctx.addIssue({ code: "custom", ...p2, fatal: _fatal });
              }
          });
      return ZodAny.create();
  };
  const late = {
      object: ZodObject.lazycreate,
  };
  var ZodFirstPartyTypeKind;
  (function (ZodFirstPartyTypeKind) {
      ZodFirstPartyTypeKind["ZodString"] = "ZodString";
      ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
      ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
      ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
      ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
      ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
      ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
      ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
      ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
      ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
      ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
      ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
      ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
      ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
      ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
      ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
      ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
      ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
      ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
      ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
      ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
      ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
      ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
      ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
      ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
      ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
      ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
      ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
      ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
      ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
      ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
      ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
      ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
      ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
      ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
      ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  const instanceOfType = (
  // const instanceOfType = <T extends new (...args: any[]) => any>(
  cls, params = {
      message: `Input not instance of ${cls.name}`,
  }) => custom((data) => data instanceof cls, params);
  const stringType = ZodString.create;
  const numberType = ZodNumber.create;
  const nanType = ZodNaN.create;
  const bigIntType = ZodBigInt.create;
  const booleanType = ZodBoolean.create;
  const dateType = ZodDate.create;
  const symbolType = ZodSymbol.create;
  const undefinedType = ZodUndefined.create;
  const nullType = ZodNull.create;
  const anyType = ZodAny.create;
  const unknownType = ZodUnknown.create;
  const neverType = ZodNever.create;
  const voidType = ZodVoid.create;
  const arrayType = ZodArray.create;
  const objectType = ZodObject.create;
  const strictObjectType = ZodObject.strictCreate;
  const unionType = ZodUnion.create;
  const discriminatedUnionType = ZodDiscriminatedUnion.create;
  const intersectionType = ZodIntersection.create;
  const tupleType = ZodTuple.create;
  const recordType = ZodRecord.create;
  const mapType = ZodMap.create;
  const setType = ZodSet.create;
  const functionType = ZodFunction.create;
  const lazyType = ZodLazy.create;
  const literalType = ZodLiteral.create;
  const enumType = ZodEnum.create;
  const nativeEnumType = ZodNativeEnum.create;
  const promiseType = ZodPromise.create;
  const effectsType = ZodEffects.create;
  const optionalType = ZodOptional.create;
  const nullableType = ZodNullable.create;
  const preprocessType = ZodEffects.createWithPreprocess;
  const pipelineType = ZodPipeline.create;
  const ostring = () => stringType().optional();
  const onumber = () => numberType().optional();
  const oboolean = () => booleanType().optional();
  const coerce = {
      string: ((arg) => ZodString.create({ ...arg, coerce: true })),
      number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
      boolean: ((arg) => ZodBoolean.create({
          ...arg,
          coerce: true,
      })),
      bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
      date: ((arg) => ZodDate.create({ ...arg, coerce: true })),
  };
  const NEVER = INVALID;
  
  var z = /*#__PURE__*/Object.freeze({
      __proto__: null,
      defaultErrorMap: errorMap,
      setErrorMap: setErrorMap,
      getErrorMap: getErrorMap,
      makeIssue: makeIssue,
      EMPTY_PATH: EMPTY_PATH,
      addIssueToContext: addIssueToContext,
      ParseStatus: ParseStatus,
      INVALID: INVALID,
      DIRTY: DIRTY,
      OK: OK,
      isAborted: isAborted,
      isDirty: isDirty,
      isValid: isValid,
      isAsync: isAsync,
      get util () { return util; },
      get objectUtil () { return objectUtil; },
      ZodParsedType: ZodParsedType,
      getParsedType: getParsedType,
      ZodType: ZodType,
      ZodString: ZodString,
      ZodNumber: ZodNumber,
      ZodBigInt: ZodBigInt,
      ZodBoolean: ZodBoolean,
      ZodDate: ZodDate,
      ZodSymbol: ZodSymbol,
      ZodUndefined: ZodUndefined,
      ZodNull: ZodNull,
      ZodAny: ZodAny,
      ZodUnknown: ZodUnknown,
      ZodNever: ZodNever,
      ZodVoid: ZodVoid,
      ZodArray: ZodArray,
      ZodObject: ZodObject,
      ZodUnion: ZodUnion,
      ZodDiscriminatedUnion: ZodDiscriminatedUnion,
      ZodIntersection: ZodIntersection,
      ZodTuple: ZodTuple,
      ZodRecord: ZodRecord,
      ZodMap: ZodMap,
      ZodSet: ZodSet,
      ZodFunction: ZodFunction,
      ZodLazy: ZodLazy,
      ZodLiteral: ZodLiteral,
      ZodEnum: ZodEnum,
      ZodNativeEnum: ZodNativeEnum,
      ZodPromise: ZodPromise,
      ZodEffects: ZodEffects,
      ZodTransformer: ZodEffects,
      ZodOptional: ZodOptional,
      ZodNullable: ZodNullable,
      ZodDefault: ZodDefault,
      ZodCatch: ZodCatch,
      ZodNaN: ZodNaN,
      BRAND: BRAND,
      ZodBranded: ZodBranded,
      ZodPipeline: ZodPipeline,
      ZodReadonly: ZodReadonly,
      custom: custom,
      Schema: ZodType,
      ZodSchema: ZodType,
      late: late,
      get ZodFirstPartyTypeKind () { return ZodFirstPartyTypeKind; },
      coerce: coerce,
      any: anyType,
      array: arrayType,
      bigint: bigIntType,
      boolean: booleanType,
      date: dateType,
      discriminatedUnion: discriminatedUnionType,
      effect: effectsType,
      'enum': enumType,
      'function': functionType,
      'instanceof': instanceOfType,
      intersection: intersectionType,
      lazy: lazyType,
      literal: literalType,
      map: mapType,
      nan: nanType,
      nativeEnum: nativeEnumType,
      never: neverType,
      'null': nullType,
      nullable: nullableType,
      number: numberType,
      object: objectType,
      oboolean: oboolean,
      onumber: onumber,
      optional: optionalType,
      ostring: ostring,
      pipeline: pipelineType,
      preprocess: preprocessType,
      promise: promiseType,
      record: recordType,
      set: setType,
      strictObject: strictObjectType,
      string: stringType,
      symbol: symbolType,
      transformer: effectsType,
      tuple: tupleType,
      'undefined': undefinedType,
      union: unionType,
      unknown: unknownType,
      'void': voidType,
      NEVER: NEVER,
      ZodIssueCode: ZodIssueCode,
      quotelessJson: quotelessJson,
      ZodError: ZodError
  });
  
  const blockBaseSchema = z.object({
    id: z.string(),
    groupId: z.string(),
    outgoingEdgeId: z.string().optional()
  });
  const optionBaseSchema = z.object({
    variableId: z.string().optional()
  });
  
  const fileInputOptionsSchema = optionBaseSchema.merge(z.object({
    isRequired: z.boolean().optional(),
    isMultipleAllowed: z.boolean(),
    labels: z.object({
      placeholder: z.string(),
      button: z.string(),
      clear: z.string().optional(),
      skip: z.string().optional()
    }),
    sizeLimit: z.number().optional()
  }));
  blockBaseSchema.merge(z.object({
    type: z.literal(InputBlockType.FILE),
    options: fileInputOptionsSchema
  }));
  const defaultFileInputOptions = {
    isRequired: true,
    isMultipleAllowed: false,
    labels: {
      placeholder: `<strong>
        Click to upload
      </strong> or drag and drop<br>
      (size limit: 10MB)`,
      button: 'Upload',
      clear: 'Clear',
      skip: 'Skip'
    }
  };
  
  const _tmpl$$n = /*#__PURE__*/template(`<div class="w-full bg-gray-200 rounded-full h-2.5"><div class="upload-progress-bar h-2.5 rounded-full">`),
    _tmpl$2$c = /*#__PURE__*/template(`<span class="relative"><div class="total-files-indicator flex items-center justify-center absolute -right-1 rounded-full px-1 w-4 h-4">`),
    _tmpl$3$5 = /*#__PURE__*/template(`<div class="flex flex-col justify-center items-center"><p class="text-sm text-gray-500 text-center">`),
    _tmpl$4$3 = /*#__PURE__*/template(`<input id="dropzone-file" type="file" class="hidden">`),
    _tmpl$5$1 = /*#__PURE__*/template(`<div class="flex justify-end">`),
    _tmpl$6$1 = /*#__PURE__*/template(`<div class="flex justify-end"><div class="flex gap-2">`),
    _tmpl$7$1 = /*#__PURE__*/template(`<p class="text-red-500 text-sm">`),
    _tmpl$8 = /*#__PURE__*/template(`<form class="flex flex-col w-full gap-2"><label for="dropzone-file">`),
    _tmpl$9 = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-3 text-gray-500"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path><polyline points="16 16 12 12 8 16">`),
    _tmpl$10 = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-3 text-gray-500"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9">`);
  const FileUploadForm = props => {
    const [selectedFiles, setSelectedFiles] = createSignal([]);
    const [isUploading, setIsUploading] = createSignal(false);
    const [uploadProgressPercent, setUploadProgressPercent] = createSignal(0);
    const [isDraggingOver, setIsDraggingOver] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal();
    const onNewFiles = files => {
      setErrorMessage(undefined);
      const newFiles = Array.from(files);
      if (newFiles.some(file => file.size > (props.block.options.sizeLimit ?? 10) * 1024 * 1024)) return setErrorMessage(`A file is larger than ${props.block.options.sizeLimit ?? 10}MB`);
      if (!props.block.options.isMultipleAllowed && files) return startSingleFileUpload(newFiles[0]);
      setSelectedFiles([...selectedFiles(), ...newFiles]);
    };
    const handleSubmit = async e => {
      e.preventDefault();
      if (selectedFiles().length === 0) return;
      startFilesUpload(selectedFiles());
    };
    const startSingleFileUpload = async file => {
      if (props.context.isPreview) return props.onSubmit({
        label: `File uploaded`,
        value: 'http://fake-upload-url.com'
      });
      setIsUploading(true);
      const urls = await uploadFiles({
        sessionId: props.context.sessionId,
        basePath: `${props.context.apiHost ?? guessApiHost()}/presigned-url`,
        files: [{
          file,
          path: `${file.name}`
          // path: `public/results/${props.context.resultId}/${props.block.id}/${file.name}`,
        }]
      });
  
      setIsUploading(false);
      if (urls.length) return props.onSubmit({
        label: `File uploaded`,
        value: urls[0] ?? ''
      });
      setErrorMessage('An error occured while uploading the file');
    };
    const startFilesUpload = async files => {
      if (props.context.isPreview) return props.onSubmit({
        label: `${files.length} file${files.length > 1 ? 's' : ''} uploaded`,
        value: files.map((_, idx) => `http://fake-upload-url.com/${idx}`).join(', ')
      });
      setIsUploading(true);
      const urls = await uploadFiles({
        sessionId: props.context.sessionId,
        basePath: `${props.context.apiHost ?? guessApiHost()}/presigned-url`,
        files: files.map(file => ({
          file: file,
          path: `${file.name}`
          // path: `public/results/${props.context.resultId}/${props.block.id}/${file.name}`,
        })),
  
        onUploadProgress: setUploadProgressPercent
      });
      setIsUploading(false);
      setUploadProgressPercent(0);
      if (urls.length !== files.length) return setErrorMessage('An error occured while uploading the files');
      props.onSubmit({
        label: `${urls.length} file${urls.length > 1 ? 's' : ''} uploaded`,
        value: urls.join(', ')
      });
    };
    const handleDragOver = e => {
      e.preventDefault();
      setIsDraggingOver(true);
    };
    const handleDragLeave = () => setIsDraggingOver(false);
    const handleDropFile = e => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer?.files) return;
      onNewFiles(e.dataTransfer.files);
    };
    const clearFiles = () => setSelectedFiles([]);
    const skip = () => props.onSkip(props.block.options.labels.skip ?? defaultFileInputOptions.labels.skip);
    return (() => {
      const _el$ = _tmpl$8(),
        _el$2 = _el$.firstChild;
      _el$.addEventListener("submit", handleSubmit);
      _el$2.addEventListener("drop", handleDropFile);
      _el$2.addEventListener("dragleave", handleDragLeave);
      _el$2.addEventListener("dragover", handleDragOver);
      insert(_el$2, createComponent(Switch, {
        get children() {
          return [createComponent(Match, {
            get when() {
              return isUploading();
            },
            get children() {
              return createComponent(Show, {
                get when() {
                  return selectedFiles().length > 1;
                },
                get fallback() {
                  return createComponent(Spinner, {});
                },
                get children() {
                  const _el$3 = _tmpl$$n(),
                    _el$4 = _el$3.firstChild;
                  _el$4.style.setProperty("transition", "width 150ms cubic-bezier(0.4, 0, 0.2, 1)");
                  createRenderEffect(() => `${uploadProgressPercent() > 0 ? uploadProgressPercent : 10}%` != null ? _el$4.style.setProperty("width", `${uploadProgressPercent() > 0 ? uploadProgressPercent : 10}%`) : _el$4.style.removeProperty("width"));
                  return _el$3;
                }
              });
            }
          }), createComponent(Match, {
            get when() {
              return !isUploading();
            },
            get children() {
              return [(() => {
                const _el$5 = _tmpl$3$5(),
                  _el$8 = _el$5.firstChild;
                insert(_el$5, createComponent(Show, {
                  get when() {
                    return selectedFiles().length;
                  },
                  get fallback() {
                    return createComponent(UploadIcon, {});
                  },
                  get children() {
                    const _el$6 = _tmpl$2$c(),
                      _el$7 = _el$6.firstChild;
                    insert(_el$6, createComponent(FileIcon, {}), _el$7);
                    _el$7.style.setProperty("bottom", "5px");
                    insert(_el$7, () => selectedFiles().length);
                    return _el$6;
                  }
                }), _el$8);
                createRenderEffect(() => _el$8.innerHTML = props.block.options.labels.placeholder);
                return _el$5;
              })(), (() => {
                const _el$9 = _tmpl$4$3();
                _el$9.addEventListener("change", e => {
                  if (!e.currentTarget.files) return;
                  onNewFiles(e.currentTarget.files);
                });
                createRenderEffect(() => _el$9.multiple = props.block.options.isMultipleAllowed);
                return _el$9;
              })()];
            }
          })];
        }
      }));
      insert(_el$, createComponent(Show, {
        get when() {
          return selectedFiles().length === 0 && props.block.options.isRequired === false;
        },
        get children() {
          const _el$10 = _tmpl$5$1();
          insert(_el$10, createComponent(Button, {
            "on:click": skip,
            get children() {
              return props.block.options.labels.skip ?? defaultFileInputOptions.labels.skip;
            }
          }));
          return _el$10;
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return createMemo(() => !!(props.block.options.isMultipleAllowed && selectedFiles().length > 0))() && !isUploading();
        },
        get children() {
          const _el$11 = _tmpl$6$1(),
            _el$12 = _el$11.firstChild;
          insert(_el$12, createComponent(Show, {
            get when() {
              return selectedFiles().length;
            },
            get children() {
              return createComponent(Button, {
                variant: "secondary",
                "on:click": clearFiles,
                get children() {
                  return props.block.options.labels.clear ?? defaultFileInputOptions.labels.clear;
                }
              });
            }
          }), null);
          insert(_el$12, createComponent(SendButton, {
            type: "submit",
            disableIcon: true,
            get children() {
              return createMemo(() => props.block.options.labels.button === defaultFileInputOptions.labels.button)() ? `Upload ${selectedFiles().length} file${selectedFiles().length > 1 ? 's' : ''}` : props.block.options.labels.button;
            }
          }), null);
          return _el$11;
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return errorMessage();
        },
        get children() {
          const _el$13 = _tmpl$7$1();
          insert(_el$13, errorMessage);
          return _el$13;
        }
      }), null);
      createRenderEffect(() => className(_el$2, 'agent-upload-input py-6 flex flex-col justify-center items-center w-full bg-gray-50 border-2 border-gray-300 border-dashed cursor-pointer hover:bg-gray-100 px-8 ' + (isDraggingOver() ? 'dragging-over' : '')));
      return _el$;
    })();
  };
  const UploadIcon = () => _tmpl$9();
  const FileIcon = () => _tmpl$10();
  
  var PaymentProvider;
  (function (PaymentProvider) {
    PaymentProvider["STRIPE"] = "Stripe";
  })(PaymentProvider || (PaymentProvider = {}));
  
  const loadStripe = publishableKey => new Promise(resolve => {
    if (window.Stripe) return resolve(window.Stripe(publishableKey));
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3';
    document.body.appendChild(script);
    script.onload = () => {
      if (!window.Stripe) throw new Error('Stripe.js failed to load.');
      resolve(window.Stripe(publishableKey));
    };
  });
  
  const _tmpl$$m = /*#__PURE__*/template(`<div class="agent-input-error-message mt-4 text-center animate-fade-in">`),
    _tmpl$2$b = /*#__PURE__*/template(`<form id="payment-form" class="flex flex-col p-4 agent-input w-full items-center"><slot name="stripe-payment-form">`);
  const slotName = 'stripe-payment-form';
  let paymentElementSlot;
  let stripe = null;
  let elements = null;
  const StripePaymentForm = props => {
    const [message, setMessage] = createSignal();
    const [isMounted, setIsMounted] = createSignal(false);
    const [isLoading, setIsLoading] = createSignal(false);
    onMount(async () => {
      initShadowMountPoint(paymentElementSlot);
      stripe = await loadStripe(props.options.publicKey);
      if (!stripe) return;
      elements = stripe.elements({
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: getComputedStyle(paymentElementSlot).getPropertyValue('--agent-button-bg-color')
          }
        },
        clientSecret: props.options.paymentIntentSecret
      });
      const paymentElement = elements.create('payment', {
        layout: 'tabs'
      });
      paymentElement.mount('#payment-element');
      setTimeout(() => setIsMounted(true), 1000);
    });
    const handleSubmit = async event => {
      event.preventDefault();
      if (!stripe || !elements) return;
      setIsLoading(true);
      setPaymentInProgressInStorage({
        sessionId: props.context.sessionId,
        agentConfig: props.context.agentConfig
      });
      const {
        error,
        paymentIntent
      } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
          payment_method_data: {
            billing_details: {
              name: props.options.additionalInformation?.name,
              email: props.options.additionalInformation?.email,
              phone: props.options.additionalInformation?.phoneNumber,
              address: {
                ...props.options.additionalInformation?.address,
                postal_code: props.options.additionalInformation?.address?.postalCode
              }
            }
          }
        },
        redirect: 'if_required'
      });
      removePaymentInProgressFromStorage();
      setIsLoading(false);
      if (error?.type === 'validation_error') return;
      if (error?.type === 'card_error') return setMessage(error.message);
      if (!error && paymentIntent.status === 'succeeded') return props.onSuccess();
    };
    return (() => {
      const _el$ = _tmpl$2$b(),
        _el$2 = _el$.firstChild;
      _el$.addEventListener("submit", handleSubmit);
      const _ref$ = paymentElementSlot;
      typeof _ref$ === "function" ? use(_ref$, _el$2) : paymentElementSlot = _el$2;
      _el$2._$owner = getOwner();
      insert(_el$, createComponent(Show, {
        get when() {
          return isMounted();
        },
        get children() {
          return createComponent(SendButton, {
            get isLoading() {
              return isLoading();
            },
            "class": "mt-4 w-full max-w-lg animate-fade-in",
            disableIcon: true,
            get children() {
              return [createMemo(() => props.options.labels.button), " ", createMemo(() => props.options.amountLabel)];
            }
          });
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return message();
        },
        get children() {
          const _el$3 = _tmpl$$m();
          insert(_el$3, message);
          return _el$3;
        }
      }), null);
      return _el$;
    })();
  };
  const initShadowMountPoint = element => {
    const rootNode = element.getRootNode();
    const host = rootNode.host;
    const slotPlaceholder = document.createElement('div');
    slotPlaceholder.style.width = '100%';
    slotPlaceholder.slot = slotName;
    host.appendChild(slotPlaceholder);
    const paymentElementContainer = document.createElement('div');
    paymentElementContainer.id = 'payment-element';
    slotPlaceholder.appendChild(paymentElementContainer);
  };
  
  const PaymentForm = props => createComponent(Switch, {
    get children() {
      return createComponent(Match, {
        get when() {
          return props.options.provider === PaymentProvider.STRIPE;
        },
        get children() {
          return createComponent(StripePaymentForm, {
            get onSuccess() {
              return props.onSuccess;
            },
            get options() {
              return props.options;
            },
            get context() {
              return props.context;
            }
          });
        }
      });
    }
  });
  
  const _tmpl$$l = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3px" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12">`);
  const CheckIcon = props => (() => {
    const _el$ = _tmpl$$l();
    spread(_el$, props, true, true);
    return _el$;
  })();
  
  const _tmpl$$k = /*#__PURE__*/template(`<div>`);
  const Checkbox = props => {
    return (() => {
      const _el$ = _tmpl$$k();
      insert(_el$, createComponent(Show, {
        get when() {
          return props.isChecked;
        },
        get children() {
          return createComponent(CheckIcon, {});
        }
      }));
      createRenderEffect(() => className(_el$, 'w-4 h-4 agent-checkbox' + (props.isChecked ? ' checked' : '') + (props.class ? ` ${props.class}` : '')));
      return _el$;
    })();
  };
  
  const _tmpl$$j = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2px" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18">`);
  const CloseIcon = props => (() => {
    const _el$ = _tmpl$$j();
    spread(_el$, props, true, true);
    return _el$;
  })();
  
  const _tmpl$$i = /*#__PURE__*/template(`<button class="w-5 h-5">`),
    _tmpl$2$a = /*#__PURE__*/template(`<div class="flex justify-between items-center gap-2 w-full pr-4"><input class="focus:outline-none bg-transparent px-4 py-4 flex-1 w-full text-input" type="text">`);
  const SearchInput = props => {
    const [value, setValue] = createSignal('');
    const [local, others] = splitProps(props, ['onInput', 'ref']);
    const changeValue = value => {
      setValue(value);
      local.onInput(value);
    };
    const clearValue = () => {
      setValue('');
      props.onClear();
    };
    return (() => {
      const _el$ = _tmpl$2$a(),
        _el$2 = _el$.firstChild;
      _el$2.$$input = e => changeValue(e.currentTarget.value);
      const _ref$ = props.ref;
      typeof _ref$ === "function" ? use(_ref$, _el$2) : props.ref = _el$2;
      _el$2.style.setProperty("font-size", "16px");
      spread(_el$2, mergeProps({
        get value() {
          return value();
        }
      }, others), false, false);
      insert(_el$, createComponent(Show, {
        get when() {
          return value().length > 0;
        },
        get children() {
          const _el$3 = _tmpl$$i();
          _el$3.addEventListener("click", clearValue);
          insert(_el$3, createComponent(CloseIcon, {}));
          return _el$3;
        }
      }), null);
      return _el$;
    })();
  };
  delegateEvents(["input"]);
  
  var ItemType;
  (function (ItemType) {
    ItemType[ItemType["BUTTON"] = 0] = "BUTTON";
    ItemType[ItemType["CONDITION"] = 1] = "CONDITION";
    ItemType[ItemType["AB_TEST"] = 2] = "AB_TEST";
    ItemType[ItemType["PICTURE_CHOICE"] = 3] = "PICTURE_CHOICE";
  })(ItemType || (ItemType = {}));
  
  const itemBaseSchema = z.object({
    id: z.string(),
    blockId: z.string(),
    outgoingEdgeId: z.string().optional()
  });
  
  const defaultButtonLabel = 'Send';
  
  var LogicBlockType;
  (function (LogicBlockType) {
    LogicBlockType["SET_VARIABLE"] = "Set variable";
    LogicBlockType["CONDITION"] = "Condition";
    LogicBlockType["REDIRECT"] = "Redirect";
    LogicBlockType["SCRIPT"] = "Code";
    LogicBlockType["AGENT_LINK"] = "Agent link";
    LogicBlockType["WAIT"] = "Wait";
    LogicBlockType["JUMP"] = "Jump";
    LogicBlockType["AB_TEST"] = "AB test";
  })(LogicBlockType || (LogicBlockType = {}));
  
  var LogicalOperator;
  (function (LogicalOperator) {
    LogicalOperator["OR"] = "OR";
    LogicalOperator["AND"] = "AND";
  })(LogicalOperator || (LogicalOperator = {}));
  var ComparisonOperators;
  (function (ComparisonOperators) {
    ComparisonOperators["EQUAL"] = "Equal to";
    ComparisonOperators["NOT_EQUAL"] = "Not equal";
    ComparisonOperators["CONTAINS"] = "Contains";
    ComparisonOperators["NOT_CONTAINS"] = "Does not contain";
    ComparisonOperators["GREATER"] = "Greater than";
    ComparisonOperators["LESS"] = "Less than";
    ComparisonOperators["IS_SET"] = "Is set";
    ComparisonOperators["IS_EMPTY"] = "Is empty";
    ComparisonOperators["STARTS_WITH"] = "Starts with";
    ComparisonOperators["ENDS_WITH"] = "Ends with";
    ComparisonOperators["MATCHES_REGEX"] = "Matches regex";
    ComparisonOperators["NOT_MATCH_REGEX"] = "Does not match regex";
  })(ComparisonOperators || (ComparisonOperators = {}));
  const comparisonSchema = z.object({
    id: z.string(),
    variableId: z.string().optional(),
    comparisonOperator: z.nativeEnum(ComparisonOperators).optional(),
    value: z.string().optional()
  });
  const conditionSchema = z.object({
    logicalOperator: z.nativeEnum(LogicalOperator),
    comparisons: z.array(comparisonSchema)
  });
  const conditionItemSchema = itemBaseSchema.merge(z.object({
    type: z.literal(ItemType.CONDITION),
    content: conditionSchema
  }));
  blockBaseSchema.merge(z.object({
    type: z.enum([LogicBlockType.CONDITION]),
    items: z.array(conditionItemSchema)
  }));
  ({
    comparisons: [],
    logicalOperator: LogicalOperator.AND
  });
  
  const choiceInputOptionsSchema = optionBaseSchema.merge(z.object({
    isMultipleChoice: z.boolean(),
    buttonLabel: z.string(),
    dynamicVariableId: z.string().optional(),
    isSearchable: z.boolean().optional(),
    searchInputPlaceholder: z.string().optional()
  }));
  const defaultChoiceInputOptions = {
    buttonLabel: defaultButtonLabel,
    searchInputPlaceholder: 'Filter the options...',
    isMultipleChoice: false,
    isSearchable: false
  };
  const buttonItemSchema = itemBaseSchema.merge(z.object({
    type: z.literal(ItemType.BUTTON),
    content: z.string().optional(),
    isUrl: z.boolean().optional(),
    displayCondition: z.object({
      isEnabled: z.boolean().optional(),
      condition: conditionSchema.optional()
    }).optional()
  }));
  blockBaseSchema.merge(z.object({
    type: z.enum([InputBlockType.CHOICE]),
    items: z.array(buttonItemSchema),
    options: choiceInputOptionsSchema
  }));
  
  const _tmpl$$h = /*#__PURE__*/template(`<div class="flex items-end agent-input w-full">`),
    _tmpl$2$9 = /*#__PURE__*/template(`<form class="flex flex-col items-end gap-2 w-full"><div>`),
    _tmpl$3$4 = /*#__PURE__*/template(`<span><div role="checkbox"><div class="flex items-center gap-2"><span>`),
    _tmpl$4$2 = /*#__PURE__*/template(`<span><div role="checkbox" aria-checked class="w-full py-2 px-4 font-semibold focus:outline-none cursor-pointer select-none agent-selectable selected"><div class="flex items-center gap-2"><span>`);
  const MultipleChoicesForm = props => {
    let inputRef;
    const [filteredItems, setFilteredItems] = createSignal(props.defaultItems);
    const [selectedItemIds, setSelectedItemIds] = createSignal([]);
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
    });
    const handleClick = itemId => {
      toggleSelectedItemId(itemId);
    };
    const toggleSelectedItemId = itemId => {
      const existingIndex = selectedItemIds().indexOf(itemId);
      if (existingIndex !== -1) {
        setSelectedItemIds(selectedItemIds => selectedItemIds.filter(selectedItemId => selectedItemId !== itemId));
      } else {
        setSelectedItemIds(selectedIndices => [...selectedIndices, itemId]);
      }
    };
    const handleSubmit = () => props.onSubmit({
      value: selectedItemIds().map(selectedItemId => props.defaultItems.find(item => item.id === selectedItemId)?.content).join(', ')
    });
    const filterItems = inputValue => {
      setFilteredItems(props.defaultItems.filter(item => item.content?.toLowerCase().includes((inputValue ?? '').toLowerCase())));
    };
    return (() => {
      const _el$ = _tmpl$2$9(),
        _el$3 = _el$.firstChild;
      _el$.addEventListener("submit", handleSubmit);
      insert(_el$, createComponent(Show, {
        get when() {
          return props.options.isSearchable;
        },
        get children() {
          const _el$2 = _tmpl$$h();
          insert(_el$2, createComponent(SearchInput, {
            ref(r$) {
              const _ref$ = inputRef;
              typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
            },
            onInput: filterItems,
            get placeholder() {
              return props.options.searchInputPlaceholder ?? defaultChoiceInputOptions.searchInputPlaceholder;
            },
            onClear: () => setFilteredItems(props.defaultItems)
          }));
          return _el$2;
        }
      }), _el$3);
      insert(_el$3, createComponent(For, {
        get each() {
          return filteredItems();
        },
        children: item => (() => {
          const _el$4 = _tmpl$3$4(),
            _el$5 = _el$4.firstChild,
            _el$6 = _el$5.firstChild,
            _el$7 = _el$6.firstChild;
          _el$5.addEventListener("click", () => handleClick(item.id));
          insert(_el$6, createComponent(Checkbox, {
            get isChecked() {
              return selectedItemIds().some(selectedItemId => selectedItemId === item.id);
            }
          }), _el$7);
          insert(_el$7, () => item.content);
          createRenderEffect(_p$ => {
            const _v$ = 'relative' + (isMobile() ? ' w-full' : ''),
              _v$2 = selectedItemIds().some(selectedItemId => selectedItemId === item.id),
              _v$3 = 'w-full py-2 px-4 font-semibold focus:outline-none cursor-pointer select-none agent-selectable' + (selectedItemIds().some(selectedItemId => selectedItemId === item.id) ? ' selected' : ''),
              _v$4 = item.id;
            _v$ !== _p$._v$ && className(_el$4, _p$._v$ = _v$);
            _v$2 !== _p$._v$2 && setAttribute(_el$5, "aria-checked", _p$._v$2 = _v$2);
            _v$3 !== _p$._v$3 && className(_el$5, _p$._v$3 = _v$3);
            _v$4 !== _p$._v$4 && setAttribute(_el$5, "data-itemid", _p$._v$4 = _v$4);
            return _p$;
          }, {
            _v$: undefined,
            _v$2: undefined,
            _v$3: undefined,
            _v$4: undefined
          });
          return _el$4;
        })()
      }), null);
      insert(_el$3, createComponent(For, {
        get each() {
          return selectedItemIds().filter(selectedItemId => filteredItems().every(item => item.id !== selectedItemId));
        },
        children: selectedItemId => (() => {
          const _el$8 = _tmpl$4$2(),
            _el$9 = _el$8.firstChild,
            _el$10 = _el$9.firstChild,
            _el$11 = _el$10.firstChild;
          _el$9.addEventListener("click", () => handleClick(selectedItemId));
          setAttribute(_el$9, "data-itemid", selectedItemId);
          insert(_el$10, createComponent(Checkbox, {
            isChecked: true
          }), _el$11);
          insert(_el$11, () => props.defaultItems.find(item => item.id === selectedItemId)?.content);
          createRenderEffect(() => className(_el$8, 'relative' + (isMobile() ? ' w-full' : '')));
          return _el$8;
        })()
      }), null);
      insert(_el$, (() => {
        const _c$ = createMemo(() => selectedItemIds().length > 0);
        return () => _c$() && createComponent(SendButton, {
          disableIcon: true,
          get children() {
            return props.options?.buttonLabel ?? 'Send';
          }
        });
      })(), null);
      createRenderEffect(() => className(_el$3, 'flex flex-wrap justify-end gap-2' + (props.options.isSearchable ? ' overflow-y-scroll max-h-80 rounded-md hide-scrollbar' : '')));
      return _el$;
    })();
  };
  
  const _tmpl$$g = /*#__PURE__*/template(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3">`);
  const ExternalLinkIcon = props => (() => {
    const _el$ = _tmpl$$g();
    spread(_el$, props, true, true);
    return _el$;
  })();
  
  const _tmpl$$f = /*#__PURE__*/template(`<div class="flex items-end agent-input w-full">`),
    _tmpl$2$8 = /*#__PURE__*/template(`<div class="flex flex-col gap-2 w-full"><div>`),
    _tmpl$3$3 = /*#__PURE__*/template(`<span>`),
    _tmpl$4$1 = /*#__PURE__*/template(`<span class="flex h-3 w-3 absolute top-0 right-0 -mt-1 -mr-1 ping"><span class="animate-ping absolute inline-flex h-full w-full rounded-full brightness-200 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 brightness-150">`);
  const Buttons = props => {
    console.log('Rendering Buttons component with props:', JSON.stringify(props, null, 2));
    let inputRef;
    const [filteredItems, setFilteredItems] = createSignal(props.defaultItems);
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
    });
    // eslint-disable-next-line solid/reactivity
    const handleClick = itemIndex => () => props.onSubmit({
      value: filteredItems()[itemIndex].content ?? ''
    });
    const filterItems = inputValue => {
      setFilteredItems(props.defaultItems.filter(item => item.content?.toLowerCase().includes((inputValue ?? '').toLowerCase())));
    };
    return (() => {
      const _el$ = _tmpl$2$8(),
        _el$3 = _el$.firstChild;
      insert(_el$, createComponent(Show, {
        get when() {
          return props.options.isSearchable;
        },
        get children() {
          const _el$2 = _tmpl$$f();
          insert(_el$2, createComponent(SearchInput, {
            ref(r$) {
              const _ref$ = inputRef;
              typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
            },
            onInput: filterItems,
            get placeholder() {
              return props.options.searchInputPlaceholder ?? defaultChoiceInputOptions.searchInputPlaceholder;
            },
            onClear: () => setFilteredItems(props.defaultItems)
          }));
          return _el$2;
        }
      }), _el$3);
      insert(_el$3, createComponent(For, {
        get each() {
          return filteredItems();
        },
        children: (item, index) => (() => {
          const _el$4 = _tmpl$3$3();
          insert(_el$4, createComponent(Button, {
            get ["on:click"]() {
              return handleClick(index());
            },
            get ["data-itemid"]() {
              return item.id;
            },
            "class": "w-full",
            get children() {
              return [createMemo(() => item.content), createMemo(() => createMemo(() => !!item.isUrl)() && createComponent(ExternalLinkIcon, {
                "class": "ml-2 -mr-1 h-4 w-4",
                "aria-hidden": "true"
              }))];
            }
          }), null);
          insert(_el$4, (() => {
            const _c$ = createMemo(() => !!(props.inputIndex === 0 && props.defaultItems.length === 1));
            return () => _c$() && _tmpl$4$1();
          })(), null);
          createRenderEffect(() => className(_el$4, 'relative' + (isMobile() ? ' w-full' : '')));
          return _el$4;
        })()
      }));
      createRenderEffect(() => className(_el$3, 'flex flex-wrap justify-end gap-2' + (props.options.isSearchable ? ' overflow-y-scroll max-h-80 rounded-md hide-scrollbar' : '')));
      return _el$;
    })();
  };
  
  const _tmpl$$e = /*#__PURE__*/template(`<div class="flex items-end agent-input w-full">`),
    _tmpl$2$7 = /*#__PURE__*/template(`<div class="flex flex-col gap-2 w-full"><div>`),
    _tmpl$3$2 = /*#__PURE__*/template(`<button><img fetchpriority="high" class="m-auto"><div><span class="font-semibold"></span><span class="text-sm whitespace-pre-wrap text-left">`);
  const SinglePictureChoice = props => {
    let inputRef;
    const [filteredItems, setFilteredItems] = createSignal(props.defaultItems);
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
    });
    // eslint-disable-next-line solid/reactivity
    const handleClick = itemIndex => () => {
      const pictureSrc = filteredItems()[itemIndex].pictureSrc;
      if (!pictureSrc) return;
      return props.onSubmit({
        value: filteredItems()[itemIndex].title ?? pictureSrc
      });
    };
    const filterItems = inputValue => {
      setFilteredItems(props.defaultItems.filter(item => item.title?.toLowerCase().includes((inputValue ?? '').toLowerCase()) || item.description?.toLowerCase().includes((inputValue ?? '').toLowerCase())));
    };
    return (() => {
      const _el$ = _tmpl$2$7(),
        _el$3 = _el$.firstChild;
      insert(_el$, createComponent(Show, {
        get when() {
          return props.options.isSearchable;
        },
        get children() {
          const _el$2 = _tmpl$$e();
          insert(_el$2, createComponent(SearchInput, {
            ref(r$) {
              const _ref$ = inputRef;
              typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
            },
            onInput: filterItems,
            get placeholder() {
              return props.options.searchInputPlaceholder ?? '';
            },
            onClear: () => setFilteredItems(props.defaultItems)
          }));
          return _el$2;
        }
      }), _el$3);
      insert(_el$3, createComponent(For, {
        get each() {
          return filteredItems();
        },
        children: (item, index) => (() => {
          const _el$4 = _tmpl$3$2(),
            _el$5 = _el$4.firstChild,
            _el$6 = _el$5.nextSibling,
            _el$7 = _el$6.firstChild,
            _el$8 = _el$7.nextSibling;
          _el$4.addEventListener("click", handleClick(index()));
          insert(_el$7, () => item.title);
          insert(_el$8, () => item.description);
          createRenderEffect(_p$ => {
            const _v$ = item.id,
              _v$2 = 'flex flex-col agent-picture-button focus:outline-none filter hover:brightness-90 active:brightness-75 justify-between  ' + (isSvgSrc(item.pictureSrc) ? 'has-svg' : ''),
              _v$3 = item.pictureSrc,
              _v$4 = item.title ?? `Picture ${index() + 1}`,
              _v$5 = `Picture choice ${index() + 1}`,
              _v$6 = 'flex flex-col gap-1 py-2 flex-shrink-0 px-4 w-full' + (item.description ? ' items-start' : '');
            _v$ !== _p$._v$ && setAttribute(_el$4, "data-itemid", _p$._v$ = _v$);
            _v$2 !== _p$._v$2 && className(_el$4, _p$._v$2 = _v$2);
            _v$3 !== _p$._v$3 && setAttribute(_el$5, "src", _p$._v$3 = _v$3);
            _v$4 !== _p$._v$4 && setAttribute(_el$5, "alt", _p$._v$4 = _v$4);
            _v$5 !== _p$._v$5 && setAttribute(_el$5, "elementtiming", _p$._v$5 = _v$5);
            _v$6 !== _p$._v$6 && className(_el$6, _p$._v$6 = _v$6);
            return _p$;
          }, {
            _v$: undefined,
            _v$2: undefined,
            _v$3: undefined,
            _v$4: undefined,
            _v$5: undefined,
            _v$6: undefined
          });
          return _el$4;
        })()
      }));
      createRenderEffect(() => className(_el$3, 'gap-2 flex flex-wrap justify-end' + (props.options.isSearchable ? ' overflow-y-scroll max-h-[464px] rounded-md hide-scrollbar' : '')));
      return _el$;
    })();
  };
  
  const pictureChoiceOptionsSchema = optionBaseSchema.merge(z.object({
    isMultipleChoice: z.boolean().optional(),
    isSearchable: z.boolean().optional(),
    buttonLabel: z.string(),
    searchInputPlaceholder: z.string(),
    dynamicItems: z.object({
      isEnabled: z.boolean().optional(),
      titlesVariableId: z.string().optional(),
      descriptionsVariableId: z.string().optional(),
      pictureSrcsVariableId: z.string().optional()
    }).optional()
  }));
  const pictureChoiceItemSchema = itemBaseSchema.merge(z.object({
    type: z.literal(ItemType.PICTURE_CHOICE),
    pictureSrc: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    displayCondition: z.object({
      isEnabled: z.boolean().optional(),
      condition: conditionSchema.optional()
    }).optional()
  }));
  blockBaseSchema.merge(z.object({
    type: z.enum([InputBlockType.PICTURE_CHOICE]),
    items: z.array(pictureChoiceItemSchema),
    options: pictureChoiceOptionsSchema
  }));
  const defaultPictureChoiceOptions = {
    buttonLabel: defaultButtonLabel,
    searchInputPlaceholder: 'Filter the options...'
  };
  
  const _tmpl$$d = /*#__PURE__*/template(`<div class="flex items-end agent-input w-full">`),
    _tmpl$2$6 = /*#__PURE__*/template(`<form class="flex flex-col gap-2 w-full items-end"><div>`),
    _tmpl$3$1 = /*#__PURE__*/template(`<span class="font-semibold">`),
    _tmpl$4 = /*#__PURE__*/template(`<span class="text-sm whitespace-pre-wrap text-left">`),
    _tmpl$5 = /*#__PURE__*/template(`<div class="flex flex-col gap-1 ">`),
    _tmpl$6 = /*#__PURE__*/template(`<div role="checkbox"><img fetchpriority="high" class="m-auto"><div>`),
    _tmpl$7 = /*#__PURE__*/template(`<div role="checkbox" aria-checked class="flex flex-col focus:outline-none cursor-pointer select-none agent-selectable-picture selected"><img fetchpriority="high"><div>`);
  const MultiplePictureChoice = props => {
    let inputRef;
    const [filteredItems, setFilteredItems] = createSignal(props.defaultItems);
    const [selectedItemIds, setSelectedItemIds] = createSignal([]);
    onMount(() => {
      if (!isMobile() && inputRef) inputRef.focus();
    });
    const handleClick = itemId => {
      toggleSelectedItemId(itemId);
    };
    const toggleSelectedItemId = itemId => {
      const existingIndex = selectedItemIds().indexOf(itemId);
      if (existingIndex !== -1) {
        setSelectedItemIds(selectedItemIds => selectedItemIds.filter(selectedItemId => selectedItemId !== itemId));
      } else {
        setSelectedItemIds(selectedIndices => [...selectedIndices, itemId]);
      }
    };
    const handleSubmit = () => props.onSubmit({
      value: selectedItemIds().map(selectedItemId => {
        const item = props.defaultItems.find(item => item.id === selectedItemId);
        return item?.title ?? item?.pictureSrc;
      }).join(', ')
    });
    const filterItems = inputValue => {
      setFilteredItems(props.defaultItems.filter(item => item.title?.toLowerCase().includes((inputValue ?? '').toLowerCase()) || item.description?.toLowerCase().includes((inputValue ?? '').toLowerCase())));
    };
    return (() => {
      const _el$ = _tmpl$2$6(),
        _el$3 = _el$.firstChild;
      _el$.addEventListener("submit", handleSubmit);
      insert(_el$, createComponent(Show, {
        get when() {
          return props.options.isSearchable;
        },
        get children() {
          const _el$2 = _tmpl$$d();
          insert(_el$2, createComponent(SearchInput, {
            ref(r$) {
              const _ref$ = inputRef;
              typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
            },
            onInput: filterItems,
            get placeholder() {
              return props.options.searchInputPlaceholder ?? defaultPictureChoiceOptions.searchInputPlaceholder;
            },
            onClear: () => setFilteredItems(props.defaultItems)
          }));
          return _el$2;
        }
      }), _el$3);
      insert(_el$3, createComponent(For, {
        get each() {
          return filteredItems();
        },
        children: (item, index) => (() => {
          const _el$4 = _tmpl$6(),
            _el$5 = _el$4.firstChild,
            _el$6 = _el$5.nextSibling;
          _el$4.addEventListener("click", () => handleClick(item.id));
          insert(_el$6, createComponent(Checkbox, {
            get isChecked() {
              return selectedItemIds().some(selectedItemId => selectedItemId === item.id);
            },
            get ["class"]() {
              return 'flex-shrink-0' + (item.title || item.description ? ' mt-1' : undefined);
            }
          }), null);
          insert(_el$6, createComponent(Show, {
            get when() {
              return item.title || item.description;
            },
            get children() {
              const _el$7 = _tmpl$5();
              insert(_el$7, createComponent(Show, {
                get when() {
                  return item.title;
                },
                get children() {
                  const _el$8 = _tmpl$3$1();
                  insert(_el$8, () => item.title);
                  return _el$8;
                }
              }), null);
              insert(_el$7, createComponent(Show, {
                get when() {
                  return item.description;
                },
                get children() {
                  const _el$9 = _tmpl$4();
                  insert(_el$9, () => item.description);
                  return _el$9;
                }
              }), null);
              return _el$7;
            }
          }), null);
          createRenderEffect(_p$ => {
            const _v$ = selectedItemIds().some(selectedItemId => selectedItemId === item.id),
              _v$2 = 'flex flex-col focus:outline-none cursor-pointer select-none agent-selectable-picture' + (selectedItemIds().some(selectedItemId => selectedItemId === item.id) ? ' selected' : '') + (isSvgSrc(item.pictureSrc) ? ' has-svg' : ''),
              _v$3 = item.id,
              _v$4 = item.pictureSrc,
              _v$5 = item.title ?? `Picture ${index() + 1}`,
              _v$6 = `Picture choice ${index() + 1}`,
              _v$7 = 'flex gap-3 py-2 flex-shrink-0' + (isEmpty(item.title) && isEmpty(item.description) ? ' justify-center' : ' px-3');
            _v$ !== _p$._v$ && setAttribute(_el$4, "aria-checked", _p$._v$ = _v$);
            _v$2 !== _p$._v$2 && className(_el$4, _p$._v$2 = _v$2);
            _v$3 !== _p$._v$3 && setAttribute(_el$4, "data-itemid", _p$._v$3 = _v$3);
            _v$4 !== _p$._v$4 && setAttribute(_el$5, "src", _p$._v$4 = _v$4);
            _v$5 !== _p$._v$5 && setAttribute(_el$5, "alt", _p$._v$5 = _v$5);
            _v$6 !== _p$._v$6 && setAttribute(_el$5, "elementtiming", _p$._v$6 = _v$6);
            _v$7 !== _p$._v$7 && className(_el$6, _p$._v$7 = _v$7);
            return _p$;
          }, {
            _v$: undefined,
            _v$2: undefined,
            _v$3: undefined,
            _v$4: undefined,
            _v$5: undefined,
            _v$6: undefined,
            _v$7: undefined
          });
          return _el$4;
        })()
      }), null);
      insert(_el$3, createComponent(For, {
        get each() {
          return selectedItemIds().filter(selectedItemId => filteredItems().every(item => item.id !== selectedItemId)).map(selectedItemId => props.defaultItems.find(item => item.id === selectedItemId)).filter(isDefined);
        },
        children: (selectedItem, index) => (() => {
          const _el$10 = _tmpl$7(),
            _el$11 = _el$10.firstChild,
            _el$12 = _el$11.nextSibling;
          _el$10.addEventListener("click", () => handleClick(selectedItem.id));
          insert(_el$12, createComponent(Checkbox, {
            get isChecked() {
              return selectedItemIds().some(selectedItemId => selectedItemId === selectedItem.id);
            },
            get ["class"]() {
              return 'flex-shrink-0' + (selectedItem.title || selectedItem.description ? ' mt-1' : undefined);
            }
          }), null);
          insert(_el$12, createComponent(Show, {
            get when() {
              return selectedItem.title || selectedItem.description;
            },
            get children() {
              const _el$13 = _tmpl$5();
              insert(_el$13, createComponent(Show, {
                get when() {
                  return selectedItem.title;
                },
                get children() {
                  const _el$14 = _tmpl$3$1();
                  insert(_el$14, () => selectedItem.title);
                  return _el$14;
                }
              }), null);
              insert(_el$13, createComponent(Show, {
                get when() {
                  return selectedItem.description;
                },
                get children() {
                  const _el$15 = _tmpl$4();
                  insert(_el$15, () => selectedItem.description);
                  return _el$15;
                }
              }), null);
              return _el$13;
            }
          }), null);
          createRenderEffect(_p$ => {
            const _v$8 = selectedItem.id,
              _v$9 = props.defaultItems.find(item => item.id === selectedItem.id)?.pictureSrc,
              _v$10 = selectedItem.title ?? `Selected picture ${index() + 1}`,
              _v$11 = `Selected picture choice ${index() + 1}`,
              _v$12 = 'flex gap-3 py-2 flex-shrink-0' + (isEmpty(selectedItem.title) && isEmpty(selectedItem.description) ? ' justify-center' : ' pl-4');
            _v$8 !== _p$._v$8 && setAttribute(_el$10, "data-itemid", _p$._v$8 = _v$8);
            _v$9 !== _p$._v$9 && setAttribute(_el$11, "src", _p$._v$9 = _v$9);
            _v$10 !== _p$._v$10 && setAttribute(_el$11, "alt", _p$._v$10 = _v$10);
            _v$11 !== _p$._v$11 && setAttribute(_el$11, "elementtiming", _p$._v$11 = _v$11);
            _v$12 !== _p$._v$12 && className(_el$12, _p$._v$12 = _v$12);
            return _p$;
          }, {
            _v$8: undefined,
            _v$9: undefined,
            _v$10: undefined,
            _v$11: undefined,
            _v$12: undefined
          });
          return _el$10;
        })()
      }), null);
      insert(_el$, (() => {
        const _c$ = createMemo(() => selectedItemIds().length > 0);
        return () => _c$() && createComponent(SendButton, {
          disableIcon: true,
          get children() {
            return props.options?.buttonLabel ?? defaultPictureChoiceOptions.buttonLabel;
          }
        });
      })(), null);
      createRenderEffect(() => className(_el$3, 'flex flex-wrap justify-end gap-2' + (props.options.isSearchable ? ' overflow-y-scroll max-h-[464px] rounded-md hide-scrollbar' : '')));
      return _el$;
    })();
  };
  
  const _tmpl$$c = /*#__PURE__*/template(`<div class="flex justify-end animate-fade-in gap-2">`),
    _tmpl$2$5 = /*#__PURE__*/template(`<div>`);
  const InputChatBlock = props => {
    const [answer, setAnswer] = createSignal();
    const handleSubmit = async ({
      label,
      value
    }) => {
      setAnswer(label ?? value);
      props.onSubmit(value ?? label);
    };
    const handleSkip = label => {
      setAnswer(label);
      props.onSkip();
    };
    return createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return answer() && !props.hasError;
          },
          get children() {
            return createComponent(GuestBubble, {
              get message() {
                return answer();
              },
              get showAvatar() {
                return props.guestAvatar?.isEnabled ?? false;
              },
              get avatarSrc() {
                return props.guestAvatar?.url && props.guestAvatar.url;
              }
            });
          }
        }), createComponent(Match, {
          get when() {
            return isNotDefined(answer()) || props.hasError;
          },
          get children() {
            return createMemo(() => props.inputIndex === props.activeInputId)() && (() => {
              const _el$ = _tmpl$$c();
              const _ref$ = props.ref;
              typeof _ref$ === "function" ? use(_ref$, _el$) : props.ref = _el$;
              insert(_el$, (() => {
                const _c$ = createMemo(() => !!props.hasHostAvatar);
                return () => _c$() && (() => {
                  const _el$2 = _tmpl$2$5();
                  createRenderEffect(() => className(_el$2, 'flex flex-shrink-0 items-center ' + (isMobile() ? 'w-6 h-6' : 'w-10 h-10')));
                  return _el$2;
                })();
              })(), null);
              insert(_el$, createComponent(Input, {
                get context() {
                  return props.context;
                },
                get block() {
                  return props.block;
                },
                get inputIndex() {
                  return props.inputIndex;
                },
                get isInputPrefillEnabled() {
                  return props.isInputPrefillEnabled;
                },
                onSubmit: handleSubmit,
                onSkip: handleSkip
              }), null);
              createRenderEffect(() => setAttribute(_el$, "data-blockid", props.block.id));
              return _el$;
            })();
          }
        })];
      }
    });
  };
  const Input = props => {
    console.log('Rendering Input component with block:', JSON.stringify(props.block, null, 2));
    createEffect(() => {
      console.log('Current block type is:', props.block.type);
    });
    const onSubmit = answer => props.onSubmit(answer);
    const getPrefilledValue = () => props.isInputPrefillEnabled ? props.block.prefilledValue : undefined;
    const submitPaymentSuccess = () => props.onSubmit({
      value: props.block.options.labels.success ?? 'Success'
    });
    return createComponent(Switch, {
      get children() {
        return [createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.TEXT;
          },
          get children() {
            return createComponent(TextInput, {
              get block() {
                return props.block;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.NUMBER;
          },
          get children() {
            return createComponent(NumberInput, {
              get block() {
                return props.block;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.EMAIL;
          },
          get children() {
            return createComponent(EmailInput, {
              get block() {
                return props.block;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.URL;
          },
          get children() {
            return createComponent(UrlInput, {
              get block() {
                return props.block;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.PHONE;
          },
          get children() {
            return createComponent(PhoneInput, {
              get labels() {
                return props.block.options.labels;
              },
              get defaultCountryCode() {
                return props.block.options.defaultCountryCode;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.DATE;
          },
          get children() {
            return createComponent(DateForm, {
              get options() {
                return props.block.options;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return isButtonsBlock(props.block);
          },
          keyed: true,
          children: block => createComponent(Switch, {
            get children() {
              return [createComponent(Match, {
                get when() {
                  return !block.options.isMultipleChoice;
                },
                get children() {
                  return createComponent(Buttons, {
                    get inputIndex() {
                      return props.inputIndex;
                    },
                    get defaultItems() {
                      return block.items;
                    },
                    get options() {
                      return block.options;
                    },
                    onSubmit: onSubmit
                  });
                }
              }), createComponent(Match, {
                get when() {
                  return block.options.isMultipleChoice;
                },
                get children() {
                  return createComponent(MultipleChoicesForm, {
                    get inputIndex() {
                      return props.inputIndex;
                    },
                    get defaultItems() {
                      return block.items;
                    },
                    get options() {
                      return block.options;
                    },
                    onSubmit: onSubmit
                  });
                }
              })];
            }
          })
        }), createComponent(Match, {
          get when() {
            return isPictureChoiceBlock(props.block);
          },
          keyed: true,
          children: block => createComponent(Switch, {
            get children() {
              return [createComponent(Match, {
                get when() {
                  return !block.options.isMultipleChoice;
                },
                get children() {
                  return createComponent(SinglePictureChoice, {
                    get defaultItems() {
                      return block.items;
                    },
                    get options() {
                      return block.options;
                    },
                    onSubmit: onSubmit
                  });
                }
              }), createComponent(Match, {
                get when() {
                  return block.options.isMultipleChoice;
                },
                get children() {
                  return createComponent(MultiplePictureChoice, {
                    get defaultItems() {
                      return block.items;
                    },
                    get options() {
                      return block.options;
                    },
                    onSubmit: onSubmit
                  });
                }
              })];
            }
          })
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.RATING;
          },
          get children() {
            return createComponent(RatingForm, {
              get block() {
                return props.block;
              },
              get defaultValue() {
                return getPrefilledValue();
              },
              onSubmit: onSubmit
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.FILE;
          },
          get children() {
            return createComponent(FileUploadForm, {
              get context() {
                return props.context;
              },
              get block() {
                return props.block;
              },
              onSubmit: onSubmit,
              get onSkip() {
                return props.onSkip;
              }
            });
          }
        }), createComponent(Match, {
          get when() {
            return props.block.type === InputBlockType.PAYMENT;
          },
          get children() {
            return createComponent(PaymentForm, {
              get context() {
                return props.context;
              },
              get options() {
                return {
                  ...props.block.options,
                  ...props.block.runtimeOptions
                };
              },
              onSuccess: submitPaymentSuccess
            });
          }
        })];
      }
    });
  };
  const isButtonsBlock = block => block?.type === InputBlockType.CHOICE ? block : undefined;
  const isPictureChoiceBlock = block => block?.type === InputBlockType.PICTURE_CHOICE ? block : undefined;
  
  const _tmpl$$b = /*#__PURE__*/template(`<div><div>`);
  const AvatarSideContainer = props => {
    let avatarContainer;
    const [top, setTop] = createSignal(0);
    const resizeObserver = new ResizeObserver(entries => setTop(entries[0].target.clientHeight - (isMobile() ? 24 : 40)));
    onMount(() => {
      if (avatarContainer) {
        resizeObserver.observe(avatarContainer);
      }
    });
    onCleanup(() => {
      if (avatarContainer) {
        resizeObserver.unobserve(avatarContainer);
      }
    });
    return (() => {
      const _el$ = _tmpl$$b(),
        _el$2 = _el$.firstChild;
      const _ref$ = avatarContainer;
      typeof _ref$ === "function" ? use(_ref$, _el$) : avatarContainer = _el$;
      _el$2.style.setProperty("transition", "top 350ms ease-out, opacity 250ms ease-out");
      insert(_el$2, createComponent(Avatar, {
        get initialAvatarSrc() {
          return props.hostAvatarSrc;
        }
      }));
      createRenderEffect(_p$ => {
        const _v$ = 'flex flex-shrink-0 items-center relative agent-avatar-container ' + (isMobile() ? 'w-6' : 'w-10'),
          _v$2 = 'absolute flex items-center top-0' + (isMobile() ? ' w-6 h-6' : ' w-10 h-10') + (props.hideAvatar ? ' opacity-0' : ' opacity-100'),
          _v$3 = `${top()}px`;
        _v$ !== _p$._v$ && className(_el$, _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && className(_el$2, _p$._v$2 = _v$2);
        _v$3 !== _p$._v$3 && ((_p$._v$3 = _v$3) != null ? _el$2.style.setProperty("top", _v$3) : _el$2.style.removeProperty("top"));
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined
      });
      return _el$;
    })();
  };
  
  const [streamingMessage, setStreamingMessage] = createSignal();
  
  const _tmpl$$a = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative items-start agent-host-bubble"><div class="flex items-center absolute px-4 py-2 bubble-typing " data-testid="host-bubble"></div><div class="overflow-hidden text-fade-in mx-4 my-2 whitespace-pre-wrap slate-html-container relative text-ellipsis opacity-100 h-full">`);
  const StreamingBubble = props => {
    let ref;
    const [content, setContent] = createSignal('');
    createEffect(() => {
      if (streamingMessage()?.id === props.streamingMessageId) setContent(streamingMessage()?.content ?? '');
    });
    return (() => {
      const _el$ = _tmpl$$a(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.firstChild,
        _el$4 = _el$3.firstChild,
        _el$5 = _el$4.nextSibling;
      const _ref$ = ref;
      typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
      _el$4.style.setProperty("width", "100%");
      _el$4.style.setProperty("height", "100%");
      insert(_el$5, content);
      return _el$;
    })();
  };
  
  const _tmpl$$9 = /*#__PURE__*/template(`<div><div class="flex flex-col flex-1 gap-2">`),
    _tmpl$2$4 = /*#__PURE__*/template(`<div class="flex flex-col w-full min-w-0 gap-2">`);
  const ChatChunk = props => {
    let inputRef;
    const [displayedMessageIndex, setDisplayedMessageIndex] = createSignal(0);
    onMount(() => {
      if (props.streamingMessageId) return;
      if (props.messages.length === 0) {
        props.onAllBubblesDisplayed();
      }
      props.onScrollToBottom(inputRef?.offsetTop ? inputRef?.offsetTop - 50 : undefined);
    });
    const displayNextMessage = async bubbleOffsetTop => {
      const lastBubbleBlockId = props.messages[displayedMessageIndex()].id;
      await props.onNewBubbleDisplayed(lastBubbleBlockId);
      setDisplayedMessageIndex(displayedMessageIndex() === props.messages.length ? displayedMessageIndex() : displayedMessageIndex() + 1);
      props.onScrollToBottom(bubbleOffsetTop);
      if (displayedMessageIndex() === props.messages.length) {
        props.onAllBubblesDisplayed();
      }
    };
    return (() => {
      const _el$ = _tmpl$2$4();
      insert(_el$, createComponent(Show, {
        get when() {
          return props.messages.length > 0;
        },
        get children() {
          const _el$2 = _tmpl$$9(),
            _el$3 = _el$2.firstChild;
          insert(_el$2, createComponent(Show, {
            get when() {
              return props.theme.chat.hostAvatar?.isEnabled && props.messages.length > 0;
            },
            get children() {
              return createComponent(AvatarSideContainer, {
                get hostAvatarSrc() {
                  return props.theme.chat.hostAvatar?.url;
                },
                get hideAvatar() {
                  return props.hideAvatar;
                }
              });
            }
          }), _el$3);
          insert(_el$3, createComponent(For, {
            get each() {
              return props.messages.slice(0, displayedMessageIndex() + 1);
            },
            children: message => createComponent(HostBubble, {
              message: message,
              get typingEmulation() {
                return props.settings.typingEmulation;
              },
              onTransitionEnd: displayNextMessage
            })
          }));
          createRenderEffect(_p$ => {
            const _v$ = 'flex' + (isMobile() ? ' gap-1' : ' gap-2'),
              _v$2 = props.theme.chat.guestAvatar?.isEnabled ? isMobile() ? '32px' : '48px' : undefined;
            _v$ !== _p$._v$ && className(_el$2, _p$._v$ = _v$);
            _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$3.style.setProperty("margin-right", _v$2) : _el$3.style.removeProperty("margin-right"));
            return _p$;
          }, {
            _v$: undefined,
            _v$2: undefined
          });
          return _el$2;
        }
      }), null);
      insert(_el$, (() => {
        const _c$ = createMemo(() => !!(props.input && displayedMessageIndex() === props.messages.length));
        return () => _c$() && createComponent(InputChatBlock, {
          ref(r$) {
            const _ref$ = inputRef;
            typeof _ref$ === "function" ? _ref$(r$) : inputRef = r$;
          },
          get block() {
            return props.input;
          },
          get inputIndex() {
            return props.inputIndex;
          },
          get activeInputId() {
            return props.activeInputId;
          },
          get onSubmit() {
            return props.onSubmit;
          },
          get onSkip() {
            return props.onSkip;
          },
          get hasHostAvatar() {
            return props.theme.chat.hostAvatar?.isEnabled ?? false;
          },
          get guestAvatar() {
            return props.theme.chat.guestAvatar;
          },
          get context() {
            return props.context;
          },
          get isInputPrefillEnabled() {
            return props.settings.general.isInputPrefillEnabled ?? true;
          },
          get hasError() {
            return props.hasError;
          }
        });
      })(), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return props.streamingMessageId;
        },
        keyed: true,
        children: streamingMessageId => (() => {
          const _el$4 = _tmpl$$9(),
            _el$5 = _el$4.firstChild;
          insert(_el$4, createComponent(Show, {
            get when() {
              return props.theme.chat.hostAvatar?.isEnabled;
            },
            get children() {
              return createComponent(AvatarSideContainer, {
                get hostAvatarSrc() {
                  return props.theme.chat.hostAvatar?.url;
                },
                get hideAvatar() {
                  return props.hideAvatar;
                }
              });
            }
          }), _el$5);
          insert(_el$5, createComponent(StreamingBubble, {
            streamingMessageId: streamingMessageId
          }));
          createRenderEffect(_p$ => {
            const _v$3 = 'flex' + (isMobile() ? ' gap-1' : ' gap-2'),
              _v$4 = props.theme.chat.guestAvatar?.isEnabled ? isMobile() ? '32px' : '48px' : undefined;
            _v$3 !== _p$._v$3 && className(_el$4, _p$._v$3 = _v$3);
            _v$4 !== _p$._v$4 && ((_p$._v$4 = _v$4) != null ? _el$5.style.setProperty("margin-right", _v$4) : _el$5.style.removeProperty("margin-right"));
            return _p$;
          }, {
            _v$3: undefined,
            _v$4: undefined
          });
          return _el$4;
        })()
      }), null);
      return _el$;
    })();
  };
  
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const AsyncFunction$1 = Object.getPrototypeOf(async function () {}).constructor;
  const executeScript = async ({
    content,
    args
  }) => {
    const func = AsyncFunction$1(...args.map(arg => arg.id), parseContent(content));
    try {
      await func(...args.map(arg => arg.value));
    } catch (err) {
      console.error(err);
    }
  };
  const parseContent = content => {
    const contentWithoutScriptTags = content.replace(/<script>/g, '').replace(/<\/script>/g, '');
    return contentWithoutScriptTags;
  };
  
  const executeChatwoot = chatwoot => {
    executeScript(chatwoot.scriptToExecute);
  };
  
  const initGoogleAnalytics = id => {
    if (isDefined(window.gtag)) return Promise.resolve();
    return new Promise(resolve => {
      const existingScript = document.getElementById('gtag');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        script.id = 'gtag';
        const initScript = document.createElement('script');
        initScript.innerHTML = `window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
      
        gtag('config', '${id}');
        `;
        document.body.appendChild(script);
        document.body.appendChild(initScript);
        script.onload = () => {
          resolve();
        };
      }
      if (existingScript) resolve();
    });
  };
  const sendGaEvent = options => {
    if (!options) return;
    if (!window.gtag) {
      console.error('Google Analytics was not properly initialized');
      return;
    }
    window.gtag('event', options.action, {
      event_category: isEmpty(options.category) ? undefined : options.category,
      event_label: isEmpty(options.label) ? undefined : options.label,
      value: options.value,
      send_to: isEmpty(options.sendTo) ? undefined : options.sendTo
    });
  };
  
  const executeGoogleAnalyticsBlock = async options => {
    if (!options?.trackingId) return;
    sendGaEvent(options);
  };
  
  // let abortController: AbortController | null = null
  const secondsToWaitBeforeRetries = 3;
  const maxRetryAttempts = 3;
  const streamChat = context => async (message,
  // type: string | undefined,
  {
    onMessageStream
  }) => {
    let abortController = new AbortController();
    try {
      const apiHost = context.apiHost;
      console.log(`streamChat : agentName: ${context.agentName}`);
      const res = await fetch(`${isNotEmpty(apiHost) ? apiHost : guessApiHost()}/streamer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: context.sessionId,
          agentName: context.agentName,
          tabNumber: context.tabNumber,
          message
        }),
        signal: abortController.signal
      });
      if (!res.ok) {
        console.log(`res not ok. context.retryAttempt is ${context.retryAttempt}, res.status is ${res.status}`);
        if ((context.retryAttempt ?? 0) < maxRetryAttempts && (res.status === 403 || res.status === 500 || res.status === 503)) {
          await new Promise(resolve => setTimeout(resolve, secondsToWaitBeforeRetries * 1000));
          return streamChat({
            ...context,
            retryAttempt: (context.retryAttempt ?? 0) + 1
          })(message, {
            onMessageStream
          });
        }
        return {
          error: (await res.json()) || 'Failed to fetch the chat response.'
        };
      }
      if (!res.body) {
        console.log(`res not having body. throwing ...`);
        throw new Error('The response body is empty.');
      }
      let accumulatedMessage = '';
      let endValue;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        endValue = value;
        if (done) {
          break;
        }
        const chunk = decoder.decode(value);
        // message += chunk
        if (onMessageStream) onMessageStream(chunk, accumulatedMessage);
        if (abortController === null) {
          reader.cancel();
          break;
        }
      }
      // Should I comment code below as we do not want to abort connections.
      // abortController = null
      return {
        message: accumulatedMessage
      };
    } catch (err) {
      console.error(err);
      // Ignore abort errors as they are expected.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (err.name === 'AbortError') {
        // abortController = null
        return {
          error: {
            message: 'Request aborted'
          }
        };
      }
      if (err instanceof Error) return {
        error: {
          message: err.message
        }
      };
      return {
        error: {
          message: 'Failed to fetch the chat response.'
        }
      };
    }
  };
  
  const executeRedirect = ({
    url,
    isNewTab
  }) => {
    console.log(`url is: ${url}, isNewTab is ${isNewTab}`);
    if (!url) return;
    const updatedWindow = window.open(url, isNewTab ? '_blank' : '_self');
    if (!updatedWindow) return {
      blockedPopupUrl: url
    };
  };
  
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const executeSetVariable = async ({
    content,
    args
  }) => {
    try {
      const func = AsyncFunction(...args.map(arg => arg.id), content.includes('return ') ? content : `return ${content}`);
      const replyToSend = await func(...args.map(arg => arg.value));
      return {
        replyToSend: safeStringify(replyToSend)
      };
    } catch (err) {
      console.error(err);
      return {
        replyToSend: safeStringify(content)
      };
    }
  };
  const safeStringify = val => {
    if (isNotDefined(val)) return;
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val);
    } catch {
      console.warn('Failed to safely stringify variable value', val);
      return;
    }
  };
  
  const executeWait = async ({
    secondsToWaitFor
  }) => {
    await new Promise(resolve => setTimeout(resolve, secondsToWaitFor * 1000));
  };
  
  const initPixel = pixelId => {
    const script = document.createElement('script');
    script.innerHTML = `!function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');`;
    document.head.appendChild(script);
    const noscript = document.createElement('noscript');
    noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/>`;
    document.head.appendChild(noscript);
  };
  const trackPixelEvent = options => {
    if (!options.eventType || !options.pixelId) return;
    if (!window.fbq) {
      console.error('Facebook Pixel was not properly initialized');
      return;
    }
    const params = options.params?.length ? options.params.reduce((obj, param) => {
      if (!param.key || !param.value) return obj;
      return {
        ...obj,
        [param.key]: param.value
      };
    }, {}) : undefined;
    if (options.eventType === 'Custom') {
      if (!options.name) return;
      window.fbq('trackCustom', options.name, params);
    }
    window.fbq('track', options.eventType, params);
  };
  
  const executePixel = async options => {
    if (isEmpty(options?.pixelId)) return;
    trackPixelEvent(options);
  };
  
  const gtmBodyElement = googleTagManagerId => {
    if (document.getElementById('gtm-noscript')) return '';
    const noScriptElement = document.createElement('noscript');
    noScriptElement.id = 'gtm-noscript';
    const iframeElement = document.createElement('iframe');
    iframeElement.src = `https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`;
    iframeElement.height = '0';
    iframeElement.width = '0';
    iframeElement.style.display = 'none';
    iframeElement.style.visibility = 'hidden';
    noScriptElement.appendChild(iframeElement);
    return noScriptElement;
  };
  
  /* eslint-disable solid/reactivity */
  const injectStartProps = async startPropsToInject => {
    const customHeadCode = startPropsToInject.customHeadCode;
    if (isNotEmpty(customHeadCode)) injectCustomHeadCode(customHeadCode);
    const gtmId = startPropsToInject.gtmId;
    if (isNotEmpty(gtmId)) document.body.prepend(gtmBodyElement(gtmId));
    const googleAnalyticsId = startPropsToInject.googleAnalyticsId;
    if (isNotEmpty(googleAnalyticsId)) await initGoogleAnalytics(googleAnalyticsId);
    const pixelId = startPropsToInject.pixelId;
    if (isNotEmpty(pixelId)) initPixel(pixelId);
  };
  
  const executeClientSideAction = async ({
    clientSideAction,
    context,
    onMessageStream
  }) => {
    if ('chatwoot' in clientSideAction) {
      return executeChatwoot(clientSideAction.chatwoot);
    }
    if ('googleAnalytics' in clientSideAction) {
      return executeGoogleAnalyticsBlock(clientSideAction.googleAnalytics);
    }
    if ('scriptToExecute' in clientSideAction) {
      return executeScript(clientSideAction.scriptToExecute);
    }
    if ('redirect' in clientSideAction) {
      return executeRedirect(clientSideAction.redirect);
    }
    if ('wait' in clientSideAction) {
      return executeWait(clientSideAction.wait);
    }
    if ('setVariable' in clientSideAction) {
      return executeSetVariable(clientSideAction.setVariable.scriptToExecute);
    }
    if ('streamOpenAiChatCompletion' in clientSideAction) {
      const {
        error,
        message
      } = await streamChat(context)(clientSideAction.streamOpenAiChatCompletion.message,
      // clientSideAction.streamOpenAiChatCompletion.type,
      {
        onMessageStream
      });
      if (error) return {
        replyToSend: undefined,
        logs: [{
          status: 'error',
          description: 'Failed to stream OpenAI completion',
          details: JSON.stringify(error, null, 2)
        }]
      };
      return {
        replyToSend: message
      };
    }
    if ('startPropsToInject' in clientSideAction) {
      return injectStartProps(clientSideAction.startPropsToInject);
    }
    if ('pixel' in clientSideAction) {
      return executePixel(clientSideAction.pixel);
    }
  };
  
  const _tmpl$$8 = /*#__PURE__*/template(`<div class="flex flex-col animate-fade-in"><div class="flex w-full items-center"><div class="flex relative items-start agent-host-bubble"><div class="flex items-center absolute px-4 py-2 bubble-typing " data-testid="host-bubble"></div><p class="overflow-hidden text-fade-in mx-4 my-2 whitespace-pre-wrap slate-html-container relative opacity-0 h-6 text-ellipsis">`);
  const LoadingBubble = () => (() => {
    const _el$ = _tmpl$$8(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild,
      _el$4 = _el$3.firstChild;
    _el$4.style.setProperty("width", "64px");
    _el$4.style.setProperty("height", "32px");
    insert(_el$4, createComponent(TypingBubble, {}));
    return _el$;
  })();
  
  const _tmpl$$7 = /*#__PURE__*/template(`<div class="flex w-full"><div class="flex flex-col w-full min-w-0"><div class="flex gap-2">`);
  const LoadingChunk = props => (() => {
    const _el$ = _tmpl$$7(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.firstChild;
    insert(_el$3, createComponent(Show, {
      get when() {
        return props.theme.chat.hostAvatar?.isEnabled;
      },
      get children() {
        return createComponent(AvatarSideContainer, {
          get hostAvatarSrc() {
            return props.theme.chat.hostAvatar?.url;
          }
        });
      }
    }), null);
    insert(_el$3, createComponent(LoadingBubble, {}), null);
    return _el$;
  })();
  
  const _tmpl$$6 = /*#__PURE__*/template(`<div class="w-full max-w-xs p-4 text-gray-500 bg-white shadow flex flex-col gap-2 agent-popup-blocked-toast" role="alert"><div class="flex flex-col gap-1"><span class=" text-sm font-semibold text-gray-900">Popup blocked</span><div class="text-sm font-normal">The bot wants to open a new tab but it was blocked by your broswer. It needs a manual approval.</div></div><a target="_blank" class="py-1 px-4 justify-center text-sm font-semibold text-white focus:outline-none flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:brightness-100 filter hover:brightness-90 active:brightness-75 agent-button" rel="noreferrer">Continue in new tab`);
  const PopupBlockedToast = props => {
    return (() => {
      const _el$ = _tmpl$$6(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;
      _el$3.$$click = () => props.onLinkClick();
      createRenderEffect(() => setAttribute(_el$3, "href", props.url));
      return _el$;
    })();
  };
  delegateEvents(["click"]);
  
  const _tmpl$$5 = /*#__PURE__*/template(`<div class="flex flex-col overflow-y-scroll w-full min-h-full px-3 pt-10 relative scrollable-container agent-chat-view scroll-smooth gap-2">`),
    _tmpl$2$3 = /*#__PURE__*/template(`<div class="flex justify-end">`),
    _tmpl$3 = /*#__PURE__*/template(`<div class="w-full h-32 flex-shrink-0">`);
  const parseDynamicTheme = (initialTheme, dynamicTheme) => ({
    ...initialTheme,
    chat: {
      ...initialTheme.chat,
      hostAvatar: initialTheme.chat.hostAvatar && dynamicTheme?.hostAvatarUrl ? {
        ...initialTheme.chat.hostAvatar,
        url: dynamicTheme.hostAvatarUrl
      } : initialTheme.chat.hostAvatar,
      guestAvatar: initialTheme.chat.guestAvatar && dynamicTheme?.guestAvatarUrl ? {
        ...initialTheme.chat.guestAvatar,
        url: dynamicTheme?.guestAvatarUrl
      } : initialTheme.chat.guestAvatar
    }
  });
  const ConversationContainer = props => {
    let chatContainer;
    const [chatChunks, setChatChunks] = createSignal([{
      input: props.initialAgentReply.input,
      messages: props.initialAgentReply.messages,
      clientSideActions: props.initialAgentReply.clientSideActions
    }]);
    const [dynamicTheme, setDynamicTheme] = createSignal(props.initialAgentReply.dynamicTheme);
    const [theme, setTheme] = createSignal(props.initialAgentReply.agentConfig.theme);
    const [isSending, setIsSending] = createSignal(false);
    const [blockedPopupUrl, setBlockedPopupUrl] = createSignal();
    const [hasError, setHasError] = createSignal(false);
    const [activeInputId, setActiveInputId] = createSignal(0);
    console.log(`Context in ConversationContainer is : ${JSON.stringify(props.context)}`);
    onMount(() => {
      (async () => {
        const initialChunk = chatChunks()[0];
        if (initialChunk.clientSideActions) {
          const actionsBeforeFirstBubble = initialChunk.clientSideActions.filter(action => isNotDefined(action.lastBubbleBlockId));
          for (const action of actionsBeforeFirstBubble) {
            if ('streamOpenAiChatCompletion' in action || 'webhookToExecute' in action) setIsSending(true);
            const response = await executeClientSideAction({
              clientSideAction: action,
              context: {
                apiHost: props.context.apiHost,
                sessionId: props.context.sessionId,
                agentName: props.context.agentName,
                tabNumber: props.context.tabNumber
              },
              onMessageStream: streamMessage
            });
            if (response && 'replyToSend' in response) {
              // sendMessage(response.replyToSend, response.logs)
              return;
            }
            if (response && 'blockedPopupUrl' in response) setBlockedPopupUrl(response.blockedPopupUrl);
          }
        }
      })();
    });
    createEffect(() => {
      setTheme(parseDynamicTheme(props.initialAgentReply.agentConfig.theme, dynamicTheme()));
    });
    /**
     * Process a chunk of data from the server.
     *
     * This function tries to parse the chunk as JSON and checks for a 'type' property.
     * Depending on the 'type' property, it either returns independent text or appends to the existing message.
     * If the chunk is not JSON or doesn't have a 'type' property, it's treated as a normal text message.
     *
     * @param {string} chunk - The chunk of data to process.
     * @param {string} message - The existing message string to which new text might be appended.
     * @returns {string} - The updated message string.
     */
    const streamMessage = (chunk, content) => {
      console.log(`streamMessage: chunk: ${chunk}`);
      console.log(`streamMessage: content: ${content}`);
      let parsedChunk;
      let isJson = false;
      // Try to parse the chunk as JSON
      try {
        parsedChunk = JSON.parse(chunk);
        isJson = true;
      } catch (e) {
        // Not a JSON, continue as a text message
        console.log(`Failed to parse response`);
        isJson = false;
      }
      if (isJson) {
        if (parsedChunk.end) {
          //Delete the session id
          console.log(`Setting session id to null`);
          props.setSessionId(null);
        } else {
          //Match with the sessionId from the server
          if (parsedChunk.sessionId !== props.context.sessionId) {
            console.log(`Setting new session id to ${parsedChunk.sessionId}`);
            props.setSessionId(parsedChunk.sessionId);
          }
        }
        if (parsedChunk.pdType === 'independentText') {
          // Return the independent text
          streamIndependentMessage(parsedChunk);
        }
      } else {
        // Treat as a normal text message
        content += chunk;
        streamTextMessage(content);
      }
    };
    const streamIndependentMessage = data => {
      setIsSending(false);
      const lastChunk = [...chatChunks()].pop();
      if (!lastChunk) return;
      if (data.input) {
        setActiveInputId(prev => prev + 1);
      }
      setChatChunks(displayedChunks => [...displayedChunks, {
        input: data.input,
        messages: [...chatChunks()].pop()?.streamingMessageId ? data.messages.slice(1) : data.messages,
        clientSideActions: data.clientSideActions
      }]);
    };
    const streamTextMessage = content => {
      console.log(`streamTextMessage: ${content}`);
      setIsSending(false);
      const lastChunk = [...chatChunks()].pop();
      if (!lastChunk) return;
      const id = lastChunk.streamingMessageId ?? createUniqueId();
      if (!lastChunk.streamingMessageId) setChatChunks(displayedChunks => [...displayedChunks, {
        messages: [],
        streamingMessageId: id
      }]);
      setStreamingMessage({
        id,
        content
      });
    };
    createEffect(() => {
      setTheme(parseDynamicTheme(props.initialAgentReply.agentConfig.theme, dynamicTheme()));
    });
    const sendMessage = async (message, clientLogs) => {
      if (clientLogs) props.onNewLogs?.(clientLogs);
      setHasError(false);
      const currentInputBlock = [...chatChunks()].pop()?.input;
      if (currentInputBlock?.id && props.onAnswer && message) props.onAnswer({
        message,
        blockId: currentInputBlock.id
      });
      if (currentInputBlock?.type === InputBlockType.FILE) props.onNewLogs?.([{
        description: 'Files are not uploaded in preview mode',
        status: 'info'
      }]);
      // Current chunk is {"input":{"type":"text input","options":{"labels":{"placeholder":"Type your answer...","button":"Send"},"isLong":false}},"messages":[{"type":"text","content":{"richText":[{"type":"p","children":[{"text":"What is your email address?"}]}]}}]}
      // If current chunk type has input->type = 'text input' then stream:
      if (currentInputBlock?.type === "text input") {
        let action = {
          "streamOpenAiChatCompletion": {
            "message": message
          }
        };
        console.log(`Starting stream with agentName: ${props.context.agentName}`);
        await executeClientSideAction({
          clientSideAction: action,
          context: {
            apiHost: props.context.apiHost,
            sessionId: props.context.sessionId,
            agentName: props.context.agentName,
            tabNumber: props.context.tabNumber
          },
          onMessageStream: streamMessage
        });
        return;
      }
      const longRequest = setTimeout(() => {
        setIsSending(true);
      }, 1000);
      const {
        data,
        error
      } = await sendMessageQuery({
        apiHost: props.context.apiHost,
        sessionId: props.context.sessionId,
        message,
        clientLogs
      });
      clearTimeout(longRequest);
      setIsSending(false);
      if (error) {
        setHasError(true);
        props.onNewLogs?.([{
          description: 'Failed to send the reply',
          details: error,
          status: 'error'
        }]);
      }
      if (!data) return;
      if (data.logs) props.onNewLogs?.(data.logs);
      if (data.dynamicTheme) setDynamicTheme(data.dynamicTheme);
      if (data.input?.id && props.onNewInputBlock) {
        props.onNewInputBlock({
          id: data.input.id,
          groupId: data.input.groupId
        });
      }
      if (data.clientSideActions) {
        const actionsBeforeFirstBubble = data.clientSideActions.filter(action => isNotDefined(action.lastBubbleBlockId));
        for (const action of actionsBeforeFirstBubble) {
          if ('streamOpenAiChatCompletion' in action || 'webhookToExecute' in action) setIsSending(true);
          // Current action is {"streamOpenAiChatCompletion":{"messages":"Some content"}}
          const response = await executeClientSideAction({
            clientSideAction: action,
            context: {
              apiHost: props.context.apiHost,
              sessionId: props.context.sessionId,
              agentName: props.context.agentName
            },
            onMessageStream: streamMessage
          });
          if (response && 'replyToSend' in response) {
            // sendMessage(response.replyToSend, response.logs)
            return;
          }
          if (response && 'blockedPopupUrl' in response) setBlockedPopupUrl(response.blockedPopupUrl);
        }
      }
      if (data.input) {
        setActiveInputId(prev => prev + 1);
      }
      setChatChunks(displayedChunks => [...displayedChunks, {
        input: data.input,
        messages: [...chatChunks()].pop()?.streamingMessageId ? data.messages.slice(1) : data.messages,
        clientSideActions: data.clientSideActions
      }]);
    };
    const autoScrollToBottom = offsetTop => {
      setTimeout(() => {
        chatContainer?.scrollTo(0, offsetTop ?? chatContainer.scrollHeight);
      }, 50);
    };
    const handleAllBubblesDisplayed = async () => {
      const lastChunk = [...chatChunks()].pop();
      if (!lastChunk) return;
      if (isNotDefined(lastChunk.input)) {
        props.onEnd?.();
      }
    };
    const handleNewBubbleDisplayed = async blockId => {
      const lastChunk = [...chatChunks()].pop();
      if (!lastChunk) return;
      if (lastChunk.clientSideActions) {
        const actionsToExecute = lastChunk.clientSideActions.filter(action => action.lastBubbleBlockId === blockId);
        for (const action of actionsToExecute) {
          if ('streamOpenAiChatCompletion' in action || 'webhookToExecute' in action) setIsSending(true);
          console.log(`executeClientSideAction in handleNewBubbleDisplayed`);
          const response = await executeClientSideAction({
            clientSideAction: action,
            context: {
              apiHost: props.context.apiHost,
              sessionId: props.context.sessionId,
              agentName: props.context.agentName
            },
            onMessageStream: streamMessage
          });
          if (response && 'replyToSend' in response) {
            sendMessage(response.replyToSend, response.logs);
            return;
          }
          if (response && 'blockedPopupUrl' in response) setBlockedPopupUrl(response.blockedPopupUrl);
        }
      }
    };
    const handleSkip = () => sendMessage(undefined);
    let inputCounter = 0;
    return (() => {
      const _el$ = _tmpl$$5();
      const _ref$ = chatContainer;
      typeof _ref$ === "function" ? use(_ref$, _el$) : chatContainer = _el$;
      insert(_el$, createComponent(For, {
        get each() {
          return chatChunks();
        },
        children: (chatChunk, index) => {
          if (chatChunk.input) {
            inputCounter += 1;
          }
          return createComponent(ChatChunk, {
            inputIndex: inputCounter,
            get messages() {
              return chatChunk.messages;
            },
            get input() {
              return chatChunk.input;
            },
            get activeInputId() {
              return activeInputId();
            },
            get theme() {
              return theme();
            },
            get settings() {
              return props.initialAgentReply.agentConfig.settings;
            },
            get streamingMessageId() {
              return chatChunk.streamingMessageId;
            },
            get context() {
              return props.context;
            },
            get hideAvatar() {
              return createMemo(() => !!(!chatChunk.input && !chatChunk.streamingMessageId))() && index() < chatChunks().length - 1;
            },
            get hasError() {
              return createMemo(() => !!hasError())() && index() === chatChunks().length - 1;
            },
            onNewBubbleDisplayed: handleNewBubbleDisplayed,
            onAllBubblesDisplayed: handleAllBubblesDisplayed,
            onSubmit: sendMessage,
            onScrollToBottom: autoScrollToBottom,
            onSkip: handleSkip
          });
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return isSending();
        },
        get children() {
          return createComponent(LoadingChunk, {
            get theme() {
              return theme();
            }
          });
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return blockedPopupUrl();
        },
        keyed: true,
        children: blockedPopupUrl => (() => {
          const _el$2 = _tmpl$2$3();
          insert(_el$2, createComponent(PopupBlockedToast, {
            url: blockedPopupUrl,
            onLinkClick: () => setBlockedPopupUrl(undefined)
          }));
          return _el$2;
        })()
      }), null);
      insert(_el$, createComponent(BottomSpacer, {}), null);
      return _el$;
    })();
  };
  const BottomSpacer = () => {
    return _tmpl$3();
  };
  
  const _tmpl$$4 = /*#__PURE__*/template(`<div class="h-full flex justify-center items-center flex-col"><p class="text-2xl text-center"></p><p class="text-center">`);
  const ErrorMessage = props => {
    return (() => {
      const _el$ = _tmpl$$4(),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;
      insert(_el$2, () => props.error.message);
      insert(_el$3, () => props.error.cause);
      return _el$;
    })();
  };
  
  const sessionStorageKey = 'resultId';
  const getExistingResultIdFromStorage = agentId => {
    if (!agentId) return;
    try {
      return sessionStorage.getItem(`${sessionStorageKey}-${agentId}`) ?? localStorage.getItem(`${sessionStorageKey}-${agentId}`) ?? undefined;
    } catch {
      /* empty */
    }
  };
  const setResultInStorage = (storageType = 'session') => (agentId, resultId) => {
    try {
      ;
      (storageType === 'session' ? localStorage : sessionStorage).removeItem(`${sessionStorageKey}-${agentId}`);
      return (storageType === 'session' ? sessionStorage : localStorage).setItem(`${sessionStorageKey}-${agentId}`, resultId);
    } catch {
      /* empty */
    }
  };
  
  var BackgroundType;
  (function (BackgroundType) {
    BackgroundType["COLOR"] = "Color";
    BackgroundType["IMAGE"] = "Image";
    BackgroundType["NONE"] = "None";
  })(BackgroundType || (BackgroundType = {}));
  
  const cssVariableNames = {
    general: {
      bgImage: '--agent-widget-container-bg-image',
      bgColor: '--agent-widget-container-bg-color',
      fontFamily: '--agent-widget-container-font-family',
      color: '--agent-widget-container-color'
    },
    chat: {
      hostBubbles: {
        bgColor: '--agent-host-bubble-bg-color',
        color: '--agent-host-bubble-color'
      },
      guestBubbles: {
        bgColor: '--agent-guest-bubble-bg-color',
        color: '--agent-guest-bubble-color'
      },
      inputs: {
        bgColor: '--agent-input-bg-color',
        color: '--agent-input-color',
        placeholderColor: '--agent-input-placeholder-color'
      },
      buttons: {
        bgColor: '--agent-button-bg-color',
        bgColorRgb: '--agent-button-bg-color-rgb',
        color: '--agent-button-color'
      },
      checkbox: {
        bgColor: '--agent-checkbox-bg-color',
        color: '--agent-checkbox-color',
        baseAlpha: '--selectable-base-alpha'
      }
    }
  };
  const setCssVariablesValue = (theme, container) => {
    if (!theme) return;
    const documentStyle = container?.style;
    if (!documentStyle) return;
    if (theme.general) setGeneralTheme(theme.general, documentStyle);
    if (theme.chat) setChatTheme(theme.chat, documentStyle);
  };
  const setGeneralTheme = (generalTheme, documentStyle) => {
    const {
      background,
      font
    } = generalTheme;
    if (background) setAgentBackground(background, documentStyle);
    if (font) documentStyle.setProperty(cssVariableNames.general.fontFamily, font);
  };
  const setChatTheme = (chatTheme, documentStyle) => {
    const {
      hostBubbles,
      guestBubbles,
      buttons,
      inputs,
      roundness
    } = chatTheme;
    if (hostBubbles) setHostBubbles(hostBubbles, documentStyle);
    if (guestBubbles) setGuestBubbles(guestBubbles, documentStyle);
    if (buttons) setButtons(buttons, documentStyle);
    if (inputs) setInputs(inputs, documentStyle);
    if (roundness) setRoundness(roundness, documentStyle);
  };
  const setHostBubbles = (hostBubbles, documentStyle) => {
    if (hostBubbles.backgroundColor) documentStyle.setProperty(cssVariableNames.chat.hostBubbles.bgColor, hostBubbles.backgroundColor);
    if (hostBubbles.color) documentStyle.setProperty(cssVariableNames.chat.hostBubbles.color, hostBubbles.color);
  };
  const setGuestBubbles = (guestBubbles, documentStyle) => {
    if (guestBubbles.backgroundColor) documentStyle.setProperty(cssVariableNames.chat.guestBubbles.bgColor, guestBubbles.backgroundColor);
    if (guestBubbles.color) documentStyle.setProperty(cssVariableNames.chat.guestBubbles.color, guestBubbles.color);
  };
  const setButtons = (buttons, documentStyle) => {
    if (buttons.backgroundColor) {
      documentStyle.setProperty(cssVariableNames.chat.buttons.bgColor, buttons.backgroundColor);
      documentStyle.setProperty(cssVariableNames.chat.buttons.bgColorRgb, hexToRgb(buttons.backgroundColor).join(', '));
    }
    if (buttons.color) documentStyle.setProperty(cssVariableNames.chat.buttons.color, buttons.color);
  };
  const setInputs = (inputs, documentStyle) => {
    if (inputs.backgroundColor) documentStyle.setProperty(cssVariableNames.chat.inputs.bgColor, inputs.backgroundColor);
    if (inputs.color) documentStyle.setProperty(cssVariableNames.chat.inputs.color, inputs.color);
    if (inputs.placeholderColor) documentStyle.setProperty(cssVariableNames.chat.inputs.placeholderColor, inputs.placeholderColor);
  };
  const setAgentBackground = (background, documentStyle) => {
    documentStyle.setProperty(cssVariableNames.general.bgImage, null);
    documentStyle.setProperty(cssVariableNames.general.bgColor, null);
    documentStyle.setProperty(background?.type === BackgroundType.IMAGE ? cssVariableNames.general.bgImage : cssVariableNames.general.bgColor, parseBackgroundValue(background));
    documentStyle.setProperty(cssVariableNames.chat.checkbox.bgColor, background?.type === BackgroundType.IMAGE ? 'rgba(255, 255, 255, 0.75)' : (background?.type === BackgroundType.COLOR ? background.content : '#ffffff') ?? '#ffffff');
    const backgroundColor = background.type === BackgroundType.IMAGE ? '#000000' : background?.type === BackgroundType.COLOR && isNotEmpty(background.content) ? background.content : '#ffffff';
    documentStyle.setProperty(cssVariableNames.general.color, isLight(backgroundColor) ? '#303235' : '#ffffff');
    if (background.type === BackgroundType.IMAGE) {
      documentStyle.setProperty(cssVariableNames.chat.checkbox.baseAlpha, '0.40');
    } else {
      documentStyle.setProperty(cssVariableNames.chat.checkbox.baseAlpha, '0');
    }
  };
  const parseBackgroundValue = ({
    type,
    content
  }) => {
    switch (type) {
      case BackgroundType.NONE:
        return 'transparent';
      case BackgroundType.COLOR:
        return content ?? '#ffffff';
      case BackgroundType.IMAGE:
        return `url(${content})`;
    }
  };
  const setRoundness = (roundness, documentStyle) => {
    switch (roundness) {
      case 'none':
        documentStyle.setProperty('--agent-border-radius', '0');
        break;
      case 'medium':
        documentStyle.setProperty('--agent-border-radius', '6px');
        break;
      case 'large':
        documentStyle.setProperty('--agent-border-radius', '20px');
        break;
    }
  };
  
  var css_248z = "#lite-badge{background-color:#fff!important;border-radius:4px!important;border-width:1px!important;bottom:20px!important;color:#111827!important;display:flex!important;font-size:14px!important;font-weight:600!important;gap:8px!important;left:auto!important;line-height:20px!important;opacity:1!important;padding:4px 8px!important;position:absolute!important;right:auto!important;top:auto!important;transition:background-color .2s ease-in-out!important;visibility:visible!important;z-index:50!important}#lite-badge:hover{background-color:#f7f8ff!important}";
  
  const _tmpl$$3 = /*#__PURE__*/template(`<style>`),
    _tmpl$2$2 = /*#__PURE__*/template(`<div><div class="flex w-full h-full justify-center">`);
  const Bot = props => {
    const [sessionId, setSessionId] = createSignal(null);
    const [initialAgentReply, setInitialChatReply] = createSignal();
    const [customCss, setCustomCss] = createSignal('');
    const [isInitialized, setIsInitialized] = createSignal(false);
    const [error, setError] = createSignal();
    const getSessionData = () => {
      const storedData = localStorage.getItem("sessionData");
      return storedData ? JSON.parse(storedData) : null;
    };
    const initializeBot = async () => {
      setIsInitialized(true);
      const urlParams = new URLSearchParams(location.search);
      props.onInit?.();
      const prefilledVariables = {};
      urlParams.forEach((value, key) => {
        prefilledVariables[key] = value;
      });
      let agentIdFromProps = props.agentName;
      const storedSessionData = getSessionData();
      if (storedSessionData) {
        // If session data exists in localStorage, use it to initialize your component
        setSessionId(storedSessionData.sessionId);
        setInitialChatReply(storedSessionData.initialAgentReply);
        setCustomCss(storedSessionData.customCss ?? '');
        if (storedSessionData.agentName) {
          agentIdFromProps = storedSessionData.agentName;
        }
      } else {
        const {
          data,
          error
        } = await getInitialChatReplyQuery({
          stripeRedirectStatus: urlParams.get('redirect_status') ?? undefined,
          agentName: props.agentName,
          apiHost: props.apiHost,
          isPreview: props.isPreview ?? false,
          resultId: isNotEmpty(props.resultId) ? props.resultId : getExistingResultIdFromStorage(agentIdFromProps),
          startGroupId: props.startGroupId,
          prefilledVariables: {
            ...prefilledVariables,
            ...props.prefilledVariables
          }
        });
        if (error && 'code' in error && typeof error.code === 'string') {
          if (props.isPreview ?? false) {
            return setError(new Error('An error occurred while loading the bot.', {
              cause: error.message
            }));
          }
          if (['BAD_REQUEST', 'FORBIDDEN'].includes(error.code)) return setError(new Error('This bot is now closed.'));
          if (error.code === 'NOT_FOUND') return setError(new Error("The bot you're looking for doesn't exist."));
        }
        if (!data) return setError(new Error("Error! Couldn't initiate the chat."));
        if (data.resultId && agentIdFromProps) setResultInStorage(data.agentConfig.settings.general.rememberUser?.storage)(agentIdFromProps, data.resultId);
        setSessionId(data.sessionId);
        setInitialChatReply(data);
        setCustomCss(data.agentConfig.theme.customCss ?? '');
        if (data.input?.id && props.onNewInputBlock) props.onNewInputBlock({
          id: data.input.id,
          groupId: data.input.groupId
        });
        if (data.logs) props.onNewLogs?.(data.logs);
        // After all your usual initializations, save the session data to localStorage
        localStorage.setItem("sessionData", JSON.stringify({
          sessionId: data.sessionId,
          initialAgentReply: data,
          agentName: props.agentName,
          customCss: data.agentConfig.theme.customCss ?? ''
        }));
      }
    };
    createEffect(() => {
      if (isNotDefined(props.agentName) || isInitialized()) return;
      initializeBot().then();
    });
    createEffect(() => {
      localStorage.setItem("sessionData", JSON.stringify({
        sessionId: sessionId(),
        initialAgentReply: initialAgentReply(),
        agentName: props.agentName
      }));
    });
    // The key used to store the last tab number
    const LAST_TAB_NUMBER_KEY = 'lastTabNumber';
    let tabNumber;
    createEffect(() => {
      // Check if we have a tab number for the current session
      let tabNumberString = sessionStorage.getItem('tabNumber');
      if (!tabNumberString) {
        // If not, get the last tab number from localStorage, increment it and save
        const lastTabNumber = parseInt(localStorage.getItem(LAST_TAB_NUMBER_KEY) || '0');
        tabNumber = lastTabNumber + 1;
        localStorage.setItem(LAST_TAB_NUMBER_KEY, tabNumber.toString());
        sessionStorage.setItem('tabNumber', tabNumber.toString());
        // Trigger the storage event for other tabs
        window.dispatchEvent(new Event('storage'));
      } else {
        tabNumber = parseInt(tabNumberString);
      }
      // Cleanup logic (if needed)...
      onCleanup(() => {
        // any cleanup activities, if necessary.
      });
    });
    onCleanup(() => {
      setIsInitialized(false);
    });
    return [(() => {
      const _el$ = _tmpl$$3();
      insert(_el$, customCss);
      return _el$;
    })(), (() => {
      const _el$2 = _tmpl$$3();
      insert(_el$2, css_248z);
      return _el$2;
    })(), createComponent(Show, {
      get when() {
        return error();
      },
      keyed: true,
      children: error => createComponent(ErrorMessage, {
        error: error
      })
    }), createComponent(Show, {
      get when() {
        return initialAgentReply();
      },
      keyed: true,
      children: initialAgentReply => createComponent(BotContent, {
        get ["class"]() {
          return props.class;
        },
        get initialAgentReply() {
          return {
            ...initialAgentReply,
            agentConfig: {
              ...initialAgentReply.agentConfig,
              settings: initialAgentReply.agentConfig?.settings,
              theme: initialAgentReply.agentConfig?.theme
            }
          };
        },
        get context() {
          return {
            apiHost: props.apiHost,
            isPreview: props.isPreview ?? false,
            resultId: initialAgentReply.resultId,
            sessionId: sessionId(),
            agentConfig: initialAgentReply.agentConfig,
            agentName: props.agentName,
            tabNumber: tabNumber
          };
        },
        setSessionId: setSessionId,
        get onNewInputBlock() {
          return props.onNewInputBlock;
        },
        get onNewLogs() {
          return props.onNewLogs;
        },
        get onAnswer() {
          return props.onAnswer;
        },
        get onEnd() {
          return props.onEnd;
        }
      })
    })];
  };
  const BotContent = props => {
    let botContainer;
    const resizeObserver = new ResizeObserver(entries => {
      return setIsMobile(entries[0].target.clientWidth < 400);
    });
    const injectCustomFont = () => {
      const existingFont = document.getElementById('bot-font');
      if (existingFont?.getAttribute('href')?.includes(props.initialAgentReply.agentConfig?.theme?.general?.font ?? 'Open Sans')) return;
      const font = document.createElement('link');
      font.href = `https://fonts.bunny.net/css2?family=${props.initialAgentReply.agentConfig?.theme?.general?.font ?? 'Open Sans'}:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&display=swap');')`;
      font.rel = 'stylesheet';
      font.id = 'bot-font';
      document.head.appendChild(font);
    };
    onMount(() => {
      if (!botContainer) return;
      resizeObserver.observe(botContainer);
    });
    createEffect(() => {
      injectCustomFont();
      if (!botContainer) return;
      setCssVariablesValue(props.initialAgentReply.agentConfig.theme, botContainer);
    });
    onCleanup(() => {
      if (!botContainer) return;
      resizeObserver.unobserve(botContainer);
    });
    return (() => {
      const _el$3 = _tmpl$2$2(),
        _el$4 = _el$3.firstChild;
      const _ref$ = botContainer;
      typeof _ref$ === "function" ? use(_ref$, _el$3) : botContainer = _el$3;
      insert(_el$4, createComponent(ConversationContainer, {
        get context() {
          return props.context;
        },
        get initialAgentReply() {
          return props.initialAgentReply;
        },
        get onNewInputBlock() {
          return props.onNewInputBlock;
        },
        get onAnswer() {
          return props.onAnswer;
        },
        get onEnd() {
          return props.onEnd;
        },
        get onNewLogs() {
          return props.onNewLogs;
        },
        get setSessionId() {
          return props.setSessionId;
        }
      }));
      insert(_el$3, createComponent(Show, {
        get when() {
          return props.initialAgentReply.agentConfig.settings.general.isBrandingEnabled;
        },
        get children() {
          return createComponent(LiteBadge, {
            botContainer: botContainer
          });
        }
      }), null);
      createRenderEffect(() => className(_el$3, 'relative flex w-full h-full text-base overflow-hidden bg-cover bg-center flex-col items-center agent-widget-container ' + props.class));
      return _el$3;
    })();
  };
  
  const _tmpl$$2 = /*#__PURE__*/template(`<style>`),
    _tmpl$2$1 = /*#__PURE__*/template(`<div part="bot">`);
  const Bubble = props => {
    const [bubbleProps, botProps] = splitProps(props, ['onOpen', 'onClose', 'previewMessage', 'onPreviewMessageClick', 'theme', 'autoShowDelay']);
    const [prefilledVariables, setPrefilledVariables] = createSignal(
    // eslint-disable-next-line solid/reactivity
    botProps.prefilledVariables);
    const [isPreviewMessageDisplayed, setIsPreviewMessageDisplayed] = createSignal(false);
    const [previewMessage, setPreviewMessage] = createSignal({
      message: bubbleProps.previewMessage?.message ?? '',
      avatarUrl: bubbleProps.previewMessage?.avatarUrl
    });
    const [isBotOpened, setIsBotOpened] = createSignal(false);
    const [isBotStarted, setIsBotStarted] = createSignal(false);
    onMount(() => {
      window.addEventListener('message', processIncomingEvent);
      const autoShowDelay = bubbleProps.autoShowDelay;
      const previewMessageAutoShowDelay = bubbleProps.previewMessage?.autoShowDelay;
      const paymentInProgress = getPaymentInProgressInStorage();
      if (paymentInProgress) openBot();
      if (isDefined(autoShowDelay)) {
        setTimeout(() => {
          openBot();
        }, autoShowDelay);
      }
      if (isDefined(previewMessageAutoShowDelay)) {
        setTimeout(() => {
          showMessage();
        }, previewMessageAutoShowDelay);
      }
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    createEffect(() => {
      if (!props.prefilledVariables) return;
      setPrefilledVariables(existingPrefilledVariables => ({
        ...existingPrefilledVariables,
        ...props.prefilledVariables
      }));
    });
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'open') openBot();
      if (data.command === 'close') closeBot();
      if (data.command === 'toggle') toggleBot();
      if (data.command === 'showPreviewMessage') showMessage(data.message);
      if (data.command === 'hidePreviewMessage') hideMessage();
      if (data.command === 'setPrefilledVariables') setPrefilledVariables(existingPrefilledVariables => ({
        ...existingPrefilledVariables,
        ...data.variables
      }));
    };
    const openBot = () => {
      if (!isBotStarted()) setIsBotStarted(true);
      hideMessage();
      setIsBotOpened(true);
      if (isBotOpened()) bubbleProps.onOpen?.();
    };
    const closeBot = () => {
      setIsBotOpened(false);
      if (isBotOpened()) bubbleProps.onClose?.();
    };
    const toggleBot = () => {
      isBotOpened() ? closeBot() : openBot();
    };
    const handlePreviewMessageClick = () => {
      bubbleProps.onPreviewMessageClick?.();
      openBot();
    };
    const showMessage = previewMessage => {
      if (previewMessage) setPreviewMessage(previewMessage);
      if (isBotOpened()) return;
      setIsPreviewMessageDisplayed(true);
    };
    const hideMessage = () => {
      setIsPreviewMessageDisplayed(false);
    };
    return [(() => {
      const _el$ = _tmpl$$2();
      insert(_el$, css_248z$1);
      return _el$;
    })(), createComponent(Show, {
      get when() {
        return isPreviewMessageDisplayed();
      },
      get children() {
        return createComponent(PreviewMessage, mergeProps(previewMessage, {
          get placement() {
            return bubbleProps.theme?.placement;
          },
          get previewMessageTheme() {
            return bubbleProps.theme?.previewMessage;
          },
          get buttonSize() {
            return bubbleProps.theme?.button?.size;
          },
          onClick: handlePreviewMessageClick,
          onCloseClick: hideMessage
        }));
      }
    }), createComponent(BubbleButton, mergeProps(() => bubbleProps.theme?.button, {
      get placement() {
        return bubbleProps.theme?.placement;
      },
      toggleBot: toggleBot,
      get isBotOpened() {
        return isBotOpened();
      }
    })), (() => {
      const _el$2 = _tmpl$2$1();
      _el$2.style.setProperty("height", "calc(100% - 80px)");
      _el$2.style.setProperty("transition", "transform 200ms cubic-bezier(0, 1.2, 1, 1), opacity 150ms ease-out");
      _el$2.style.setProperty("box-shadow", "rgb(0 0 0 / 16%) 0px 5px 40px");
      _el$2.style.setProperty("z-index", "42424242");
      insert(_el$2, createComponent(Show, {
        get when() {
          return isBotStarted();
        },
        get children() {
          return createComponent(Bot, mergeProps(botProps, {
            get prefilledVariables() {
              return prefilledVariables();
            },
            "class": "rounded-lg"
          }));
        }
      }));
      createRenderEffect(_p$ => {
        const _v$ = props.theme?.placement === 'left' ? 'bottom left' : 'bottom right',
          _v$2 = isBotOpened() ? 'scale3d(1, 1, 1)' : 'scale3d(0, 0, 1)',
          _v$3 = bubbleProps.theme?.chatWindow?.backgroundColor,
          _v$4 = 'fixed rounded-lg w-full sm:w-[400px] max-h-[704px]' + (isBotOpened() ? ' opacity-1' : ' opacity-0 pointer-events-none') + (props.theme?.button?.size === 'large' ? ' bottom-24' : ' bottom-20') + (props.theme?.placement === 'left' ? ' sm:left-5' : ' sm:right-5');
        _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$2.style.setProperty("transform-origin", _v$) : _el$2.style.removeProperty("transform-origin"));
        _v$2 !== _p$._v$2 && ((_p$._v$2 = _v$2) != null ? _el$2.style.setProperty("transform", _v$2) : _el$2.style.removeProperty("transform"));
        _v$3 !== _p$._v$3 && ((_p$._v$3 = _v$3) != null ? _el$2.style.setProperty("background-color", _v$3) : _el$2.style.removeProperty("background-color"));
        _v$4 !== _p$._v$4 && className(_el$2, _p$._v$4 = _v$4);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined,
        _v$3: undefined,
        _v$4: undefined
      });
      return _el$2;
    })()];
  };
  
  const _tmpl$$1 = /*#__PURE__*/template(`<style>`),
    _tmpl$2 = /*#__PURE__*/template(`<div class="relative" aria-labelledby="modal-title" role="dialog" aria-modal="true"><style></style><div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity animate-fade-in" part="overlay"></div><div class="fixed inset-0 z-10 overflow-y-auto"><div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0"><div>`);
  const Popup = props => {
    const [popupProps, botProps] = splitProps(props, ['onOpen', 'onClose', 'autoShowDelay', 'theme', 'isOpen', 'defaultOpen']);
    const [prefilledVariables, setPrefilledVariables] = createSignal(
    // eslint-disable-next-line solid/reactivity
    botProps.prefilledVariables);
    const [isBotOpened, setIsBotOpened] = createSignal(
    // eslint-disable-next-line solid/reactivity
    popupProps.isOpen ?? false);
    onMount(() => {
      const paymentInProgress = getPaymentInProgressInStorage();
      if (popupProps.defaultOpen || paymentInProgress) openBot();
      window.addEventListener('message', processIncomingEvent);
      const autoShowDelay = popupProps.autoShowDelay;
      if (isDefined(autoShowDelay)) {
        setTimeout(() => {
          openBot();
        }, autoShowDelay);
      }
    });
    onCleanup(() => {
      window.removeEventListener('message', processIncomingEvent);
    });
    createEffect(() => {
      if (isNotDefined(props.isOpen) || props.isOpen === isBotOpened()) return;
      toggleBot();
    });
    createEffect(() => {
      if (!props.prefilledVariables) return;
      setPrefilledVariables(existingPrefilledVariables => ({
        ...existingPrefilledVariables,
        ...props.prefilledVariables
      }));
    });
    const stopPropagation = event => {
      event.stopPropagation();
    };
    const processIncomingEvent = event => {
      const {
        data
      } = event;
      if (!data.isFromAgent) return;
      if (data.command === 'open') openBot();
      if (data.command === 'close') closeBot();
      if (data.command === 'toggle') toggleBot();
      if (data.command === 'setPrefilledVariables') setPrefilledVariables(existingPrefilledVariables => ({
        ...existingPrefilledVariables,
        ...data.variables
      }));
    };
    const openBot = () => {
      setIsBotOpened(true);
      popupProps.onOpen?.();
      document.body.style.overflow = 'hidden';
      document.addEventListener('pointerdown', closeBot);
    };
    const closeBot = () => {
      setIsBotOpened(false);
      popupProps.onClose?.();
      document.body.style.overflow = 'auto';
      document.removeEventListener('pointerdown', closeBot);
    };
    const toggleBot = () => {
      isBotOpened() ? closeBot() : openBot();
    };
    return createComponent(Show, {
      get when() {
        return isBotOpened();
      },
      get children() {
        return [(() => {
          const _el$ = _tmpl$$1();
          insert(_el$, css_248z$1);
          return _el$;
        })(), (() => {
          const _el$2 = _tmpl$2(),
            _el$3 = _el$2.firstChild,
            _el$4 = _el$3.nextSibling,
            _el$5 = _el$4.nextSibling,
            _el$6 = _el$5.firstChild,
            _el$7 = _el$6.firstChild;
          insert(_el$3, css_248z$1);
          _el$7.addEventListener("pointerdown", stopPropagation);
          insert(_el$7, createComponent(Bot, mergeProps(botProps, {
            get prefilledVariables() {
              return prefilledVariables();
            }
          })));
          createRenderEffect(_p$ => {
            const _v$ = props.theme?.zIndex ?? 42424242,
              _v$2 = 'relative h-[80vh] transform overflow-hidden rounded-lg text-left transition-all sm:my-8 sm:w-full sm:max-w-lg' + (props.theme?.backgroundColor ? ' shadow-xl' : ''),
              _v$3 = props.theme?.backgroundColor ?? 'transparent';
            _v$ !== _p$._v$ && ((_p$._v$ = _v$) != null ? _el$2.style.setProperty("z-index", _v$) : _el$2.style.removeProperty("z-index"));
            _v$2 !== _p$._v$2 && className(_el$7, _p$._v$2 = _v$2);
            _v$3 !== _p$._v$3 && ((_p$._v$3 = _v$3) != null ? _el$7.style.setProperty("background-color", _v$3) : _el$7.style.removeProperty("background-color"));
            return _p$;
          }, {
            _v$: undefined,
            _v$2: undefined,
            _v$3: undefined
          });
          return _el$2;
        })()];
      }
    });
  };
  
  const _tmpl$ = /*#__PURE__*/template(`<style>
  :host {
    display: block;
    width: 100%;
    height: 100%;
    overflow-y: hidden;
  }
  `);
  const Standard = (props, {
    element
  }) => {
    const [isBotDisplayed, setIsBotDisplayed] = createSignal(false);
    const launchBot = () => {
      setIsBotDisplayed(true);
    };
    const botLauncherObserver = new IntersectionObserver(intersections => {
      if (intersections.some(intersection => intersection.isIntersecting)) launchBot();
    });
    onMount(() => {
      botLauncherObserver.observe(element);
    });
    onCleanup(() => {
      botLauncherObserver.disconnect();
    });
    return [(() => {
      const _el$ = _tmpl$(),
        _el$2 = _el$.firstChild;
      insert(_el$, css_248z$1, _el$2);
      return _el$;
    })(), createComponent(Show, {
      get when() {
        return isBotDisplayed();
      },
      get children() {
        return createComponent(Bot, props);
      }
    })];
  };
  
  const registerWebComponents = () => {
    if (typeof window === 'undefined') return;
    // @ts-expect-error element incorect type
    customElement('agent-standard', defaultBotProps, Standard);
    customElement('agent-bubble', defaultBubbleProps, Bubble);
    customElement('agent-popup', defaultPopupProps, Popup);
  };
  
  const close = () => {
    const message = {
      isFromAgent: true,
      command: 'close'
    };
    window.postMessage(message);
  };
  
  const hidePreviewMessage = () => {
    const message = {
      isFromAgent: true,
      command: 'hidePreviewMessage'
    };
    window.postMessage(message);
  };
  
  const open = () => {
    const message = {
      isFromAgent: true,
      command: 'open'
    };
    window.postMessage(message);
  };
  
  const setPrefilledVariables = variables => {
    const message = {
      isFromAgent: true,
      command: 'setPrefilledVariables',
      variables
    };
    window.postMessage(message);
  };
  
  const showPreviewMessage = proactiveMessage => {
    const message = {
      isFromAgent: true,
      command: 'showPreviewMessage',
      message: proactiveMessage
    };
    window.postMessage(message);
  };
  
  const toggle = () => {
    const message = {
      isFromAgent: true,
      command: 'toggle'
    };
    window.postMessage(message);
  };
  
  const setInputValue = value => {
    const message = {
      isFromAgent: true,
      command: 'setInputValue',
      value
    };
    window.postMessage(message);
  };
  
  const initStandard = props => {
    if (typeof window !== 'undefined') {
      const standardElement = props.id ? document.getElementById(props.id) : document.querySelector('agent-standard');
      if (!standardElement) throw new Error('<agent-standard> element not found.');
      Object.assign(standardElement, props);
    }
  };
  const initPopup = props => {
    if (typeof window !== 'undefined') {
      const popupElement = document.createElement('agent-popup');
      Object.assign(popupElement, props);
      document.body.appendChild(popupElement);
    }
  };
  const initBubble = props => {
    if (typeof window !== 'undefined') {
      const bubbleElement = document.createElement('agent-bubble');
      Object.assign(bubbleElement, props);
      document.body.appendChild(bubbleElement);
    }
  };
  const parsePredictable = () => ({
    initStandard,
    initPopup,
    initBubble,
    close,
    hidePreviewMessage,
    open,
    setPrefilledVariables,
    showPreviewMessage,
    toggle,
    setInputValue
  });
  const injectAgentInWindow = agent => {
    if (typeof window === 'undefined') return;
    window.Agent = {
      ...agent
    };
  };
  
  let agent;
  if (typeof window !== 'undefined') {
    registerWebComponents();
    agent = parsePredictable();
    injectAgentInWindow(agent);
  }
  var agent$1 = agent;
  
  export { agent$1 as default };
  