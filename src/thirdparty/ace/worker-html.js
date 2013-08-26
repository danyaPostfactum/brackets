"no use strict";
;(function(window) {
if (typeof window.window != "undefined" && window.document) {
    return;
}

window.console = function() {
    var msgs = Array.prototype.slice.call(arguments, 0);
    postMessage({type: "log", data: msgs});
};
window.console.error =
window.console.warn = 
window.console.log =
window.console.trace = window.console;

window.window = window;
window.ace = window;

window.normalizeModule = function(parentId, moduleName) {
    if (moduleName.indexOf("!") !== -1) {
        var chunks = moduleName.split("!");
        return normalizeModule(parentId, chunks[0]) + "!" + normalizeModule(parentId, chunks[1]);
    }
    if (moduleName.charAt(0) == ".") {
        var base = parentId.split("/").slice(0, -1).join("/");
        moduleName = base + "/" + moduleName;
        
        while(moduleName.indexOf(".") !== -1 && previous != moduleName) {
            var previous = moduleName;
            moduleName = moduleName.replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
        }
    }
    
    return moduleName;
};

window.require = function(parentId, id) {
    if (!id) {
        id = parentId
        parentId = null;
    }
    if (!id.charAt)
        throw new Error("worker.js require() accepts only (parentId, id) as arguments");

    id = normalizeModule(parentId, id);

    var module = require.modules[id];
    if (module) {
        if (!module.initialized) {
            module.initialized = true;
            module.exports = module.factory().exports;
        }
        return module.exports;
    }
    
    var chunks = id.split("/");
    chunks[0] = require.tlns[chunks[0]] || chunks[0];
    var path = chunks.join("/") + ".js";
    
    require.id = id;
    importScripts(path);
    return require(parentId, id);
};

require.modules = {};
require.tlns = {};

window.define = function(id, deps, factory) {
    if (arguments.length == 2) {
        factory = deps;
        if (typeof id != "string") {
            deps = id;
            id = require.id;
        }
    } else if (arguments.length == 1) {
        factory = id;
        id = require.id;
    }

    if (id.indexOf("text!") === 0) 
        return;
    
    var req = function(deps, factory) {
        return require(id, deps, factory);
    };

    require.modules[id] = {
        exports: {},
        factory: function() {
            var module = this;
            var returnExports = factory(req, module.exports, module);
            if (returnExports)
                module.exports = returnExports;
            return module;
        }
    };
};

window.initBaseUrls  = function initBaseUrls(topLevelNamespaces) {
    require.tlns = topLevelNamespaces;
}

window.initSender = function initSender() {

    var EventEmitter = require("ace/lib/event_emitter").EventEmitter;
    var oop = require("ace/lib/oop");
    
    var Sender = function() {};
    
    (function() {
        
        oop.implement(this, EventEmitter);
                
        this.callback = function(data, callbackId) {
            postMessage({
                type: "call",
                id: callbackId,
                data: data
            });
        };
    
        this.emit = function(name, data) {
            postMessage({
                type: "event",
                name: name,
                data: data
            });
        };
        
    }).call(Sender.prototype);
    
    return new Sender();
}

window.main = null;
window.sender = null;

window.onmessage = function(e) {
    var msg = e.data;
    if (msg.command) {
        if (main[msg.command])
            main[msg.command].apply(main, msg.args);
        else
            throw new Error("Unknown command:" + msg.command);
    }
    else if (msg.init) {        
        initBaseUrls(msg.tlns);
        require("ace/lib/es5-shim");
        sender = initSender();
        var clazz = require(msg.module)[msg.classname];
        main = new clazz(sender);
    } 
    else if (msg.event && sender) {
        sender._emit(msg.event, msg.data);
    }
};
})(this);

ace.define('ace/lib/event_emitter', ['require', 'exports', 'module' ], function(require, exports, module) {


var EventEmitter = {};
var stopPropagation = function() { this.propagationStopped = true; };
var preventDefault = function() { this.defaultPrevented = true; };

EventEmitter._emit =
EventEmitter._dispatchEvent = function(eventName, e) {
    this._eventRegistry || (this._eventRegistry = {});
    this._defaultHandlers || (this._defaultHandlers = {});

    var listeners = this._eventRegistry[eventName] || [];
    var defaultHandler = this._defaultHandlers[eventName];
    if (!listeners.length && !defaultHandler)
        return;

    if (typeof e != "object" || !e)
        e = {};

    if (!e.type)
        e.type = eventName;
    if (!e.stopPropagation)
        e.stopPropagation = stopPropagation;
    if (!e.preventDefault)
        e.preventDefault = preventDefault;

    for (var i=0; i<listeners.length; i++) {
        listeners[i](e, this);
        if (e.propagationStopped)
            break;
    }
    
    if (defaultHandler && !e.defaultPrevented)
        return defaultHandler(e, this);
};


EventEmitter._signal = function(eventName, e) {
    var listeners = (this._eventRegistry || {})[eventName];
    if (!listeners)
        return;

    for (var i=0; i<listeners.length; i++)
        listeners[i](e, this);
};

EventEmitter.once = function(eventName, callback) {
    var _self = this;
    callback && this.addEventListener(eventName, function newCallback() {
        _self.removeEventListener(eventName, newCallback);
        callback.apply(null, arguments);
    });
};


EventEmitter.setDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        handlers = this._defaultHandlers = {_disabled_: {}};
    
    if (handlers[eventName]) {
        var old = handlers[eventName];
        var disabled = handlers._disabled_[eventName];
        if (!disabled)
            handlers._disabled_[eventName] = disabled = [];
        disabled.push(old);
        var i = disabled.indexOf(callback);
        if (i != -1) 
            disabled.splice(i, 1);
    }
    handlers[eventName] = callback;
};
EventEmitter.removeDefaultHandler = function(eventName, callback) {
    var handlers = this._defaultHandlers
    if (!handlers)
        return;
    var disabled = handlers._disabled_[eventName];
    
    if (handlers[eventName] == callback) {
        var old = handlers[eventName];
        if (disabled)
            this.setDefaultHandler(eventName, disabled.pop());
    } else if (disabled) {
        var i = disabled.indexOf(callback);
        if (i != -1)
            disabled.splice(i, 1);
    }
};

EventEmitter.on =
EventEmitter.addEventListener = function(eventName, callback, capturing) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        listeners = this._eventRegistry[eventName] = [];

    if (listeners.indexOf(callback) == -1)
        listeners[capturing ? "unshift" : "push"](callback);
    return callback;
};

EventEmitter.off =
EventEmitter.removeListener =
EventEmitter.removeEventListener = function(eventName, callback) {
    this._eventRegistry = this._eventRegistry || {};

    var listeners = this._eventRegistry[eventName];
    if (!listeners)
        return;

    var index = listeners.indexOf(callback);
    if (index !== -1)
        listeners.splice(index, 1);
};

EventEmitter.removeAllListeners = function(eventName) {
    if (this._eventRegistry) this._eventRegistry[eventName] = [];
};

exports.EventEmitter = EventEmitter;

});

ace.define('ace/lib/oop', ['require', 'exports', 'module' ], function(require, exports, module) {


exports.inherits = (function() {
    var tempCtor = function() {};
    return function(ctor, superCtor) {
        tempCtor.prototype = superCtor.prototype;
        ctor.super_ = superCtor.prototype;
        ctor.prototype = new tempCtor();
        ctor.prototype.constructor = ctor;
    };
}());

exports.mixin = function(obj, mixin) {
    for (var key in mixin) {
        obj[key] = mixin[key];
    }
    return obj;
};

exports.implement = function(proto, mixin) {
    exports.mixin(proto, mixin);
};

});

ace.define('ace/lib/es5-shim', ['require', 'exports', 'module' ], function(require, exports, module) {

function Empty() {}

if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) { // .length is 1
        var target = this;
        if (typeof target != "function") {
            throw new TypeError("Function.prototype.bind called on incompatible " + target);
        }
        var args = slice.call(arguments, 1); // for normal call
        var bound = function () {

            if (this instanceof bound) {

                var result = target.apply(
                    this,
                    args.concat(slice.call(arguments))
                );
                if (Object(result) === result) {
                    return result;
                }
                return this;

            } else {
                return target.apply(
                    that,
                    args.concat(slice.call(arguments))
                );

            }

        };
        if(target.prototype) {
            Empty.prototype = target.prototype;
            bound.prototype = new Empty();
            Empty.prototype = null;
        }
        return bound;
    };
}
var call = Function.prototype.call;
var prototypeOfArray = Array.prototype;
var prototypeOfObject = Object.prototype;
var slice = prototypeOfArray.slice;
var _toString = call.bind(prototypeOfObject.toString);
var owns = call.bind(prototypeOfObject.hasOwnProperty);
var defineGetter;
var defineSetter;
var lookupGetter;
var lookupSetter;
var supportsAccessors;
if ((supportsAccessors = owns(prototypeOfObject, "__defineGetter__"))) {
    defineGetter = call.bind(prototypeOfObject.__defineGetter__);
    defineSetter = call.bind(prototypeOfObject.__defineSetter__);
    lookupGetter = call.bind(prototypeOfObject.__lookupGetter__);
    lookupSetter = call.bind(prototypeOfObject.__lookupSetter__);
}
if ([1,2].splice(0).length != 2) {
    if(function() { // test IE < 9 to splice bug - see issue #138
        function makeArray(l) {
            var a = new Array(l+2);
            a[0] = a[1] = 0;
            return a;
        }
        var array = [], lengthBefore;
        
        array.splice.apply(array, makeArray(20));
        array.splice.apply(array, makeArray(26));

        lengthBefore = array.length; //46
        array.splice(5, 0, "XXX"); // add one element

        lengthBefore + 1 == array.length

        if (lengthBefore + 1 == array.length) {
            return true;// has right splice implementation without bugs
        }
    }()) {//IE 6/7
        var array_splice = Array.prototype.splice;
        Array.prototype.splice = function(start, deleteCount) {
            if (!arguments.length) {
                return [];
            } else {
                return array_splice.apply(this, [
                    start === void 0 ? 0 : start,
                    deleteCount === void 0 ? (this.length - start) : deleteCount
                ].concat(slice.call(arguments, 2)))
            }
        };
    } else {//IE8
        Array.prototype.splice = function(pos, removeCount){
            var length = this.length;
            if (pos > 0) {
                if (pos > length)
                    pos = length;
            } else if (pos == void 0) {
                pos = 0;
            } else if (pos < 0) {
                pos = Math.max(length + pos, 0);
            }

            if (!(pos+removeCount < length))
                removeCount = length - pos;

            var removed = this.slice(pos, pos+removeCount);
            var insert = slice.call(arguments, 2);
            var add = insert.length;            
            if (pos === length) {
                if (add) {
                    this.push.apply(this, insert);
                }
            } else {
                var remove = Math.min(removeCount, length - pos);
                var tailOldPos = pos + remove;
                var tailNewPos = tailOldPos + add - remove;
                var tailCount = length - tailOldPos;
                var lengthAfterRemove = length - remove;

                if (tailNewPos < tailOldPos) { // case A
                    for (var i = 0; i < tailCount; ++i) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } else if (tailNewPos > tailOldPos) { // case B
                    for (i = tailCount; i--; ) {
                        this[tailNewPos+i] = this[tailOldPos+i];
                    }
                } // else, add == remove (nothing to do)

                if (add && pos === lengthAfterRemove) {
                    this.length = lengthAfterRemove; // truncate array
                    this.push.apply(this, insert);
                } else {
                    this.length = lengthAfterRemove + add; // reserves space
                    for (i = 0; i < add; ++i) {
                        this[pos+i] = insert[i];
                    }
                }
            }
            return removed;
        };
    }
}
if (!Array.isArray) {
    Array.isArray = function isArray(obj) {
        return _toString(obj) == "[object Array]";
    };
}
var boxedString = Object("a"),
    splitString = boxedString[0] != "a" || !(0 in boxedString);

if (!Array.prototype.forEach) {
    Array.prototype.forEach = function forEach(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            thisp = arguments[1],
            i = -1,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(); // TODO message
        }

        while (++i < length) {
            if (i in self) {
                fun.call(thisp, self[i], i, object);
            }
        }
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function map(fun /*, thisp*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            result = Array(length),
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self)
                result[i] = fun.call(thisp, self[i], i, object);
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function filter(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                    object,
            length = self.length >>> 0,
            result = [],
            value,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self) {
                value = self[i];
                if (fun.call(thisp, value, i, object)) {
                    result.push(value);
                }
            }
        }
        return result;
    };
}
if (!Array.prototype.every) {
    Array.prototype.every = function every(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && !fun.call(thisp, self[i], i, object)) {
                return false;
            }
        }
        return true;
    };
}
if (!Array.prototype.some) {
    Array.prototype.some = function some(fun /*, thisp */) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0,
            thisp = arguments[1];
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }

        for (var i = 0; i < length; i++) {
            if (i in self && fun.call(thisp, self[i], i, object)) {
                return true;
            }
        }
        return false;
    };
}
if (!Array.prototype.reduce) {
    Array.prototype.reduce = function reduce(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduce of empty array with no initial value");
        }

        var i = 0;
        var result;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i++];
                    break;
                }
                if (++i >= length) {
                    throw new TypeError("reduce of empty array with no initial value");
                }
            } while (true);
        }

        for (; i < length; i++) {
            if (i in self) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        }

        return result;
    };
}
if (!Array.prototype.reduceRight) {
    Array.prototype.reduceRight = function reduceRight(fun /*, initial*/) {
        var object = toObject(this),
            self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                object,
            length = self.length >>> 0;
        if (_toString(fun) != "[object Function]") {
            throw new TypeError(fun + " is not a function");
        }
        if (!length && arguments.length == 1) {
            throw new TypeError("reduceRight of empty array with no initial value");
        }

        var result, i = length - 1;
        if (arguments.length >= 2) {
            result = arguments[1];
        } else {
            do {
                if (i in self) {
                    result = self[i--];
                    break;
                }
                if (--i < 0) {
                    throw new TypeError("reduceRight of empty array with no initial value");
                }
            } while (true);
        }

        do {
            if (i in this) {
                result = fun.call(void 0, result, self[i], i, object);
            }
        } while (i--);

        return result;
    };
}
if (!Array.prototype.indexOf || ([0, 1].indexOf(1, 2) != -1)) {
    Array.prototype.indexOf = function indexOf(sought /*, fromIndex */ ) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }

        var i = 0;
        if (arguments.length > 1) {
            i = toInteger(arguments[1]);
        }
        i = i >= 0 ? i : Math.max(0, length + i);
        for (; i < length; i++) {
            if (i in self && self[i] === sought) {
                return i;
            }
        }
        return -1;
    };
}
if (!Array.prototype.lastIndexOf || ([0, 1].lastIndexOf(0, -3) != -1)) {
    Array.prototype.lastIndexOf = function lastIndexOf(sought /*, fromIndex */) {
        var self = splitString && _toString(this) == "[object String]" ?
                this.split("") :
                toObject(this),
            length = self.length >>> 0;

        if (!length) {
            return -1;
        }
        var i = length - 1;
        if (arguments.length > 1) {
            i = Math.min(i, toInteger(arguments[1]));
        }
        i = i >= 0 ? i : length - Math.abs(i);
        for (; i >= 0; i--) {
            if (i in self && sought === self[i]) {
                return i;
            }
        }
        return -1;
    };
}
if (!Object.getPrototypeOf) {
    Object.getPrototypeOf = function getPrototypeOf(object) {
        return object.__proto__ || (
            object.constructor ?
            object.constructor.prototype :
            prototypeOfObject
        );
    };
}
if (!Object.getOwnPropertyDescriptor) {
    var ERR_NON_OBJECT = "Object.getOwnPropertyDescriptor called on a " +
                         "non-object: ";
    Object.getOwnPropertyDescriptor = function getOwnPropertyDescriptor(object, property) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT + object);
        if (!owns(object, property))
            return;

        var descriptor, getter, setter;
        descriptor =  { enumerable: true, configurable: true };
        if (supportsAccessors) {
            var prototype = object.__proto__;
            object.__proto__ = prototypeOfObject;

            var getter = lookupGetter(object, property);
            var setter = lookupSetter(object, property);
            object.__proto__ = prototype;

            if (getter || setter) {
                if (getter) descriptor.get = getter;
                if (setter) descriptor.set = setter;
                return descriptor;
            }
        }
        descriptor.value = object[property];
        return descriptor;
    };
}
if (!Object.getOwnPropertyNames) {
    Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
        return Object.keys(object);
    };
}
if (!Object.create) {
    var createEmpty;
    if (Object.prototype.__proto__ === null) {
        createEmpty = function () {
            return { "__proto__": null };
        };
    } else {
        createEmpty = function () {
            var empty = {};
            for (var i in empty)
                empty[i] = null;
            empty.constructor =
            empty.hasOwnProperty =
            empty.propertyIsEnumerable =
            empty.isPrototypeOf =
            empty.toLocaleString =
            empty.toString =
            empty.valueOf =
            empty.__proto__ = null;
            return empty;
        }
    }

    Object.create = function create(prototype, properties) {
        var object;
        if (prototype === null) {
            object = createEmpty();
        } else {
            if (typeof prototype != "object")
                throw new TypeError("typeof prototype["+(typeof prototype)+"] != 'object'");
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
        }
        if (properties !== void 0)
            Object.defineProperties(object, properties);
        return object;
    };
}

function doesDefinePropertyWork(object) {
    try {
        Object.defineProperty(object, "sentinel", {});
        return "sentinel" in object;
    } catch (exception) {
    }
}
if (Object.defineProperty) {
    var definePropertyWorksOnObject = doesDefinePropertyWork({});
    var definePropertyWorksOnDom = typeof document == "undefined" ||
        doesDefinePropertyWork(document.createElement("div"));
    if (!definePropertyWorksOnObject || !definePropertyWorksOnDom) {
        var definePropertyFallback = Object.defineProperty;
    }
}

if (!Object.defineProperty || definePropertyFallback) {
    var ERR_NON_OBJECT_DESCRIPTOR = "Property description must be an object: ";
    var ERR_NON_OBJECT_TARGET = "Object.defineProperty called on non-object: "
    var ERR_ACCESSORS_NOT_SUPPORTED = "getters & setters can not be defined " +
                                      "on this javascript engine";

    Object.defineProperty = function defineProperty(object, property, descriptor) {
        if ((typeof object != "object" && typeof object != "function") || object === null)
            throw new TypeError(ERR_NON_OBJECT_TARGET + object);
        if ((typeof descriptor != "object" && typeof descriptor != "function") || descriptor === null)
            throw new TypeError(ERR_NON_OBJECT_DESCRIPTOR + descriptor);
        if (definePropertyFallback) {
            try {
                return definePropertyFallback.call(Object, object, property, descriptor);
            } catch (exception) {
            }
        }
        if (owns(descriptor, "value")) {

            if (supportsAccessors && (lookupGetter(object, property) ||
                                      lookupSetter(object, property)))
            {
                var prototype = object.__proto__;
                object.__proto__ = prototypeOfObject;
                delete object[property];
                object[property] = descriptor.value;
                object.__proto__ = prototype;
            } else {
                object[property] = descriptor.value;
            }
        } else {
            if (!supportsAccessors)
                throw new TypeError(ERR_ACCESSORS_NOT_SUPPORTED);
            if (owns(descriptor, "get"))
                defineGetter(object, property, descriptor.get);
            if (owns(descriptor, "set"))
                defineSetter(object, property, descriptor.set);
        }

        return object;
    };
}
if (!Object.defineProperties) {
    Object.defineProperties = function defineProperties(object, properties) {
        for (var property in properties) {
            if (owns(properties, property))
                Object.defineProperty(object, property, properties[property]);
        }
        return object;
    };
}
if (!Object.seal) {
    Object.seal = function seal(object) {
        return object;
    };
}
if (!Object.freeze) {
    Object.freeze = function freeze(object) {
        return object;
    };
}
try {
    Object.freeze(function () {});
} catch (exception) {
    Object.freeze = (function freeze(freezeObject) {
        return function freeze(object) {
            if (typeof object == "function") {
                return object;
            } else {
                return freezeObject(object);
            }
        };
    })(Object.freeze);
}
if (!Object.preventExtensions) {
    Object.preventExtensions = function preventExtensions(object) {
        return object;
    };
}
if (!Object.isSealed) {
    Object.isSealed = function isSealed(object) {
        return false;
    };
}
if (!Object.isFrozen) {
    Object.isFrozen = function isFrozen(object) {
        return false;
    };
}
if (!Object.isExtensible) {
    Object.isExtensible = function isExtensible(object) {
        if (Object(object) === object) {
            throw new TypeError(); // TODO message
        }
        var name = '';
        while (owns(object, name)) {
            name += '?';
        }
        object[name] = true;
        var returnValue = owns(object, name);
        delete object[name];
        return returnValue;
    };
}
if (!Object.keys) {
    var hasDontEnumBug = true,
        dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
        ],
        dontEnumsLength = dontEnums.length;

    for (var key in {"toString": null}) {
        hasDontEnumBug = false;
    }

    Object.keys = function keys(object) {

        if (
            (typeof object != "object" && typeof object != "function") ||
            object === null
        ) {
            throw new TypeError("Object.keys called on a non-object");
        }

        var keys = [];
        for (var name in object) {
            if (owns(object, name)) {
                keys.push(name);
            }
        }

        if (hasDontEnumBug) {
            for (var i = 0, ii = dontEnumsLength; i < ii; i++) {
                var dontEnum = dontEnums[i];
                if (owns(object, dontEnum)) {
                    keys.push(dontEnum);
                }
            }
        }
        return keys;
    };

}
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}
var ws = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
    "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
    "\u2029\uFEFF";
if (!String.prototype.trim || ws.trim()) {
    ws = "[" + ws + "]";
    var trimBeginRegexp = new RegExp("^" + ws + ws + "*"),
        trimEndRegexp = new RegExp(ws + ws + "*$");
    String.prototype.trim = function trim() {
        return String(this).replace(trimBeginRegexp, "").replace(trimEndRegexp, "");
    };
}

function toInteger(n) {
    n = +n;
    if (n !== n) { // isNaN
        n = 0;
    } else if (n !== 0 && n !== (1/0) && n !== -(1/0)) {
        n = (n > 0 || -1) * Math.floor(Math.abs(n));
    }
    return n;
}

function isPrimitive(input) {
    var type = typeof input;
    return (
        input === null ||
        type === "undefined" ||
        type === "boolean" ||
        type === "number" ||
        type === "string"
    );
}

function toPrimitive(input) {
    var val, valueOf, toString;
    if (isPrimitive(input)) {
        return input;
    }
    valueOf = input.valueOf;
    if (typeof valueOf === "function") {
        val = valueOf.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    toString = input.toString;
    if (typeof toString === "function") {
        val = toString.call(input);
        if (isPrimitive(val)) {
            return val;
        }
    }
    throw new TypeError();
}
var toObject = function (o) {
    if (o == null) { // this matches both null and undefined
        throw new TypeError("can't convert "+o+" to object");
    }
    return Object(o);
};

});

ace.define('ace/mode/html_worker', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/lang', 'ace/worker/mirror', 'ace/mode/html/parser'], function(require, exports, module) {


var oop = require("../lib/oop");
var lang = require("../lib/lang");
var Mirror = require("../worker/mirror").Mirror;
var Parser = require("./html/parser").Parser;
var messages = require("./html/parser").messages;

var Worker = exports.Worker = function(sender) {
    Mirror.call(this, sender);
    this.setTimeout(400);
};

oop.inherits(Worker, Mirror);

(function() {

    function formatMessage(format, variables) {
        return format.replace(/%\((.*?)\)/g, function(match, key) {
            return variables[key];
        });
    }

    this.onUpdate = function() {
        var value = this.doc.getValue();
        if (!value)
            return;

        var parser = new Parser();
        parser.parse(value);
        this.sender.emit("error", parser.errors.map(function(error) {
            var position    = error[0];
            var messageCode = error[1];
            var messageVars = error[2];
            var isWarning   = error[3];
            var isDoctypeInfo = messageCode.indexOf("expected-doctype-but") == 0;
            return {
                row: position.line,
                column: position.column,
                text: formatMessage(messages[messageCode], messageVars),
                type: isDoctypeInfo ? "info" : isWarning ? "warning" : "error"
            };
        }));
    };

}).call(Worker.prototype);

});

ace.define('ace/lib/lang', ['require', 'exports', 'module' ], function(require, exports, module) {


exports.stringReverse = function(string) {
    return string.split("").reverse().join("");
};

exports.stringRepeat = function (string, count) {
    var result = '';
    while (count > 0) {
        if (count & 1)
            result += string;

        if (count >>= 1)
            string += string;
    }
    return result;
};

var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;

exports.stringTrimLeft = function (string) {
    return string.replace(trimBeginRegexp, '');
};

exports.stringTrimRight = function (string) {
    return string.replace(trimEndRegexp, '');
};

exports.copyObject = function(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
};

exports.copyArray = function(array){
    var copy = [];
    for (var i=0, l=array.length; i<l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject( array[i] );
        else 
            copy[i] = array[i];
    }
    return copy;
};

exports.deepCopy = function (obj) {
    if (typeof obj != "object") {
        return obj;
    }
    
    var copy = obj.constructor();
    for (var key in obj) {
        if (typeof obj[key] == "object") {
            copy[key] = this.deepCopy(obj[key]);
        } else {
            copy[key] = obj[key];
        }
    }
    return copy;
};

exports.arrayToMap = function(arr) {
    var map = {};
    for (var i=0; i<arr.length; i++) {
        map[arr[i]] = 1;
    }
    return map;

};

exports.createMap = function(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
};
exports.arrayRemove = function(array, value) {
  for (var i = 0; i <= array.length; i++) {
    if (value === array[i]) {
      array.splice(i, 1);
    }
  }
};

exports.escapeRegExp = function(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

exports.escapeHTML = function(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
};

exports.getMatchOffsets = function(string, regExp) {
    var matches = [];

    string.replace(regExp, function(str) {
        matches.push({
            offset: arguments[arguments.length-2],
            length: str.length
        });
    });

    return matches;
};
exports.deferredCall = function(fcn) {

    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var deferred = function(timeout) {
        deferred.cancel();
        timer = setTimeout(callback, timeout || 0);
        return deferred;
    };

    deferred.schedule = deferred;

    deferred.call = function() {
        this.cancel();
        fcn();
        return deferred;
    };

    deferred.cancel = function() {
        clearTimeout(timer);
        timer = null;
        return deferred;
    };

    return deferred;
};


exports.delayedCall = function(fcn, defaultTimeout) {
    var timer = null;
    var callback = function() {
        timer = null;
        fcn();
    };

    var _self = function(timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(callback, timeout || defaultTimeout);
    };

    _self.delay = _self;
    _self.schedule = function(timeout) {
        if (timer == null)
            timer = setTimeout(callback, timeout || 0);
    };

    _self.call = function() {
        this.cancel();
        fcn();
    };

    _self.cancel = function() {
        timer && clearTimeout(timer);
        timer = null;
    };

    _self.isPending = function() {
        return timer;
    };

    return _self;
};
});
ace.define('ace/worker/mirror', ['require', 'exports', 'module' , 'ace/document', 'ace/lib/lang'], function(require, exports, module) {


var Document = require("../document").Document;
var lang = require("../lib/lang");
    
var Mirror = exports.Mirror = function(sender) {
    this.sender = sender;
    var doc = this.doc = new Document("");
    
    var deferredUpdate = this.deferredUpdate = lang.delayedCall(this.onUpdate.bind(this));
    
    var _self = this;
    sender.on("change", function(e) {
        doc.applyDeltas(e.data);
        deferredUpdate.schedule(_self.$timeout);
    });
};

(function() {
    
    this.$timeout = 500;
    
    this.setTimeout = function(timeout) {
        this.$timeout = timeout;
    };
    
    this.setValue = function(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    };
    
    this.getValue = function(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    };
    
    this.onUpdate = function() {
    };
    
}).call(Mirror.prototype);

});

ace.define('ace/document', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/event_emitter', 'ace/range', 'ace/anchor'], function(require, exports, module) {


var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;
var Range = require("./range").Range;
var Anchor = require("./anchor").Anchor;

var Document = function(text) {
    this.$lines = [];
    if (text.length == 0) {
        this.$lines = [""];
    } else if (Array.isArray(text)) {
        this._insertLines(0, text);
    } else {
        this.insert({row: 0, column:0}, text);
    }
};

(function() {

    oop.implement(this, EventEmitter);
    this.setValue = function(text) {
        var len = this.getLength();
        this.remove(new Range(0, 0, len, this.getLine(len-1).length));
        this.insert({row: 0, column:0}, text);
    };
    this.getValue = function() {
        return this.getAllLines().join(this.getNewLineCharacter());
    };
    this.createAnchor = function(row, column) {
        return new Anchor(this, row, column);
    };
    if ("aaa".split(/a/).length == 0)
        this.$split = function(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        }
    else
        this.$split = function(text) {
            return text.split(/\r\n|\r|\n/);
        };


    this.$detectNewLine = function(text) {
        var match = text.match(/^.*?(\r\n|\r|\n)/m);
        this.$autoNewLine = match ? match[1] : "\n";
    };
    this.getNewLineCharacter = function() {
        switch (this.$newLineMode) {
          case "windows":
            return "\r\n";
          case "unix":
            return "\n";
          default:
            return this.$autoNewLine;
        }
    };

    this.$autoNewLine = "\n";
    this.$newLineMode = "auto";
    this.setNewLineMode = function(newLineMode) {
        if (this.$newLineMode === newLineMode)
            return;

        this.$newLineMode = newLineMode;
    };
    this.getNewLineMode = function() {
        return this.$newLineMode;
    };
    this.isNewLine = function(text) {
        return (text == "\r\n" || text == "\r" || text == "\n");
    };
    this.getLine = function(row) {
        return this.$lines[row] || "";
    };
    this.getLines = function(firstRow, lastRow) {
        return this.$lines.slice(firstRow, lastRow + 1);
    };
    this.getAllLines = function() {
        return this.getLines(0, this.getLength());
    };
    this.getLength = function() {
        return this.$lines.length;
    };
    this.getTextRange = function(range) {
        if (range.start.row == range.end.row) {
            return this.getLine(range.start.row)
                .substring(range.start.column, range.end.column);
        }
        var lines = this.getLines(range.start.row, range.end.row);
        lines[0] = (lines[0] || "").substring(range.start.column);
        var l = lines.length - 1;
        if (range.end.row - range.start.row == l)
            lines[l] = lines[l].substring(0, range.end.column);
        return lines.join(this.getNewLineCharacter());
    };

    this.$clipPosition = function(position) {
        var length = this.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = this.getLine(length-1).length;
        } else if (position.row < 0)
            position.row = 0;
        return position;
    };
    this.insert = function(position, text) {
        if (!text || text.length === 0)
            return position;

        position = this.$clipPosition(position);
        if (this.getLength() <= 1)
            this.$detectNewLine(text);

        var lines = this.$split(text);
        var firstLine = lines.splice(0, 1)[0];
        var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];

        position = this.insertInLine(position, firstLine);
        if (lastLine !== null) {
            position = this.insertNewLine(position); // terminate first line
            position = this._insertLines(position.row, lines);
            position = this.insertInLine(position, lastLine || "");
        }
        return position;
    };
    this.insertLines = function(row, lines) {
        if (row >= this.getLength())
            return this.insert({row: row, column: 0}, "\n" + lines.join("\n"));
        return this._insertLines(Math.max(row, 0), lines);
    };
    this._insertLines = function(row, lines) {
        if (lines.length == 0)
            return {row: row, column: 0};
        if (lines.length > 0xFFFF) {
            var end = this._insertLines(row, lines.slice(0xFFFF));
            lines = lines.slice(0, 0xFFFF);
        }

        var args = [row, 0];
        args.push.apply(args, lines);
        this.$lines.splice.apply(this.$lines, args);

        var range = new Range(row, 0, row + lines.length, 0);
        var delta = {
            action: "insertLines",
            range: range,
            lines: lines
        };
        this._emit("change", { data: delta });
        return end || range.end;
    };
    this.insertNewLine = function(position) {
        position = this.$clipPosition(position);
        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column);
        this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));

        var end = {
            row : position.row + 1,
            column : 0
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: this.getNewLineCharacter()
        };
        this._emit("change", { data: delta });

        return end;
    };
    this.insertInLine = function(position, text) {
        if (text.length == 0)
            return position;

        var line = this.$lines[position.row] || "";

        this.$lines[position.row] = line.substring(0, position.column) + text
                + line.substring(position.column);

        var end = {
            row : position.row,
            column : position.column + text.length
        };

        var delta = {
            action: "insertText",
            range: Range.fromPoints(position, end),
            text: text
        };
        this._emit("change", { data: delta });

        return end;
    };
    this.remove = function(range) {
        range.start = this.$clipPosition(range.start);
        range.end = this.$clipPosition(range.end);

        if (range.isEmpty())
            return range.start;

        var firstRow = range.start.row;
        var lastRow = range.end.row;

        if (range.isMultiLine()) {
            var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
            var lastFullRow = lastRow - 1;

            if (range.end.column > 0)
                this.removeInLine(lastRow, 0, range.end.column);

            if (lastFullRow >= firstFullRow)
                this._removeLines(firstFullRow, lastFullRow);

            if (firstFullRow != firstRow) {
                this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                this.removeNewLine(range.start.row);
            }
        }
        else {
            this.removeInLine(firstRow, range.start.column, range.end.column);
        }
        return range.start;
    };
    this.removeInLine = function(row, startColumn, endColumn) {
        if (startColumn == endColumn)
            return;

        var range = new Range(row, startColumn, row, endColumn);
        var line = this.getLine(row);
        var removed = line.substring(startColumn, endColumn);
        var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
        this.$lines.splice(row, 1, newLine);

        var delta = {
            action: "removeText",
            range: range,
            text: removed
        };
        this._emit("change", { data: delta });
        return range.start;
    };
    this.removeLines = function(firstRow, lastRow) {
        if (firstRow < 0 || lastRow >= this.getLength())
            return this.remove(new Range(firstRow, 0, lastRow + 1, 0));
        return this._removeLines(firstRow, lastRow);
    };

    this._removeLines = function(firstRow, lastRow) {
        var range = new Range(firstRow, 0, lastRow + 1, 0);
        var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);

        var delta = {
            action: "removeLines",
            range: range,
            nl: this.getNewLineCharacter(),
            lines: removed
        };
        this._emit("change", { data: delta });
        return removed;
    };
    this.removeNewLine = function(row) {
        var firstLine = this.getLine(row);
        var secondLine = this.getLine(row+1);

        var range = new Range(row, firstLine.length, row+1, 0);
        var line = firstLine + secondLine;

        this.$lines.splice(row, 2, line);

        var delta = {
            action: "removeText",
            range: range,
            text: this.getNewLineCharacter()
        };
        this._emit("change", { data: delta });
    };
    this.replace = function(range, text) {
        if (text.length == 0 && range.isEmpty())
            return range.start;
        if (text == this.getTextRange(range))
            return range.end;

        this.remove(range);
        if (text) {
            var end = this.insert(range.start, text);
        }
        else {
            end = range.start;
        }

        return end;
    };
    this.applyDeltas = function(deltas) {
        for (var i=0; i<deltas.length; i++) {
            var delta = deltas[i];
            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this.insertLines(range.start.row, delta.lines);
            else if (delta.action == "insertText")
                this.insert(range.start, delta.text);
            else if (delta.action == "removeLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "removeText")
                this.remove(range);
        }
    };
    this.revertDeltas = function(deltas) {
        for (var i=deltas.length-1; i>=0; i--) {
            var delta = deltas[i];

            var range = Range.fromPoints(delta.range.start, delta.range.end);

            if (delta.action == "insertLines")
                this._removeLines(range.start.row, range.end.row - 1);
            else if (delta.action == "insertText")
                this.remove(range);
            else if (delta.action == "removeLines")
                this._insertLines(range.start.row, delta.lines);
            else if (delta.action == "removeText")
                this.insert(range.start, delta.text);
        }
    };
    this.indexToPosition = function(index, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        for (var i = startRow || 0, l = lines.length; i < l; i++) {
            index -= lines[i].length + newlineLength;
            if (index < 0)
                return {row: i, column: index + lines[i].length + newlineLength};
        }
        return {row: l-1, column: lines[l-1].length};
    };
    this.positionToIndex = function(pos, startRow) {
        var lines = this.$lines || this.getAllLines();
        var newlineLength = this.getNewLineCharacter().length;
        var index = 0;
        var row = Math.min(pos.row, lines.length);
        for (var i = startRow || 0; i < row; ++i)
            index += lines[i].length + newlineLength;

        return index + pos.column;
    };

}).call(Document.prototype);

exports.Document = Document;
});

ace.define('ace/range', ['require', 'exports', 'module' ], function(require, exports, module) {

var comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};
var Range = function(startRow, startColumn, endRow, endColumn) {
    this.start = {
        row: startRow,
        column: startColumn
    };

    this.end = {
        row: endRow,
        column: endColumn
    };
};

(function() {
    this.isEqual = function(range) {
        return this.start.row === range.start.row &&
            this.end.row === range.end.row &&
            this.start.column === range.start.column &&
            this.end.column === range.end.column;
    };
    this.toString = function() {
        return ("Range: [" + this.start.row + "/" + this.start.column +
            "] -> [" + this.end.row + "/" + this.end.column + "]");
    };

    this.contains = function(row, column) {
        return this.compare(row, column) == 0;
    };
    this.compareRange = function(range) {
        var cmp,
            end = range.end,
            start = range.start;

        cmp = this.compare(end.row, end.column);
        if (cmp == 1) {
            cmp = this.compare(start.row, start.column);
            if (cmp == 1) {
                return 2;
            } else if (cmp == 0) {
                return 1;
            } else {
                return 0;
            }
        } else if (cmp == -1) {
            return -2;
        } else {
            cmp = this.compare(start.row, start.column);
            if (cmp == -1) {
                return -1;
            } else if (cmp == 1) {
                return 42;
            } else {
                return 0;
            }
        }
    };
    this.comparePoint = function(p) {
        return this.compare(p.row, p.column);
    };
    this.containsRange = function(range) {
        return this.comparePoint(range.start) == 0 && this.comparePoint(range.end) == 0;
    };
    this.intersects = function(range) {
        var cmp = this.compareRange(range);
        return (cmp == -1 || cmp == 0 || cmp == 1);
    };
    this.isEnd = function(row, column) {
        return this.end.row == row && this.end.column == column;
    };
    this.isStart = function(row, column) {
        return this.start.row == row && this.start.column == column;
    };
    this.setStart = function(row, column) {
        if (typeof row == "object") {
            this.start.column = row.column;
            this.start.row = row.row;
        } else {
            this.start.row = row;
            this.start.column = column;
        }
    };
    this.setEnd = function(row, column) {
        if (typeof row == "object") {
            this.end.column = row.column;
            this.end.row = row.row;
        } else {
            this.end.row = row;
            this.end.column = column;
        }
    };
    this.inside = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column) || this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideStart = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isEnd(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.insideEnd = function(row, column) {
        if (this.compare(row, column) == 0) {
            if (this.isStart(row, column)) {
                return false;
            } else {
                return true;
            }
        }
        return false;
    };
    this.compare = function(row, column) {
        if (!this.isMultiLine()) {
            if (row === this.start.row) {
                return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
            };
        }

        if (row < this.start.row)
            return -1;

        if (row > this.end.row)
            return 1;

        if (this.start.row === row)
            return column >= this.start.column ? 0 : -1;

        if (this.end.row === row)
            return column <= this.end.column ? 0 : 1;

        return 0;
    };
    this.compareStart = function(row, column) {
        if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareEnd = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else {
            return this.compare(row, column);
        }
    };
    this.compareInside = function(row, column) {
        if (this.end.row == row && this.end.column == column) {
            return 1;
        } else if (this.start.row == row && this.start.column == column) {
            return -1;
        } else {
            return this.compare(row, column);
        }
    };
    this.clipRows = function(firstRow, lastRow) {
        if (this.end.row > lastRow)
            var end = {row: lastRow + 1, column: 0};
        else if (this.end.row < firstRow)
            var end = {row: firstRow, column: 0};

        if (this.start.row > lastRow)
            var start = {row: lastRow + 1, column: 0};
        else if (this.start.row < firstRow)
            var start = {row: firstRow, column: 0};

        return Range.fromPoints(start || this.start, end || this.end);
    };
    this.extend = function(row, column) {
        var cmp = this.compare(row, column);

        if (cmp == 0)
            return this;
        else if (cmp == -1)
            var start = {row: row, column: column};
        else
            var end = {row: row, column: column};

        return Range.fromPoints(start || this.start, end || this.end);
    };

    this.isEmpty = function() {
        return (this.start.row === this.end.row && this.start.column === this.end.column);
    };
    this.isMultiLine = function() {
        return (this.start.row !== this.end.row);
    };
    this.clone = function() {
        return Range.fromPoints(this.start, this.end);
    };
    this.collapseRows = function() {
        if (this.end.column == 0)
            return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row-1), 0)
        else
            return new Range(this.start.row, 0, this.end.row, 0)
    };
    this.toScreenRange = function(session) {
        var screenPosStart = session.documentToScreenPosition(this.start);
        var screenPosEnd = session.documentToScreenPosition(this.end);

        return new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
    };
    this.moveBy = function(row, column) {
        this.start.row += row;
        this.start.column += column;
        this.end.row += row;
        this.end.column += column;
    };

}).call(Range.prototype);
Range.fromPoints = function(start, end) {
    return new Range(start.row, start.column, end.row, end.column);
};
Range.comparePoints = comparePoints;

Range.comparePoints = function(p1, p2) {
    return p1.row - p2.row || p1.column - p2.column;
};


exports.Range = Range;
});

ace.define('ace/anchor', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/lib/event_emitter'], function(require, exports, module) {


var oop = require("./lib/oop");
var EventEmitter = require("./lib/event_emitter").EventEmitter;

var Anchor = exports.Anchor = function(doc, row, column) {
    this.$onChange = this.onChange.bind(this);
    this.attach(doc);
    
    if (typeof column == "undefined")
        this.setPosition(row.row, row.column);
    else
        this.setPosition(row, column);
};

(function() {

    oop.implement(this, EventEmitter);
    this.getPosition = function() {
        return this.$clipPositionToDocument(this.row, this.column);
    };
    this.getDocument = function() {
        return this.document;
    };
    this.onChange = function(e) {
        var delta = e.data;
        var range = delta.range;

        if (range.start.row == range.end.row && range.start.row != this.row)
            return;

        if (range.start.row > this.row)
            return;

        if (range.start.row == this.row && range.start.column > this.column)
            return;

        var row = this.row;
        var column = this.column;
        var start = range.start;
        var end = range.end;

        if (delta.action === "insertText") {
            if (start.row === row && start.column <= column) {
                if (start.row === end.row) {
                    column += end.column - start.column;
                } else {
                    column -= start.column;
                    row += end.row - start.row;
                }
            } else if (start.row !== end.row && start.row < row) {
                row += end.row - start.row;
            }
        } else if (delta.action === "insertLines") {
            if (start.row <= row) {
                row += end.row - start.row;
            }
        } else if (delta.action === "removeText") {
            if (start.row === row && start.column < column) {
                if (end.column >= column)
                    column = start.column;
                else
                    column = Math.max(0, column - (end.column - start.column));

            } else if (start.row !== end.row && start.row < row) {
                if (end.row === row)
                    column = Math.max(0, column - end.column) + start.column;
                row -= (end.row - start.row);
            } else if (end.row === row) {
                row -= end.row - start.row;
                column = Math.max(0, column - end.column) + start.column;
            }
        } else if (delta.action == "removeLines") {
            if (start.row <= row) {
                if (end.row <= row)
                    row -= end.row - start.row;
                else {
                    row = start.row;
                    column = 0;
                }
            }
        }

        this.setPosition(row, column, true);
    };
    this.setPosition = function(row, column, noClip) {
        var pos;
        if (noClip) {
            pos = {
                row: row,
                column: column
            };
        } else {
            pos = this.$clipPositionToDocument(row, column);
        }

        if (this.row == pos.row && this.column == pos.column)
            return;

        var old = {
            row: this.row,
            column: this.column
        };

        this.row = pos.row;
        this.column = pos.column;
        this._emit("change", {
            old: old,
            value: pos
        });
    };
    this.detach = function() {
        this.document.removeEventListener("change", this.$onChange);
    };
    this.attach = function(doc) {
        this.document = doc || this.document;
        this.document.on("change", this.$onChange);
    };
    this.$clipPositionToDocument = function(row, column) {
        var pos = {};

        if (row >= this.document.getLength()) {
            pos.row = Math.max(0, this.document.getLength() - 1);
            pos.column = this.document.getLine(pos.row).length;
        }
        else if (row < 0) {
            pos.row = 0;
            pos.column = 0;
        }
        else {
            pos.row = row;
            pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
        }

        if (column < 0)
            pos.column = 0;

        return pos;
    };

}).call(Anchor.prototype);

});
ace.define('ace/mode/html/parser', ['require', 'exports', 'module' , 'ace/mode/html5', 'html5-entities', 'util', 'ace/mode/html/constants', 'ace/mode/html/tokenizer', 'ace/mode/html/treebuilder', 'ace/mode/html/treewalker', 'ace/mode/html/serializer', 'ace/mode/html/parser', 'ace/mode/html/debug', 'assert', 'events', 'ace/mode/html/saxtreebuilder', 'VxNTWn', 'ace/mode/core-upgrade', 'ace/mode/html/buffer', 'buffer', '__browserify_process', 'base64-js', 'ace/mode/html/buffer_ieee754', 'ace/mode/html/html5'], function(require, exports, module) {
require=(function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i})({1:[function(require,module,exports){
if(!Array.prototype.last) Object.defineProperty(Array.prototype, 'last', {
    value: function() { return this[this.length - 1] }
});


},{}],2:[function(require,module,exports){
(function(){var HTML5 = require('../html5');

function Buffer() {
    this.data = '';
    this.start = 0;
    this.committed = 0;
    this.eof = false;
    this.lastLocation = {line: 0, column: 0};
}

exports.Buffer = Buffer;

Buffer.prototype = {
    slice: function() {
        if(this.start >= this.data.length) {
            if(!this.eof) throw HTML5.DRAIN;
            return HTML5.EOF;
        }
        return this.data.slice(this.start, this.data.length);
    },
    char: function() {
        if(!this.eof && this.start >= this.data.length - 1) throw HTML5.DRAIN;
        if(this.start >= this.data.length) {
            return HTML5.EOF;
        }
        return this.data[this.start++];
    },
    advance: function(amount) {
        this.start += amount;
        if(this.start >= this.data.length) {    
            if(!this.eof) throw HTML5.DRAIN;
            return HTML5.EOF;
        } else {
            if(this.committed > this.data.length / 2) {
                this.lastLocation = this.location();
                this.data = this.data.slice(this.committed);
                this.start = this.start - this.committed;
                this.committed = 0;
            }
        }
    },
    matchWhile: function(re) {
        if(this.eof && this.start >= this.data.length ) return '';
        var r = new RegExp("^"+re+"+");
        var m = r.exec(this.slice());
        if(m) {
            if(!this.eof && m[0].length == this.data.length - this.start) throw HTML5.DRAIN;
            this.advance(m[0].length);
            return m[0];
        } else {
            return '';
        }
    },
    matchUntil: function(re) {
        var m, s;
        s = this.slice();
        if(s === HTML5.EOF) {
            return '';
        } else if(m = new RegExp(re + (this.eof ? "|$" : "")).exec(s)) {
            var t = this.data.slice(this.start, this.start + m.index);
            this.advance(m.index);
            return t.toString();
        } else {
            throw HTML5.DRAIN;
        }
    },
    append: function(data) {
        this.data += data;
    },
    shift: function(n) {
        if(!this.eof && this.start + n >= this.data.length) throw HTML5.DRAIN;
        if(this.eof && this.start >= this.data.length) return HTML5.EOF;
        var d = this.data.slice(this.start, this.start + n).toString();
        this.advance(Math.min(n, this.data.length - this.start));
        return d;
    },
    peek: function(n) {
        if(!this.eof && this.start + n >= this.data.length) throw HTML5.DRAIN;
        if(this.eof && this.start >= this.data.length) return HTML5.EOF;
        return this.data.slice(this.start, Math.min(this.start + n, this.data.length)).toString();
    },
    length: function() {
        return this.data.length - this.start - 1;
    },
    location: function() {
        var lastLine = this.lastLocation.line;
        var lastColumn = this.lastLocation.column;
        var read = this.data.slice(0, this.committed);
        var newlines = read.match(/\n/g);
        var line = newlines ? lastLine + newlines.length : lastLine;
        var column = newlines ? read.length - read.lastIndexOf('\n') - 1 : lastColumn + read.length;
        return {line: line, column: column};
    },
    unget: function(d) {
        if(d === HTML5.EOF) return;
        this.start -= (d.length);
    },
    undo: function() {
        this.start = this.committed;
    },
    commit: function() {
        this.committed = this.start;
    }
};

})()
},{"../html5":"VxNTWn"}],3:[function(require,module,exports){
var HTML5 = require('../html5');

HTML5.CONTENT_MODEL_FLAGS = [
    'PCDATA',
    'RCDATA',
    'CDATA',
    'SCRIPT_CDATA',
    'PLAINTEXT'
];

HTML5.Marker = {type: 'Marker', data: 'this is a marker token'};


(function() {
    function EOF() {
    }

    EOF.prototype = {
        toString: function() { return '[EOF]' }
    };
    HTML5.EOF = new EOF();
})();


HTML5.EOF_TOK = {type: 'EOF', data: 'End of File' };
HTML5.DRAIN = -2;

HTML5.SCOPING_ELEMENTS = {
    html: [
        'applet',
        'caption',
        'html',
        'table',
        'td',
        'th', 
        'marquee',
        'object'
    ],
    math: [
        'mi',
        'mo',
        'mn',
        'ms',
        'mtext',
        'annotation-xml'
    ],
    svg: [
        'foreignObject',
        'desc',
        'title'
    ]
};

HTML5.LIST_SCOPING_ELEMENTS = {
    html: [
        'ol',
        'ul',
        'applet',
        'caption',
        'html',
        'table',
        'td',
        'th', 
        'marquee',
        'object'
    ],
    math: [
        'mi',
        'mo',
        'mn',
        'ms',
        'mtext',
        'annotation-xml'
    ],
    svg: [
        'foreignObject',
        'desc',
        'title'
    ]
};

HTML5.BUTTON_SCOPING_ELEMENTS = {
    html: [
        'button',
        'applet',
        'caption',
        'html',
        'table',
        'td',
        'th', 
        'marquee',
        'object'
    ],
    math: [
        'mi',
        'mo',
        'mn',
        'ms',
        'mtext',
        'annotation-xml'
    ],
    svg: [
        'foreignObject',
        'desc',
        'title'
    ]
};

HTML5.TABLE_SCOPING_ELEMENTS = {
    html: ['table', 'html']
};

HTML5.SELECT_SCOPING_ELEMENTS = {
    html: ['option', 'optgroup']
};

HTML5.FORMATTING_ELEMENTS = [
    'a',
    'b',
    'big',
    'code',
    'em',
    'font',
    'i',
    'nobr',
    's',
    'small',
    'strike',
    'strong',
    'tt',
    'u'
];
HTML5.SPECIAL_ELEMENTS = {
    html: [
        'address',
        'applet',
        'area',
        'article',
        'aside',
        'base',
        'basefont',
        'bgsound',
        'blockquote',
        'body',
        'br',
        'button',
        'caption',
        'center',
        'col',
        'colgroup',
        'dd',
        'details',
        'dir',
        'div',
        'dl',
        'dt',
        'embed',
        'fieldset',
        'figcaption',
        'figure',
        'footer',
        'form',
        'frame',
        'frameset',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'head',
        'header',
        'hgroup',
        'hr',
        'html',
        'iframe',
        'img',
        'input',
        'isindex',
        'li',
        'link',
        'listing',
        'main',
        'marquee',
        'menu',
        'menuitem',
        'meta',
        'nav',
        'noembed',
        'noframes',
        'noscript',
        'object',
        'ol',
        'p',
        'param',
        'plaintext',
        'pre',
        'script',
        'section',
        'select',
        'source',
        'style',
        'summary',
        'table',
        'tbody',
        'td',
        'textarea',
        'tfoot',
        'th',
        'thead',
        'title',
        'tr',
        'track',
        'ul',
        'wbr',
        'xmp' // @todo: svg:foreignObject
    ],
    math: [
        'mi',
        'mo',
        'mn',
        'ms',
        'mtext',
        'annotation-xml'
    ],
    svg: [
        'foreignObject',
        'desc',
        'title'
    ]
};

HTML5.HTML_INTEGRATION_POINT_ELEMENTS = {
    math: ['annotation-xml'],
    svg: ['foreignObject', 'desc', 'title']
};

HTML5.MATHML_TEXT_INTEGRATION_POINT_ELEMENTS = {
    math: ['mi', 'mo', 'mn', 'ms', 'mtext']
};

HTML5.SPACE_CHARACTERS_IN = "\t\n\x0B\x0C\x20\u0012\r";
HTML5.SPACE_CHARACTERS = "[\t\n\x0B\x0C\x20\r]";
HTML5.SPACE_CHARACTERS_R = /^[\t\n\x0B\x0C \r]/;

HTML5.TABLE_INSERT_MODE_ELEMENTS = [
    'table',
    'tbody',
    'tfoot',
    'thead',
    'tr'
];

HTML5.ASCII_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
HTML5.ASCII_UPPERCASE = HTML5.ASCII_LOWERCASE.toUpperCase();
HTML5.ASCII_LETTERS = "[a-zA-Z]";
HTML5.ASCII_LETTERS_R = /^[a-zA-Z]/;
HTML5.DIGITS = '0123456789';
HTML5.DIGITS_R = new RegExp('^[0123456789]');
HTML5.HEX_DIGITS = HTML5.DIGITS + 'abcdefABCDEF';
HTML5.HEX_DIGITS_R = new RegExp('^[' + HTML5.DIGITS + 'abcdefABCDEF' +']' );
HTML5.HEADING_ELEMENTS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
];

HTML5.VOID_ELEMENTS = [
    'base',
    'command',
    'link',
    'meta',
    'hr',
    'br',
    'img',
    'embed',
    'param',
    'area',
    'col',
    'input',
    'source',
    'track'
];

HTML5.CDATA_ELEMENTS = [
    'title',
    'textarea'
];

HTML5.RCDATA_ELEMENTS = [
    'style',
    'script',
    'xmp',
    'iframe',
    'noembed',
    'noframes',
    'noscript'
];

HTML5.BOOLEAN_ATTRIBUTES = {
    '_global': ['irrelevant'],
    'style': ['scoped'],
    'img': ['ismap'],
    'audio': ['autoplay', 'controls'],
    'video': ['autoplay', 'controls'],
    'script': ['defer', 'async'],
    'details': ['open'],
    'datagrid': ['multiple', 'disabled'],
    'command': ['hidden', 'disabled', 'checked', 'default'],
    'menu': ['autosubmit'],
    'fieldset': ['disabled', 'readonly'],
    'option': ['disabled', 'readonly', 'selected'],
    'optgroup': ['disabled', 'readonly'],
    'button': ['disabled', 'autofocus'],
    'input': ['disabled', 'readonly', 'required', 'autofocus', 'checked', 'ismap'],
    'select': ['disabled', 'readonly', 'autofocus', 'multiple'],
    'output': ['disabled', 'readonly']
};

HTML5.ENTITIES = require('html5-entities');

HTML5.ENCODINGS = [
    'ansi_x3.4-1968',
    'iso-ir-6',
    'ansi_x3.4-1986',
    'iso_646.irv:1991',
    'ascii',
    'iso646-us',
    'us-ascii',
    'us',
    'ibm367',
    'cp367',
    'csascii',
    'ks_c_5601-1987',
    'korean',
    'iso-2022-kr',
    'csiso2022kr',
    'euc-kr',
    'iso-2022-jp',
    'csiso2022jp',
    'iso-2022-jp-2',
    '',
    'iso-ir-58',
    'chinese',
    'csiso58gb231280',
    'iso_8859-1:1987',
    'iso-ir-100',
    'iso_8859-1',
    'iso-8859-1',
    'latin1',
    'l1',
    'ibm819',
    'cp819',
    'csisolatin1',
    'iso_8859-2:1987',
    'iso-ir-101',
    'iso_8859-2',
    'iso-8859-2',
    'latin2',
    'l2',
    'csisolatin2',
    'iso_8859-3:1988',
    'iso-ir-109',
    'iso_8859-3',
    'iso-8859-3',
    'latin3',
    'l3',
    'csisolatin3',
    'iso_8859-4:1988',
    'iso-ir-110',
    'iso_8859-4',
    'iso-8859-4',
    'latin4',
    'l4',
    'csisolatin4',
    'iso_8859-6:1987',
    'iso-ir-127',
    'iso_8859-6',
    'iso-8859-6',
    'ecma-114',
    'asmo-708',
    'arabic',
    'csisolatinarabic',
    'iso_8859-7:1987',
    'iso-ir-126',
    'iso_8859-7',
    'iso-8859-7',
    'elot_928',
    'ecma-118',
    'greek',
    'greek8',
    'csisolatingreek',
    'iso_8859-8:1988',
    'iso-ir-138',
    'iso_8859-8',
    'iso-8859-8',
    'hebrew',
    'csisolatinhebrew',
    'iso_8859-5:1988',
    'iso-ir-144',
    'iso_8859-5',
    'iso-8859-5',
    'cyrillic',
    'csisolatincyrillic',
    'iso_8859-9:1989',
    'iso-ir-148',
    'iso_8859-9',
    'iso-8859-9',
    'latin5',
    'l5',
    'csisolatin5',
    'iso-8859-10',
    'iso-ir-157',
    'l6',
    'iso_8859-10:1992',
    'csisolatin6',
    'latin6',
    'hp-roman8',
    'roman8',
    'r8',
    'ibm037',
    'cp037',
    'csibm037',
    'ibm424',
    'cp424',
    'csibm424',
    'ibm437',
    'cp437',
    '437',
    'cspc8codepage437',
    'ibm500',
    'cp500',
    'csibm500',
    'ibm775',
    'cp775',
    'cspc775baltic',
    'ibm850',
    'cp850',
    '850',
    'cspc850multilingual',
    'ibm852',
    'cp852',
    '852',
    'cspcp852',
    'ibm855',
    'cp855',
    '855',
    'csibm855',
    'ibm857',
    'cp857',
    '857',
    'csibm857',
    'ibm860',
    'cp860',
    '860',
    'csibm860',
    'ibm861',
    'cp861',
    '861',
    'cp-is',
    'csibm861',
    'ibm862',
    'cp862',
    '862',
    'cspc862latinhebrew',
    'ibm863',
    'cp863',
    '863',
    'csibm863',
    'ibm864',
    'cp864',
    'csibm864',
    'ibm865',
    'cp865',
    '865',
    'csibm865',
    'ibm866',
    'cp866',
    '866',
    'csibm866',
    'ibm869',
    'cp869',
    '869',
    'cp-gr',
    'csibm869',
    'ibm1026',
    'cp1026',
    'csibm1026',
    'koi8-r',
    'cskoi8r',
    'koi8-u',
    'big5-hkscs',
    'ptcp154',
    'csptcp154',
    'pt154',
    'cp154',
    'utf-7',
    'utf-16be',
    'utf-16le',
    'utf-16',
    'utf-8',
    'iso-8859-13',
    'iso-8859-14',
    'iso-ir-199',
    'iso_8859-14:1998',
    'iso_8859-14',
    'latin8',
    'iso-celtic',
    'l8',
    'iso-8859-15',
    'iso_8859-15',
    'iso-8859-16',
    'iso-ir-226',
    'iso_8859-16:2001',
    'iso_8859-16',
    'latin10',
    'l10',
    'gbk',
    'cp936',
    'ms936',
    'gb18030',
    'shift_jis',
    'ms_kanji',
    'csshiftjis',
    'euc-jp',
    'gb2312',
    'big5',
    'csbig5',
    'windows-1250',
    'windows-1251',
    'windows-1252',
    'windows-1253',
    'windows-1254',
    'windows-1255',
    'windows-1256',
    'windows-1257',
    'windows-1258',
    'tis-620',
    'hz-gb-2312'
];

HTML5.E = {
    "null-character":
        "Null character in input stream, replaced with U+FFFD.",
    "invalid-codepoint":
        "Invalid codepoint in stream",
    "incorrectly-placed-solidus":
        "Solidus (/) incorrectly placed in tag.",
    "incorrect-cr-newline-entity":
        "Incorrect CR newline entity, replaced with LF.",
    "illegal-windows-1252-entity":
        "Entity used with illegal number (windows-1252 reference).",
    "cant-convert-numeric-entity":
        "Numeric entity couldn't be converted to character " +
        "(codepoint U+%(charAsInt)08x).",
    "invalid-numeric-entity-replaced":
        "Numeric entity represents an illegal codepoint. " +
        "Expanded to the C1 controls range.",
    "numeric-entity-without-semicolon":
        "Numeric entity didn't end with ';'.",
    "expected-numeric-entity-but-got-eof":
        "Numeric entity expected. Got end of file instead.",
    "expected-numeric-entity":
        "Numeric entity expected but none found.",
    "named-entity-without-semicolon":
        "Named entity didn't end with ';'.",
    "expected-named-entity":
        "Named entity expected. Got none.",
    "attributes-in-end-tag":
        "End tag contains unexpected attributes.",
    "self-closing-flag-on-end-tag":
        "End tag contains unexpected self-closing flag.",
    "bare-less-than-sign-at-eof":
        "End of file after <.",
    "expected-tag-name-but-got-right-bracket":
        "Expected tag name. Got '>' instead.",
    "expected-tag-name-but-got-question-mark":
        "Expected tag name. Got '?' instead. (HTML doesn't " +
    "support processing instructions.)",
    "expected-tag-name":
        "Expected tag name. Got something else instead.",
    "expected-closing-tag-but-got-right-bracket":
        "Expected closing tag. Got '>' instead. Ignoring '</>'.",
    "expected-closing-tag-but-got-eof":
        "Expected closing tag. Unexpected end of file.",
    "expected-closing-tag-but-got-char":
        "Expected closing tag. Unexpected character '%(data)' found.",
    "eof-in-tag-name":
        "Unexpected end of file in the tag name.",
    "expected-attribute-name-but-got-eof":
        "Unexpected end of file. Expected attribute name instead.",
    "eof-in-attribute-name":
        "Unexpected end of file in attribute name.",
    "invalid-character-in-attribute-name":
        "Invalid character in attribute name.",
    "duplicate-attribute":
        "Dropped duplicate attribute on tag.",
    "expected-end-of-tag-but-got-eof":
        "Unexpected end of file. Expected = or end of tag.",
    "expected-attribute-value-but-got-eof":
        "Unexpected end of file. Expected attribute value.",
    "expected-attribute-value-but-got-right-bracket":
        "Expected attribute value. Got '>' instead.",
    "unexpected-character-in-unquoted-attribute-value":
        "Unexpected character in unquoted attribute",
    "invalid-character-after-attribute-name":
        "Unexpected character after attribute name.",
    "unexpected-character-after-attribute-value":
        "Unexpected character after attribute value.",
    "eof-in-attribute-value-double-quote":
        "Unexpected end of file in attribute value (\").",
    "eof-in-attribute-value-single-quote":
        "Unexpected end of file in attribute value (').",
    "eof-in-attribute-value-no-quotes":
        "Unexpected end of file in attribute value.",
    "eof-after-attribute-value":
        "Unexpected end of file after attribute value.",
    "unexpected-eof-after-solidus-in-tag":
        "Unexpected end of file in tag. Expected >.",
    "unexpected-character-after-solidus-in-tag":
        "Unexpected character after / in tag. Expected >.",
    "expected-dashes-or-doctype":
        "Expected '--' or 'DOCTYPE'. Not found.",
    "unexpected-bang-after-double-dash-in-comment":
        "Unexpected ! after -- in comment.",
    "incorrect-comment":
        "Incorrect comment.",
    "eof-in-comment":
        "Unexpected end of file in comment.",
    "eof-in-comment-end-dash":
        "Unexpected end of file in comment (-).",
    "unexpected-dash-after-double-dash-in-comment":
        "Unexpected '-' after '--' found in comment.",
    "eof-in-comment-double-dash":
        "Unexpected end of file in comment (--).",
    "eof-in-comment-end-bang-state":
        "Unexpected end of file in comment.",
    "unexpected-char-in-comment":
        "Unexpected character in comment found.",
    "need-space-after-doctype":
        "No space after literal string 'DOCTYPE'.",
    "expected-doctype-name-but-got-right-bracket":
        "Unexpected > character. Expected DOCTYPE name.",
    "expected-doctype-name-but-got-eof":
        "Unexpected end of file. Expected DOCTYPE name.",
    "eof-in-doctype-name":
        "Unexpected end of file in DOCTYPE name.",
    "eof-in-doctype":
        "Unexpected end of file in DOCTYPE.",
    "expected-space-or-right-bracket-in-doctype":
        "Expected space or '>'. Got '%(data)'.",
    "unexpected-end-of-doctype":
        "Unexpected end of DOCTYPE.",
    "unexpected-char-in-doctype":
        "Unexpected character in DOCTYPE.",
    "eof-in-bogus-doctype":
        "Unexpected end of file in bogus doctype.",
    "eof-in-innerhtml":
        "Unexpected EOF in inner html mode.",
    "unexpected-doctype":
        "Unexpected DOCTYPE. Ignored.",
    "non-html-root":
        "html needs to be the first start tag.",
    "expected-doctype-but-got-eof":
        "Unexpected End of file. Expected DOCTYPE.",
    "unknown-doctype":
        "Erroneous DOCTYPE. Expected <!DOCTYPE html>.",
    "quirky-doctype":
        "Quirky doctype. Expected <!DOCTYPE html>.",
    "almost-standards-doctype":
        "Almost standards mode doctype. Expected <!DOCTYPE html>.",
    "obsolete-doctype":
        "Obsolete doctype. Expected <!DOCTYPE html>.",
    "expected-doctype-but-got-chars":
        "Unexpected non-space characters. Expected DOCTYPE.",
    "expected-doctype-but-got-start-tag":
        "Unexpected start tag (%(name)). Expected DOCTYPE.",
    "expected-doctype-but-got-end-tag":
        "Unexpected end tag (%(name)). Expected DOCTYPE.",
    "end-tag-after-implied-root":
        "Unexpected end tag (%(name)) after the (implied) root element.",
    "expected-named-closing-tag-but-got-eof":
        "Unexpected end of file. Expected end tag (%(name)).",
    "two-heads-are-not-better-than-one":
        "Unexpected start tag head in existing head. Ignored.",
    "unexpected-end-tag":
        "Unexpected end tag (%(name)). Ignored.",
    "unexpected-start-tag-out-of-my-head":
        "Unexpected start tag (%(name)) that can be in head. Moved.",
    "unexpected-start-tag":
        "Unexpected start tag (%(name)).",
    "missing-end-tag":
        "Missing end tag (%(name)).",
    "missing-end-tags":
        "Missing end tags (%(name)).",
    "unexpected-start-tag-implies-end-tag":
        "Unexpected start tag (%(startName)) " +
        "implies end tag (%(endName)).",
    "unexpected-start-tag-treated-as":
        "Unexpected start tag (%(originalName)). Treated as %(newName).",
    "deprecated-tag":
        "Unexpected start tag %(name). Don't use it!",
    "unexpected-start-tag-ignored":
        "Unexpected start tag %(name). Ignored.",
    "expected-one-end-tag-but-got-another":
        "Unexpected end tag (%(gotName)). " +
        "Missing end tag (%(expectedName)).",
    "end-tag-too-early":
        "End tag (%(name)) seen too early. Expected other end tag.",
    "end-tag-too-early-named":
        "Unexpected end tag (%(gotName)). Expected end tag (%(expectedName).",
    "end-tag-too-early-ignored":
        "End tag (%(name)) seen too early. Ignored.",
    "adoption-agency-1.1":
        "End tag (%(name)) violates step 1, " +
        "paragraph 1 of the adoption agency algorithm.",
    "adoption-agency-1.2":
        "End tag (%(name)) violates step 1, " +
        "paragraph 2 of the adoption agency algorithm.",
    "adoption-agency-1.3":
        "End tag (%(name)) violates step 1, " +
        "paragraph 3 of the adoption agency algorithm.",
    "unexpected-end-tag-treated-as":
        "Unexpected end tag (%(originalName)). Treated as %(newName).",
    "no-end-tag":
        "This element (%(name)) has no end tag.",
    "unexpected-implied-end-tag-in-table":
        "Unexpected implied end tag (%(name)) in the table phase.",
    "unexpected-implied-end-tag-in-table-body":
        "Unexpected implied end tag (%(name)) in the table body phase.",
    "unexpected-char-implies-table-voodoo":
        "Unexpected non-space characters in " +
        "table context caused voodoo mode.",
    "unpexted-hidden-input-in-table":
        "Unexpected input with type hidden in table context.",
    "unexpected-start-tag-implies-table-voodoo":
        "Unexpected start tag (%(name)) in " +
        "table context caused voodoo mode.",
    "unexpected-end-tag-implies-table-voodoo":
        "Unexpected end tag (%(name)) in " +
        "table context caused voodoo mode.",
    "unexpected-cell-in-table-body":
        "Unexpected table cell start tag (%(name)) " +
        "in the table body phase.",
    "unexpected-cell-end-tag":
        "Got table cell end tag (%(name)) " +
        "while required end tags are missing.",
    "unexpected-end-tag-in-table-body":
        "Unexpected end tag (%(name)) in the table body phase. Ignored.",
    "unexpected-implied-end-tag-in-table-row":
        "Unexpected implied end tag (%(name)) in the table row phase.",
    "unexpected-end-tag-in-table-row":
        "Unexpected end tag (%(name)) in the table row phase. Ignored.",
    "unexpected-select-in-select":
        "Unexpected select start tag in the select phase " +
        "treated as select end tag.",
    "unexpected-input-in-select":
        "Unexpected input start tag in the select phase.",
    "unexpected-start-tag-in-select":
        "Unexpected start tag token (%(name)) in the select phase. " +
        "Ignored.",
    "unexpected-end-tag-in-select":
        "Unexpected end tag (%(name)) in the select phase. Ignored.",
    "unexpected-table-element-start-tag-in-select-in-table":
        "Unexpected table element start tag (%(name))s in the select in table phase.",
    "unexpected-table-element-end-tag-in-select-in-table":
        "Unexpected table element end tag (%(name))s in the select in table phase.",
    "unexpected-char-after-body":
        "Unexpected non-space characters in the after body phase.",
    "unexpected-start-tag-after-body":
        "Unexpected start tag token (%(name))" +
        "in the after body phase.",
    "unexpected-end-tag-after-body":
        "Unexpected end tag token (%(name))" +
        " in the after body phase.",
    "unexpected-char-in-frameset":
        "Unepxected characters in the frameset phase. Characters ignored.",
    "unexpected-start-tag-in-frameset":
        "Unexpected start tag token (%(name))" +
        " in the frameset phase. Ignored.",
    "unexpected-frameset-in-frameset-innerhtml":
        "Unexpected end tag token (frameset " +
        "in the frameset phase (innerHTML).",
    "unexpected-end-tag-in-frameset":
        "Unexpected end tag token (%(name))" +
        " in the frameset phase. Ignored.",
    "unexpected-char-after-frameset":
        "Unexpected non-space characters in the " +
        "after frameset phase. Ignored.",
    "unexpected-start-tag-after-frameset":
        "Unexpected start tag (%(name))" +
        " in the after frameset phase. Ignored.",
    "unexpected-end-tag-after-frameset":
        "Unexpected end tag (%(name))" +
        " in the after frameset phase. Ignored.",
    "expected-eof-but-got-char":
        "Unexpected non-space characters. Expected end of file.",
    "expected-eof-but-got-start-tag":
        "Unexpected start tag (%(name))" +
        ". Expected end of file.",
    "expected-eof-but-got-end-tag":
        "Unexpected end tag (%(name))" +
        ". Expected end of file.",
    "unexpected-end-table-in-caption":
        "Unexpected end table tag in caption. Generates implied end caption.",
    "end-html-in-innerhtml": 
        "Unexpected html end tag in inner html mode.",
    "eof-in-table":
        "Unexpected end of file. Expected table content.",
    "eof-in-script":
        "Unexpected end of file. Expected script content.",
    "non-void-element-with-trailing-solidus":
        "Trailing solidus not allowed on element %(name).",
    "unexpected-html-element-in-foreign-content":
        "HTML start tag \"%(name)\" in a foreign namespace context.",
    "unexpected-start-tag-in-table":
        "Unexpected %(name). Expected table content."
};

HTML5.Models = {PCDATA: 'PCDATA', RCDATA: 'RCDATA', CDATA: 'CDATA', SCRIPT_CDATA: 'SCRIPT_CDATA'};

HTML5.TAGMODES = {
    select: 'inSelect',
    td: 'inCell',
    th: 'inCell',
    tr: 'inRow',
    tbody: 'inTableBody',
    thead: 'inTableBody',
    tfoot: 'inTableBody',
    caption: 'inCaption',
    colgroup: 'inColumnGroup',
    table: 'inTable',
    head: 'inBody',
    body: 'inBody',
    frameset: 'inFrameset',
    html: 'beforeHead'
};

HTML5.SVGTagMap = {
    "altglyph": "altGlyph",
    "altglyphdef": "altGlyphDef",
    "altglyphitem": "altGlyphItem",
    "animatecolor": "animateColor",
    "animatemotion": "animateMotion",
    "animatetransform": "animateTransform",
    "clippath": "clipPath",
    "feblend": "feBlend",
    "fecolormatrix": "feColorMatrix",
    "fecomponenttransfer": "feComponentTransfer",
    "fecomposite": "feComposite",
    "feconvolvematrix": "feConvolveMatrix",
    "fediffuselighting": "feDiffuseLighting",
    "fedisplacementmap": "feDisplacementMap",
    "fedistantlight": "feDistantLight",
    "feflood": "feFlood",
    "fefunca": "feFuncA",
    "fefuncb": "feFuncB",
    "fefuncg": "feFuncG",
    "fefuncr": "feFuncR",
    "fegaussianblur": "feGaussianBlur",
    "feimage": "feImage",
    "femerge": "feMerge",
    "femergenode": "feMergeNode",
    "femorphology": "feMorphology",
    "feoffset": "feOffset",
    "fepointlight": "fePointLight",
    "fespecularlighting": "feSpecularLighting",
    "fespotlight": "feSpotLight",
    "fetile": "feTile",
    "feturbulence": "feTurbulence",
    "foreignobject": "foreignObject",
    "glyphref": "glyphRef",
    "lineargradient": "linearGradient",
    "radialgradient": "radialGradient",
    "textpath": "textPath"
};

HTML5.MATHMLAttributeMap = {
    definitionurl: 'definitionURL'
};

HTML5.SVGAttributeMap = {
    attributename:  'attributeName',
    attributetype:  'attributeType',
    basefrequency:  'baseFrequency',
    baseprofile:    'baseProfile',
    calcmode:   'calcMode',
    clippathunits:  'clipPathUnits',
    contentscripttype:  'contentScriptType',
    contentstyletype:   'contentStyleType',
    diffuseconstant:    'diffuseConstant',
    edgemode:   'edgeMode',
    externalresourcesrequired:  'externalResourcesRequired',
    filterres:  'filterRes',
    filterunits:    'filterUnits',
    glyphref:   'glyphRef',
    gradienttransform:  'gradientTransform',
    gradientunits:  'gradientUnits',
    kernelmatrix:   'kernelMatrix',
    kernelunitlength:   'kernelUnitLength',
    keypoints:  'keyPoints',
    keysplines: 'keySplines',
    keytimes:   'keyTimes',
    lengthadjust:   'lengthAdjust',
    limitingconeangle:  'limitingConeAngle',
    markerheight:   'markerHeight',
    markerunits:    'markerUnits',
    markerwidth:    'markerWidth',
    maskcontentunits:   'maskContentUnits',
    maskunits:  'maskUnits',
    numoctaves: 'numOctaves',
    pathlength: 'pathLength',
    patterncontentunits:    'patternContentUnits',
    patterntransform:   'patternTransform',
    patternunits:   'patternUnits',
    pointsatx:  'pointsAtX',
    pointsaty:  'pointsAtY',
    pointsatz:  'pointsAtZ',
    preservealpha:  'preserveAlpha',
    preserveaspectratio:    'preserveAspectRatio',
    primitiveunits: 'primitiveUnits',
    refx:   'refX',
    refy:   'refY',
    repeatcount:    'repeatCount',
    repeatdur:  'repeatDur',
    requiredextensions: 'requiredExtensions',
    requiredfeatures:   'requiredFeatures',
    specularconstant:   'specularConstant',
    specularexponent:   'specularExponent',
    spreadmethod:   'spreadMethod',
    startoffset:    'startOffset',
    stddeviation:   'stdDeviation',
    stitchtiles:    'stitchTiles',
    surfacescale:   'surfaceScale',
    systemlanguage: 'systemLanguage',
    tablevalues:    'tableValues',
    targetx:    'targetX',
    targety:    'targetY',
    textlength: 'textLength',
    viewbox:    'viewBox',
    viewtarget: 'viewTarget',
    xchannelselector:   'xChannelSelector',
    ychannelselector:   'yChannelSelector',
    zoomandpan: 'zoomAndPan'
};


},{"../html5":"VxNTWn","html5-entities":9}],4:[function(require,module,exports){
var HTML5 = require('../html5');
var util = require('util');

var debugFlags = {any: true}

HTML5.debug = function(section) {
    if(debugFlags[section] || debugFlags[section.split('.')[0]]) {
        var out = [];
        for(var i in arguments) {
            out.push(arguments[i])
        }
        console.log(util.inspect(out, false, 3))
    }
}

HTML5.enableDebug = function(section) {
    debugFlags[section] = true;
}

HTML5.disableDebug = function(section) {
    debugFlags[section] = false;
}

HTML5.dumpTagStack = function(tags) {
    var r = [];
    for(var i in tags) {
        r.push(tags[i].tagName);
    }
    return r.join(', ');
}

},{"../html5":"VxNTWn","util":16}],"VxNTWn":[function(require,module,exports){
exports.HTML5 = exports;

exports.HTML5.moduleName = 'HTML5';

require('./constants');
require('./tokenizer');
require('./treebuilder');
require('./treewalker');
require('./serializer');
require('./parser');
require('./debug');



},{"./constants":3,"./debug":4,"./parser":6,"./serializer":8,"./tokenizer":11,"./treebuilder":12,"./treewalker":13}],6:[function(require,module,exports){
(function(){var HTML5 = exports.HTML5 = require('../html5');

var assert = require('assert');
var events = require('events');
var util = require('util');

require('./tokenizer');

var Parser = HTML5.Parser = function HTML5Parser(options) {
    var parser = this;
    events.EventEmitter.apply(this);
    this.strict = false;
    this.errors = [];
    var phase;
    var phases = this.phases = {};
    var secondary_phase;
    var framesetOk = true;

    Object.defineProperty(this, 'phase', {
        set: function(p) {
            phase = p;
            if (!p) throw( new Error("Can't leave phase undefined"));
            if (!p instanceof Function) throw( new Error("Not a function"));
        },
        get: function() {
            return phase;
        }
    });

    this.newPhase = function(name) {
        this.phase = phases[name];
        HTML5.debug('parser.newPhase', name);
        this.phaseName = name;
    };

    phases.base = {
        end_tag_handlers: {"-default": 'endTagOther'},
        start_tag_handlers: {"-default": 'startTagOther'},
        parse_error: function(code, options) {
            parser.parse_error(code, options);
        },
        processEOF: function() {
            tree.generateImpliedEndTags();
            if (tree.open_elements.length > 2) {
                parser.parse_error('expected-closing-tag-but-got-eof');
            } else if (tree.open_elements.length == 2 &&
                tree.open_elements[1].tagName.toLowerCase() != 'body') {
                parser.parse_error('expected-closing-tag-but-got-eof');
            } else if (parser.inner_html && tree.open_elements.length > 1) {
                parser.parse_error('eof-in-innerhtml');
            }
        },
        processComment: function(data) {
            tree.insert_comment(data, tree.open_elements.last());
        },
        processDoctype: function(name, publicId, systemId, correct) {
            parser.parse_error('unexpected-doctype');
        },
        processSpaceCharacters: function(data) {
            tree.insert_text(data);
        },
        processStartTag: function(name, attributes, self_closing) {
            if (this[this.start_tag_handlers[name]]) {
                this[this.start_tag_handlers[name]](name, attributes, self_closing);
            } else if (this[this.start_tag_handlers["-default"]]) {
                this[this.start_tag_handlers["-default"]](name, attributes, self_closing);
            } else {
                throw(new Error("No handler found for "+name));
            }
        },
        processEndTag: function(name) {
            if (this[this.end_tag_handlers[name]]) {
                this[this.end_tag_handlers[name]](name);
            } else if (this[this.end_tag_handlers["-default"]]) {
                this[this.end_tag_handlers["-default"]](name);
            } else {
                throw(new Error("No handler found for "+name));
            }
        },
        inScope: function(name, scopingElements) {
            if (!scopingElements) scopingElements = HTML5.SCOPING_ELEMENTS;
            if (!tree.open_elements.length) return false;
            for(var i = tree.open_elements.length - 1; i >= 0; i--) {
                var node = tree.open_elements[i];
                if (!node.tagName) return false;
                if (node.tagName.toLowerCase() == name) return true;
                if ((node.namespace || 'html') in scopingElements &&
                    scopingElements[node.namespace || 'html'].indexOf(node.tagName.toLowerCase()) >= 0) return false;
            }
            return false;
        },
        startTagHtml: function(name, attributes) {
            if (!parser.first_start_tag && name == 'html') {
                parser.parse_error('non-html-root');
            }
            for(var i = 0; i < attributes.length; i++) {
                if (!tree.open_elements[0].getAttribute(attributes[i].nodeName)) {
                    tree.open_elements[0].setAttribute(attributes[i].nodeName, attributes[i].nodeValue);
                }
            }
            parser.first_start_tag = false;
        },
        adjust_mathml_attributes: function(attributes) {
            attributes.forEach(function(a) {
                if (HTML5.MATHMLAttributeMap[a.nodeName])
                    a.nodeName = HTML5.MATHMLAttributeMap[a.nodeName];
            });
            return attributes;
        },
        adjust_svg_tag_names: function(name) {
            return HTML5.SVGTagMap[name] || name;
        },
        adjust_svg_attributes: function(attributes) {
            attributes.forEach(function(a) {
                if (HTML5.SVGAttributeMap[a.nodeName])
                    a.nodeName = HTML5.SVGAttributeMap[a.nodeName];
            });
            return attributes;
        },
        adjust_foreign_attributes: function (attributes) {
            for(var i = 0; i < attributes.length; i++) {
                if (attributes[i].nodeName.indexOf(':') != -1) {
                    var t = attributes[i].nodeName.split(':');
                    attributes[i].namespace = t[0];
                    attributes[i].nodeName = t[1];
                }
            }
            return attributes;
        }
    };

    phases.initial = Object.create(phases.base);

    phases.initial.processEOF = function() {
        parser.parse_error("expected-doctype-but-got-eof");
        this.anythingElse();
        phase.processEOF();
    };

    phases.initial.processComment = function(data) {
        tree.insert_comment(data, tree.document);
    };

    phases.initial.processDoctype = function(name, publicId, systemId, correct) {
        tree.insert_doctype(name || '', publicId || '', systemId || '');

        if (!correct || name != 'html' || (publicId != null && ([
                    "+//silmaril//dtd html pro v0r11 19970101//",
                    "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
                    "-//as//dtd html 3.0 aswedit + extensions//",
                    "-//ietf//dtd html 2.0 level 1//",
                    "-//ietf//dtd html 2.0 level 2//",
                    "-//ietf//dtd html 2.0 strict level 1//",
                    "-//ietf//dtd html 2.0 strict level 2//",
                    "-//ietf//dtd html 2.0 strict//",
                    "-//ietf//dtd html 2.0//",
                    "-//ietf//dtd html 2.1e//",
                    "-//ietf//dtd html 3.0//",
                    "-//ietf//dtd html 3.0//",
                    "-//ietf//dtd html 3.2 final//",
                    "-//ietf//dtd html 3.2//",
                    "-//ietf//dtd html 3//",
                    "-//ietf//dtd html level 0//",
                    "-//ietf//dtd html level 0//",
                    "-//ietf//dtd html level 1//",
                    "-//ietf//dtd html level 1//",
                    "-//ietf//dtd html level 2//",
                    "-//ietf//dtd html level 2//",
                    "-//ietf//dtd html level 3//",
                    "-//ietf//dtd html level 3//",
                    "-//ietf//dtd html strict level 0//",
                    "-//ietf//dtd html strict level 0//",
                    "-//ietf//dtd html strict level 1//",
                    "-//ietf//dtd html strict level 1//",
                    "-//ietf//dtd html strict level 2//",
                    "-//ietf//dtd html strict level 2//",
                    "-//ietf//dtd html strict level 3//",
                    "-//ietf//dtd html strict level 3//",
                    "-//ietf//dtd html strict//",
                    "-//ietf//dtd html strict//",
                    "-//ietf//dtd html strict//",
                    "-//ietf//dtd html//",
                    "-//ietf//dtd html//",
                    "-//ietf//dtd html//",
                    "-//metrius//dtd metrius presentational//",
                    "-//microsoft//dtd internet explorer 2.0 html strict//",
                    "-//microsoft//dtd internet explorer 2.0 html//",
                    "-//microsoft//dtd internet explorer 2.0 tables//",
                    "-//microsoft//dtd internet explorer 3.0 html strict//",
                    "-//microsoft//dtd internet explorer 3.0 html//",
                    "-//microsoft//dtd internet explorer 3.0 tables//",
                    "-//netscape comm. corp.//dtd html//",
                    "-//netscape comm. corp.//dtd strict html//",
                    "-//o'reilly and associates//dtd html 2.0//",
                    "-//o'reilly and associates//dtd html extended 1.0//",
                    "-//spyglass//dtd html 2.0 extended//",
                    "-//sq//dtd html 2.0 hotmetal + extensions//",
                    "-//sun microsystems corp.//dtd hotjava html//",
                    "-//sun microsystems corp.//dtd hotjava strict html//",
                    "-//w3c//dtd html 3 1995-03-24//",
                    "-//w3c//dtd html 3.2 draft//",
                    "-//w3c//dtd html 3.2 final//",
                    "-//w3c//dtd html 3.2//",
                    "-//w3c//dtd html 3.2s draft//",
                    "-//w3c//dtd html 4.0 frameset//",
                    "-//w3c//dtd html 4.0 transitional//",
                    "-//w3c//dtd html experimental 19960712//",
                    "-//w3c//dtd html experimental 970421//",
                    "-//w3c//dtd w3 html//",
                    "-//w3o//dtd w3 html 3.0//",
                    "-//webtechs//dtd mozilla html 2.0//",
                    "-//webtechs//dtd mozilla html//",
                    "html"
                ].some(publicIdStartsWith)
                || [
                    "-//w3o//dtd w3 html strict 3.0//en//",
                    "-/w3c/dtd html 4.0 transitional/en",
                    "html"
                ].indexOf(publicId.toLowerCase()) > -1
                || (systemId == null && [
                    "-//w3c//dtd html 4.01 transitional//",
                    "-//w3c//dtd html 4.01 frameset//"
                ].some(publicIdStartsWith)))
            )
            || (systemId != null && (systemId.toLowerCase() == "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd"))
        ) {
            parser.compatMode = "quirks";
            parser.parse_error("quirky-doctype");
        } else if (publicId != null && ([
                "-//w3c//dtd xhtml 1.0 transitional//",
                "-//w3c//dtd xhtml 1.0 frameset//"
            ].some(publicIdStartsWith)
            || (systemId != null && [
                "-//w3c//dtd html 4.01 transitional//",
                "-//w3c//dtd html 4.01 frameset//"
            ].indexOf(publicId.toLowerCase()) > -1))
        ) {
            parser.compatMode = "limited quirks";
            parser.parse_error("almost-standards-doctype");
        } else {
            if ((publicId == "-//W3C//DTD HTML 4.0//EN" && (systemId == null || systemId == "http://www.w3.org/TR/REC-html40/strict.dtd"))
                || (publicId == "-//W3C//DTD HTML 4.01//EN" && (systemId == null || systemId == "http://www.w3.org/TR/html4/strict.dtd"))
                || (publicId == "-//W3C//DTD XHTML 1.0 Strict//EN" && (systemId == "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"))
                || (publicId == "-//W3C//DTD XHTML 1.1//EN" && (systemId == "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"))
            ) {
                parser.parse_error("obsolete-doctype", null, true);
            } else if (!((systemId == null || systemId == "about:legacy-compat") && publicId == null)) {
                parser.parse_error("unknown-doctype");
            }
        }
        parser.newPhase('beforeHTML');
        function publicIdStartsWith(string) {
            return publicId.toLowerCase().indexOf(string) == 0;
        }
    };

    phases.initial.processSpaceCharacters = function(data) {
    };

    phases.initial.processCharacters = function(data) {
        parser.parse_error('expected-doctype-but-got-chars');
        this.anythingElse();
        phase.processCharacters(data);
    };

    phases.initial.processStartTag = function(name, attributes, self_closing) {
        parser.parse_error('expected-doctype-but-got-start-tag', {name: name});
        this.anythingElse();
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.initial.processEndTag = function(name) {
        parser.parse_error('expected-doctype-but-got-end-tag', {name: name});
        this.anythingElse();
        phase.processEndTag(name);
    };

    phases.initial.anythingElse = function() {
        parser.compatMode = 'quirks';
        parser.newPhase('beforeHTML');
    };

    phases.afterAfterBody = Object.create(phases.base);

    phases.afterAfterBody.start_tag_handlers = {
        html: 'startTagHtml',
        '-default': 'startTagOther'
    };

    phases.afterAfterBody.processComment = function(data) {
        tree.insert_comment(data, tree.document);
    };

    phases.afterAfterBody.processDoctype = function(data) {
        phases.inBody.processDoctype(data);
    };

    phases.afterAfterBody.processSpaceCharacters = function(data) {
        phases.inBody.processSpaceCharacters(data);
    };

    phases.afterAfterBody.startTagHtml = function(data, attributes) {
        phases.inBody.startTagHtml(data, attributes);
    };

    phases.afterAfterBody.startTagOther = function(name, attributes, self_closing) {
        parser.parse_error('unexpected-start-tag', {name: name});
        parser.newPhase('inBody');
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.afterAfterBody.endTagOther = function(name) {
        parser.parse_error('unexpected-end-tag', {name: name});
        parser.newPhase('inBody');
        phase.processEndTag(name);
    };

    phases.afterAfterBody.processCharacters = function(data) {
        parser.parse_error('unexpected-char-after-body');
        parser.newPhase('inBody');
        phase.processCharacters(data);
    };

    phases.afterBody = Object.create(phases.base);
    
    phases.afterBody.end_tag_handlers = {
        html: 'endTagHtml',
        '-default': 'endTagOther'
    };

    phases.afterBody.processComment = function(data) {
        tree.insert_comment(data, tree.open_elements[0]);
    };

    phases.afterBody.processCharacters = function(data) {
        parser.parse_error('unexpected-char-after-body');
        parser.newPhase('inBody');
        phase.processCharacters(data);
    };

    phases.afterBody.processStartTag = function(name, attributes, self_closing) {
        parser.parse_error('unexpected-start-tag-after-body', {name: name});
        parser.newPhase('inBody');
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.afterBody.endTagHtml = function(name) {
        if (parser.inner_html) {
            parser.parse_error('end-html-in-innerhtml');
        } else {
            parser.last_phase = parser.phase;
            parser.newPhase('afterAfterBody');
        }
    };

    phases.afterBody.endTagOther = function(name) {
        parser.parse_error('unexpected-end-tag-after-body', {name: name});
        parser.newPhase('inBody');
        phase.processEndTag(name);
    };

    phases.afterFrameset = Object.create(phases.base);

    phases.afterFrameset.start_tag_handlers = {
        html: 'startTagHtml',
        noframes: 'startTagNoframes',
        '-default': 'startTagOther'
    };

    phases.afterFrameset.end_tag_handlers = {
        html: 'endTagHtml',
        '-default': 'endTagOther'
    };

    phases.afterFrameset.processCharacters = function(data) {
        parser.parse_error("unexpected-char-after-frameset");
    };

    phases.afterFrameset.startTagNoframes = function(name, attributes) {
        phases.inHead.processStartTag(name, attributes);
    };

    phases.afterFrameset.startTagOther = function(name, attributes) {
        parser.parse_error("unexpected-start-tag-after-frameset", {name: name});
    };

    phases.afterFrameset.endTagHtml = function(name) {
        parser.newPhase('afterAfterFrameset');
    };

    phases.afterFrameset.endTagOther = function(name) {
        parser.parse_error("unexpected-end-tag-after-frameset", {name: name});
    };

    phases.afterHead = Object.create(phases.base);

    phases.afterHead.start_tag_handlers = {
        html: 'startTagHtml',
        head: 'startTagHead',
        body: 'startTagBody',
        frameset: 'startTagFrameset',
        base: 'startTagFromHead',
        link: 'startTagFromHead',
        meta: 'startTagFromHead',
        script: 'startTagFromHead',
        style: 'startTagFromHead',
        title: 'startTagFromHead',
        "-default": 'startTagOther'
    };

    phases.afterHead.end_tag_handlers = {
        body: 'endTagBodyHtmlBr',
        html: 'endTagBodyHtmlBr',
        br: 'endTagBodyHtmlBr',
        "-default": 'endTagOther'
    };

    phases.afterHead.processEOF = function() {
        this.anything_else();
        phase.processEOF();
    };

    phases.afterHead.processCharacters = function(data) {
        this.anything_else();
        phase.processCharacters(data);
    };

    phases.afterHead.startTagHtml = function(name, attributes) {
        phases.inBody.processStartTag(name, attributes);
    }

    phases.afterHead.startTagBody = function(name, attributes) {
        framesetOk = false;
        tree.insert_element(name, attributes);
        parser.newPhase('inBody');
    };

    phases.afterHead.startTagFrameset = function(name, attributes) {
        tree.insert_element(name, attributes);
        parser.newPhase('inFrameset');
    };

    phases.afterHead.startTagFromHead = function(name, attributes, self_closing) {
        parser.parse_error("unexpected-start-tag-out-of-my-head", {name: name});
        tree.open_elements.push(tree.head_pointer);
        phases.inHead.processStartTag(name, attributes, self_closing);
        tree.open_elements.splice(tree.open_elements.indexOf(tree.head_pointer), 1);
    };

    phases.afterHead.startTagHead = function(name, attributes, self_closing) {
        parser.parse_error('unexpected-start-tag', {name: name});
    };

    phases.afterHead.startTagOther = function(name, attributes, self_closing) {
        this.anything_else();
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.afterHead.endTagBodyHtmlBr = function(name) {
        this.anything_else();
        phase.processEndTag(name);
    };

    phases.afterHead.endTagOther = function(name) {
        parser.parse_error('unexpected-end-tag', {name: name});
    };

    phases.afterHead.anything_else = function() {
        tree.insert_element('body', {});
        parser.newPhase('inBody');
        framesetOk = true;
    };

    phases.beforeHead = Object.create(phases.base);

    phases.beforeHead.start_tag_handlers = {
        html: 'startTagHtml',
        head: 'startTagHead',
        '-default': 'startTagOther'
    };

    phases.beforeHead.end_tag_handlers = {
        html: 'endTagImplyHead',
        head: 'endTagImplyHead',
        body: 'endTagImplyHead',
        br: 'endTagImplyHead',
        '-default': 'endTagOther'
    };

    phases.beforeHead.processEOF = function() {
        this.startTagHead('head', {});
        phase.processEOF();
    };

    phases.beforeHead.processCharacters = function(data) {
        this.startTagHead('head', {});
        phase.processCharacters(data);
    };

    phases.beforeHead.processSpaceCharacters = function(data) {
    };

    phases.beforeHead.startTagHead = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.head_pointer = tree.open_elements.last();
        parser.newPhase('inHead');
    };

    phases.beforeHead.startTagOther = function(name, attributes, self_closing) {
        this.startTagHead('head', {});
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.beforeHead.endTagImplyHead = function(name) {
        this.startTagHead('head', {});
        phase.processEndTag(name);
    };

    phases.beforeHead.endTagOther = function(name) {
        parser.parse_error('end-tag-after-implied-root', {name: name});
    };

    phases.beforeHTML = Object.create(phases.base);

    phases.beforeHTML.processEOF = function() {
        this.insert_html_element();
        phase.processEOF();
    };

    phases.beforeHTML.processComment = function(data) {
        tree.insert_comment(data, tree.document);
    };

    phases.beforeHTML.processSpaceCharacters = function(data) {
    };

    phases.beforeHTML.processCharacters = function(data) {
        this.insert_html_element();
        phase.processCharacters(data);
    };

    phases.beforeHTML.processStartTag = function(name, attributes, self_closing) {
        if (name == 'html') parser.first_start_tag = true;
        this.insert_html_element();
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.beforeHTML.processEndTag = function(name) {
        this.insert_html_element();
        phase.processEndTag(name);
    };

    phases.beforeHTML.insert_html_element = function() {
        tree.insert_root('html');
        parser.newPhase('beforeHead');
    };


    phases.inCaption = Object.create(phases.base);

    phases.inCaption.start_tag_handlers = {
        html: 'startTagHtml',
        caption: 'startTagTableElement',
        col: 'startTagTableElement',
        colgroup: 'startTagTableElement',
        tbody: 'startTagTableElement',
        td: 'startTagTableElement',
        tfoot: 'startTagTableElement',
        thead: 'startTagTableElement',
        tr: 'startTagTableElement',
        '-default': 'startTagOther'
    };

    phases.inCaption.end_tag_handlers = {
        caption: 'endTagCaption',
        table: 'endTagTable',
        body: 'endTagIgnore',
        col: 'endTagIgnore',
        colgroup: 'endTagIgnore',
        html: 'endTagIgnore',
        tbody: 'endTagIgnore',
        td: 'endTagIgnore',
        tfood: 'endTagIgnore',
        thead: 'endTagIgnore',
        tr: 'endTagIgnore',
        '-default': 'endTagOther'
    };

    phases.inCaption.ignoreEndTagCaption = function() {
        return !this.inScope('caption', HTML5.TABLE_SCOPING_ELEMENTS);
    };

    phases.inCaption.processCharacters = function(data) {
        phases.inBody.processCharacters(data);
    };

    phases.inCaption.startTagTableElement = function(name, attributes) {
        parser.parse_error('unexpected-end-tag', {name: name});
        var ignoreEndTag = this.ignoreEndTagCaption();
        phase.processEndTag('caption');
        if (!ignoreEndTag) phase.processStartTag(name, attributes);
    };

    phases.inCaption.startTagOther = function(name, attributes, self_closing) {
        phases.inBody.processStartTag(name, attributes, self_closing);
    };

    phases.inCaption.endTagCaption = function(name) {
        if (this.ignoreEndTagCaption()) {
            assert.ok(parser.inner_html);
            parser.parse_error('unexpected-end-tag', {name: name});
        } else {
            tree.generateImpliedEndTags();
            if (tree.open_elements.last().tagName.toLowerCase() != 'caption') {
                parser.parse_error('expected-one-end-tag-but-got-another', {
                    gotName: "caption",
                    expectedName: tree.open_elements.last().tagName.toLowerCase()
                });
            }

            tree.remove_open_elements_until('caption');
        
            tree.clearActiveFormattingElements();

            parser.newPhase('inTable');
        }
    };

    phases.inCaption.endTagTable = function(name) {
        parser.parse_error("unexpected-end-table-in-caption");
        var ignoreEndTag = this.ignoreEndTagCaption();
        phase.processEndTag('caption');
        if (!ignoreEndTag) phase.processEndTag(name);
    };

    phases.inCaption.endTagIgnore = function(name) {
        parser.parse_error('unexpected-end-tag', {name: name});
    };

    phases.inCaption.endTagOther = function(name) {
        phases.inBody.processEndTag(name);
    };


    phases.inCell = Object.create(phases.base);

    phases.inCell.start_tag_handlers = {
        html: 'startTagHtml',
        caption: 'startTagTableOther',
        col: 'startTagTableOther',
        colgroup: 'startTagTableOther',
        tbody: 'startTagTableOther',
        td: 'startTagTableOther',
        tfoot: 'startTagTableOther',
        th: 'startTagTableOther',
        thead: 'startTagTableOther',
        tr: 'startTagTableOther',
        '-default': 'startTagOther'
    };

    phases.inCell.end_tag_handlers = {
        td: 'endTagTableCell',
        th: 'endTagTableCell',
        body: 'endTagIgnore',
        caption: 'endTagIgnore',
        col: 'endTagIgnore',
        colgroup: 'endTagIgnore',
        html: 'endTagIgnore',
        table: 'endTagImply',
        tbody: 'endTagImply',
        tfoot: 'endTagImply',
        thead: 'endTagImply',
        tr: 'endTagImply',
        '-default': 'endTagOther'
    };

    phases.inCell.processCharacters = function(data) {
        phases.inBody.processCharacters(data);
    };

    phases.inCell.startTagTableOther = function(name, attributes, self_closing) {
        if (this.inScope('td', HTML5.TABLE_SCOPING_ELEMENTS) || this.inScope('th', HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.closeCell();
            phase.processStartTag(name, attributes, self_closing);
        } else {
            parser.parse_error();
        }
    };

    phases.inCell.startTagOther = function(name, attributes, self_closing) {
        phases.inBody.processStartTag(name, attributes, self_closing);
    };

    phases.inCell.endTagTableCell = function(name) {
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            tree.generateImpliedEndTags(name);
            if (tree.open_elements.last().tagName.toLowerCase() != name.toLowerCase()) {
                parser.parse_error('unexpected-cell-end-tag', {name: name});
                tree.remove_open_elements_until(name);
            } else {
                tree.pop_element();
            }
            tree.clearActiveFormattingElements();
            parser.newPhase('inRow');
        } else {
            parser.parse_error('unexpected-end-tag', {name: name});
        }
    };

    phases.inCell.endTagIgnore = function(name) {
        parser.parse_error('unexpected-end-tag', {name: name});
    };

    phases.inCell.endTagImply = function(name) {
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.closeCell();
            phase.processEndTag(name);
        } else {
            parser.parse_error();
        }
    };

    phases.inCell.endTagOther = function(name) {
        phases.inBody.processEndTag(name);
    };

    phases.inCell.closeCell = function() {
        if (this.inScope('td', HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.endTagTableCell('td');
        } else if (this.inScope('th', HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.endTagTableCell('th');
        }
    };


    phases.inColumnGroup = Object.create(phases.base);

    phases.inColumnGroup.start_tag_handlers = {
        html: 'startTagHtml',
        col: 'startTagCol',
        '-default': 'startTagOther'
    };

    phases.inColumnGroup.end_tag_handlers = {
        colgroup: 'endTagColgroup',
        col: 'endTagCol',
        '-default': 'endTagOther'
    };

    phases.inColumnGroup.ignoreEndTagColgroup = function() {
        return tree.open_elements.last().tagName.toLowerCase() == 'html';
    };

    phases.inColumnGroup.processCharacters = function(data) {
        var ignoreEndTag = this.ignoreEndTagColgroup();
        this.endTagColgroup('colgroup');
        if (!ignoreEndTag) phase.processCharacters(data);
    };

    phases.inColumnGroup.startTagCol = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.pop_element();
    };

    phases.inColumnGroup.startTagOther = function(name, attributes, self_closing) {
        var ignoreEndTag = this.ignoreEndTagColgroup();
        this.endTagColgroup('colgroup');
        if (!ignoreEndTag) phase.processStartTag(name, attributes, self_closing);
    };

    phases.inColumnGroup.endTagColgroup = function(name) {
        if (this.ignoreEndTagColgroup()) {
            assert.ok(parser.inner_html);
            parser.parse_error();
        } else {
            tree.pop_element();
            parser.newPhase('inTable');
        }
    };

    phases.inColumnGroup.endTagCol = function(name) {
        parser.parse_error("no-end-tag", {name: 'col'});
    };

    phases.inColumnGroup.endTagOther = function(name) {
        var ignoreEndTag = this.ignoreEndTagColgroup();
        this.endTagColgroup('colgroup');
        if (!ignoreEndTag) phase.processEndTag(name) ;
    };

    phases.inForeignContent = Object.create(phases.base);

    phases.inForeignContent.processStartTag = function(name, attributes, self_closing) {
        var currentNode = tree.open_elements.last();
        if (['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var'].indexOf(name) != -1
                || (name == 'font' && attributes.some(function(attr){ return ['color', 'face', 'size'].indexOf(attr.nodeName) >= 0 }))) {
            parser.parse_error('unexpected-html-element-in-foreign-content', {name: name});
            while (tree.open_elements.last().namespace
                    && !parser.is_html_integration_point(tree.open_elements.last())
                    && !parser.is_mathml_text_integration_point(tree.open_elements.last())) {
                tree.open_elements.pop();
            }
            parser.phase.processStartTag(name, attributes, self_closing);
        } else {
            if (tree.open_elements.last().namespace == 'math') {
                attributes = this.adjust_mathml_attributes(attributes);
            }
            if (tree.open_elements.last().namespace == 'svg') {
                name = this.adjust_svg_tag_names(name);
                attributes = this.adjust_svg_attributes(attributes);
            }
            attributes = this.adjust_foreign_attributes(attributes);
            tree.insert_foreign_element(name, attributes, tree.open_elements.last().namespace);
            if (self_closing) tree.open_elements.pop();
        }
    };

    phases.inForeignContent.processEndTag = function(name) {
        var node = tree.open_elements.last();
        var index = tree.open_elements.length - 1;
        if (node.tagName.toLowerCase() != name)
            parser.parse_error("unexpected-end-tag", {name: name});

        while (true) {
            if (index == 0)
                break;
            if (node.tagName.toLowerCase() == name) {
                while (tree.open_elements.pop() != node);
                break;
            }
            index -= 1;
            node = tree.open_elements[index];
            if (node.namespace) {
                continue;
            } else {
                parser.phase.processEndTag(name);
                break;
            }
        }
    };

    phases.inForeignContent.processCharacters = function(characters) {
        characters = characters.replace(/\u0000/g, function(match, index){
            parser.parse_error('invalid-codepoint');
            return '\uFFFD';
        });
        if (framesetOk && new RegExp('[^' + '\uFFFD' + HTML5.SPACE_CHARACTERS_IN + ']').test(characters))
            framesetOk = false;
        tree.insert_text(characters);
    };

    phases.inFrameset = Object.create(phases.base);

    phases.inFrameset.start_tag_handlers = {
        html: 'startTagHtml',
        frameset: 'startTagFrameset',
        frame: 'startTagFrame',
        noframes: 'startTagNoframes',
        "-default": 'startTagOther'
    };

    phases.inFrameset.end_tag_handlers = {
        frameset: 'endTagFrameset',
        noframes: 'endTagNoframes',
        '-default': 'endTagOther'
    };

    phases.inFrameset.processCharacters = function(data) {
        parser.parse_error("unexpected-char-in-frameset");
    };

    phases.inFrameset.startTagFrameset = function(name, attributes) {
        tree.insert_element(name, attributes);
    };

    phases.inFrameset.startTagFrame = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.pop_element();
    };

    phases.inFrameset.startTagNoframes = function(name, attributes) {
        phases.inBody.processStartTag(name, attributes);
    };

    phases.inFrameset.startTagOther = function(name, attributes) {
        parser.parse_error("unexpected-start-tag-in-frameset", {name: name});
    };

    phases.inFrameset.endTagFrameset = function(name, attributes) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'html') {
            parser.parse_error("unexpected-frameset-in-frameset-innerhtml");
        } else {
            tree.pop_element();
        }

        if (!parser.inner_html && tree.open_elements.last().tagName.toLowerCase() != 'frameset') {
            parser.newPhase('afterFrameset');
        }
    };

    phases.inFrameset.endTagNoframes = function(name) {
        phases.inBody.processEndTag(name);
    };

    phases.inFrameset.endTagOther = function(name) {
        parser.parse_error("unexpected-end-tag-in-frameset", {name: name});
    };


    phases.inHead = Object.create(phases.base);

    phases.inHead.start_tag_handlers = {
        html: 'startTagHtml',
        head: 'startTagHead',
        title: 'startTagTitle',
        script: 'startTagScript',
        style: 'startTagNoScriptNoFramesStyle',
        noscript: 'startTagNoScriptNoFramesStyle',
        noframes: 'startTagNoScriptNoFramesStyle',
        base: 'startTagBaseLinkCommand',
        basefont: 'startTagBaseLinkCommand',
        bgsound: 'startTagBaseLinkCommand',
        command: 'startTagBaseLinkCommand',
        link: 'startTagBaseLinkCommand',
        meta: 'startTagMeta',
        "-default": 'startTagOther'
    };

    phases.inHead.end_tag_handlers = {
        head: 'endTagHead',
        html: 'endTagHtmlBodyBr',
        body: 'endTagHtmlBodyBr',
        br: 'endTagHtmlBodyBr',
        "-default": 'endTagOther'
    };

    phases.inHead.processEOF = function() {
        var name = tree.open_elements.last().tagName.toLowerCase();
        if (['title', 'style', 'script'].indexOf(name) != -1) {
            parser.parse_error("expected-named-closing-tag-but-got-eof", {name: name});
            tree.pop_element();
        }

        this.anything_else();

        phase.processEOF();
    };

    phases.inHead.processCharacters = function(data) {
        var name = tree.open_elements.last().tagName.toLowerCase();
        HTML5.debug('parser.inHead.processCharacters', data);
        if (['title', 'style', 'script', 'noscript'].indexOf(name) != -1) {
            tree.insert_text(data);
        } else {
            this.anything_else();
            phase.processCharacters(data);
        }
    };

    phases.inHead.startTagHtml = function(name, attributes) {
        phases.inBody.processStartTag(name, attributes);
    };

    phases.inHead.startTagHead = function(name, attributes) {
        parser.parse_error('two-heads-are-not-better-than-one');
    };

    phases.inHead.startTagTitle = function(name, attributes) {
        parser.parseRCDataRawText("RCDATA", name, attributes);
    };

    phases.inHead.startTagNoScriptNoFramesStyle = function(name, attributes) {
        parser.parseRCDataRawText("RAWTEXT", name, attributes);
    };

    phases.inHead.startTagScript = function(name, attributes) {
        tree.insert_element(name, attributes);
        parser.tokenizer.state = parser.tokenizer.script_data_state;
        parser.original_phase = parser.phaseName;
        parser.newPhase('text');
    };

    phases.inHead.startTagBaseLinkCommand = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.open_elements.pop();
    };

    phases.inHead.startTagMeta = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.open_elements.pop();
    };

    phases.inHead.startTagOther = function(name, attributes, self_closing) {
        this.anything_else();
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.inHead.endTagHead = function(name) {
        if (tree.open_elements[tree.open_elements.length - 1].tagName.toLowerCase() == 'head') {
            tree.pop_element();
        } else {
            parser.parse_error('unexpected-end-tag', {name: 'head'});
        }
        parser.newPhase('afterHead');
    };

    phases.inHead.endTagHtmlBodyBr = function(name) {
        this.anything_else();
        phase.processEndTag(name);
    };

    phases.inHead.endTagOther = function(name) {
        parser.parse_error('unexpected-end-tag', {name: name});
    };

    phases.inHead.anything_else = function() {
        this.endTagHead('head');
    };

    phases.inTable = Object.create(phases.base);

    phases.inTable.start_tag_handlers = {
        html: 'startTagHtml',
        caption: 'startTagCaption',
        colgroup: 'startTagColgroup',
        col: 'startTagCol',
        table: 'startTagTable',
        tbody: 'startTagRowGroup',
        tfoot: 'startTagRowGroup',
        thead: 'startTagRowGroup',
        td: 'startTagImplyTbody',
        th: 'startTagImplyTbody',
        tr: 'startTagImplyTbody',
        style: 'startTagStyleScript',
        script: 'startTagStyleScript',
        input: 'startTagInput',
        form: 'startTagForm',
        '-default': 'startTagOther'
    };

    phases.inTable.end_tag_handlers = {
        table: 'endTagTable',
        body: 'endTagIgnore',
        caption: 'endTagIgnore',
        col: 'endTagIgnore',
        colgroup: 'endTagIgnore',
        html: 'endTagIgnore',
        tbody: 'endTagIgnore',
        td: 'endTagIgnore',
        tfoot: 'endTagIgnore',
        th: 'endTagIgnore',
        thead: 'endTagIgnore',
        tr: 'endTagIgnore',
        '-default': 'endTagOther'
    };

    phases.inTable.processSpaceCharacters =  function(data) {
        var currentNode = tree.open_elements.last();
        if (['table', 'tbody', 'tfoot', 'thead', 'tr'].indexOf(currentNode.tagName.toLowerCase()) > -1) {
            var original_phase = parser.phaseName;
            parser.newPhase('inTableText');
            phase.original_phase = original_phase;
            phase.processSpaceCharacters(data);
        } else {
            tree.insert_from_table = true;
            phases.inBody.processSpaceCharacters(data);
            tree.insert_from_table = false;
        }
    };

    phases.inTable.processCharacters =  function(data) {
        var currentNode = tree.open_elements.last();
        if (['table', 'tbody', 'tfoot', 'thead', 'tr'].indexOf(currentNode.tagName.toLowerCase()) > -1) {
            var original_phase = parser.phaseName;
            parser.newPhase('inTableText');
            phase.original_phase = original_phase;
            phase.processCharacters(data);
        } else {
            tree.insert_from_table = true;
            phases.inBody.processCharacters(data);
            tree.insert_from_table = false;
        }
    };

    phases.inTable.startTagCaption = function(name, attributes) {
        this.clearStackToTableContext();
        tree.activeFormattingElements.push(HTML5.Marker);
        tree.insert_element(name, attributes);
        parser.newPhase('inCaption');
    };

    phases.inTable.startTagColgroup = function(name, attributes) {
        this.clearStackToTableContext();
        tree.insert_element(name, attributes);
        parser.newPhase('inColumnGroup');
    };

    phases.inTable.startTagCol = function(name, attributes) {
        this.startTagColgroup('colgroup', {});
        phase.processStartTag(name, attributes);
    };

    phases.inTable.startTagRowGroup = function(name, attributes) {
        this.clearStackToTableContext();
        tree.insert_element(name, attributes);
        parser.newPhase('inTableBody');
    };

    phases.inTable.startTagImplyTbody = function(name, attributes) {
        this.startTagRowGroup('tbody', {});
        phase.processStartTag(name, attributes);
    };

    phases.inTable.startTagTable = function(name, attributes) {
        parser.parse_error("unexpected-start-tag-implies-end-tag",
                {startName: "table", endName: "table"});
        phase.processEndTag('table');
        if (!parser.inner_html) phase.processStartTag(name, attributes);
    };

    phases.inTable.startTagStyleScript = function(name, attributes) {
        phases.inHead.processStartTag(name, attributes);
    };

    phases.inTable.startTagInput = function(name, attributes) {
        for (var key in attributes) {
            if (attributes[key].nodeName.toLowerCase() == 'type') {
                if (attributes[key].nodeValue.toLowerCase() == 'hidden') {
                    parser.parse_error("unexpected-hidden-input-in-table");
                    tree.insert_element(name, attributes);
                    tree.open_elements.pop();
                    return;
                }
                break;
            }
        }
        this.startTagOther(name, attributes);
    };

    phases.inTable.startTagForm = function(name, attributes) {
        parser.parse_error("unexpected-form-in-table");
        if (!tree.formPointer) {
            tree.insert_element(name, attributes);
            tree.formPointer = tree.open_elements.last();
            tree.open_elements.pop();
        }
    };

    phases.inTable.startTagOther = function(name, attributes, self_closing) {
        this.parse_error("unexpected-start-tag-implies-table-voodoo", {name: name});
        tree.insert_from_table = true;
        phases.inBody.processStartTag(name, attributes, self_closing);
        tree.insert_from_table = false;
    };

    phases.inTable.endTagTable = function(name) {
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            tree.generateImpliedEndTags();
            if (tree.open_elements.last().tagName.toLowerCase() != name) {
                parser.parse_error("end-tag-too-early-named", {gotName: 'table', expectedName: tree.open_elements.last().tagName.toLowerCase()});
            }

            tree.remove_open_elements_until('table');
            parser.reset_insertion_mode();
        } else {
            assert.ok(parser.inner_html);
            parser.parse_error();
        }
    };

    phases.inTable.endTagIgnore = function(name) {
        parser.parse_error("unexpected-end-tag", {name: name});
    };

    phases.inTable.endTagOther = function(name) {
        parser.parse_error("unexpected-end-tag-implies-table-voodoo", {name: name});
        tree.insert_from_table = true;
        phases.inBody.processEndTag(name);
        tree.insert_from_table = false;
    };

    phases.inTable.clearStackToTableContext = function() {
        var name = tree.open_elements.last().tagName.toLowerCase();
        while (name != 'table' && name != 'html') {
            parser.parse_error("unexpected-implied-end-tag-in-table", {name: name});
            tree.pop_element();
            name = tree.open_elements.last().tagName.toLowerCase();
        }
    };

    phases.inTable.inserText = function(data) {
        tree.insert_from_table = true;
        phases.inBody.processCharacters(data);
        tree.insert_from_table = false;
    }

    phases.inTableText = Object.create(phases.base);
    phases.inTableText.original_phase = null;
    phases.inTableText.character_tokens = [];

    phases.inTableText.flushCharacters = function() {
        var data = this.character_tokens.join('');
        if (new RegExp('[^' + HTML5.SPACE_CHARACTERS_IN + ']').test(data))
            phases.inTable.inserText(data);
        else if (data)
            tree.insert_text(data);
        this.character_tokens = [];
    };

    phases.inTableText.processComment = function(data) {
        this.flushCharacters();
        parser.newPhase(this.original_phase);
        phase.processComment(data);
    };

    phases.inTableText.processEOF = function(data) {
        this.flushCharacters();
        parser.newPhase(this.original_phase);
        phase.processEOF();
    };

    phases.inTableText.processCharacters = function(data) {
        data = data.replace(/\u0000/g, function(match, index){
            parser.parse_error("invalid-codepoint");
            return '';
        });
        if (!data)
            return;
        this.character_tokens.push(data);
    }

    phases.inTableText.processSpaceCharacters = function(data) {
        this.character_tokens.push(data);
    };

    phases.inTableText.processStartTag = function(name, attributes, self_closing) {
        this.flushCharacters();
        parser.newPhase(this.original_phase);
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.inTableText.processEndTag = function(name, attributes) {
        this.flushCharacters();
        parser.newPhase(this.original_phase);
        phase.processEndTag(name, attributes);
    };

    phases.inTableBody = Object.create(phases.base);

    phases.inTableBody.start_tag_handlers = {
        html: 'startTagHtml',
        tr: 'startTagTr',
        td: 'startTagTableCell',
        th: 'startTagTableCell',
        caption: 'startTagTableOther',
        col: 'startTagTableOther',
        colgroup: 'startTagTableOther',
        tbody: 'startTagTableOther',
        tfoot: 'startTagTableOther',
        thead: 'startTagTableOther',
        '-default': 'startTagOther'
    };

    phases.inTableBody.end_tag_handlers = {
        table: 'endTagTable',
        tbody: 'endTagTableRowGroup',
        tfoot: 'endTagTableRowGroup',
        thead: 'endTagTableRowGroup',
        body: 'endTagIgnore',
        caption: 'endTagIgnore',
        col: 'endTagIgnore',
        colgroup: 'endTagIgnore',
        html: 'endTagIgnore',
        td: 'endTagIgnore',
        th: 'endTagIgnore',
        tr: 'endTagIgnore',
        '-default': 'endTagOther'
    };

    phases.inTableBody.processSpaceCharacters = function(data) {
        phases.inTable.processSpaceCharacters(data);
    };

    phases.inTableBody.processCharacters = function(data) {
        phases.inTable.processCharacters(data);
    };

    phases.inTableBody.startTagTr = function(name, attributes) {
        this.clearStackToTableBodyContext();
        tree.insert_element(name, attributes);
        parser.newPhase('inRow');
    };

    phases.inTableBody.startTagTableCell = function(name, attributes) {
        parser.parse_error("unexpected-cell-in-table-body", {name: name});
        this.startTagTr('tr', {});
        phase.processStartTag(name, attributes);
    };

    phases.inTableBody.startTagTableOther = function(name, attributes) {
        if (this.inScope('tbody', HTML5.TABLE_SCOPING_ELEMENTS) ||  this.inScope('thead', HTML5.TABLE_SCOPING_ELEMENTS) || this.inScope('tfoot', HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.clearStackToTableBodyContext();
            this.endTagTableRowGroup(tree.open_elements.last().tagName.toLowerCase());
            phase.processStartTag(name, attributes);
        } else {
            parser.parse_error();
        }
    };
    
    phases.inTableBody.startTagOther = function(name, attributes) {
        phases.inTable.processStartTag(name, attributes);
    };

    phases.inTableBody.endTagTableRowGroup = function(name) {
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.clearStackToTableBodyContext();
            tree.pop_element();
            parser.newPhase('inTable');
        } else {
            parser.parse_error('unexpected-end-tag-in-table-body', {name: name});
        }
    };

    phases.inTableBody.endTagTable = function(name) {
        if (this.inScope('tbody', HTML5.TABLE_SCOPING_ELEMENTS) || this.inScope('thead', HTML5.TABLE_SCOPING_ELEMENTS) || this.inScope('tfoot', HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.clearStackToTableBodyContext();
            this.endTagTableRowGroup(tree.open_elements.last().tagName.toLowerCase());
            phase.processEndTag(name);
        } else {
            this.parse_error();
        }
    };

    phases.inTableBody.endTagIgnore = function(name) {
        parser.parse_error("unexpected-end-tag-in-table-body", {name: name});
    };

    phases.inTableBody.endTagOther = function(name) {
        phases.inTable.processEndTag(name);
    };

    phases.inTableBody.clearStackToTableBodyContext = function() {
        var name = tree.open_elements.last().tagName.toLowerCase();
        while(name != 'tbody' && name != 'tfoot' && name != 'thead' && name != 'html') {
            parser.parse_error("unexpected-implied-end-tag-in-table", {name: name});
            tree.pop_element();
            name = tree.open_elements.last().tagName.toLowerCase();
        }
    };

    phases.inSelect = Object.create(phases.base);

    phases.inSelect.start_tag_handlers = {
        html: 'startTagHtml',
        option: 'startTagOption',
        optgroup: 'startTagOptgroup',
        select: 'startTagSelect',
        input: 'startTagInput',
        keygen: 'startTagInput',
        textarea: 'startTagInput',
        script: 'startTagScript',
        '-default': 'startTagOther'
    };

    phases.inSelect.end_tag_handlers = {
        option: 'endTagOption',
        optgroup: 'endTagOptgroup',
        select: 'endTagSelect',
        caption: 'endTagTableElements',
        table: 'endTagTableElements',
        tbody: 'endTagTableElements',
        tfoot: 'endTagTableElements',
        thead: 'endTagTableElements',
        tr: 'endTagTableElements',
        td: 'endTagTableElements',
        th: 'endTagTableElements',
        '-default': 'endTagOther'
    };
    
    phases.inSelect.processCharacters = function(data) {
        data = data.replace(/\u0000/g, function(match, index){
            parser.parse_error("illegal-codepoint");
            return '';
        });
        if (!data)
            return;
        tree.insert_text(data);
    };

    phases.inSelect.startTagOption = function(name, attributes) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'option') tree.pop_element();
        tree.insert_element(name, attributes);
    };

    phases.inSelect.startTagOptgroup = function(name, attributes) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'option') tree.pop_element();
        if (tree.open_elements.last().tagName.toLowerCase() == 'optgroup') tree.pop_element();
        tree.insert_element(name, attributes);
    };
    
    phases.inSelect.endTagOption = function(name) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'option') {
            tree.pop_element();
        } else {
            parser.parse_error('unexpected-end-tag-in-select', {name: 'option'});
        }
    };

    phases.inSelect.endTagOptgroup = function(name) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'option' && tree.open_elements[tree.open_elements.length - 2].tagName.toLowerCase() == 'optgroup') {
            tree.pop_element();
        }
        if (tree.open_elements.last().tagName.toLowerCase() == 'optgroup') {
            tree.pop_element();
        } else {
            parser.parse_error('unexpected-end-tag-in-select', {name: 'optgroup'});
        }
    };

    phases.inSelect.startTagSelect = function(name) {
        parser.parse_error("unexpected-select-in-select");
        this.endTagSelect('select');
    };

    phases.inSelect.endTagSelect = function(name) {
        if (this.inScope('select', HTML5.TABLE_SCOPING_ELEMENTS)) {
            tree.remove_open_elements_until('select');
            parser.reset_insertion_mode();
        } else {
            parser.parse_error();
        }
    };

    phases.inSelect.startTagInput = function(name, attributes) {
        parser.parse_error("unexpected-input-in-select");
        if (this.inScope('select', HTML5.SELECT_SCOPING_ELEMENTS)) {
            this.endTagSelect('select');
            phase.processStartTag(name, attributes);
        }
    };

    phases.inSelect.startTagScript = function(name, attributes) {
        phases.inHead.processStartTag(name, attributes);
    }

    phases.inSelect.endTagTableElements = function(name) {
        parser.parse_error('unexpected-end-tag-in-select', {name: name});
        
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.endTagSelect('select');
            phase.processEndTag(name);
        }
    };

    phases.inSelect.startTagOther = function(name, attributes) {
        parser.parse_error("unexpected-start-tag-in-select", {name: name});
    };

    phases.inSelect.endTagOther = function(name) {
        parser.parse_error('unexpected-end-tag-in-select', {name: name});
    };

    phases.inSelectInTable = Object.create(phases.base);

    phases.inSelectInTable.start_tag_handlers = {
        caption: 'startTagTable',
        table: 'startTagTable',
        tbody: 'startTagTable',
        tfoot: 'startTagTable',
        thead: 'startTagTable',
        tr: 'startTagTable',
        td: 'startTagTable',
        th: 'startTagTable',
        '-default': 'startTagOther'
    };

    phases.inSelectInTable.end_tag_handlers = {
        caption: 'endTagTable',
        table: 'endTagTable',
        tbody: 'endTagTable',
        tfoot: 'endTagTable',
        thead: 'endTagTable',
        tr: 'endTagTable',
        td: 'endTagTable',
        th: 'endTagTable',
        '-default': 'endTagOther'
    };

    phases.inSelectInTable.processCharacters = function(data) {
        phases.inSelect.processCharacters(data);
    };

    phases.inSelectInTable.startTagTable = function(name, attributes) {
        parser.parse_error("unexpected-table-element-start-tag-in-select-in-table", {name: name});
        this.endTagOther("select");
        phase.processStartTag(name, attributes);
    };

    phases.inSelectInTable.startTagOther = function(name, attributes, self_closing) {
        phases.inSelect.processStartTag(name, attributes, self_closing);
    };

    phases.inSelectInTable.endTagTable = function(name) {
        parser.parse_error("unexpected-table-element-end-tag-in-select-in-table", {name: name});
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.endTagOther("select");
            phase.processEndTag(name);
        }
    };

    phases.inSelectInTable.endTagOther = function(name) {
        phases.inSelect.processEndTag(name);
    };

    phases.inRow = Object.create(phases.base);

    phases.inRow.start_tag_handlers = {
        html: 'startTagHtml',
        td: 'startTagTableCell',
        th: 'startTagTableCell',
        caption: 'startTagTableOther',
        col: 'startTagTableOther',
        colgroup: 'startTagTableOther',
        tbody: 'startTagTableOther',
        tfoot: 'startTagTableOther',
        thead: 'startTagTableOther',
        tr: 'startTagTableOther',
        '-default': 'startTagOther'
    };

    phases.inRow.end_tag_handlers = {
        tr: 'endTagTr',
        table: 'endTagTable',
        tbody: 'endTagTableRowGroup',
        tfoot: 'endTagTableRowGroup',
        thead: 'endTagTableRowGroup',
        body: 'endTagIgnore',
        caption: 'endTagIgnore',
        col: 'endTagIgnore',
        colgroup: 'endTagIgnore',
        html: 'endTagIgnore',
        td: 'endTagIgnore',
        th: 'endTagIgnore',
        '-default': 'endTagOther'
    };

    phases.inRow.processSpaceCharacters = function(data) {
        phases.inTable.processSpaceCharacters(data);
    };

    phases.inRow.processCharacters = function(data) {
        phases.inTable.processCharacters(data);
    };

    phases.inRow.startTagTableCell = function(name, attributes) {
        this.clearStackToTableRowContext();
        tree.insert_element(name, attributes);
        parser.newPhase('inCell');
        tree.activeFormattingElements.push(HTML5.Marker);
    };

    phases.inRow.startTagTableOther = function(name, attributes) {
        var ignoreEndTag = this.ignoreEndTagTr();
        this.endTagTr('tr');
        if (!ignoreEndTag) phase.processStartTag(name, attributes);
    };

    phases.inRow.startTagOther = function(name, attributes, self_closing) {
        phases.inTable.processStartTag(name, attributes, self_closing);
    };

    phases.inRow.endTagTr = function(name) {
        if (this.ignoreEndTagTr()) {
            assert.ok(parser.inner_html);
            parser.parse_error();
        } else {
            this.clearStackToTableRowContext();
            tree.pop_element();
            parser.newPhase('inTableBody');
        }
    };

    phases.inRow.endTagTable = function(name) {
        var ignoreEndTag = this.ignoreEndTagTr();
        this.endTagTr('tr');
        if (!ignoreEndTag) phase.processEndTag(name);
    };

    phases.inRow.endTagTableRowGroup = function(name) {
        if (this.inScope(name, HTML5.TABLE_SCOPING_ELEMENTS)) {
            this.endTagTr('tr');
            phase.processEndTag(name);
        } else {
            parser.parse_error();
        }
    };

    phases.inRow.endTagIgnore = function(name) {
        parser.parse_error("unexpected-end-tag-in-table-row", {name: name});
    };

    phases.inRow.endTagOther = function(name) {
        phases.inTable.processEndTag(name);
    };

    phases.inRow.clearStackToTableRowContext = function() {
        var name = tree.open_elements.last().tagName.toLowerCase();
        while (name != 'tr' && name != 'html') {
            parser.parse_error("unexpected-implied-end-tag-in-table-row", {name: name});
            tree.pop_element();
            name = tree.open_elements.last().tagName.toLowerCase();
        }
    };

    phases.inRow.ignoreEndTagTr = function() {
        return !this.inScope('tr', HTML5.TABLE_SCOPING_ELEMENTS);
    };

    phases.rootElement = Object.create(phases.base);

    phases.rootElement.processEOF = function() {
        this.insert_html_element();
        phase.processEOF();
    };

    phases.rootElement.processComment = function(data) {
        tree.insert_comment(data, this.tree.document);
    };

    phases.rootElement.processSpaceCharacters = function(data) {
    };

    phases.rootElement.processCharacters = function(data) {
        this.insert_html_element();
        phase.processCharacters(data);
    };

    phases.rootElement.processStartTag = function(name, attributes, self_closing) {
        if (name == 'html') parser.first_start_tag = true;
        this.insert_html_element();
        phase.processStartTag(name, attributes, self_closing);
    };

    phases.rootElement.processEndTag = function(name) {
        this.insert_html_element();
        phase.processEndTag(name);
    };

    phases.rootElement.insert_html_element = function() {
        tree.insert_root('html');
        parser.newPhase('beforeHead');
    };

    phases.afterAfterFrameset = Object.create(phases.base);

    phases.afterAfterFrameset.start_tag_handlers = {
        html: 'startTagHtml',
        noframes: 'startTagNoFrames',
        '-default': 'startTagOther'
    };

    phases.afterAfterFrameset.processEOF = function() {};

    phases.afterAfterFrameset.processComment = function(data) {
        tree.insert_comment(data, tree.document);
    };

    phases.afterAfterFrameset.processSpaceCharacters = function(data) {
        phases.inBody.processSpaceCharacters(data);
    };

    phases.afterAfterFrameset.processCharacters = function(data) {
        parser.parse_error('expected-eof-but-got-char');
    };

    phases.afterAfterFrameset.startTagHtml = function(name, attributes) {
        phases.inBody.processStartTag(name, attributes);
    };

    phases.afterAfterFrameset.startTagNoFrames = function(name, attributes) {
        phases.inHead.processStartTag(name, attributes);
    };

    phases.afterAfterFrameset.startTagOther = function(name, attributes, self_closing) {
        parser.parse_error('expected-eof-but-got-start-tag', {name: name});
    };

    phases.afterAfterFrameset.processEndTag = function(name, attributes) {
        parser.parse_error('expected-eof-but-got-end-tag');
    };

    phases.inBody = Object.create(phases.base);

    phases.inBody.start_tag_handlers = {
        html: 'startTagHtml',
        head: 'startTagMisplaced',
        base: 'startTagProcessInHead',
        basefont: 'startTagProcessInHead',
        bgsound: 'startTagProcessInHead',
        command: 'startTagProcessInHead',
        link: 'startTagProcessInHead',
        meta: 'startTagProcessInHead',
        noframes: 'startTagProcessInHead',
        script: 'startTagProcessInHead',
        style: 'startTagProcessInHead',
        title: 'startTagTitle',
        body: 'startTagBody',
        form: 'startTagForm',
        plaintext: 'startTagPlaintext',
        a: 'startTagA',
        button: 'startTagButton',
        xmp: 'startTagXmp',
        table: 'startTagTable',
        hr: 'startTagHr',
        image: 'startTagImage',
        input: 'startTagInput',
        textarea: 'startTagTextarea',
        select: 'startTagSelect',
        isindex: 'startTagIsindex',
        applet: 'startTagAppletMarqueeObject',
        marquee:    'startTagAppletMarqueeObject',
        object: 'startTagAppletMarqueeObject',
        li: 'startTagListItem',
        dd: 'startTagListItem',
        dt: 'startTagListItem',
        address: 'startTagCloseP',
        article: 'startTagCloseP',
        aside: 'startTagCloseP',
        blockquote: 'startTagCloseP',
        center: 'startTagCloseP',
        details: 'startTagCloseP',
        dir: 'startTagCloseP',
        div: 'startTagCloseP',
        dl: 'startTagCloseP',
        fieldset: 'startTagCloseP',
        figcaption: 'startTagCloseP',
        figure: 'startTagCloseP',
        footer: 'startTagCloseP',
        header: 'startTagCloseP',
        hgroup: 'startTagCloseP',
        main: 'startTagCloseP',
        menu: 'startTagCloseP',
        nav: 'startTagCloseP',
        ol: 'startTagCloseP',
        p: 'startTagCloseP',
        section: 'startTagCloseP',
        summary: 'startTagCloseP',
        ul: 'startTagCloseP',
        listing: 'startTagPreListing',
        pre: 'startTagPreListing',
        b: 'startTagFormatting',
        big: 'startTagFormatting',
        code: 'startTagFormatting',
        em: 'startTagFormatting',
        font: 'startTagFormatting',
        i: 'startTagFormatting',
        s: 'startTagFormatting',
        small: 'startTagFormatting',
        strike: 'startTagFormatting',
        strong: 'startTagFormatting',
        tt: 'startTagFormatting',
        u: 'startTagFormatting',
        nobr: 'startTagNobr',
        area: 'startTagVoidFormatting',
        br: 'startTagVoidFormatting',
        embed: 'startTagVoidFormatting',
        img: 'startTagVoidFormatting',
        keygen: 'startTagVoidFormatting',
        wbr: 'startTagVoidFormatting',
        param: 'startTagParamSourceTrack',
        source: 'startTagParamSourceTrack',
        track: 'startTagParamSourceTrack',
        iframe: 'startTagIFrame',
        noembed: 'startTagRawText',
        noscript: 'startTagRawText',
        h1: 'startTagHeading',
        h2: 'startTagHeading',
        h3: 'startTagHeading',
        h4: 'startTagHeading',
        h5: 'startTagHeading',
        h6: 'startTagHeading',
        caption: 'startTagMisplaced',
        col: 'startTagMisplaced',
        colgroup: 'startTagMisplaced',
        frame: 'startTagMisplaced',
        frameset: 'startTagFrameset',
        tbody: 'startTagMisplaced',
        td: 'startTagMisplaced',
        tfoot: 'startTagMisplaced',
        th: 'startTagMisplaced',
        thead: 'startTagMisplaced',
        tr: 'startTagMisplaced',
        option: 'startTagOptionOptgroup',
        optgroup: 'startTagOptionOptgroup',
        math: 'startTagMath',
        svg: 'startTagSVG',
        rt: 'startTagRpRt',
        rp: 'startTagRpRt',
        "-default": 'startTagOther'
    };

    phases.inBody.end_tag_handlers = {
        p: 'endTagP',
        body: 'endTagBody',
        html: 'endTagHtml',
        address: 'endTagBlock',
        article: 'endTagBlock',
        aside: 'endTagBlock',
        blockquote: 'endTagBlock',
        button: 'endTagBlock',
        center: 'endTagBlock',
        details: 'endTagBlock',
        dir: 'endTagBlock',
        div: 'endTagBlock',
        dl: 'endTagBlock',
        fieldset: 'endTagBlock',
        figcaption: 'endTagBlock',
        figure: 'endTagBlock',
        footer: 'endTagBlock',
        header: 'endTagBlock',
        hgroup: 'endTagBlock',
        listing: 'endTagBlock',
        main: 'endTagBlock',
        menu: 'endTagBlock',
        nav: 'endTagBlock',
        ol: 'endTagBlock',
        pre: 'endTagBlock',
        section: 'endTagBlock',
        summary: 'endTagBlock',
        ul: 'endTagBlock',
        form: 'endTagForm',
        applet: 'endTagAppletMarqueeObject',
        marquee: 'endTagAppletMarqueeObject',
        object: 'endTagAppletMarqueeObject',
        dd: 'endTagListItem',
        dt: 'endTagListItem',
        li: 'endTagListItem',
        h1: 'endTagHeading',
        h2: 'endTagHeading',
        h3: 'endTagHeading',
        h4: 'endTagHeading',
        h5: 'endTagHeading',
        h6: 'endTagHeading',
        a: 'endTagFormatting',
        b: 'endTagFormatting',
        big: 'endTagFormatting',
        code: 'endTagFormatting',
        em: 'endTagFormatting',
        font: 'endTagFormatting',
        i: 'endTagFormatting',
        nobr: 'endTagFormatting',
        s: 'endTagFormatting',
        small: 'endTagFormatting',
        strike: 'endTagFormatting',
        strong: 'endTagFormatting',
        tt: 'endTagFormatting',
        u: 'endTagFormatting',
        br: 'endTagBr',
        "-default": 'endTagOther'
    };

    phases.inBody.processSpaceCharactersDropNewline = function(data) {
        this.dropNewline = false;
        var lastTag = tree.open_elements.last().tagName.toLowerCase();
        if (data.length > 0 && data[0] == "\n" && (['pre', 'listing', 'textarea'].indexOf(lastTag) > -1) && !tree.open_elements.last().hasChildNodes()) {
            data = data.slice(1);
        }

        if (data.length > 0) {
            tree.reconstructActiveFormattingElements();
            tree.insert_text(data);
        }
    };

    phases.inBody.processSpaceCharacters = function(data) {
        if (this.dropNewline) {
            this.processSpaceCharactersDropNewline(data);
        } else {
            this.processSpaceCharactersNonPre(data);
        }
    };

    phases.inBody.processSpaceCharactersNonPre = function(data) {
        tree.reconstructActiveFormattingElements();
        tree.insert_text(data);
    };

    phases.inBody.processCharacters = function(data) {
        data = data.replace(/\u0000/g, function(match, index){
            parser.parse_error("illegal-codepoint");
            return '';
        });
        if (!data)
            return;
        tree.reconstructActiveFormattingElements();
        tree.insert_text(data);
        if (framesetOk && new RegExp('[^' + HTML5.SPACE_CHARACTERS_IN + ']').test(data))
            framesetOk = false;
    };

    phases.inBody.startTagProcessInHead = function(name, attributes) {
        phases.inHead.processStartTag(name, attributes);
    };

    phases.inBody.startTagBody = function(name, attributes) {
        parser.parse_error('unexpected-start-tag', {name: 'body'});
        if (tree.open_elements.length == 1 ||
            tree.open_elements[1].tagName.toLowerCase() != 'body') {
            assert.ok(parser.inner_html);
        } else {
            framesetOk = false;
            for(var i = 0; i < attributes.length; i++) {
                if (!tree.open_elements[1].getAttribute(attributes[i].nodeName)) {
                    tree.open_elements[1].setAttribute(attributes[i].nodeName, attributes[i].nodeValue);
                }
            }
        }
    };

    phases.inBody.startTagFrameset = function(name, attributes) {
        parser.parse_error('unexpected-start-tag', {name: 'frameset'});
        if (tree.open_elements.length == 1 ||
            tree.open_elements[1].tagName.toLowerCase() != 'body') {
            assert.ok(parser.inner_html);
        } else if (framesetOk) {
            if (tree.open_elements[1].parentNode)
                tree.open_elements[1].parentNode.removeChild(tree.open_elements[1]);
            while (tree.open_elements.last().tagName.toLowerCase() != 'html')
                tree.open_elements.pop();
            tree.insert_element(name, attributes);
            parser.newPhase('inFrameset');
        }
    };

    phases.inBody.startTagCloseP = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        tree.insert_element(name, attributes);
    };

    phases.inBody.startTagPreListing = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        tree.insert_element(name, attributes);
        framesetOk = false;
        this.dropNewline = true;
    };

    phases.inBody.startTagForm = function(name, attributes) {
        if (tree.formPointer) {
            parser.parse_error('unexpected-start-tag', {name: name});
        } else {
            if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
            tree.insert_element(name, attributes);
            tree.formPointer = tree.open_elements.last();
        }
    };

    phases.inBody.startTagRpRt = function(name, attributes) {
        if (this.inScope('ruby')) {
            tree.generateImpliedEndTags();
            if (tree.open_elements.last().tagName.toLowerCase() != 'ruby') {
                parser.parse_error('unexpected-start-tag', {name: name});
            }
        }
        tree.insert_element(name, attributes);
    };

    phases.inBody.startTagListItem = function(name, attributes) {
        var stopNames = {li: ['li'], dd: ['dd', 'dt'], dt: ['dd', 'dt']};
        var stopName = stopNames[name];

        var els = tree.open_elements;
        for(var i = els.length - 1; i >= 0; i--) {
            var node = els[i];
            if (stopName.indexOf(node.tagName.toLowerCase()) != -1) {
                phase.processEndTag(node.tagName.toLowerCase());
                break;
            }
            if (((node.namespace || 'html') in HTML5.SPECIAL_ELEMENTS &&
                    HTML5.SPECIAL_ELEMENTS[node.namespace || 'html'].indexOf(node.tagName.toLowerCase()) != -1)/* ||
                ((node.namespace || 'html') in HTML5.SCOPING_ELEMENTS
                    && HTML5.SCOPING_ELEMENTS[node.namespace || 'html'].indexOf(node.tagName.toLowerCase()) != -1)*/ &&
                ['address', 'div', 'p'].indexOf(node.tagName.toLowerCase()) == -1) break;
        }
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        tree.insert_element(name, attributes);
        framesetOk = false;
    };

    phases.inBody.startTagPlaintext = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        tree.insert_element(name, attributes);
        parser.tokenizer.content_model = HTML5.Models.PLAINTEXT;
    };

    phases.inBody.startTagHeading = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        if (HTML5.HEADING_ELEMENTS.indexOf(tree.open_elements.last().tagName.toLowerCase()) != -1) {
            parser.parse_error('unexpected-start-tag', {name: name});
            tree.pop_element();
        }

        tree.insert_element(name, attributes);
    };

    phases.inBody.startTagA = function(name, attributes) {
        var afeAElement = tree.elementInActiveFormattingElements('a');
        if (afeAElement) {
            parser.parse_error("unexpected-start-tag-implies-end-tag", {startName: "a", endName: "a"});
            this.endTagFormatting('a');
            var pos;
            pos = tree.open_elements.indexOf(afeAElement);
            if (pos != -1) tree.open_elements.splice(pos, 1);
            pos = tree.activeFormattingElements.indexOf(afeAElement);
            if (pos != -1) tree.activeFormattingElements.splice(pos, 1);
        }
        tree.reconstructActiveFormattingElements();
        this.addFormattingElement(name, attributes);
    };

    phases.inBody.startTagFormatting = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        this.addFormattingElement(name, attributes);
    };

    phases.inBody.startTagNobr = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        if (this.inScope('nobr')) {
            parser.parse_error("unexpected-start-tag-implies-end-tag", {startName: 'nobr', endName: 'nobr'});
            this.processEndTag('nobr');
                tree.reconstructActiveFormattingElements()
        }
        this.addFormattingElement(name, attributes);
    };

    phases.inBody.startTagButton = function(name, attributes) {
        if (this.inScope('button')) {
            parser.parse_error('unexpected-start-tag-implies-end-tag', {startName: 'button', endName: 'button'});
            this.processEndTag('button');
            phase.processStartTag(name, attributes);
        } else {
            framesetOk = false;
            tree.reconstructActiveFormattingElements();
            tree.insert_element(name, attributes);
        }
    };

    phases.inBody.startTagAppletMarqueeObject = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, attributes);
        tree.activeFormattingElements.push(HTML5.Marker);
        framesetOk = false;
    };

    phases.inBody.endTagAppletMarqueeObject = function(name) {
        if (!this.inScope(name)) {
            parser.parse_error("unexpected-end-tag", {name: name});
        } else {
            tree.generateImpliedEndTags();
            if (tree.open_elements.last().tagName.toLowerCase() != name) {
                parser.parse_error('end-tag-too-early', {name: name});
            }
            tree.remove_open_elements_until(name);
            tree.clearActiveFormattingElements();
        }
    };

    phases.inBody.startTagXmp = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.processEndTag('p');
        tree.reconstructActiveFormattingElements();
        parser.parseRCDataRawText("RAWTEXT", name, attributes);
        framesetOk = false;
    };

    phases.inBody.startTagTable = function(name, attributes) {
        if (parser.compatMode !== "quirks")
            if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS))
                this.processEndTag('p');
        tree.insert_element(name, attributes);
        parser.newPhase('inTable');
        framesetOk = false;
    };

    phases.inBody.startTagVoidFormatting = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, attributes);
        tree.pop_element();
        framesetOk = false;
    };

    phases.inBody.startTagParamSourceTrack = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.pop_element();
    };

    phases.inBody.startTagHr = function(name, attributes) {
        if (this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) this.endTagP('p');
        tree.insert_element(name, attributes);
        tree.pop_element();
        framesetOk = false;
    };

    phases.inBody.startTagImage = function(name, attributes) {
        parser.parse_error('unexpected-start-tag-treated-as', {originalName: 'image', newName: 'img'});
        this.processStartTag('img', attributes);
    };

    phases.inBody.startTagInput = function(name, attributes) {
        var currentFramesetOk = framesetOk;
        this.startTagVoidFormatting(name, attributes);
        for (var key in attributes) {
            if (attributes[key].nodeName == 'type') {
                if (attributes[key].nodeValue.toLowerCase() == 'hidden')
                    framesetOk = currentFramesetOk;
                break;
            }
        }
    };

    phases.inBody.startTagIsindex = function(name, attributes) {
        parser.parse_error('deprecated-tag', {name: 'isindex'});
        if (tree.formPointer)
            return;
        var formAttributes = [];
        var inputAttributes = [];
        var prompt = "This is a searchable index. Enter search keywords: ";
        for (var key in attributes) {
            switch (attributes[key].nodeName) {
                case 'action':
                    formAttributes.push({nodeName: 'action',
                        nodeValue: attributes[key].nodeValue});
                    break;
                case 'prompt':
                    prompt = attributes[key].nodeValue;
                    break;
                case 'name':
                    break;
                default:
                    inputAttributes.push({nodeName: attributes[key].nodeName,
                        nodeValue: attributes[key].nodeValue});
            }
        }
        inputAttributes.push({nodeName: 'name', nodeValue: 'isindex'});
        this.processStartTag('form', formAttributes);
        this.processStartTag('hr');
        this.processStartTag('label');
        this.processCharacters(prompt);
        this.processStartTag('input', inputAttributes);
        this.processEndTag('label');
        this.processStartTag('hr');
        this.processEndTag('form');
    };

    phases.inBody.startTagTextarea = function(name, attributes) {
        tree.insert_element(name, attributes);
        parser.tokenizer.content_model = HTML5.Models.RCDATA;
        this.dropNewline = true;
        framesetOk = false;
    };

    phases.inBody.startTagIFrame = function(name, attributes) {
        framesetOk = false;
        this.startTagRawText(name, attributes);
    };

    phases.inBody.startTagRawText = function(name, attributes) {
        parser.parseRCDataRawText("RAWTEXT", name, attributes);
    };

    phases.inBody.startTagSelect = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, attributes);
        framesetOk = false;
        var phaseName = parser.phaseName;
        if (phaseName == 'inTable' ||
            phaseName == 'inCaption' ||
            phaseName == 'inColumnGroup' ||
            phaseName == 'inTableBody' ||
            phaseName == 'inRow' ||
            phaseName == 'inCell') {
            parser.newPhase('inSelectInTable');
        } else {
            parser.newPhase('inSelect');
        }
    };

    phases.inBody.startTagMisplaced = function(name, attributes) {
        parser.parse_error('unexpected-start-tag-ignored', {name: name});
    };

    phases.inBody.endTagMisplaced = function(name) {
        parser.parse_error("unexpected-end-tag", {name: name});
    };

    phases.inBody.endTagBr = function(name) {
        parser.parse_error("unexpected-end-tag-treated-as", {originalName: "br", newName: "br element"});
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, []);
        tree.pop_element();
    };

    phases.inBody.startTagOptionOptgroup = function(name, attributes) {
        if (tree.open_elements.last().tagName.toLowerCase() == 'option') this.endTagOther('option');
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, attributes);
    };

    phases.inBody.startTagOther = function(name, attributes) {
        tree.reconstructActiveFormattingElements();
        tree.insert_element(name, attributes);
    };

    phases.inBody.startTagTitle = function(name, attributes) {
        tree.insert_element(name, attributes);
        parser.tokenizer.content_model = HTML5.Models.RCDATA;
    };

    phases.inBody.endTagTitle = function(name, attributes) {
        if (tree.open_elements[tree.open_elements.length - 1].tagName.toLowerCase() == name.toLowerCase()) {
            tree.pop_element();
            parser.tokenizer.content_model = HTML5.Models.PCDATA;
        } else {
            parser.parse_error('unexpected-end-tag', {name: name});
        }
    };

    phases.inBody.endTagOther = function endTagOther(name) {
        var currentNode;
        function isCurrentNode(el) {
            return el == currentNode;
        }

        var nodes = tree.open_elements;
        for(var eli = nodes.length - 1; eli > 0; eli--) {
            currentNode = nodes[eli];
            if (nodes[eli].tagName.toLowerCase() == name) {
                tree.generateImpliedEndTags();
                if (tree.open_elements.last().tagName.toLowerCase() != name) {
                    parser.parse_error('unexpected-end-tag', {name: name});
                }
                
                tree.remove_open_elements_until(isCurrentNode);

                break;
            } else {
                if (((currentNode.namespace || 'html') in HTML5.SPECIAL_ELEMENTS &&
                        HTML5.SPECIAL_ELEMENTS[currentNode.namespace || 'html'].indexOf(currentNode.tagName.toLowerCase()) != -1) ||
                    ((currentNode.namespace || 'html') in HTML5.SCOPING_ELEMENTS &&
                        HTML5.SCOPING_ELEMENTS[currentNode.namespace || 'html'].indexOf(currentNode.tagName.toLowerCase()) != -1)
                ) {
                    parser.parse_error('unexpected-end-tag', {name: name});
                    break;
                }
            }
        }
    };

    phases.inBody.startTagMath = function(name, attributes, self_closing) {
        tree.reconstructActiveFormattingElements();
        attributes = this.adjust_mathml_attributes(attributes);
        attributes = this.adjust_foreign_attributes(attributes);
        tree.insert_foreign_element(name, attributes, 'math');
        if (self_closing) {
            tree.open_elements.pop();
        }
    };

    phases.inBody.startTagSVG = function(name, attributes, self_closing) {
        tree.reconstructActiveFormattingElements();
        attributes = this.adjust_svg_attributes(attributes);
        attributes = this.adjust_foreign_attributes(attributes);
        tree.insert_foreign_element(name, attributes, 'svg');
        if (self_closing) {
            tree.open_elements.pop();
        }
    };

    phases.inBody.endTagP = function(name) {
        if (!this.inScope('p', HTML5.BUTTON_SCOPING_ELEMENTS)) {
            parser.parse_error('unexpected-end-tag', {name: 'p'});
            this.startTagCloseP('p', {});
            this.endTagP('p');
        } else {
            tree.generateImpliedEndTags('p');
            if (tree.open_elements.last().tagName.toLowerCase() != 'p')
                parser.parse_error('unexpected-end-tag', {name: 'p'});
            tree.remove_open_elements_until(name);
        }
    };

    phases.inBody.endTagBody = function(name) {
        if (!this.inScope('body')) {
            parser.parse_error('unexpected-end-tag', {name: name});
            return;
        }
        if (tree.open_elements.last().tagName.toLowerCase() != 'body') {
            parser.parse_error('expected-one-end-tag-but-got-another', {
                expectedName: tree.open_elements.last().tagName.toLowerCase(),
                gotName: name
            });
        }
        parser.newPhase('afterBody');
    };

    phases.inBody.endTagHtml = function(name) {
        if (!this.inScope('body')) {
            parser.parse_error('unexpected-end-tag', {name: name});
            return;
        }
        if (tree.open_elements.last().tagName.toLowerCase() != 'body') {
            parser.parse_error('expected-one-end-tag-but-got-another', {
                expectedName: tree.open_elements.last().tagName.toLowerCase(),
                gotName: name
            });
        }
        parser.newPhase('afterBody');
        phase.processEndTag(name);
    };

    phases.inBody.endTagBlock = function(name) {
        if (!this.inScope(name)) {
            parser.parse_error('unexpected-end-tag', {name: name});
        } else {
            tree.generateImpliedEndTags();
            if (tree.open_elements.last().tagName.toLowerCase() != name) {
                parser.parse_error('end-tag-too-early', {name: name});
            }
            tree.remove_open_elements_until(name);
        }
    };

    phases.inBody.endTagForm = function(name)  {
        var node = tree.formPointer;
        tree.formPointer = null;
        if (!node || !this.inScope(name)) {
            parser.parse_error('unexpected-end-tag', {name: name});
        } else {
            tree.generateImpliedEndTags();
        
            if (tree.open_elements.last() != node) {
                parser.parse_error('end-tag-too-early-ignored', {name: 'form'});
            }
            tree.open_elements.splice(tree.open_elements.indexOf(node), 1);
        }
    };

    phases.inBody.endTagListItem = function(name) {
        if (!this.inScope(name, HTML5.LIST_SCOPING_ELEMENTS)) {
            parser.parse_error('unexpected-end-tag', {name: name});
        } else {
            tree.generateImpliedEndTags(name);
            if (tree.open_elements.last().tagName.toLowerCase() != name)
                parser.parse_error('end-tag-too-early', {name: name});
            tree.remove_open_elements_until(name);
        }
    };

    phases.inBody.endTagHeading = function(name) {
        var error = true;
        var i;

        for(i in HTML5.HEADING_ELEMENTS) {
            var el = HTML5.HEADING_ELEMENTS[i];
            if (this.inScope(el)) {
                error = false;
                break;
            }
        }
        if (error) {
            parser.parse_error('unexpected-end-tag', {name: name});
            return;
        }

        tree.generateImpliedEndTags();

        if (tree.open_elements.last().tagName.toLowerCase() != name)
            parser.parse_error('end-tag-too-early', {name: name});

        tree.remove_open_elements_until(function(e) {
            return HTML5.HEADING_ELEMENTS.indexOf(e.tagName.toLowerCase()) != -1;
        });
    };

    phases.inBody.endTagFormatting = function(name, attributes) {
        var element;
        var afeElement;

        function isAfeElement(el) {
            return el == afeElement;
        }

        var outerLoopCounter = 0;

        while (outerLoopCounter++ < 8) {
            afeElement = tree.elementInActiveFormattingElements(name);
            if (!afeElement || (tree.open_elements.indexOf(afeElement) != -1 &&
                !this.inScope(afeElement.tagName.toLowerCase()))) {
                parser.parse_error('adoption-agency-1.1', {name: name});
            this.endTagOther(name, attributes);
                return;
            } else if (tree.open_elements.indexOf(afeElement) == -1) {
                parser.parse_error('adoption-agency-1.2', {name: name});
                tree.activeFormattingElements.splice(tree.activeFormattingElements.indexOf(afeElement), 1);
                return;
            } else if (!this.inScope(afeElement.tagName.toLowerCase())) {
                parser.parse_error('adoption-agency-4.4', {name: name});
            }

            if (afeElement != tree.open_elements.last()) {
                parser.parse_error('adoption-agency-1.3', {name: name});
            }
            var afeIndex = tree.open_elements.indexOf(afeElement);
            var furthestBlock = null;
            var els = tree.open_elements.slice(afeIndex);
            var len = els.length;
            for (var i = 0; i < len; i++) {
                element = els[i];
                if (((element.namespace || 'html') in HTML5.SPECIAL_ELEMENTS &&
                        HTML5.SPECIAL_ELEMENTS[element.namespace || 'html'].indexOf(element.tagName.toLowerCase()) != -1) ||
                    ((element.namespace || 'html') in HTML5.SCOPING_ELEMENTS &&
                        HTML5.SCOPING_ELEMENTS[element.namespace || 'html'].indexOf(element.tagName.toLowerCase()) != -1)
                ) {
                    furthestBlock = element;
                    break;
                }
            }
            
            if (!furthestBlock) {
                element = tree.remove_open_elements_until(isAfeElement);
                tree.activeFormattingElements.splice(tree.activeFormattingElements.indexOf(element), 1);
                return;
            }


            var commonAncestor = tree.open_elements[afeIndex - 1];

            var bookmark = tree.activeFormattingElements.indexOf(afeElement);

            var lastNode;
            var node;
            var clone;
            lastNode = node = furthestBlock;
            var index = tree.open_elements.indexOf(node);

            var innerLoopCounter = 0;
            while (innerLoopCounter++ < 3) {
                index -= 1;
                node = tree.open_elements[index];
                if (tree.activeFormattingElements.indexOf(node) < 0) {
                    tree.open_elements.splice(index, 1);
                    continue;
                }
                if (node == afeElement)
                    break;

                if (lastNode == furthestBlock)
                    bookmark = tree.activeFormattingElements.indexOf(node) + 1;

                var clone = node.cloneNode();

                tree.activeFormattingElements[tree.activeFormattingElements.indexOf(node)] = clone;
                tree.open_elements[tree.open_elements.indexOf(node)] = clone;

                node = clone;

                if (lastNode.parentNode)
                    lastNode.parentNode.removeChild(lastNode);
                node.appendChild(lastNode);
                lastNode = node;
            }

            if (lastNode.parentNode)
                lastNode.parentNode.removeChild(lastNode);


            if (['table', 'tbody', 'tfoot', 'thead', 'tr'].indexOf(commonAncestor.tagName.toLowerCase()) > -1) {
                var position = tree.getTableMisnestedNodePosition();
                position.parent.insertBefore(lastNode, position.insertBefore);
            } else {
                commonAncestor.appendChild(lastNode);
            }

            clone = afeElement.cloneNode();

            tree.reparentChildren(furthestBlock, clone);

            furthestBlock.appendChild(clone);

            tree.activeFormattingElements.splice(tree.activeFormattingElements.indexOf(afeElement), 1);
            tree.activeFormattingElements.splice(Math.min(bookmark, tree.activeFormattingElements.length), 0, clone);

            tree.open_elements.splice(tree.open_elements.indexOf(afeElement), 1);
            tree.open_elements.splice(tree.open_elements.indexOf(furthestBlock) + 1, 0, clone);
        }
    };

    phases.inBody.addFormattingElement = function(name, attributes) {
        tree.insert_element(name, attributes);
        tree.activeFormattingElements.push(tree.open_elements.last());
    };

    phases.text = Object.create(phases.base);

    phases.text.start_tag_handlers = {
        '-default': 'startTagOther'
    };

    phases.text.end_tag_handlers = {
        script: 'endTagScript',
        '-default': 'endTagOther'
    };

    phases.text.processCharacters = function(data) {
        tree.insert_text(data);
    };

    phases.text.processEOF = function() {
        parser.parse_error("expected-named-closing-tag-but-got-eof",
            {name: tree.open_elements.last().tagName.toLowerCase()});
        tree.open_elements.pop();
        parser.newPhase(parser.original_phase);
        phase.processEOF();
    };

    phases.text.startTagOther = function(name) {
        throw "Tried to process start tag " + name + " in RCDATA/RAWTEXT mode";
    };

    phases.text.endTagScript = function(name) {
        var node = tree.open_elements.pop();
        assert.ok(node.tagName.toLowerCase() == 'script');
        parser.newPhase(parser.original_phase);
    };

    phases.text.endTagOther = function(name) {
        tree.open_elements.pop();
        parser.newPhase(parser.original_phase);
    }

    if (options) for(var o in options) {
        this[o] = options[o];
    }

    if (!this.tree) {
        var SAXTreeBuilder = require('./saxtreebuilder').SAXTreeBuilder;
        this.tree = new SAXTreeBuilder(this);
    }
    var tree = this.tree;
};

util.inherits(Parser, events.EventEmitter);

Parser.prototype.parse = function(source) {
    if (!source) throw(new Error("No source to parse"));
    HTML5.debug('parser.parse', source);
    this.tokenizer = new HTML5.Tokenizer(source, this.document, this.tree);
    this.setup();
    this.tokenizer.tokenize();
};

Parser.prototype.parse_fragment = function(source, element) {
    HTML5.debug('parser.parse_fragment', source, element);
    this.tokenizer = new HTML5.Tokenizer(source, this.document);
    if (element && element.ownerDocument) {
        this.setup(element.tagName, null);
        this.tree.open_elements.push(element);
        this.tree.root_pointer = element;
    } else if (element) {
        this.setup(element, null);
    } else {
        this.setup();
        this.tree.open_elements.push(this.tree.html_pointer);
        this.tree.root_pointer = this.tree.html_pointer;
    }
    this.tokenizer.tokenize();
};

Object.defineProperty(Parser.prototype, 'fragment', {
    get: function() {
        return this.tree.getFragment();
    }
});

Parser.prototype.do_token = function(token) {
    var method = 'process' + token.type;

    if (token.type == 'ParseError') {
        this.parse_error(token.data, token.datavars);
    } else {
        var currentNode = this.tree.open_elements.last() || null;
        if (!currentNode || !currentNode.namespace ||
            (this.is_mathml_text_integration_point(currentNode) &&
                ((token.type == 'StartTag' &&
                        !(token.name in {mglyph:0, malignmark:0})) ||
                    (token.type in {Characters:0, SpaceCharacters:0}))
            ) ||
            (currentNode.namespace == 'math' &&
                currentNode.tagName.toLowerCase() == 'annotation-xml' &&
                token.type == 'StartTag' && token.name == 'svg'
            ) || 
            (this.is_html_integration_point(currentNode) &&
                token.type in {StartTag:0, Characters:0, SpaceCharacters:0}
            ) ||
            token.type == 'EOF'
        ) {
            var phase = this.phase;
        } else {
            var phase = this.phases.inForeignContent;
        }
        switch(token.type) {
        case 'Characters':
        case 'SpaceCharacters':
        case 'Comment':
            phase[method](token.data);
            break;
        case 'StartTag':
            if (token.name == "script") {
                this.inScript = true;
                this.scriptBuffer = '';
            }
            phase[method](token.name, token.data, token.self_closing);
            break;
        case 'EndTag':
            phase[method](token.name);
            if (token.name == "script") {
                this.inScript = false;
            }
            break;
        case 'Doctype':
            phase[method](token.name, token.publicId, token.systemId, token.correct);
            break;
        case 'EOF':
            phase[method]();
            break;
        }
    }
};

Parser.prototype.setup = function(container, encoding) {
    this.tokenizer.addListener('token', function(t) {
        return function(token) { t.do_token(token); };
    }(this));
    this.tokenizer.addListener('end', function(t) {
        return function() { t.emit('end'); };
    }(this));
    this.emit('setup', this);

    var inner_html = !!container;
    container = container || 'div';

    this.tree.reset();
    this.first_start_tag = false;
    this.errors = [];
    this.compatMode = "no quirks";

    if (inner_html) {
        this.inner_html = container.toLowerCase();
        switch(this.inner_html) {
        case 'title':
        case 'textarea':
            this.tokenizer.content_model = HTML5.Models.RCDATA;
            break;
        case 'script':
            this.tokenizer.content_model = HTML5.Models.SCRIPT_CDATA;
            break;
        case 'style':
        case 'xmp':
        case 'iframe':
        case 'noembed':
        case 'noframes':
        case 'noscript':
            this.tokenizer.content_model = HTML5.Models.CDATA;
            break;
        case 'plaintext':
            this.tokenizer.content_model = HTML5.Models.PLAINTEXT;
            break;
        default:
            this.tokenizer.content_model = HTML5.Models.PCDATA;
        }
        this.tree.create_structure_elements(inner_html);
        this.tree.open_elements.push(this.tree.root_pointer = this.tree.html_pointer);
        this.reset_insertion_mode();
    } else {
        this.inner_html = false;
        this.newPhase('initial');
    }

    this.last_phase = null;

};

Parser.prototype.parse_error = function(code, data, isWarning) {
    this.errors.push([this.tokenizer.position, code, data ,isWarning]);
    if (this.strict) throw(this.errors.last());
};

Parser.prototype.reset_insertion_mode = function() {

    var last = false;
    var node_name, new_phase;
    
    for(var i = this.tree.open_elements.length - 1; i >= 0; i--) {
        var node = this.tree.open_elements[i];
        node_name = node.tagName.toLowerCase();
        new_phase = null;
        if (node == this.tree.open_elements[0]) {
            assert.ok(this.inner_html);
            last = true;
            node_name = this.inner_html;
        }

        if ((node_name == 'select' || node_name == 'colgroup' || node_name == 'head' || node_name == 'html')) {
            assert.ok(this.inner_html)
        }

        if (!last && node.namespace)
            continue;

        if (HTML5.TAGMODES[node_name]) {
            this.newPhase(HTML5.TAGMODES[node_name]);
        } else if (last) {
            this.newPhase('inBody');
        } else {
            continue;
        }

        break;
    }
};

Parser.prototype.parseRCDataRawText = function(contentType, name, attributes) {
    this.tree.insert_element(name, attributes);
    if (contentType == "RAWTEXT") {
        this.tokenizer.content_model = HTML5.Models.CDATA;
    } else {
        this.tokenizer.content_model = HTML5.Models.RCDATA;
    }
    this.original_phase = this.phaseName;
    this.newPhase('text');
}

Parser.prototype.is_html_integration_point = function(element) {
    if (element.namespace in HTML5.HTML_INTEGRATION_POINT_ELEMENTS &&
        HTML5.HTML_INTEGRATION_POINT_ELEMENTS[element.namespace].indexOf(element.tagName.toLowerCase()) > -1) {
        return element.tagName.toLowerCase() != 'annotation-xml' || (['text/html', 'application/xhtml+xml'].indexOf((element.getAttribute('encoding') || '').toLowerCase()) > -1);
    }
    return false;
};

Parser.prototype.is_mathml_text_integration_point = function(element) {
    if (element.namespace in HTML5.MATHML_TEXT_INTEGRATION_POINT_ELEMENTS &&
        HTML5.MATHML_TEXT_INTEGRATION_POINT_ELEMENTS[element.namespace].indexOf(element.tagName.toLowerCase()) > -1) {
        return true;
    }
    return false;
};

})()
},{"../html5":"VxNTWn","./saxtreebuilder":7,"./tokenizer":11,"assert":14,"events":15,"util":16}],7:[function(require,module,exports){
var HTML5 = require('../html5');
var util = require('util');
var TreeBuilder = require('./treebuilder').TreeBuilder;

var SAXTreeBuilder = exports.SAXTreeBuilder = HTML5.SAXTreeBuilder = function() {
    TreeBuilder.call(this);
};

util.inherits(SAXTreeBuilder, TreeBuilder);

SAXTreeBuilder.prototype.createDoctype = function(name, publicId, systemId) {
    var doctype = new DTD(name, publicId, systemId);
    return doctype;
};

SAXTreeBuilder.prototype.createDocument = function() {
    var document = new Document();
    return document;
};

SAXTreeBuilder.prototype.createFragment = function() {
    var fragment = new DocumentFragment();
    return fragment;
};

SAXTreeBuilder.prototype.createComment = function(data) {
    var comment = new Comment(data);
    return comment;
};

SAXTreeBuilder.prototype.createText = function(data) {
    var text = new Characters(data);
    return text;
};

SAXTreeBuilder.prototype.createElement = function (name, attributes, namespace) {
    var element = new Element(namespace, name, name, attributes);
    return element;
};

var NodeType = {
    CDATA: 1,
    CHARACTERS: 2,
    COMMENT: 3,
    DOCUMENT: 4,
    DOCUMENT_FRAGMENT: 5,
    DTD: 6,
    ELEMENT: 7,
    ENTITY: 8,
    IGNORABLE_WHITESPACE: 9,
    PROCESSING_INSTRUCTION: 10,
    SKIPPED_ENTITY: 11
};
function Node() {
    this.parentNode = null;
    this.nextSibling = null;
    Object.defineProperty(this, 'previousSibling', {
        get: function() {
            var prev = null;
            var next = this.parentNode.firstChild;
            for(;;) {
                if (this == next) {
                    return prev;
                }
                prev = next;
                next = next.nextSibling;
            }
        }
    });
};
Node.prototype.visit = function(treeParser) {};
Node.prototype.revisit = function(treeParser) {
    return;
};
Node.prototype.detach = function() {
    if (this.parentNode != null) {
        this.parentNode.removeChild(this);
        this.parentNode = null;
    }
};

function ParentNode() {
    Node.call(this);
};

ParentNode.prototype = Object.create(Node.prototype);
ParentNode.prototype.insertBefore = function(child, sibling) {
    if (sibling == null) {
        return this.appendChild(child);
    }
    child.detach();
    child.parentNode = this;
    if (this.firstChild == sibling) {
        child.nextSibling = sibling;
        this.firstChild = child;
    } else {
        var prev = this.firstChild;
        var next = this.firstChild.nextSibling;
        while (next != sibling) {
            prev = next;
            next = next.nextSibling;
        }
        prev.nextSibling = child;
        child.nextSibling = next;
    }
    return child;
};
ParentNode.prototype.appendChild = function(child) {
    child.detach();
    child.parentNode = this;
    if (this.firstChild == null) {
        this.firstChild = child;
    } else {
        this.lastChild.nextSibling = child;
    }
    this.lastChild = child;
    return child;
}
ParentNode.prototype.removeChild = function(node) {
    if (this.firstChild == node) {
        this.firstChild = node.nextSibling;
        if (this.lastChild == node) {
            this.lastChild = null;
        }
    } else {
        var prev = this.firstChild;
        var next = this.firstChild.nextSibling;
        while (next != node) {
            prev = next;
            next = next.nextSibling;
        }
        prev.nextSibling = node.nextSibling;
        if (this.lastChild == node) {
            this.lastChild = prev;
        }
    }
    node.parentNode = null;
    return node;
}

ParentNode.prototype.hasChildNodes = function() {
    return this.firstChild != null;
}
function Document () {
    Node.call(this);
    this.nodeType = NodeType.DOCUMENT;
}

Document.prototype = Object.create(ParentNode.prototype);
Document.prototype.visit = function(treeParser) {
    treeParser.startDocument(this);
};
Document.prototype.revisit = function(treeParser) {
    treeParser.endDocument();
}
function DocumentFragment() {
    Node.call(this);
    this.nodeType = NodeType.DOCUMENT_FRAGMENT;
}

DocumentFragment.prototype = Object.create(ParentNode.prototype);
DocumentFragment.prototype.visit = function(treeParser) {
}
function Element(uri, localName, qName, atts, prefixMappings) {
    ParentNode.call(this);

    this.uri = this.namespace = uri;
    this.localName = localName;
    this.tagName = qName;
    this.attributes = atts;
    this.prefixMappings = prefixMappings;
    this.nodeType = NodeType.ELEMENT;
}

Element.prototype = Object.create(ParentNode.prototype);
Element.prototype.visit = function(treeParser) {
    if (this.prefixMappings != null) {
        for (var key in prefixMappings) {
            var mapping = prefixMappings[key];
            treeParser.startPrefixMapping(mapping.getPrefix(),
                    mapping.getUri(), this);
        }
    }
    treeParser.startElement(this.uri, this.localName, this.tagName, this.attributes, this);
}
Element.prototype.revisit = function(treeParser) {
    treeParser.endElement(this.uri, this.localName, this.tagName);
    if (this.prefixMappings != null) {
        for (var key in prefixMappings) {
            var mapping = prefixMappings[key];
            treeParser.endPrefixMapping(mapping.getPrefix());
        }
    }
}

Element.prototype.getAttribute = function(name) {
    for (var key in this.attributes) {
        if (this.attributes[key].nodeName == name)
            return this.attributes[key].nodeValue;
    }
}

Element.prototype.setAttribute = function() {

}

Element.prototype.cloneNode = function() {
    var clone = new Element(this.uri, this.localName, this.tagName,
                            this.attributes, this.prefixMappings);
    for (var key in this.attributes) {
        clone.attributes[key] = this.attributes[key];
    }
    return clone;
}
function Characters(data){
    Node.call(this);
    this.data = data;
    this.nodeType = NodeType.CHARACTERS;
}

Characters.prototype = Object.create(Node.prototype);
Characters.prototype.visit = function (treeParser) {
    treeParser.characters(this.data, 0, this.data.length, this);
}
function IgnorableWhitespace(data) {
    Node.call(this);
    this.data = data;
    this.nodeType = NodeType.IGNORABLE_WHITESPACE;
};

IgnorableWhitespace.prototype = Object.create(Node.prototype);
IgnorableWhitespace.prototype.visit = function(treeParser) {
    treeParser.ignorableWhitespace(this.data, 0, this.data.length, this);
}
function Comment(data) {
    Node.call(this);
    this.data = data;
    this.nodeType = NodeType.COMMENT;
}

Comment.prototype = Object.create(Node.prototype);
Comment.prototype.visit = function(treeParser) {
    treeParser.comment(this.data, 0, this.data.length, this);
}
function CDATA() {
    ParentNode.call(this);
    this.nodeType = NodeType.CDATA;
}

CDATA.prototype = Object.create(ParentNode.prototype);
CDATA.prototype.visit = function(treeParser) {
    treeParser.startCDATA(this);
}
CDATA.prototype.revisit = function(treeParser) {
    treeParser.endCDATA();
}
function Entity(name) {
    ParentNode.call(this);
    this.name = name;
    this.nodeType = NodeType.ENTITY;
}

Entity.prototype = Object.create(ParentNode.prototype);
Entity.prototype.visit = function(treeParser) {
    treeParser.startEntity(this.name, this);
}
Entity.prototype.revisit = function(treeParser) {
    treeParser.endEntity(this.name);
}

function SkippedEntity(name) {
    Node.call(this);
    this.name = name;
    this.nodeType = NodeType.SKIPPED_ENTITY;
}

SkippedEntity.prototype = Object.create(Node.prototype);
SkippedEntity.prototype.visit = function(treeParser) {
    treeParser.skippedEntity(this.name, this);
}
function ProcessingInstruction(target, data) {
    Node.call(this);
    this.target = target;
    this.data = data;
}

ProcessingInstruction.prototype = Object.create(Node.prototype);
ProcessingInstruction.prototype.visit = function(treeParser) {
    treeParser.processingInstruction(this.target, this.data, this);
}
ProcessingInstruction.prototype.getNodeType = function() {
    return NodeType.PROCESSING_INSTRUCTION;
}
function DTD(name, publicIdentifier, systemIdentifier) {
    ParentNode.call(this);
    this.name = name;
    this.publicIdentifier = publicIdentifier;
    this.systemIdentifier = systemIdentifier;
    this.nodeType = NodeType.DTD;
}

DTD.prototype = Object.create(ParentNode.prototype);
DTD.prototype.visit = function(treeParser) {
    treeParser.startDTD(this.name, this.publicIdentifier, this.systemIdentifier, this);
}
DTD.prototype.revisit = function(treeParser) {
    treeParser.endDTD();
}
function NullLexicalHandler() {

};

NullLexicalHandler.prototype.comment = function() {};
NullLexicalHandler.prototype.endCDATA = function() {};
NullLexicalHandler.prototype.endDTD = function() {};
NullLexicalHandler.prototype.endEntity = function() {};
NullLexicalHandler.prototype.startCDATA = function() {};
NullLexicalHandler.prototype.startDTD = function() {};
NullLexicalHandler.prototype.startEntity = function() {};
function TreeParser(contentHandler, lexicalHandler){
    this.contentHandler;
    this.lexicalHandler;
    this.locatorDelegate;

    if (contentHandler == null) {
        throw new IllegalArgumentException("contentHandler was null.");
    }
    this.contentHandler = contentHandler;
    if (lexicalHandler == null) {
        this.lexicalHandler = new NullLexicalHandler();
    } else {
        this.lexicalHandler = lexicalHandler;
    }
}
TreeParser.prototype.parse = function(node) {
    var current = node;
    var next;
    for (;;) {
        current.visit(this);
        if ((next = current.firstChild) != null) {
            current = next;
            continue;
        }
        for (;;) {
            current.revisit(this);
            if (current == node) {
                return;
            }
            if ((next = current.nextSibling) != null) {
                current = next;
                break;
            }
            current = current.parentNode;
        }
    }
}
TreeParser.prototype.characters = function(ch, start, length, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.characters(ch, start, length);
}
TreeParser.prototype.endDocument = function(locator) {
    this.locatorDelegate = locator;
    this.contentHandler.endDocument();
}
TreeParser.prototype.endElement = function(uri, localName, qName, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.endElement(uri, localName, qName);
}
TreeParser.prototype.endPrefixMapping = function(prefix, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.endPrefixMapping(prefix);
}
TreeParser.prototype.ignorableWhitespace = function(ch, start, length, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.ignorableWhitespace(ch, start, length);
}
TreeParser.prototype.processingInstruction = function(target, data, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.processingInstruction(target, data);
}
TreeParser.prototype.skippedEntity = function(name, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.skippedEntity(name);
}
TreeParser.prototype.startDocument = function(locator) {
    this.locatorDelegate = locator;
    this.contentHandler.startDocument();
}
TreeParser.prototype.startElement = function(uri, localName, qName, atts, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.startElement(uri, localName, qName, atts);
}
TreeParser.prototype.startPrefixMapping = function(prefix, uri, locator) {
    this.locatorDelegate = locator;
    this.contentHandler.startPrefixMapping(prefix, uri);
}
TreeParser.prototype.comment = function(ch, start, length, locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.comment(ch, start, length);
}
TreeParser.prototype.endCDATA = function(locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.endCDATA();
}
TreeParser.prototype.endDTD = function(locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.endDTD();
}
TreeParser.prototype.endEntity = function(name, locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.endEntity(name);
}
TreeParser.prototype.startCDATA = function(locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.startCDATA();
}
TreeParser.prototype.startDTD = function(name, publicId, systemId, locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.startDTD(name, publicId, systemId);
}
TreeParser.prototype.startEntity = function(name, locator) {
    this.locatorDelegate = locator;
    this.lexicalHandler.startEntity(name);
}
},{"../html5":"VxNTWn","./treebuilder":12,"util":16}],8:[function(require,module,exports){
var HTML5 = require('../html5');
var events = require('events');

function hescape(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

var default_opts = {
    lowercase: true,
    minimize_boolean_attributes: true,
    quote_attr_values: true,
    use_best_quote_char: true,
    use_trailing_solidus: true,
    escape_lt_in_attrs: true,
    space_before_trailing_solidus: true
}

HTML5.serialize = function(src, target, override) {
    var options;
    if(!override) {
        options = default_opts
    } else {
        options = {}
        var k;
        for(k in default_opts) options[k] = default_opts[k]
        for(k in override) options[k] = override[k]
    }
    var dest;
    if(target instanceof Function) {
        dest = new events.EventEmitter();
        dest.addListener('data', target);
    } else if(!target) {
        dest = new events.EventEmitter();
        var ret = '';
        dest.addListener('data', function(d) {
            ret += d;
        });
    } else {
        dest = target;
    }
    var strict = false;
    var errors = [];

    function serialize_error(data) {
        errors.push(data);
        if(strict) throw(data);
    }
        
    var in_cdata = false;
    var doctype;
    var escape_rcdata = false;
    var w = new HTML5.TreeWalker(src, function(tok) {
        if(tok.type == "Doctype") {
            doctype = "<!DOCTYPE " + tok.name;
            if (token.publicId)
                doctype += ' PUBLIC "' + token.publicId + '"';
            else if (token.systemId)
                doctype += " SYSTEM";
            if (token.systemId) {
                if (token.systemId.search('"') >= 0) {
                    if (token.systemId.search("'") >= 0)
                        serialize_error("System identifer contains both single and double quote characters");
                    var quote_char = "'";
                } else {
                    var quote_char = '"';
                }
                doctype += " " + quote_char + token.systemId + quote_char;
            }
            doctype += ">";
            dest.emit('data', doctype);
        } else if(tok.type == 'Characters' || tok.type == 'SpaceCharacters') {
            if(in_cdata || tok.type == 'SpaceCharacters') {
                if(in_cdata && tok.data.indexOf("</") != -1) {
                    serialize_error("Unexpected </ in CDATA")
                }
                dest.emit('data', tok.data);
            } else {
                if(tok.data) dest.emit('data', hescape(tok.data));
            }
        } else if(tok.type == "StartTag" || tok.type == 'EmptyTag') {
            if(HTML5.RCDATA_ELEMENTS.indexOf(tok.name.toLowerCase()) != -1 && !escape_rcdata) {
                in_cdata = true;
            } else if (in_cdata) {
                serialize_error("Unexpected child element of a CDATA element");
            }
            var attributes = "";
            var attrs= [];
            for(var ki = 0; ki < tok.data.length; ki++) {
                attrs.push(tok.data.item(ki));
            }
            attrs = attrs.sort();
            for(var ki in attrs) {
                var quote_attr = false;
                var v = tok.data.getNamedItem(attrs[ki].nodeName).nodeValue;
                attributes += " "+attrs[ki].nodeName;
                if(!options.minimize_boolean_attributes || ((HTML5.BOOLEAN_ATTRIBUTES[tok.name] || []).indexOf(ki) == -1 && (HTML5.BOOLEAN_ATTRIBUTES["_global"].indexOf(ki) == -1))) {
                    attributes += "=";
                    if(options.quote_attr_values || v.length == 0) {
                        quote_attr = true;
                    } else {
                        quote_attr = new RegExp("[" + HTML5.SPACE_CHARACTERS_IN + "<=>'\"" + "]").test(v)
                    }

                    v = v.replace(/&/g, '&amp;');
                    if(options.escape_lt_in_attrs) v = v.replace(/</g, '&lt;');
                    if(quote_attr) {
                        var the_quote_char = '"';
                        if(options.use_best_quote_char) {
                            if(v.indexOf("'") != -1 && v.indexOf('"') == -1) {
                                the_quote_char = '"';
                            } else if(v.indexOf('"') != -1 && v.indexOf("'") == -1) {
                                the_quote_char = "'"
                            }
                        }
                        if(the_quote_char == '"') {
                            v = v.replace(/"/g, '&quot;');
                        } else {
                            v = v.replace(/'/g, '&#39;');
                        }
                        attributes += the_quote_char + v + the_quote_char;
                    } else {
                        attributes += v;
                    }
                }
            }

            if(HTML5.VOID_ELEMENTS.indexOf(tok.name.toLowerCase()) != -1 && options.use_trailing_solidus) {
                if(options.space_before_trailing_solidus) {
                    attributes += " /";
                } else {
                    attributes += "/";
                }
            }

            if(options.lowercase) tok.name = tok.name.toLowerCase()

            dest.emit('data', "<" + tok.name + attributes + ">");

        } else if(tok.type == 'EndTag') {
            if(HTML5.RCDATA_ELEMENTS.indexOf(tok.name.toLowerCase()) != -1) {
                in_cdata = false;
            } else if(in_cdata) {
                serialize_error("Unexpected child element of a CDATA element");
            }
    
            if(options.lowercase) tok.name = tok.name.toLowerCase()
            dest.emit('data', '</' + tok.name + '>');
        } else if(tok.type == 'Comment') {
            if(tok.data.match(/--/)) serialize_error("Comment contains --");
            dest.emit('data', '<!--' + tok.data + '-->');
        } else {
            serialize_error(tok.data);
        }
    });

    dest.emit('end')

    if(ret) return ret;
}

},{"../html5":"VxNTWn","events":15}],9:[function(require,module,exports){
module.exports = {
    "AElig": "\u00C6",
    "AElig;": "\u00C6",
    "AMP": "&",
    "AMP;": "&",
    "Aacute": "\u00C1",
    "Aacute;": "\u00C1",
    "Abreve;": "\u0102",
    "Acirc": "\u00C2",
    "Acirc;": "\u00C2",
    "Acy;": "\u0410",
    "Afr;": "\u1D504",
    "Agrave": "\u00C0",
    "Agrave;": "\u00C0",
    "Alpha;": "\u0391",
    "Amacr;": "\u0100",
    "And;": "\u2A53",
    "Aogon;": "\u0104",
    "Aopf;": "\u1D538",
    "ApplyFunction;": "\u2061",
    "Aring": "\u00C5",
    "Aring;": "\u00C5",
    "Ascr;": "\u1D49C",
    "Assign;": "\u2254",
    "Atilde": "\u00C3",
    "Atilde;": "\u00C3",
    "Auml": "\u00C4",
    "Auml;": "\u00C4",
    "Backslash;": "\u2216",
    "Barv;": "\u2AE7",
    "Barwed;": "\u2306",
    "Bcy;": "\u0411",
    "Because;": "\u2235",
    "Bernoullis;": "\u212C",
    "Beta;": "\u0392",
    "Bfr;": "\u1D505",
    "Bopf;": "\u1D539",
    "Breve;": "\u02D8",
    "Bscr;": "\u212C",
    "Bumpeq;": "\u224E",
    "CHcy;": "\u0427",
    "COPY": "\u00A9",
    "COPY;": "\u00A9",
    "Cacute;": "\u0106",
    "Cap;": "\u22D2",
    "CapitalDifferentialD;": "\u2145",
    "Cayleys;": "\u212D",
    "Ccaron;": "\u010C",
    "Ccedil": "\u00C7",
    "Ccedil;": "\u00C7",
    "Ccirc;": "\u0108",
    "Cconint;": "\u2230",
    "Cdot;": "\u010A",
    "Cedilla;": "\u00B8",
    "CenterDot;": "\u00B7",
    "Cfr;": "\u212D",
    "Chi;": "\u03A7",
    "CircleDot;": "\u2299",
    "CircleMinus;": "\u2296",
    "CirclePlus;": "\u2295",
    "CircleTimes;": "\u2297",
    "ClockwiseContourIntegral;": "\u2232",
    "CloseCurlyDoubleQuote;": "\u201D",
    "CloseCurlyQuote;": "\u2019",
    "Colon;": "\u2237",
    "Colone;": "\u2A74",
    "Congruent;": "\u2261",
    "Conint;": "\u222F",
    "ContourIntegral;": "\u222E",
    "Copf;": "\u2102",
    "Coproduct;": "\u2210",
    "CounterClockwiseContourIntegral;": "\u2233",
    "Cross;": "\u2A2F",
    "Cscr;": "\u1D49E",
    "Cup;": "\u22D3",
    "CupCap;": "\u224D",
    "DD;": "\u2145",
    "DDotrahd;": "\u2911",
    "DJcy;": "\u0402",
    "DScy;": "\u0405",
    "DZcy;": "\u040F",
    "Dagger;": "\u2021",
    "Darr;": "\u21A1",
    "Dashv;": "\u2AE4",
    "Dcaron;": "\u010E",
    "Dcy;": "\u0414",
    "Del;": "\u2207",
    "Delta;": "\u0394",
    "Dfr;": "\u1D507",
    "DiacriticalAcute;": "\u00B4",
    "DiacriticalDot;": "\u02D9",
    "DiacriticalDoubleAcute;": "\u02DD",
    "DiacriticalGrave;": "`",
    "DiacriticalTilde;": "\u02DC",
    "Diamond;": "\u22C4",
    "DifferentialD;": "\u2146",
    "Dopf;": "\u1D53B",
    "Dot;": "\u00A8",
    "DotDot;": "\u20DC",
    "DotEqual;": "\u2250",
    "DoubleContourIntegral;": "\u222F",
    "DoubleDot;": "\u00A8",
    "DoubleDownArrow;": "\u21D3",
    "DoubleLeftArrow;": "\u21D0",
    "DoubleLeftRightArrow;": "\u21D4",
    "DoubleLeftTee;": "\u2AE4",
    "DoubleLongLeftArrow;": "\u27F8",
    "DoubleLongLeftRightArrow;": "\u27FA",
    "DoubleLongRightArrow;": "\u27F9",
    "DoubleRightArrow;": "\u21D2",
    "DoubleRightTee;": "\u22A8",
    "DoubleUpArrow;": "\u21D1",
    "DoubleUpDownArrow;": "\u21D5",
    "DoubleVerticalBar;": "\u2225",
    "DownArrow;": "\u2193",
    "DownArrowBar;": "\u2913",
    "DownArrowUpArrow;": "\u21F5",
    "DownBreve;": "\u0311",
    "DownLeftRightVector;": "\u2950",
    "DownLeftTeeVector;": "\u295E",
    "DownLeftVector;": "\u21BD",
    "DownLeftVectorBar;": "\u2956",
    "DownRightTeeVector;": "\u295F",
    "DownRightVector;": "\u21C1",
    "DownRightVectorBar;": "\u2957",
    "DownTee;": "\u22A4",
    "DownTeeArrow;": "\u21A7",
    "Downarrow;": "\u21D3",
    "Dscr;": "\u1D49F",
    "Dstrok;": "\u0110",
    "ENG;": "\u014A",
    "ETH": "\u00D0",
    "ETH;": "\u00D0",
    "Eacute": "\u00C9",
    "Eacute;": "\u00C9",
    "Ecaron;": "\u011A",
    "Ecirc": "\u00CA",
    "Ecirc;": "\u00CA",
    "Ecy;": "\u042D",
    "Edot;": "\u0116",
    "Efr;": "\u1D508",
    "Egrave": "\u00C8",
    "Egrave;": "\u00C8",
    "Element;": "\u2208",
    "Emacr;": "\u0112",
    "EmptySmallSquare;": "\u25FB",
    "EmptyVerySmallSquare;": "\u25AB",
    "Eogon;": "\u0118",
    "Eopf;": "\u1D53C",
    "Epsilon;": "\u0395",
    "Equal;": "\u2A75",
    "EqualTilde;": "\u2242",
    "Equilibrium;": "\u21CC",
    "Escr;": "\u2130",
    "Esim;": "\u2A73",
    "Eta;": "\u0397",
    "Euml": "\u00CB",
    "Euml;": "\u00CB",
    "Exists;": "\u2203",
    "ExponentialE;": "\u2147",
    "Fcy;": "\u0424",
    "Ffr;": "\u1D509",
    "FilledSmallSquare;": "\u25FC",
    "FilledVerySmallSquare;": "\u25AA",
    "Fopf;": "\u1D53D",
    "ForAll;": "\u2200",
    "Fouriertrf;": "\u2131",
    "Fscr;": "\u2131",
    "GJcy;": "\u0403",
    "GT": ">",
    "GT;": ">",
    "Gamma;": "\u0393",
    "Gammad;": "\u03DC",
    "Gbreve;": "\u011E",
    "Gcedil;": "\u0122",
    "Gcirc;": "\u011C",
    "Gcy;": "\u0413",
    "Gdot;": "\u0120",
    "Gfr;": "\u1D50A",
    "Gg;": "\u22D9",
    "Gopf;": "\u1D53E",
    "GreaterEqual;": "\u2265",
    "GreaterEqualLess;": "\u22DB",
    "GreaterFullEqual;": "\u2267",
    "GreaterGreater;": "\u2AA2",
    "GreaterLess;": "\u2277",
    "GreaterSlantEqual;": "\u2A7E",
    "GreaterTilde;": "\u2273",
    "Gscr;": "\u1D4A2",
    "Gt;": "\u226B",
    "HARDcy;": "\u042A",
    "Hacek;": "\u02C7",
    "Hat;": "^",
    "Hcirc;": "\u0124",
    "Hfr;": "\u210C",
    "HilbertSpace;": "\u210B",
    "Hopf;": "\u210D",
    "HorizontalLine;": "\u2500",
    "Hscr;": "\u210B",
    "Hstrok;": "\u0126",
    "HumpDownHump;": "\u224E",
    "HumpEqual;": "\u224F",
    "IEcy;": "\u0415",
    "IJlig;": "\u0132",
    "IOcy;": "\u0401",
    "Iacute": "\u00CD",
    "Iacute;": "\u00CD",
    "Icirc": "\u00CE",
    "Icirc;": "\u00CE",
    "Icy;": "\u0418",
    "Idot;": "\u0130",
    "Ifr;": "\u2111",
    "Igrave": "\u00CC",
    "Igrave;": "\u00CC",
    "Im;": "\u2111",
    "Imacr;": "\u012A",
    "ImaginaryI;": "\u2148",
    "Implies;": "\u21D2",
    "Int;": "\u222C",
    "Integral;": "\u222B",
    "Intersection;": "\u22C2",
    "InvisibleComma;": "\u2063",
    "InvisibleTimes;": "\u2062",
    "Iogon;": "\u012E",
    "Iopf;": "\u1D540",
    "Iota;": "\u0399",
    "Iscr;": "\u2110",
    "Itilde;": "\u0128",
    "Iukcy;": "\u0406",
    "Iuml": "\u00CF",
    "Iuml;": "\u00CF",
    "Jcirc;": "\u0134",
    "Jcy;": "\u0419",
    "Jfr;": "\u1D50D",
    "Jopf;": "\u1D541",
    "Jscr;": "\u1D4A5",
    "Jsercy;": "\u0408",
    "Jukcy;": "\u0404",
    "KHcy;": "\u0425",
    "KJcy;": "\u040C",
    "Kappa;": "\u039A",
    "Kcedil;": "\u0136",
    "Kcy;": "\u041A",
    "Kfr;": "\u1D50E",
    "Kopf;": "\u1D542",
    "Kscr;": "\u1D4A6",
    "LJcy;": "\u0409",
    "LT": "<",
    "LT;": "<",
    "Lacute;": "\u0139",
    "Lambda;": "\u039B",
    "Lang;": "\u27EA",
    "Laplacetrf;": "\u2112",
    "Larr;": "\u219E",
    "Lcaron;": "\u013D",
    "Lcedil;": "\u013B",
    "Lcy;": "\u041B",
    "LeftAngleBracket;": "\u27E8",
    "LeftArrow;": "\u2190",
    "LeftArrowBar;": "\u21E4",
    "LeftArrowRightArrow;": "\u21C6",
    "LeftCeiling;": "\u2308",
    "LeftDoubleBracket;": "\u27E6",
    "LeftDownTeeVector;": "\u2961",
    "LeftDownVector;": "\u21C3",
    "LeftDownVectorBar;": "\u2959",
    "LeftFloor;": "\u230A",
    "LeftRightArrow;": "\u2194",
    "LeftRightVector;": "\u294E",
    "LeftTee;": "\u22A3",
    "LeftTeeArrow;": "\u21A4",
    "LeftTeeVector;": "\u295A",
    "LeftTriangle;": "\u22B2",
    "LeftTriangleBar;": "\u29CF",
    "LeftTriangleEqual;": "\u22B4",
    "LeftUpDownVector;": "\u2951",
    "LeftUpTeeVector;": "\u2960",
    "LeftUpVector;": "\u21BF",
    "LeftUpVectorBar;": "\u2958",
    "LeftVector;": "\u21BC",
    "LeftVectorBar;": "\u2952",
    "Leftarrow;": "\u21D0",
    "Leftrightarrow;": "\u21D4",
    "LessEqualGreater;": "\u22DA",
    "LessFullEqual;": "\u2266",
    "LessGreater;": "\u2276",
    "LessLess;": "\u2AA1",
    "LessSlantEqual;": "\u2A7D",
    "LessTilde;": "\u2272",
    "Lfr;": "\u1D50F",
    "Ll;": "\u22D8",
    "Lleftarrow;": "\u21DA",
    "Lmidot;": "\u013F",
    "LongLeftArrow;": "\u27F5",
    "LongLeftRightArrow;": "\u27F7",
    "LongRightArrow;": "\u27F6",
    "Longleftarrow;": "\u27F8",
    "Longleftrightarrow;": "\u27FA",
    "Longrightarrow;": "\u27F9",
    "Lopf;": "\u1D543",
    "LowerLeftArrow;": "\u2199",
    "LowerRightArrow;": "\u2198",
    "Lscr;": "\u2112",
    "Lsh;": "\u21B0",
    "Lstrok;": "\u0141",
    "Lt;": "\u226A",
    "Map;": "\u2905",
    "Mcy;": "\u041C",
    "MediumSpace;": "\u205F",
    "Mellintrf;": "\u2133",
    "Mfr;": "\u1D510",
    "MinusPlus;": "\u2213",
    "Mopf;": "\u1D544",
    "Mscr;": "\u2133",
    "Mu;": "\u039C",
    "NJcy;": "\u040A",
    "Nacute;": "\u0143",
    "Ncaron;": "\u0147",
    "Ncedil;": "\u0145",
    "Ncy;": "\u041D",
    "NegativeMediumSpace;": "\u200B",
    "NegativeThickSpace;": "\u200B",
    "NegativeThinSpace;": "\u200B",
    "NegativeVeryThinSpace;": "\u200B",
    "NestedGreaterGreater;": "\u226B",
    "NestedLessLess;": "\u226A",
    "NewLine;": "\u000A",
    "Nfr;": "\u1D511",
    "NoBreak;": "\u2060",
    "NonBreakingSpace;": "\u00A0",
    "Nopf;": "\u2115",
    "Not;": "\u2AEC",
    "NotCongruent;": "\u2262",
    "NotCupCap;": "\u226D",
    "NotDoubleVerticalBar;": "\u2226",
    "NotElement;": "\u2209",
    "NotEqual;": "\u2260",
    "NotEqualTilde;": "\u2242\u0338",
    "NotExists;": "\u2204",
    "NotGreater;": "\u226F",
    "NotGreaterEqual;": "\u2271",
    "NotGreaterFullEqual;": "\u2267\u0338",
    "NotGreaterGreater;": "\u226B\u0338",
    "NotGreaterLess;": "\u2279",
    "NotGreaterSlantEqual;": "\u2A7E\u0338",
    "NotGreaterTilde;": "\u2275",
    "NotHumpDownHump;": "\u224E\u0338",
    "NotHumpEqual;": "\u224F\u0338",
    "NotLeftTriangle;": "\u22EA",
    "NotLeftTriangleBar;": "\u29CF\u0338",
    "NotLeftTriangleEqual;": "\u22EC",
    "NotLess;": "\u226E",
    "NotLessEqual;": "\u2270",
    "NotLessGreater;": "\u2278",
    "NotLessLess;": "\u226A\u0338",
    "NotLessSlantEqual;": "\u2A7D\u0338",
    "NotLessTilde;": "\u2274",
    "NotNestedGreaterGreater;": "\u2AA2\u0338",
    "NotNestedLessLess;": "\u2AA1\u0338",
    "NotPrecedes;": "\u2280",
    "NotPrecedesEqual;": "\u2AAF\u0338",
    "NotPrecedesSlantEqual;": "\u22E0",
    "NotReverseElement;": "\u220C",
    "NotRightTriangle;": "\u22EB",
    "NotRightTriangleBar;": "\u29D0\u0338",
    "NotRightTriangleEqual;": "\u22ED",
    "NotSquareSubset;": "\u228F\u0338",
    "NotSquareSubsetEqual;": "\u22E2",
    "NotSquareSuperset;": "\u2290\u0338",
    "NotSquareSupersetEqual;": "\u22E3",
    "NotSubset;": "\u2282\u20D2",
    "NotSubsetEqual;": "\u2288",
    "NotSucceeds;": "\u2281",
    "NotSucceedsEqual;": "\u2AB0\u0338",
    "NotSucceedsSlantEqual;": "\u22E1",
    "NotSucceedsTilde;": "\u227F\u0338",
    "NotSuperset;": "\u2283\u20D2",
    "NotSupersetEqual;": "\u2289",
    "NotTilde;": "\u2241",
    "NotTildeEqual;": "\u2244",
    "NotTildeFullEqual;": "\u2247",
    "NotTildeTilde;": "\u2249",
    "NotVerticalBar;": "\u2224",
    "Nscr;": "\u1D4A9",
    "Ntilde": "\u00D1",
    "Ntilde;": "\u00D1",
    "Nu;": "\u039D",
    "OElig;": "\u0152",
    "Oacute": "\u00D3",
    "Oacute;": "\u00D3",
    "Ocirc": "\u00D4",
    "Ocirc;": "\u00D4",
    "Ocy;": "\u041E",
    "Odblac;": "\u0150",
    "Ofr;": "\u1D512",
    "Ograve": "\u00D2",
    "Ograve;": "\u00D2",
    "Omacr;": "\u014C",
    "Omega;": "\u03A9",
    "Omicron;": "\u039F",
    "Oopf;": "\u1D546",
    "OpenCurlyDoubleQuote;": "\u201C",
    "OpenCurlyQuote;": "\u2018",
    "Or;": "\u2A54",
    "Oscr;": "\u1D4AA",
    "Oslash": "\u00D8",
    "Oslash;": "\u00D8",
    "Otilde": "\u00D5",
    "Otilde;": "\u00D5",
    "Otimes;": "\u2A37",
    "Ouml": "\u00D6",
    "Ouml;": "\u00D6",
    "OverBar;": "\u203E",
    "OverBrace;": "\u23DE",
    "OverBracket;": "\u23B4",
    "OverParenthesis;": "\u23DC",
    "PartialD;": "\u2202",
    "Pcy;": "\u041F",
    "Pfr;": "\u1D513",
    "Phi;": "\u03A6",
    "Pi;": "\u03A0",
    "PlusMinus;": "\u00B1",
    "Poincareplane;": "\u210C",
    "Popf;": "\u2119",
    "Pr;": "\u2ABB",
    "Precedes;": "\u227A",
    "PrecedesEqual;": "\u2AAF",
    "PrecedesSlantEqual;": "\u227C",
    "PrecedesTilde;": "\u227E",
    "Prime;": "\u2033",
    "Product;": "\u220F",
    "Proportion;": "\u2237",
    "Proportional;": "\u221D",
    "Pscr;": "\u1D4AB",
    "Psi;": "\u03A8",
    "QUOT": "\u0022",
    "QUOT;": "\u0022",
    "Qfr;": "\u1D514",
    "Qopf;": "\u211A",
    "Qscr;": "\u1D4AC",
    "RBarr;": "\u2910",
    "REG": "\u00AE",
    "REG;": "\u00AE",
    "Racute;": "\u0154",
    "Rang;": "\u27EB",
    "Rarr;": "\u21A0",
    "Rarrtl;": "\u2916",
    "Rcaron;": "\u0158",
    "Rcedil;": "\u0156",
    "Rcy;": "\u0420",
    "Re;": "\u211C",
    "ReverseElement;": "\u220B",
    "ReverseEquilibrium;": "\u21CB",
    "ReverseUpEquilibrium;": "\u296F",
    "Rfr;": "\u211C",
    "Rho;": "\u03A1",
    "RightAngleBracket;": "\u27E9",
    "RightArrow;": "\u2192",
    "RightArrowBar;": "\u21E5",
    "RightArrowLeftArrow;": "\u21C4",
    "RightCeiling;": "\u2309",
    "RightDoubleBracket;": "\u27E7",
    "RightDownTeeVector;": "\u295D",
    "RightDownVector;": "\u21C2",
    "RightDownVectorBar;": "\u2955",
    "RightFloor;": "\u230B",
    "RightTee;": "\u22A2",
    "RightTeeArrow;": "\u21A6",
    "RightTeeVector;": "\u295B",
    "RightTriangle;": "\u22B3",
    "RightTriangleBar;": "\u29D0",
    "RightTriangleEqual;": "\u22B5",
    "RightUpDownVector;": "\u294F",
    "RightUpTeeVector;": "\u295C",
    "RightUpVector;": "\u21BE",
    "RightUpVectorBar;": "\u2954",
    "RightVector;": "\u21C0",
    "RightVectorBar;": "\u2953",
    "Rightarrow;": "\u21D2",
    "Ropf;": "\u211D",
    "RoundImplies;": "\u2970",
    "Rrightarrow;": "\u21DB",
    "Rscr;": "\u211B",
    "Rsh;": "\u21B1",
    "RuleDelayed;": "\u29F4",
    "SHCHcy;": "\u0429",
    "SHcy;": "\u0428",
    "SOFTcy;": "\u042C",
    "Sacute;": "\u015A",
    "Sc;": "\u2ABC",
    "Scaron;": "\u0160",
    "Scedil;": "\u015E",
    "Scirc;": "\u015C",
    "Scy;": "\u0421",
    "Sfr;": "\u1D516",
    "ShortDownArrow;": "\u2193",
    "ShortLeftArrow;": "\u2190",
    "ShortRightArrow;": "\u2192",
    "ShortUpArrow;": "\u2191",
    "Sigma;": "\u03A3",
    "SmallCircle;": "\u2218",
    "Sopf;": "\u1D54A",
    "Sqrt;": "\u221A",
    "Square;": "\u25A1",
    "SquareIntersection;": "\u2293",
    "SquareSubset;": "\u228F",
    "SquareSubsetEqual;": "\u2291",
    "SquareSuperset;": "\u2290",
    "SquareSupersetEqual;": "\u2292",
    "SquareUnion;": "\u2294",
    "Sscr;": "\u1D4AE",
    "Star;": "\u22C6",
    "Sub;": "\u22D0",
    "Subset;": "\u22D0",
    "SubsetEqual;": "\u2286",
    "Succeeds;": "\u227B",
    "SucceedsEqual;": "\u2AB0",
    "SucceedsSlantEqual;": "\u227D",
    "SucceedsTilde;": "\u227F",
    "SuchThat;": "\u220B",
    "Sum;": "\u2211",
    "Sup;": "\u22D1",
    "Superset;": "\u2283",
    "SupersetEqual;": "\u2287",
    "Supset;": "\u22D1",
    "THORN": "\u00DE",
    "THORN;": "\u00DE",
    "TRADE;": "\u2122",
    "TSHcy;": "\u040B",
    "TScy;": "\u0426",
    "Tab;": "\u0009",
    "Tau;": "\u03A4",
    "Tcaron;": "\u0164",
    "Tcedil;": "\u0162",
    "Tcy;": "\u0422",
    "Tfr;": "\u1D517",
    "Therefore;": "\u2234",
    "Theta;": "\u0398",
    "ThickSpace;": "\u205F\u200A",
    "ThinSpace;": "\u2009",
    "Tilde;": "\u223C",
    "TildeEqual;": "\u2243",
    "TildeFullEqual;": "\u2245",
    "TildeTilde;": "\u2248",
    "Topf;": "\u1D54B",
    "TripleDot;": "\u20DB",
    "Tscr;": "\u1D4AF",
    "Tstrok;": "\u0166",
    "Uacute": "\u00DA",
    "Uacute;": "\u00DA",
    "Uarr;": "\u219F",
    "Uarrocir;": "\u2949",
    "Ubrcy;": "\u040E",
    "Ubreve;": "\u016C",
    "Ucirc": "\u00DB",
    "Ucirc;": "\u00DB",
    "Ucy;": "\u0423",
    "Udblac;": "\u0170",
    "Ufr;": "\u1D518",
    "Ugrave": "\u00D9",
    "Ugrave;": "\u00D9",
    "Umacr;": "\u016A",
    "UnderBar;": "_",
    "UnderBrace;": "\u23DF",
    "UnderBracket;": "\u23B5",
    "UnderParenthesis;": "\u23DD",
    "Union;": "\u22C3",
    "UnionPlus;": "\u228E",
    "Uogon;": "\u0172",
    "Uopf;": "\u1D54C",
    "UpArrow;": "\u2191",
    "UpArrowBar;": "\u2912",
    "UpArrowDownArrow;": "\u21C5",
    "UpDownArrow;": "\u2195",
    "UpEquilibrium;": "\u296E",
    "UpTee;": "\u22A5",
    "UpTeeArrow;": "\u21A5",
    "Uparrow;": "\u21D1",
    "Updownarrow;": "\u21D5",
    "UpperLeftArrow;": "\u2196",
    "UpperRightArrow;": "\u2197",
    "Upsi;": "\u03D2",
    "Upsilon;": "\u03A5",
    "Uring;": "\u016E",
    "Uscr;": "\u1D4B0",
    "Utilde;": "\u0168",
    "Uuml": "\u00DC",
    "Uuml;": "\u00DC",
    "VDash;": "\u22AB",
    "Vbar;": "\u2AEB",
    "Vcy;": "\u0412",
    "Vdash;": "\u22A9",
    "Vdashl;": "\u2AE6",
    "Vee;": "\u22C1",
    "Verbar;": "\u2016",
    "Vert;": "\u2016",
    "VerticalBar;": "\u2223",
    "VerticalLine;": "|",
    "VerticalSeparator;": "\u2758",
    "VerticalTilde;": "\u2240",
    "VeryThinSpace;": "\u200A",
    "Vfr;": "\u1D519",
    "Vopf;": "\u1D54D",
    "Vscr;": "\u1D4B1",
    "Vvdash;": "\u22AA",
    "Wcirc;": "\u0174",
    "Wedge;": "\u22C0",
    "Wfr;": "\u1D51A",
    "Wopf;": "\u1D54E",
    "Wscr;": "\u1D4B2",
    "Xfr;": "\u1D51B",
    "Xi;": "\u039E",
    "Xopf;": "\u1D54F",
    "Xscr;": "\u1D4B3",
    "YAcy;": "\u042F",
    "YIcy;": "\u0407",
    "YUcy;": "\u042E",
    "Yacute": "\u00DD",
    "Yacute;": "\u00DD",
    "Ycirc;": "\u0176",
    "Ycy;": "\u042B",
    "Yfr;": "\u1D51C",
    "Yopf;": "\u1D550",
    "Yscr;": "\u1D4B4",
    "Yuml;": "\u0178",
    "ZHcy;": "\u0416",
    "Zacute;": "\u0179",
    "Zcaron;": "\u017D",
    "Zcy;": "\u0417",
    "Zdot;": "\u017B",
    "ZeroWidthSpace;": "\u200B",
    "Zeta;": "\u0396",
    "Zfr;": "\u2128",
    "Zopf;": "\u2124",
    "Zscr;": "\u1D4B5",
    "aacute": "\u00E1",
    "aacute;": "\u00E1",
    "abreve;": "\u0103",
    "ac;": "\u223E",
    "acE;": "\u223E\u0333",
    "acd;": "\u223F",
    "acirc": "\u00E2",
    "acirc;": "\u00E2",
    "acute": "\u00B4",
    "acute;": "\u00B4",
    "acy;": "\u0430",
    "aelig": "\u00E6",
    "aelig;": "\u00E6",
    "af;": "\u2061",
    "afr;": "\u1D51E",
    "agrave": "\u00E0",
    "agrave;": "\u00E0",
    "alefsym;": "\u2135",
    "aleph;": "\u2135",
    "alpha;": "\u03B1",
    "amacr;": "\u0101",
    "amalg;": "\u2A3F",
    "amp": "&",
    "amp;": "&",
    "and;": "\u2227",
    "andand;": "\u2A55",
    "andd;": "\u2A5C",
    "andslope;": "\u2A58",
    "andv;": "\u2A5A",
    "ang;": "\u2220",
    "ange;": "\u29A4",
    "angle;": "\u2220",
    "angmsd;": "\u2221",
    "angmsdaa;": "\u29A8",
    "angmsdab;": "\u29A9",
    "angmsdac;": "\u29AA",
    "angmsdad;": "\u29AB",
    "angmsdae;": "\u29AC",
    "angmsdaf;": "\u29AD",
    "angmsdag;": "\u29AE",
    "angmsdah;": "\u29AF",
    "angrt;": "\u221F",
    "angrtvb;": "\u22BE",
    "angrtvbd;": "\u299D",
    "angsph;": "\u2222",
    "angst;": "\u00C5",
    "angzarr;": "\u237C",
    "aogon;": "\u0105",
    "aopf;": "\u1D552",
    "ap;": "\u2248",
    "apE;": "\u2A70",
    "apacir;": "\u2A6F",
    "ape;": "\u224A",
    "apid;": "\u224B",
    "apos;": "\u0027",
    "approx;": "\u2248",
    "approxeq;": "\u224A",
    "aring": "\u00E5",
    "aring;": "\u00E5",
    "ascr;": "\u1D4B6",
    "ast;": "*",
    "asymp;": "\u2248",
    "asympeq;": "\u224D",
    "atilde": "\u00E3",
    "atilde;": "\u00E3",
    "auml": "\u00E4",
    "auml;": "\u00E4",
    "awconint;": "\u2233",
    "awint;": "\u2A11",
    "bNot;": "\u2AED",
    "backcong;": "\u224C",
    "backepsilon;": "\u03F6",
    "backprime;": "\u2035",
    "backsim;": "\u223D",
    "backsimeq;": "\u22CD",
    "barvee;": "\u22BD",
    "barwed;": "\u2305",
    "barwedge;": "\u2305",
    "bbrk;": "\u23B5",
    "bbrktbrk;": "\u23B6",
    "bcong;": "\u224C",
    "bcy;": "\u0431",
    "bdquo;": "\u201E",
    "becaus;": "\u2235",
    "because;": "\u2235",
    "bemptyv;": "\u29B0",
    "bepsi;": "\u03F6",
    "bernou;": "\u212C",
    "beta;": "\u03B2",
    "beth;": "\u2136",
    "between;": "\u226C",
    "bfr;": "\u1D51F",
    "bigcap;": "\u22C2",
    "bigcirc;": "\u25EF",
    "bigcup;": "\u22C3",
    "bigodot;": "\u2A00",
    "bigoplus;": "\u2A01",
    "bigotimes;": "\u2A02",
    "bigsqcup;": "\u2A06",
    "bigstar;": "\u2605",
    "bigtriangledown;": "\u25BD",
    "bigtriangleup;": "\u25B3",
    "biguplus;": "\u2A04",
    "bigvee;": "\u22C1",
    "bigwedge;": "\u22C0",
    "bkarow;": "\u290D",
    "blacklozenge;": "\u29EB",
    "blacksquare;": "\u25AA",
    "blacktriangle;": "\u25B4",
    "blacktriangledown;": "\u25BE",
    "blacktriangleleft;": "\u25C2",
    "blacktriangleright;": "\u25B8",
    "blank;": "\u2423",
    "blk12;": "\u2592",
    "blk14;": "\u2591",
    "blk34;": "\u2593",
    "block;": "\u2588",
    "bne;": "\u003D\u20E5",
    "bnequiv;": "\u2261\u20E5",
    "bnot;": "\u2310",
    "bopf;": "\u1D553",
    "bot;": "\u22A5",
    "bottom;": "\u22A5",
    "bowtie;": "\u22C8",
    "boxDL;": "\u2557",
    "boxDR;": "\u2554",
    "boxDl;": "\u2556",
    "boxDr;": "\u2553",
    "boxH;": "\u2550",
    "boxHD;": "\u2566",
    "boxHU;": "\u2569",
    "boxHd;": "\u2564",
    "boxHu;": "\u2567",
    "boxUL;": "\u255D",
    "boxUR;": "\u255A",
    "boxUl;": "\u255C",
    "boxUr;": "\u2559",
    "boxV;": "\u2551",
    "boxVH;": "\u256C",
    "boxVL;": "\u2563",
    "boxVR;": "\u2560",
    "boxVh;": "\u256B",
    "boxVl;": "\u2562",
    "boxVr;": "\u255F",
    "boxbox;": "\u29C9",
    "boxdL;": "\u2555",
    "boxdR;": "\u2552",
    "boxdl;": "\u2510",
    "boxdr;": "\u250C",
    "boxh;": "\u2500",
    "boxhD;": "\u2565",
    "boxhU;": "\u2568",
    "boxhd;": "\u252C",
    "boxhu;": "\u2534",
    "boxminus;": "\u229F",
    "boxplus;": "\u229E",
    "boxtimes;": "\u22A0",
    "boxuL;": "\u255B",
    "boxuR;": "\u2558",
    "boxul;": "\u2518",
    "boxur;": "\u2514",
    "boxv;": "\u2502",
    "boxvH;": "\u256A",
    "boxvL;": "\u2561",
    "boxvR;": "\u255E",
    "boxvh;": "\u253C",
    "boxvl;": "\u2524",
    "boxvr;": "\u251C",
    "bprime;": "\u2035",
    "breve;": "\u02D8",
    "brvbar": "\u00A6",
    "brvbar;": "\u00A6",
    "bscr;": "\u1D4B7",
    "bsemi;": "\u204F",
    "bsim;": "\u223D",
    "bsime;": "\u22CD",
    "bsol;": "\u005C",
    "bsolb;": "\u29C5",
    "bsolhsub;": "\u27C8",
    "bull;": "\u2022",
    "bullet;": "\u2022",
    "bump;": "\u224E",
    "bumpE;": "\u2AAE",
    "bumpe;": "\u224F",
    "bumpeq;": "\u224F",
    "cacute;": "\u0107",
    "cap;": "\u2229",
    "capand;": "\u2A44",
    "capbrcup;": "\u2A49",
    "capcap;": "\u2A4B",
    "capcup;": "\u2A47",
    "capdot;": "\u2A40",
    "caps;": "\u2229\uFE00",
    "caret;": "\u2041",
    "caron;": "\u02C7",
    "ccaps;": "\u2A4D",
    "ccaron;": "\u010D",
    "ccedil": "\u00E7",
    "ccedil;": "\u00E7",
    "ccirc;": "\u0109",
    "ccups;": "\u2A4C",
    "ccupssm;": "\u2A50",
    "cdot;": "\u010B",
    "cedil": "\u00B8",
    "cedil;": "\u00B8",
    "cemptyv;": "\u29B2",
    "cent": "\u00A2",
    "cent;": "\u00A2",
    "centerdot;": "\u00B7",
    "cfr;": "\u1D520",
    "chcy;": "\u0447",
    "check;": "\u2713",
    "checkmark;": "\u2713",
    "chi;": "\u03C7",
    "cir;": "\u25CB",
    "cirE;": "\u29C3",
    "circ;": "\u02C6",
    "circeq;": "\u2257",
    "circlearrowleft;": "\u21BA",
    "circlearrowright;": "\u21BB",
    "circledR;": "\u00AE",
    "circledS;": "\u24C8",
    "circledast;": "\u229B",
    "circledcirc;": "\u229A",
    "circleddash;": "\u229D",
    "cire;": "\u2257",
    "cirfnint;": "\u2A10",
    "cirmid;": "\u2AEF",
    "cirscir;": "\u29C2",
    "clubs;": "\u2663",
    "clubsuit;": "\u2663",
    "colon;": ":",
    "colone;": "\u2254",
    "coloneq;": "\u2254",
    "comma;": ",",
    "commat;": "@",
    "comp;": "\u2201",
    "compfn;": "\u2218",
    "complement;": "\u2201",
    "complexes;": "\u2102",
    "cong;": "\u2245",
    "congdot;": "\u2A6D",
    "conint;": "\u222E",
    "copf;": "\u1D554",
    "coprod;": "\u2210",
    "copy": "\u00A9",
    "copy;": "\u00A9",
    "copysr;": "\u2117",
    "crarr;": "\u21B5",
    "cross;": "\u2717",
    "cscr;": "\u1D4B8",
    "csub;": "\u2ACF",
    "csube;": "\u2AD1",
    "csup;": "\u2AD0",
    "csupe;": "\u2AD2",
    "ctdot;": "\u22EF",
    "cudarrl;": "\u2938",
    "cudarrr;": "\u2935",
    "cuepr;": "\u22DE",
    "cuesc;": "\u22DF",
    "cularr;": "\u21B6",
    "cularrp;": "\u293D",
    "cup;": "\u222A",
    "cupbrcap;": "\u2A48",
    "cupcap;": "\u2A46",
    "cupcup;": "\u2A4A",
    "cupdot;": "\u228D",
    "cupor;": "\u2A45",
    "cups;": "\u222A\uFE00",
    "curarr;": "\u21B7",
    "curarrm;": "\u293C",
    "curlyeqprec;": "\u22DE",
    "curlyeqsucc;": "\u22DF",
    "curlyvee;": "\u22CE",
    "curlywedge;": "\u22CF",
    "curren": "\u00A4",
    "curren;": "\u00A4",
    "curvearrowleft;": "\u21B6",
    "curvearrowright;": "\u21B7",
    "cuvee;": "\u22CE",
    "cuwed;": "\u22CF",
    "cwconint;": "\u2232",
    "cwint;": "\u2231",
    "cylcty;": "\u232D",
    "dArr;": "\u21D3",
    "dHar;": "\u2965",
    "dagger;": "\u2020",
    "daleth;": "\u2138",
    "darr;": "\u2193",
    "dash;": "\u2010",
    "dashv;": "\u22A3",
    "dbkarow;": "\u290F",
    "dblac;": "\u02DD",
    "dcaron;": "\u010F",
    "dcy;": "\u0434",
    "dd;": "\u2146",
    "ddagger;": "\u2021",
    "ddarr;": "\u21CA",
    "ddotseq;": "\u2A77",
    "deg": "\u00B0",
    "deg;": "\u00B0",
    "delta;": "\u03B4",
    "demptyv;": "\u29B1",
    "dfisht;": "\u297F",
    "dfr;": "\u1D521",
    "dharl;": "\u21C3",
    "dharr;": "\u21C2",
    "diam;": "\u22C4",
    "diamond;": "\u22C4",
    "diamondsuit;": "\u2666",
    "diams;": "\u2666",
    "die;": "\u00A8",
    "digamma;": "\u03DD",
    "disin;": "\u22F2",
    "div;": "\u00F7",
    "divide": "\u00F7",
    "divide;": "\u00F7",
    "divideontimes;": "\u22C7",
    "divonx;": "\u22C7",
    "djcy;": "\u0452",
    "dlcorn;": "\u231E",
    "dlcrop;": "\u230D",
    "dollar;": "$",
    "dopf;": "\u1D555",
    "dot;": "\u02D9",
    "doteq;": "\u2250",
    "doteqdot;": "\u2251",
    "dotminus;": "\u2238",
    "dotplus;": "\u2214",
    "dotsquare;": "\u22A1",
    "doublebarwedge;": "\u2306",
    "downarrow;": "\u2193",
    "downdownarrows;": "\u21CA",
    "downharpoonleft;": "\u21C3",
    "downharpoonright;": "\u21C2",
    "drbkarow;": "\u2910",
    "drcorn;": "\u231F",
    "drcrop;": "\u230C",
    "dscr;": "\u1D4B9",
    "dscy;": "\u0455",
    "dsol;": "\u29F6",
    "dstrok;": "\u0111",
    "dtdot;": "\u22F1",
    "dtri;": "\u25BF",
    "dtrif;": "\u25BE",
    "duarr;": "\u21F5",
    "duhar;": "\u296F",
    "dwangle;": "\u29A6",
    "dzcy;": "\u045F",
    "dzigrarr;": "\u27FF",
    "eDDot;": "\u2A77",
    "eDot;": "\u2251",
    "eacute": "\u00E9",
    "eacute;": "\u00E9",
    "easter;": "\u2A6E",
    "ecaron;": "\u011B",
    "ecir;": "\u2256",
    "ecirc": "\u00EA",
    "ecirc;": "\u00EA",
    "ecolon;": "\u2255",
    "ecy;": "\u044D",
    "edot;": "\u0117",
    "ee;": "\u2147",
    "efDot;": "\u2252",
    "efr;": "\u1D522",
    "eg;": "\u2A9A",
    "egrave": "\u00E8",
    "egrave;": "\u00E8",
    "egs;": "\u2A96",
    "egsdot;": "\u2A98",
    "el;": "\u2A99",
    "elinters;": "\u23E7",
    "ell;": "\u2113",
    "els;": "\u2A95",
    "elsdot;": "\u2A97",
    "emacr;": "\u0113",
    "empty;": "\u2205",
    "emptyset;": "\u2205",
    "emptyv;": "\u2205",
    "emsp13;": "\u2004",
    "emsp14;": "\u2005",
    "emsp;": "\u2003",
    "eng;": "\u014B",
    "ensp;": "\u2002",
    "eogon;": "\u0119",
    "eopf;": "\u1D556",
    "epar;": "\u22D5",
    "eparsl;": "\u29E3",
    "eplus;": "\u2A71",
    "epsi;": "\u03B5",
    "epsilon;": "\u03B5",
    "epsiv;": "\u03F5",
    "eqcirc;": "\u2256",
    "eqcolon;": "\u2255",
    "eqsim;": "\u2242",
    "eqslantgtr;": "\u2A96",
    "eqslantless;": "\u2A95",
    "equals;": "=",
    "equest;": "\u225F",
    "equiv;": "\u2261",
    "equivDD;": "\u2A78",
    "eqvparsl;": "\u29E5",
    "erDot;": "\u2253",
    "erarr;": "\u2971",
    "escr;": "\u212F",
    "esdot;": "\u2250",
    "esim;": "\u2242",
    "eta;": "\u03B7",
    "eth": "\u00F0",
    "eth;": "\u00F0",
    "euml": "\u00EB",
    "euml;": "\u00EB",
    "euro;": "\u20AC",
    "excl;": "!",
    "exist;": "\u2203",
    "expectation;": "\u2130",
    "exponentiale;": "\u2147",
    "fallingdotseq;": "\u2252",
    "fcy;": "\u0444",
    "female;": "\u2640",
    "ffilig;": "\uFB03",
    "fflig;": "\uFB00",
    "ffllig;": "\uFB04",
    "ffr;": "\u1D523",
    "filig;": "\uFB01",
    "fjlig;": "\u0066",
    "flat;": "\u266D",
    "fllig;": "\uFB02",
    "fltns;": "\u25B1",
    "fnof;": "\u0192",
    "fopf;": "\u1D557",
    "forall;": "\u2200",
    "fork;": "\u22D4",
    "forkv;": "\u2AD9",
    "fpartint;": "\u2A0D",
    "frac12": "\u00BD",
    "frac12;": "\u00BD",
    "frac13;": "\u2153",
    "frac14": "\u00BC",
    "frac14;": "\u00BC",
    "frac15;": "\u2155",
    "frac16;": "\u2159",
    "frac18;": "\u215B",
    "frac23;": "\u2154",
    "frac25;": "\u2156",
    "frac34": "\u00BE",
    "frac34;": "\u00BE",
    "frac35;": "\u2157",
    "frac38;": "\u215C",
    "frac45;": "\u2158",
    "frac56;": "\u215A",
    "frac58;": "\u215D",
    "frac78;": "\u215E",
    "frasl;": "\u2044",
    "frown;": "\u2322",
    "fscr;": "\u1D4BB",
    "gE;": "\u2267",
    "gEl;": "\u2A8C",
    "gacute;": "\u01F5",
    "gamma;": "\u03B3",
    "gammad;": "\u03DD",
    "gap;": "\u2A86",
    "gbreve;": "\u011F",
    "gcirc;": "\u011D",
    "gcy;": "\u0433",
    "gdot;": "\u0121",
    "ge;": "\u2265",
    "gel;": "\u22DB",
    "geq;": "\u2265",
    "geqq;": "\u2267",
    "geqslant;": "\u2A7E",
    "ges;": "\u2A7E",
    "gescc;": "\u2AA9",
    "gesdot;": "\u2A80",
    "gesdoto;": "\u2A82",
    "gesdotol;": "\u2A84",
    "gesl;": "\u22DB\uFE00",
    "gesles;": "\u2A94",
    "gfr;": "\u1D524",
    "gg;": "\u226B",
    "ggg;": "\u22D9",
    "gimel;": "\u2137",
    "gjcy;": "\u0453",
    "gl;": "\u2277",
    "glE;": "\u2A92",
    "gla;": "\u2AA5",
    "glj;": "\u2AA4",
    "gnE;": "\u2269",
    "gnap;": "\u2A8A",
    "gnapprox;": "\u2A8A",
    "gne;": "\u2A88",
    "gneq;": "\u2A88",
    "gneqq;": "\u2269",
    "gnsim;": "\u22E7",
    "gopf;": "\u1D558",
    "grave;": "`",
    "gscr;": "\u210A",
    "gsim;": "\u2273",
    "gsime;": "\u2A8E",
    "gsiml;": "\u2A90",
    "gt": ">",
    "gt;": ">",
    "gtcc;": "\u2AA7",
    "gtcir;": "\u2A7A",
    "gtdot;": "\u22D7",
    "gtlPar;": "\u2995",
    "gtquest;": "\u2A7C",
    "gtrapprox;": "\u2A86",
    "gtrarr;": "\u2978",
    "gtrdot;": "\u22D7",
    "gtreqless;": "\u22DB",
    "gtreqqless;": "\u2A8C",
    "gtrless;": "\u2277",
    "gtrsim;": "\u2273",
    "gvertneqq;": "\u2269\uFE00",
    "gvnE;": "\u2269\uFE00",
    "hArr;": "\u21D4",
    "hairsp;": "\u200A",
    "half;": "\u00BD",
    "hamilt;": "\u210B",
    "hardcy;": "\u044A",
    "harr;": "\u2194",
    "harrcir;": "\u2948",
    "harrw;": "\u21AD",
    "hbar;": "\u210F",
    "hcirc;": "\u0125",
    "hearts;": "\u2665",
    "heartsuit;": "\u2665",
    "hellip;": "\u2026",
    "hercon;": "\u22B9",
    "hfr;": "\u1D525",
    "hksearow;": "\u2925",
    "hkswarow;": "\u2926",
    "hoarr;": "\u21FF",
    "homtht;": "\u223B",
    "hookleftarrow;": "\u21A9",
    "hookrightarrow;": "\u21AA",
    "hopf;": "\u1D559",
    "horbar;": "\u2015",
    "hscr;": "\u1D4BD",
    "hslash;": "\u210F",
    "hstrok;": "\u0127",
    "hybull;": "\u2043",
    "hyphen;": "\u2010",
    "iacute": "\u00ED",
    "iacute;": "\u00ED",
    "ic;": "\u2063",
    "icirc": "\u00EE",
    "icirc;": "\u00EE",
    "icy;": "\u0438",
    "iecy;": "\u0435",
    "iexcl": "\u00A1",
    "iexcl;": "\u00A1",
    "iff;": "\u21D4",
    "ifr;": "\u1D526",
    "igrave": "\u00EC",
    "igrave;": "\u00EC",
    "ii;": "\u2148",
    "iiiint;": "\u2A0C",
    "iiint;": "\u222D",
    "iinfin;": "\u29DC",
    "iiota;": "\u2129",
    "ijlig;": "\u0133",
    "imacr;": "\u012B",
    "image;": "\u2111",
    "imagline;": "\u2110",
    "imagpart;": "\u2111",
    "imath;": "\u0131",
    "imof;": "\u22B7",
    "imped;": "\u01B5",
    "in;": "\u2208",
    "incare;": "\u2105",
    "infin;": "\u221E",
    "infintie;": "\u29DD",
    "inodot;": "\u0131",
    "int;": "\u222B",
    "intcal;": "\u22BA",
    "integers;": "\u2124",
    "intercal;": "\u22BA",
    "intlarhk;": "\u2A17",
    "intprod;": "\u2A3C",
    "iocy;": "\u0451",
    "iogon;": "\u012F",
    "iopf;": "\u1D55A",
    "iota;": "\u03B9",
    "iprod;": "\u2A3C",
    "iquest": "\u00BF",
    "iquest;": "\u00BF",
    "iscr;": "\u1D4BE",
    "isin;": "\u2208",
    "isinE;": "\u22F9",
    "isindot;": "\u22F5",
    "isins;": "\u22F4",
    "isinsv;": "\u22F3",
    "isinv;": "\u2208",
    "it;": "\u2062",
    "itilde;": "\u0129",
    "iukcy;": "\u0456",
    "iuml": "\u00EF",
    "iuml;": "\u00EF",
    "jcirc;": "\u0135",
    "jcy;": "\u0439",
    "jfr;": "\u1D527",
    "jmath;": "\u0237",
    "jopf;": "\u1D55B",
    "jscr;": "\u1D4BF",
    "jsercy;": "\u0458",
    "jukcy;": "\u0454",
    "kappa;": "\u03BA",
    "kappav;": "\u03F0",
    "kcedil;": "\u0137",
    "kcy;": "\u043A",
    "kfr;": "\u1D528",
    "kgreen;": "\u0138",
    "khcy;": "\u0445",
    "kjcy;": "\u045C",
    "kopf;": "\u1D55C",
    "kscr;": "\u1D4C0",
    "lAarr;": "\u21DA",
    "lArr;": "\u21D0",
    "lAtail;": "\u291B",
    "lBarr;": "\u290E",
    "lE;": "\u2266",
    "lEg;": "\u2A8B",
    "lHar;": "\u2962",
    "lacute;": "\u013A",
    "laemptyv;": "\u29B4",
    "lagran;": "\u2112",
    "lambda;": "\u03BB",
    "lang;": "\u27E8",
    "langd;": "\u2991",
    "langle;": "\u27E8",
    "lap;": "\u2A85",
    "laquo": "\u00AB",
    "laquo;": "\u00AB",
    "larr;": "\u2190",
    "larrb;": "\u21E4",
    "larrbfs;": "\u291F",
    "larrfs;": "\u291D",
    "larrhk;": "\u21A9",
    "larrlp;": "\u21AB",
    "larrpl;": "\u2939",
    "larrsim;": "\u2973",
    "larrtl;": "\u21A2",
    "lat;": "\u2AAB",
    "latail;": "\u2919",
    "late;": "\u2AAD",
    "lates;": "\u2AAD\uFE00",
    "lbarr;": "\u290C",
    "lbbrk;": "\u2772",
    "lbrace;": "{",
    "lbrack;": "[",
    "lbrke;": "\u298B",
    "lbrksld;": "\u298F",
    "lbrkslu;": "\u298D",
    "lcaron;": "\u013E",
    "lcedil;": "\u013C",
    "lceil;": "\u2308",
    "lcub;": "{",
    "lcy;": "\u043B",
    "ldca;": "\u2936",
    "ldquo;": "\u201C",
    "ldquor;": "\u201E",
    "ldrdhar;": "\u2967",
    "ldrushar;": "\u294B",
    "ldsh;": "\u21B2",
    "le;": "\u2264",
    "leftarrow;": "\u2190",
    "leftarrowtail;": "\u21A2",
    "leftharpoondown;": "\u21BD",
    "leftharpoonup;": "\u21BC",
    "leftleftarrows;": "\u21C7",
    "leftrightarrow;": "\u2194",
    "leftrightarrows;": "\u21C6",
    "leftrightharpoons;": "\u21CB",
    "leftrightsquigarrow;": "\u21AD",
    "leftthreetimes;": "\u22CB",
    "leg;": "\u22DA",
    "leq;": "\u2264",
    "leqq;": "\u2266",
    "leqslant;": "\u2A7D",
    "les;": "\u2A7D",
    "lescc;": "\u2AA8",
    "lesdot;": "\u2A7F",
    "lesdoto;": "\u2A81",
    "lesdotor;": "\u2A83",
    "lesg;": "\u22DA\uFE00",
    "lesges;": "\u2A93",
    "lessapprox;": "\u2A85",
    "lessdot;": "\u22D6",
    "lesseqgtr;": "\u22DA",
    "lesseqqgtr;": "\u2A8B",
    "lessgtr;": "\u2276",
    "lesssim;": "\u2272",
    "lfisht;": "\u297C",
    "lfloor;": "\u230A",
    "lfr;": "\u1D529",
    "lg;": "\u2276",
    "lgE;": "\u2A91",
    "lhard;": "\u21BD",
    "lharu;": "\u21BC",
    "lharul;": "\u296A",
    "lhblk;": "\u2584",
    "ljcy;": "\u0459",
    "ll;": "\u226A",
    "llarr;": "\u21C7",
    "llcorner;": "\u231E",
    "llhard;": "\u296B",
    "lltri;": "\u25FA",
    "lmidot;": "\u0140",
    "lmoust;": "\u23B0",
    "lmoustache;": "\u23B0",
    "lnE;": "\u2268",
    "lnap;": "\u2A89",
    "lnapprox;": "\u2A89",
    "lne;": "\u2A87",
    "lneq;": "\u2A87",
    "lneqq;": "\u2268",
    "lnsim;": "\u22E6",
    "loang;": "\u27EC",
    "loarr;": "\u21FD",
    "lobrk;": "\u27E6",
    "longleftarrow;": "\u27F5",
    "longleftrightarrow;": "\u27F7",
    "longmapsto;": "\u27FC",
    "longrightarrow;": "\u27F6",
    "looparrowleft;": "\u21AB",
    "looparrowright;": "\u21AC",
    "lopar;": "\u2985",
    "lopf;": "\u1D55D",
    "loplus;": "\u2A2D",
    "lotimes;": "\u2A34",
    "lowast;": "\u2217",
    "lowbar;": "_",
    "loz;": "\u25CA",
    "lozenge;": "\u25CA",
    "lozf;": "\u29EB",
    "lpar;": "(",
    "lparlt;": "\u2993",
    "lrarr;": "\u21C6",
    "lrcorner;": "\u231F",
    "lrhar;": "\u21CB",
    "lrhard;": "\u296D",
    "lrm;": "\u200E",
    "lrtri;": "\u22BF",
    "lsaquo;": "\u2039",
    "lscr;": "\u1D4C1",
    "lsh;": "\u21B0",
    "lsim;": "\u2272",
    "lsime;": "\u2A8D",
    "lsimg;": "\u2A8F",
    "lsqb;": "[",
    "lsquo;": "\u2018",
    "lsquor;": "\u201A",
    "lstrok;": "\u0142",
    "lt": "<",
    "lt;": "<",
    "ltcc;": "\u2AA6",
    "ltcir;": "\u2A79",
    "ltdot;": "\u22D6",
    "lthree;": "\u22CB",
    "ltimes;": "\u22C9",
    "ltlarr;": "\u2976",
    "ltquest;": "\u2A7B",
    "ltrPar;": "\u2996",
    "ltri;": "\u25C3",
    "ltrie;": "\u22B4",
    "ltrif;": "\u25C2",
    "lurdshar;": "\u294A",
    "luruhar;": "\u2966",
    "lvertneqq;": "\u2268\uFE00",
    "lvnE;": "\u2268\uFE00",
    "mDDot;": "\u223A",
    "macr": "\u00AF",
    "macr;": "\u00AF",
    "male;": "\u2642",
    "malt;": "\u2720",
    "maltese;": "\u2720",
    "map;": "\u21A6",
    "mapsto;": "\u21A6",
    "mapstodown;": "\u21A7",
    "mapstoleft;": "\u21A4",
    "mapstoup;": "\u21A5",
    "marker;": "\u25AE",
    "mcomma;": "\u2A29",
    "mcy;": "\u043C",
    "mdash;": "\u2014",
    "measuredangle;": "\u2221",
    "mfr;": "\u1D52A",
    "mho;": "\u2127",
    "micro": "\u00B5",
    "micro;": "\u00B5",
    "mid;": "\u2223",
    "midast;": "*",
    "midcir;": "\u2AF0",
    "middot": "\u00B7",
    "middot;": "\u00B7",
    "minus;": "\u2212",
    "minusb;": "\u229F",
    "minusd;": "\u2238",
    "minusdu;": "\u2A2A",
    "mlcp;": "\u2ADB",
    "mldr;": "\u2026",
    "mnplus;": "\u2213",
    "models;": "\u22A7",
    "mopf;": "\u1D55E",
    "mp;": "\u2213",
    "mscr;": "\u1D4C2",
    "mstpos;": "\u223E",
    "mu;": "\u03BC",
    "multimap;": "\u22B8",
    "mumap;": "\u22B8",
    "nGg;": "\u22D9\u0338",
    "nGt;": "\u226B\u20D2",
    "nGtv;": "\u226B\u0338",
    "nLeftarrow;": "\u21CD",
    "nLeftrightarrow;": "\u21CE",
    "nLl;": "\u22D8\u0338",
    "nLt;": "\u226A\u20D2",
    "nLtv;": "\u226A\u0338",
    "nRightarrow;": "\u21CF",
    "nVDash;": "\u22AF",
    "nVdash;": "\u22AE",
    "nabla;": "\u2207",
    "nacute;": "\u0144",
    "nang;": "\u2220\u20D2",
    "nap;": "\u2249",
    "napE;": "\u2A70\u0338",
    "napid;": "\u224B\u0338",
    "napos;": "\u0149",
    "napprox;": "\u2249",
    "natur;": "\u266E",
    "natural;": "\u266E",
    "naturals;": "\u2115",
    "nbsp": "\u00A0",
    "nbsp;": "\u00A0",
    "nbump;": "\u224E\u0338",
    "nbumpe;": "\u224F\u0338",
    "ncap;": "\u2A43",
    "ncaron;": "\u0148",
    "ncedil;": "\u0146",
    "ncong;": "\u2247\u0338",
    "ncongdot;": "\u2A6D",
    "ncup;": "\u2A42",
    "ncy;": "\u043D",
    "ndash;": "\u2013",
    "ne;": "\u2260",
    "neArr;": "\u21D7",
    "nearhk;": "\u2924",
    "nearr;": "\u2197",
    "nearrow;": "\u2197",
    "nedot;": "\u2250\u0338",
    "nequiv;": "\u2262",
    "nesear;": "\u2928",
    "nesim;": "\u2242\u0338",
    "nexist;": "\u2204",
    "nexists;": "\u2204",
    "nfr;": "\u1D52B",
    "ngE;": "\u2267\u0338",
    "nge;": "\u2271",
    "ngeq;": "\u2271",
    "ngeqq;": "\u2267\u0338",
    "ngeqslant;": "\u2A7E\u0338",
    "nges;": "\u2A7E\u0338",
    "ngsim;": "\u2275",
    "ngt;": "\u226F",
    "ngtr;": "\u226F",
    "nhArr;": "\u21CE",
    "nharr;": "\u21AE",
    "nhpar;": "\u2AF2",
    "ni;": "\u220B",
    "nis;": "\u22FC",
    "nisd;": "\u22FA",
    "niv;": "\u220B",
    "njcy;": "\u045A",
    "nlArr;": "\u21CD",
    "nlE;": "\u2266\u0338",
    "nlarr;": "\u219A",
    "nldr;": "\u2025",
    "nle;": "\u2270",
    "nleftarrow;": "\u219A",
    "nleftrightarrow;": "\u21AE",
    "nleq;": "\u2270",
    "nleqq;": "\u2266\u0338",
    "nleqslant;": "\u2A7D\u0338",
    "nles;": "\u2A7D\u0338",
    "nless;": "\u226E",
    "nlsim;": "\u2274",
    "nlt;": "\u226E",
    "nltri;": "\u22EA",
    "nltrie;": "\u22EC",
    "nmid;": "\u2224",
    "nopf;": "\u1D55F",
    "not": "\u00AC",
    "not;": "\u00AC",
    "notin;": "\u2209",
    "notinE;": "\u22F9\u0338",
    "notindot;": "\u22F5\u0338",
    "notinva;": "\u2209",
    "notinvb;": "\u22F7",
    "notinvc;": "\u22F6",
    "notni;": "\u220C",
    "notniva;": "\u220C",
    "notnivb;": "\u22FE",
    "notnivc;": "\u22FD",
    "npar;": "\u2226",
    "nparallel;": "\u2226",
    "nparsl;": "\u2AFD\u20E5",
    "npart;": "\u2202\u0338",
    "npolint;": "\u2A14",
    "npr;": "\u2280",
    "nprcue;": "\u22E0",
    "npre;": "\u2AAF",
    "nprec;": "\u2280",
    "npreceq;": "\u2AAF",
    "nrArr;": "\u21CF",
    "nrarr;": "\u219B",
    "nrarrc;": "\u2933\u0338",
    "nrarrw;": "\u219D\u0338",
    "nrightarrow;": "\u219B",
    "nrtri;": "\u22EB",
    "nrtrie;": "\u22ED",
    "nsc;": "\u2281",
    "nsccue;": "\u22E1",
    "nsce;": "\u2AB0\u0338",
    "nscr;": "\u1D4C3",
    "nshortmid;": "\u2224",
    "nshortparallel;": "\u2226",
    "nsim;": "\u2241",
    "nsime;": "\u2244",
    "nsimeq;": "\u2244",
    "nsmid;": "\u2224",
    "nspar;": "\u2226",
    "nsqsube;": "\u22E2",
    "nsqsupe;": "\u22E3",
    "nsub;": "\u2284",
    "nsubE;": "\u2AC5\u0338",
    "nsube;": "\u2288",
    "nsubset;": "\u2282\u0338",
    "nsubseteq;": "\u2288",
    "nsubseteqq;": "\u2AC5\u0338",
    "nsucc;": "\u2281",
    "nsucceq;": "\u2AB0\u0338",
    "nsup;": "\u2285",
    "nsupE;": "\u2AC6",
    "nsupe;": "\u2289",
    "nsupset;": "\u2283\u0338",
    "nsupseteq;": "\u2289",
    "nsupseteqq;": "\u2AC6\u0338",
    "ntgl;": "\u2279",
    "ntilde": "\u00F1",
    "ntilde;": "\u00F1",
    "ntlg;": "\u2278",
    "ntriangleleft;": "\u22EA",
    "ntrianglelefteq;": "\u22EC",
    "ntriangleright;": "\u22EB",
    "ntrianglerighteq;": "\u22ED",
    "nu;": "\u03BD",
    "num;": "#",
    "numero;": "\u2116",
    "numsp;": "\u2007",
    "nvDash;": "\u22AD",
    "nvHarr;": "\u2904",
    "nvap;": "\u224D\u20D2",
    "nvdash;": "\u22AC",
    "nvge;": "\u2265\u20D2",
    "nvgt;": "\u003E\u20D2",
    "nvinfin;": "\u29DE",
    "nvlArr;": "\u2902",
    "nvle;": "\u2264\u20D2",
    "nvlt;": "\u003C\u20D2",
    "nvltrie;": "\u22B4\u20D2",
    "nvrArr;": "\u2903",
    "nvrtrie;": "\u22B5\u20D2",
    "nvsim;": "\u223C\u20D2",
    "nwArr;": "\u21D6",
    "nwarhk;": "\u2923",
    "nwarr;": "\u2196",
    "nwarrow;": "\u2196",
    "nwnear;": "\u2927",
    "oS;": "\u24C8",
    "oacute": "\u00F3",
    "oacute;": "\u00F3",
    "oast;": "\u229B",
    "ocir;": "\u229A",
    "ocirc": "\u00F4",
    "ocirc;": "\u00F4",
    "ocy;": "\u043E",
    "odash;": "\u229D",
    "odblac;": "\u0151",
    "odiv;": "\u2A38",
    "odot;": "\u2299",
    "odsold;": "\u29BC",
    "oelig;": "\u0153",
    "ofcir;": "\u29BF",
    "ofr;": "\u1D52C",
    "ogon;": "\u02DB",
    "ograve": "\u00F2",
    "ograve;": "\u00F2",
    "ogt;": "\u29C1",
    "ohbar;": "\u29B5",
    "ohm;": "\u03A9",
    "oint;": "\u222E",
    "olarr;": "\u21BA",
    "olcir;": "\u29BE",
    "olcross;": "\u29BB",
    "oline;": "\u203E",
    "olt;": "\u29C0",
    "omacr;": "\u014D",
    "omega;": "\u03C9",
    "omicron;": "\u03BF",
    "omid;": "\u29B6",
    "ominus;": "\u2296",
    "oopf;": "\u1D560",
    "opar;": "\u29B7",
    "operp;": "\u29B9",
    "oplus;": "\u2295",
    "or;": "\u2228",
    "orarr;": "\u21BB",
    "ord;": "\u2A5D",
    "order;": "\u2134",
    "orderof;": "\u2134",
    "ordf": "\u00AA",
    "ordf;": "\u00AA",
    "ordm": "\u00BA",
    "ordm;": "\u00BA",
    "origof;": "\u22B6",
    "oror;": "\u2A56",
    "orslope;": "\u2A57",
    "orv;": "\u2A5B",
    "oscr;": "\u2134",
    "oslash": "\u00F8",
    "oslash;": "\u00F8",
    "osol;": "\u2298",
    "otilde": "\u00F5",
    "otilde;": "\u00F5",
    "otimes;": "\u2297",
    "otimesas;": "\u2A36",
    "ouml": "\u00F6",
    "ouml;": "\u00F6",
    "ovbar;": "\u233D",
    "par;": "\u2225",
    "para": "\u00B6",
    "para;": "\u00B6",
    "parallel;": "\u2225",
    "parsim;": "\u2AF3",
    "parsl;": "\u2AFD",
    "part;": "\u2202",
    "pcy;": "\u043F",
    "percnt;": "%",
    "period;": ".",
    "permil;": "\u2030",
    "perp;": "\u22A5",
    "pertenk;": "\u2031",
    "pfr;": "\u1D52D",
    "phi;": "\u03C6",
    "phiv;": "\u03D5",
    "phmmat;": "\u2133",
    "phone;": "\u260E",
    "pi;": "\u03C0",
    "pitchfork;": "\u22D4",
    "piv;": "\u03D6",
    "planck;": "\u210F",
    "planckh;": "\u210E",
    "plankv;": "\u210F",
    "plus;": "+",
    "plusacir;": "\u2A23",
    "plusb;": "\u229E",
    "pluscir;": "\u2A22",
    "plusdo;": "\u2214",
    "plusdu;": "\u2A25",
    "pluse;": "\u2A72",
    "plusmn": "\u00B1",
    "plusmn;": "\u00B1",
    "plussim;": "\u2A26",
    "plustwo;": "\u2A27",
    "pm;": "\u00B1",
    "pointint;": "\u2A15",
    "popf;": "\u1D561",
    "pound": "\u00A3",
    "pound;": "\u00A3",
    "pr;": "\u227A",
    "prE;": "\u2AB3",
    "prap;": "\u2AB7",
    "prcue;": "\u227C",
    "pre;": "\u2AAF",
    "prec;": "\u227A",
    "precapprox;": "\u2AB7",
    "preccurlyeq;": "\u227C",
    "preceq;": "\u2AAF",
    "precnapprox;": "\u2AB9",
    "precneqq;": "\u2AB5",
    "precnsim;": "\u22E8",
    "precsim;": "\u227E",
    "prime;": "\u2032",
    "primes;": "\u2119",
    "prnE;": "\u2AB5",
    "prnap;": "\u2AB9",
    "prnsim;": "\u22E8",
    "prod;": "\u220F",
    "profalar;": "\u232E",
    "profline;": "\u2312",
    "profsurf;": "\u2313",
    "prop;": "\u221D",
    "propto;": "\u221D",
    "prsim;": "\u227E",
    "prurel;": "\u22B0",
    "pscr;": "\u1D4C5",
    "psi;": "\u03C8",
    "puncsp;": "\u2008",
    "qfr;": "\u1D52E",
    "qint;": "\u2A0C",
    "qopf;": "\u1D562",
    "qprime;": "\u2057",
    "qscr;": "\u1D4C6",
    "quaternions;": "\u210D",
    "quatint;": "\u2A16",
    "quest;": "?",
    "questeq;": "\u225F",
    "quot": "\u0022",
    "quot;": "\u0022",
    "rAarr;": "\u21DB",
    "rArr;": "\u21D2",
    "rAtail;": "\u291C",
    "rBarr;": "\u290F",
    "rHar;": "\u2964",
    "race;": "\u223D\u0331",
    "racute;": "\u0155",
    "radic;": "\u221A",
    "raemptyv;": "\u29B3",
    "rang;": "\u27E9",
    "rangd;": "\u2992",
    "range;": "\u29A5",
    "rangle;": "\u27E9",
    "raquo": "\u00BB",
    "raquo;": "\u00BB",
    "rarr;": "\u2192",
    "rarrap;": "\u2975",
    "rarrb;": "\u21E5",
    "rarrbfs;": "\u2920",
    "rarrc;": "\u2933",
    "rarrfs;": "\u291E",
    "rarrhk;": "\u21AA",
    "rarrlp;": "\u21AC",
    "rarrpl;": "\u2945",
    "rarrsim;": "\u2974",
    "rarrtl;": "\u21A3",
    "rarrw;": "\u219D",
    "ratail;": "\u291A",
    "ratio;": "\u2236",
    "rationals;": "\u211A",
    "rbarr;": "\u290D",
    "rbbrk;": "\u2773",
    "rbrace;": "}",
    "rbrack;": "]",
    "rbrke;": "\u298C",
    "rbrksld;": "\u298E",
    "rbrkslu;": "\u2990",
    "rcaron;": "\u0159",
    "rcedil;": "\u0157",
    "rceil;": "\u2309",
    "rcub;": "}",
    "rcy;": "\u0440",
    "rdca;": "\u2937",
    "rdldhar;": "\u2969",
    "rdquo;": "\u201D",
    "rdquor;": "\u201D",
    "rdsh;": "\u21B3",
    "real;": "\u211C",
    "realine;": "\u211B",
    "realpart;": "\u211C",
    "reals;": "\u211D",
    "rect;": "\u25AD",
    "reg": "\u00AE",
    "reg;": "\u00AE",
    "rfisht;": "\u297D",
    "rfloor;": "\u230B",
    "rfr;": "\u1D52F",
    "rhard;": "\u21C1",
    "rharu;": "\u21C0",
    "rharul;": "\u296C",
    "rho;": "\u03C1",
    "rhov;": "\u03F1",
    "rightarrow;": "\u2192",
    "rightarrowtail;": "\u21A3",
    "rightharpoondown;": "\u21C1",
    "rightharpoonup;": "\u21C0",
    "rightleftarrows;": "\u21C4",
    "rightleftharpoons;": "\u21CC",
    "rightrightarrows;": "\u21C9",
    "rightsquigarrow;": "\u219D",
    "rightthreetimes;": "\u22CC",
    "ring;": "\u02DA",
    "risingdotseq;": "\u2253",
    "rlarr;": "\u21C4",
    "rlhar;": "\u21CC",
    "rlm;": "\u200F",
    "rmoust;": "\u23B1",
    "rmoustache;": "\u23B1",
    "rnmid;": "\u2AEE",
    "roang;": "\u27ED",
    "roarr;": "\u21FE",
    "robrk;": "\u27E7",
    "ropar;": "\u2986",
    "ropf;": "\u1D563",
    "roplus;": "\u2A2E",
    "rotimes;": "\u2A35",
    "rpar;": ")",
    "rpargt;": "\u2994",
    "rppolint;": "\u2A12",
    "rrarr;": "\u21C9",
    "rsaquo;": "\u203A",
    "rscr;": "\u1D4C7",
    "rsh;": "\u21B1",
    "rsqb;": "]",
    "rsquo;": "\u2019",
    "rsquor;": "\u2019",
    "rthree;": "\u22CC",
    "rtimes;": "\u22CA",
    "rtri;": "\u25B9",
    "rtrie;": "\u22B5",
    "rtrif;": "\u25B8",
    "rtriltri;": "\u29CE",
    "ruluhar;": "\u2968",
    "rx;": "\u211E",
    "sacute;": "\u015B",
    "sbquo;": "\u201A",
    "sc;": "\u227B",
    "scE;": "\u2AB4",
    "scap;": "\u2AB8",
    "scaron;": "\u0161",
    "sccue;": "\u227D",
    "sce;": "\u2AB0",
    "scedil;": "\u015F",
    "scirc;": "\u015D",
    "scnE;": "\u2AB6",
    "scnap;": "\u2ABA",
    "scnsim;": "\u22E9",
    "scpolint;": "\u2A13",
    "scsim;": "\u227F",
    "scy;": "\u0441",
    "sdot;": "\u22C5",
    "sdotb;": "\u22A1",
    "sdote;": "\u2A66",
    "seArr;": "\u21D8",
    "searhk;": "\u2925",
    "searr;": "\u2198",
    "searrow;": "\u2198",
    "sect": "\u00A7",
    "sect;": "\u00A7",
    "semi;": ";",
    "seswar;": "\u2929",
    "setminus;": "\u2216",
    "setmn;": "\u2216",
    "sext;": "\u2736",
    "sfr;": "\u1D530",
    "sfrown;": "\u2322",
    "sharp;": "\u266F",
    "shchcy;": "\u0449",
    "shcy;": "\u0448",
    "shortmid;": "\u2223",
    "shortparallel;": "\u2225",
    "shy": "\u00AD",
    "shy;": "\u00AD",
    "sigma;": "\u03C3",
    "sigmaf;": "\u03C2",
    "sigmav;": "\u03C2",
    "sim;": "\u223C",
    "simdot;": "\u2A6A",
    "sime;": "\u2243",
    "simeq;": "\u2243",
    "simg;": "\u2A9E",
    "simgE;": "\u2AA0",
    "siml;": "\u2A9D",
    "simlE;": "\u2A9F",
    "simne;": "\u2246",
    "simplus;": "\u2A24",
    "simrarr;": "\u2972",
    "slarr;": "\u2190",
    "smallsetminus;": "\u2216",
    "smashp;": "\u2A33",
    "smeparsl;": "\u29E4",
    "smid;": "\u2223",
    "smile;": "\u2323",
    "smt;": "\u2AAA",
    "smte;": "\u2AAC",
    "smtes;": "\u2AAC\uFE00",
    "softcy;": "\u044C",
    "sol;": "/",
    "solb;": "\u29C4",
    "solbar;": "\u233F",
    "sopf;": "\u1D564",
    "spades;": "\u2660",
    "spadesuit;": "\u2660",
    "spar;": "\u2225",
    "sqcap;": "\u2293",
    "sqcaps;": "\u2293\uFE00",
    "sqcup;": "\u2294",
    "sqcups;": "\u2294\uFE00",
    "sqsub;": "\u228F",
    "sqsube;": "\u2291",
    "sqsubset;": "\u228F",
    "sqsubseteq;": "\u2291",
    "sqsup;": "\u2290",
    "sqsupe;": "\u2292",
    "sqsupset;": "\u2290",
    "sqsupseteq;": "\u2292",
    "squ;": "\u25A1",
    "square;": "\u25A1",
    "squarf;": "\u25AA",
    "squf;": "\u25AA",
    "srarr;": "\u2192",
    "sscr;": "\u1D4C8",
    "ssetmn;": "\u2216",
    "ssmile;": "\u2323",
    "sstarf;": "\u22C6",
    "star;": "\u2606",
    "starf;": "\u2605",
    "straightepsilon;": "\u03F5",
    "straightphi;": "\u03D5",
    "strns;": "\u00AF",
    "sub;": "\u2282",
    "subE;": "\u2AC5",
    "subdot;": "\u2ABD",
    "sube;": "\u2286",
    "subedot;": "\u2AC3",
    "submult;": "\u2AC1",
    "subnE;": "\u2ACB",
    "subne;": "\u228A",
    "subplus;": "\u2ABF",
    "subrarr;": "\u2979",
    "subset;": "\u2282",
    "subseteq;": "\u2286",
    "subseteqq;": "\u2AC5",
    "subsetneq;": "\u228A",
    "subsetneqq;": "\u2ACB",
    "subsim;": "\u2AC7",
    "subsub;": "\u2AD5",
    "subsup;": "\u2AD3",
    "succ;": "\u227B",
    "succapprox;": "\u2AB8",
    "succcurlyeq;": "\u227D",
    "succeq;": "\u2AB0",
    "succnapprox;": "\u2ABA",
    "succneqq;": "\u2AB6",
    "succnsim;": "\u22E9",
    "succsim;": "\u227F",
    "sum;": "\u2211",
    "sung;": "\u266A",
    "sup1": "\u00B9",
    "sup1;": "\u00B9",
    "sup2": "\u00B2",
    "sup2;": "\u00B2",
    "sup3": "\u00B3",
    "sup3;": "\u00B3",
    "sup;": "\u2283",
    "supE;": "\u2AC6",
    "supdot;": "\u2ABE",
    "supdsub;": "\u2AD8",
    "supe;": "\u2287",
    "supedot;": "\u2AC4",
    "suphsol;": "\u27C9",
    "suphsub;": "\u2AD7",
    "suplarr;": "\u297B",
    "supmult;": "\u2AC2",
    "supnE;": "\u2ACC",
    "supne;": "\u228B",
    "supplus;": "\u2AC0",
    "supset;": "\u2283",
    "supseteq;": "\u2287",
    "supseteqq;": "\u2AC6",
    "supsetneq;": "\u228B",
    "supsetneqq;": "\u2ACC",
    "supsim;": "\u2AC8",
    "supsub;": "\u2AD4",
    "supsup;": "\u2AD6",
    "swArr;": "\u21D9",
    "swarhk;": "\u2926",
    "swarr;": "\u2199",
    "swarrow;": "\u2199",
    "swnwar;": "\u292A",
    "szlig": "\u00DF",
    "szlig;": "\u00DF",
    "target;": "\u2316",
    "tau;": "\u03C4",
    "tbrk;": "\u23B4",
    "tcaron;": "\u0165",
    "tcedil;": "\u0163",
    "tcy;": "\u0442",
    "tdot;": "\u20DB",
    "telrec;": "\u2315",
    "tfr;": "\u1D531",
    "there4;": "\u2234",
    "therefore;": "\u2234",
    "theta;": "\u03B8",
    "thetasym;": "\u03D1",
    "thetav;": "\u03D1",
    "thickapprox;": "\u2248",
    "thicksim;": "\u223C",
    "thinsp;": "\u2009",
    "thkap;": "\u2248",
    "thksim;": "\u223C",
    "thorn": "\u00FE",
    "thorn;": "\u00FE",
    "tilde;": "\u02DC",
    "times": "\u00D7",
    "times;": "\u00D7",
    "timesb;": "\u22A0",
    "timesbar;": "\u2A31",
    "timesd;": "\u2A30",
    "tint;": "\u222D",
    "toea;": "\u2928",
    "top;": "\u22A4",
    "topbot;": "\u2336",
    "topcir;": "\u2AF1",
    "topf;": "\u1D565",
    "topfork;": "\u2ADA",
    "tosa;": "\u2929",
    "tprime;": "\u2034",
    "trade;": "\u2122",
    "triangle;": "\u25B5",
    "triangledown;": "\u25BF",
    "triangleleft;": "\u25C3",
    "trianglelefteq;": "\u22B4",
    "triangleq;": "\u225C",
    "triangleright;": "\u25B9",
    "trianglerighteq;": "\u22B5",
    "tridot;": "\u25EC",
    "trie;": "\u225C",
    "triminus;": "\u2A3A",
    "triplus;": "\u2A39",
    "trisb;": "\u29CD",
    "tritime;": "\u2A3B",
    "trpezium;": "\u23E2",
    "tscr;": "\u1D4C9",
    "tscy;": "\u0446",
    "tshcy;": "\u045B",
    "tstrok;": "\u0167",
    "twixt;": "\u226C",
    "twoheadleftarrow;": "\u219E",
    "twoheadrightarrow;": "\u21A0",
    "uArr;": "\u21D1",
    "uHar;": "\u2963",
    "uacute": "\u00FA",
    "uacute;": "\u00FA",
    "uarr;": "\u2191",
    "ubrcy;": "\u045E",
    "ubreve;": "\u016D",
    "ucirc": "\u00FB",
    "ucirc;": "\u00FB",
    "ucy;": "\u0443",
    "udarr;": "\u21C5",
    "udblac;": "\u0171",
    "udhar;": "\u296E",
    "ufisht;": "\u297E",
    "ufr;": "\u1D532",
    "ugrave": "\u00F9",
    "ugrave;": "\u00F9",
    "uharl;": "\u21BF",
    "uharr;": "\u21BE",
    "uhblk;": "\u2580",
    "ulcorn;": "\u231C",
    "ulcorner;": "\u231C",
    "ulcrop;": "\u230F",
    "ultri;": "\u25F8",
    "umacr;": "\u016B",
    "uml": "\u00A8",
    "uml;": "\u00A8",
    "uogon;": "\u0173",
    "uopf;": "\u1D566",
    "uparrow;": "\u2191",
    "updownarrow;": "\u2195",
    "upharpoonleft;": "\u21BF",
    "upharpoonright;": "\u21BE",
    "uplus;": "\u228E",
    "upsi;": "\u03C5",
    "upsih;": "\u03D2",
    "upsilon;": "\u03C5",
    "upuparrows;": "\u21C8",
    "urcorn;": "\u231D",
    "urcorner;": "\u231D",
    "urcrop;": "\u230E",
    "uring;": "\u016F",
    "urtri;": "\u25F9",
    "uscr;": "\u1D4CA",
    "utdot;": "\u22F0",
    "utilde;": "\u0169",
    "utri;": "\u25B5",
    "utrif;": "\u25B4",
    "uuarr;": "\u21C8",
    "uuml": "\u00FC",
    "uuml;": "\u00FC",
    "uwangle;": "\u29A7",
    "vArr;": "\u21D5",
    "vBar;": "\u2AE8",
    "vBarv;": "\u2AE9",
    "vDash;": "\u22A8",
    "vangrt;": "\u299C",
    "varepsilon;": "\u03F5",
    "varkappa;": "\u03F0",
    "varnothing;": "\u2205",
    "varphi;": "\u03D5",
    "varpi;": "\u03D6",
    "varpropto;": "\u221D",
    "varr;": "\u2195",
    "varrho;": "\u03F1",
    "varsigma;": "\u03C2",
    "varsubsetneq;": "\u228A\uFE00",
    "varsubsetneqq;": "\u2ACB\uFE00",
    "varsupsetneq;": "\u228B\uFE00",
    "varsupsetneqq;": "\u2ACC\uFE00",
    "vartheta;": "\u03D1",
    "vartriangleleft;": "\u22B2",
    "vartriangleright;": "\u22B3",
    "vcy;": "\u0432",
    "vdash;": "\u22A2",
    "vee;": "\u2228",
    "veebar;": "\u22BB",
    "veeeq;": "\u225A",
    "vellip;": "\u22EE",
    "verbar;": "|",
    "vert;": "|",
    "vfr;": "\u1D533",
    "vltri;": "\u22B2",
    "vnsub;": "\u2282\u20D2",
    "vnsup;": "\u2283\u20D2",
    "vopf;": "\u1D567",
    "vprop;": "\u221D",
    "vrtri;": "\u22B3",
    "vscr;": "\u1D4CB",
    "vsubnE;": "\u2ACB\uFE00",
    "vsubne;": "\u228A\uFE00",
    "vsupnE;": "\u2ACC\uFE00",
    "vsupne;": "\u228B\uFE00",
    "vzigzag;": "\u299A",
    "wcirc;": "\u0175",
    "wedbar;": "\u2A5F",
    "wedge;": "\u2227",
    "wedgeq;": "\u2259",
    "weierp;": "\u2118",
    "wfr;": "\u1D534",
    "wopf;": "\u1D568",
    "wp;": "\u2118",
    "wr;": "\u2240",
    "wreath;": "\u2240",
    "wscr;": "\u1D4CC",
    "xcap;": "\u22C2",
    "xcirc;": "\u25EF",
    "xcup;": "\u22C3",
    "xdtri;": "\u25BD",
    "xfr;": "\u1D535",
    "xhArr;": "\u27FA",
    "xharr;": "\u27F7",
    "xi;": "\u03BE",
    "xlArr;": "\u27F8",
    "xlarr;": "\u27F5",
    "xmap;": "\u27FC",
    "xnis;": "\u22FB",
    "xodot;": "\u2A00",
    "xopf;": "\u1D569",
    "xoplus;": "\u2A01",
    "xotime;": "\u2A02",
    "xrArr;": "\u27F9",
    "xrarr;": "\u27F6",
    "xscr;": "\u1D4CD",
    "xsqcup;": "\u2A06",
    "xuplus;": "\u2A04",
    "xutri;": "\u25B3",
    "xvee;": "\u22C1",
    "xwedge;": "\u22C0",
    "yacute": "\u00FD",
    "yacute;": "\u00FD",
    "yacy;": "\u044F",
    "ycirc;": "\u0177",
    "ycy;": "\u044B",
    "yen": "\u00A5",
    "yen;": "\u00A5",
    "yfr;": "\u1D536",
    "yicy;": "\u0457",
    "yopf;": "\u1D56A",
    "yscr;": "\u1D4CE",
    "yucy;": "\u044E",
    "yuml": "\u00FF",
    "yuml;": "\u00FF",
    "zacute;": "\u017A",
    "zcaron;": "\u017E",
    "zcy;": "\u0437",
    "zdot;": "\u017C",
    "zeetrf;": "\u2128",
    "zeta;": "\u03B6",
    "zfr;": "\u1D537",
    "zhcy;": "\u0436",
    "zigrarr;": "\u21DD",
    "zopf;": "\u1D56B",
    "zscr;": "\u1D4CF",
    "zwj;": "\u200D",
    "zwnj;": "\u200C"
};

},{}],"./html5":[function(require,module,exports){
module.exports=require('VxNTWn');
},{}],11:[function(require,module,exports){
(function(){require('../core-upgrade');
var HTML5 = require('../html5');
var events = require('events');
var util = require('util');
var Buffer = require('./buffer').Buffer;
var Models = HTML5.Models;

var ENTITY_KEYS = Object.keys(HTML5.ENTITIES);

var Tokenizer = HTML5.Tokenizer = function HTML5Tokenizer(input, document, tree) {
    events.EventEmitter.call(this);
    var state;
    var buffer = new Buffer();
    var escapeFlag = false;
    var lastFourChars = '';
    var current_token = null;
    var temporaryBuffer = null;
    var content_model = Models.PCDATA;
    var source;

    function data_state(buffer) {
        var c = buffer.char();
        if (c !== HTML5.EOF && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA)) {
            lastFourChars += c;
            if (lastFourChars.length >= 4) {
                lastFourChars = lastFourChars.substr(-4);
            }
        }

        if (content_model == Models.SCRIPT_CDATA) {
            if (script_buffer === null) {
                script_buffer = '';
            }
        }

        if (c === HTML5.EOF) {
            emitToken(HTML5.EOF_TOK);
            buffer.commit();
            return false;
        } else if (c === '\0' && (content_model == Models.SCRIPT_CDATA || content_model == Models.PLAINTEXT || content_model == Models.RAWTEXT || content_model == Models.RCDATA)) {
            emitToken({type: 'Characters', data: "\ufffd"});
            buffer.commit();
        } else if (c == '&' && (content_model == Models.PCDATA || content_model == Models.RCDATA) && !escapeFlag) {
            newState(entity_data_state);
        } else if (c == '-' && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA) && !escapeFlag && lastFourChars == '<!--') {
            escapeFlag = true;
            emitToken({type: 'Characters', data: c});
            buffer.commit();
        } else if (c == '<' && !escapeFlag && (content_model == Models.PCDATA || content_model == Models.RCDATA || content_model == Models.CDATA || content_model == Models.SCRIPT_CDATA)) {
            newState(tag_open_state);
        } else if (c == '>' && escapeFlag && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA) && lastFourChars.match(/-->$/)) {
            escapeFlag = false;
            emitToken({type: 'Characters', data: c});
            buffer.commit();
        } else if (HTML5.SPACE_CHARACTERS_R.test(c)) {
            emitToken({type: 'SpaceCharacters', data: c + buffer.matchWhile(HTML5.SPACE_CHARACTERS)});
            buffer.commit();
        } else {
            var o = buffer.matchUntil("\u0000|[&<>-]");
            emitToken({type: 'Characters', data: c + o});
            lastFourChars += c;
            lastFourChars = lastFourChars.slice(-4);
            buffer.commit();
        }
        return true;
    }

    var entity_data_state = function entity_data_state(buffer) {
        var entity = consume_entity(buffer);
        if (entity) {
            emitToken({type: 'Characters', data: entity});
        } else {
            emitToken({type: 'Characters', data: '&'});
        }
        newState(data_state);
        return true;
    };

    this.tokenize = function() {
        if (this.pump) this.pump();
    };

    var emitToken = function emitToken(tok) { 
        tok = normalize_token(tok);
        if (content_model == Models.SCRIPT_CDATA && (tok.type == 'Characters' || tok.type == 'SpaceCharacters') && !buffer.eof) {
            HTML5.debug('tokenizer.addScriptData', tok);
            script_buffer += tok.data;
        } else {
            HTML5.debug('tokenizer.token', tok);
            this.emit('token', tok);
        }
    }.bind(this);

    function consume_entity(buffer, allowed_char, from_attr) {
        var char = null;
        var chars = buffer.char();
        var c;
        if (chars === HTML5.EOF) return false;
        if (chars.match(HTML5.SPACE_CHARACTERS) || chars == '<' || chars == '&'
            || (allowed_char && allowed_char == chars)) {
            buffer.unget(chars);
        } else if (chars[0] == '#') { // Maybe a numeric entity
            c = buffer.shift(2);
            if (c === HTML5.EOF) {
                parse_error("expected-numeric-entity-but-got-eof");
                buffer.unget(chars);
                return false;
            }
            chars += c;
            if (chars[1] && chars[1].toLowerCase() == 'x' && HTML5.HEX_DIGITS_R.test(chars[2])) {
                buffer.unget(chars[2]);
                char = consume_numeric_entity(buffer, true);
            } else if (chars[1] && HTML5.DIGITS_R.test(chars[1])) {
                buffer.unget(chars.slice(1));
                char = consume_numeric_entity(buffer, false);
            } else {
                buffer.unget(chars);
                parse_error("expected-numeric-entity");
            }
        } else {
            var filteredEntityList = ENTITY_KEYS.filter(function(e) {
                return e[0] == chars[0];
            });
            var entityName = null;
            var matches = function(e) {
                return e.indexOf(chars) === 0;
            };
            while(true) {
                if (filteredEntityList.some(matches)) {
                    filteredEntityList = filteredEntityList.filter(matches);
                    c = buffer.char();
                    if (c !== HTML5.EOF) {
                        chars += c;
                    } else {
                        break;
                    }
                } else {
                    break;
                }

                if (HTML5.ENTITIES[chars]) {
                    entityName = chars;
                    if (entityName[entityName.length - 1] == ';') break;
                }
            } 

            if (entityName) {
                if (entityName[entityName.length - 1] != ';') {
                    parse_error("named-entity-without-semicolon");
                }
                if (entityName[entityName.length - 1] != ';' && from_attr && (HTML5.ASCII_LETTERS_R.test(chars.substr(entityName.length, 1)) || HTML5.DIGITS_R.test(chars.substr(entityName.length, 1)) || chars.substr(entityName.length, 1) == '=')) {
                    buffer.unget(chars);
                    char = '&';
                } else {
                    buffer.unget(chars.slice(entityName.length));
                    char = HTML5.ENTITIES[entityName];
                }
            } else {
                parse_error("expected-named-entity");
                buffer.unget(chars);
            }
        }

        return char;
    }

    function replaceEntityNumbers(c) {
        switch(c) {
            case 0x00: return 0xFFFD; // REPLACEMENT CHARACTER
            case 0x13: return 0x0010; // Carriage return
            case 0x80: return 0x20AC; // EURO SIGN
            case 0x81: return 0x0081; // <control>
            case 0x82: return 0x201A; // SINGLE LOW-9 QUOTATION MARK
            case 0x83: return 0x0192; // LATIN SMALL LETTER F WITH HOOK
            case 0x84: return 0x201E; // DOUBLE LOW-9 QUOTATION MARK
            case 0x85: return 0x2026; // HORIZONTAL ELLIPSIS
            case 0x86: return 0x2020; // DAGGER
            case 0x87: return 0x2021; // DOUBLE DAGGER
            case 0x88: return 0x02C6; // MODIFIER LETTER CIRCUMFLEX ACCENT
            case 0x89: return 0x2030; // PER MILLE SIGN
            case 0x8A: return 0x0160; // LATIN CAPITAL LETTER S WITH CARON
            case 0x8B: return 0x2039; // SINGLE LEFT-POINTING ANGLE QUOTATION MARK
            case 0x8C: return 0x0152; // LATIN CAPITAL LIGATURE OE
            case 0x8D: return 0x008D; // <control>
            case 0x8E: return 0x017D; // LATIN CAPITAL LETTER Z WITH CARON
            case 0x8F: return 0x008F; // <control>
            case 0x90: return 0x0090; // <control>
            case 0x91: return 0x2018; // LEFT SINGLE QUOTATION MARK
            case 0x92: return 0x2019; // RIGHT SINGLE QUOTATION MARK
            case 0x93: return 0x201C; // LEFT DOUBLE QUOTATION MARK
            case 0x94: return 0x201D; // RIGHT DOUBLE QUOTATION MARK
            case 0x95: return 0x2022; // BULLET
            case 0x96: return 0x2013; // EN DASH
            case 0x97: return 0x2014; // EM DASH
            case 0x98: return 0x02DC; // SMALL TILDE
            case 0x99: return 0x2122; // TRADE MARK SIGN
            case 0x9A: return 0x0161; // LATIN SMALL LETTER S WITH CARON
            case 0x9B: return 0x203A; // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
            case 0x9C: return 0x0153; // LATIN SMALL LIGATURE OE
            case 0x9D: return 0x009D; // <control>
            case 0x9E: return 0x017E; // LATIN SMALL LETTER Z WITH CARON
            case 0x9F: return 0x0178; // LATIN CAPITAL LETTER Y WITH DIAERESIS
            default:
                if ((c >= 0xD800 && c <= 0xDFFF) || c >= 0x10FFFF) { /// @todo. The spec says > 0x10FFFF, not >=. Section 8.2.4.69.
                    return 0xFFFD;
                } else if ((c >= 0x0001 && c <= 0x0008) || (c >= 0x000E && c <= 0x001F) ||
                    (c >= 0x007F && c <= 0x009F) || (c >= 0xFDD0 && c <= 0xFDEF) ||
                    c == 0x000B || c == 0xFFFE || c == 0x1FFFE || c == 0x2FFFFE ||
                    c == 0x2FFFF || c == 0x3FFFE || c == 0x3FFFF || c == 0x4FFFE ||
                    c == 0x4FFFF || c == 0x5FFFE || c == 0x5FFFF || c == 0x6FFFE ||
                    c == 0x6FFFF || c == 0x7FFFE || c == 0x7FFFF || c == 0x8FFFE ||
                    c == 0x8FFFF || c == 0x9FFFE || c == 0x9FFFF || c == 0xAFFFE ||
                    c == 0xAFFFF || c == 0xBFFFE || c == 0xBFFFF || c == 0xCFFFE ||
                    c == 0xCFFFF || c == 0xDFFFE || c == 0xDFFFF || c == 0xEFFFE ||
                    c == 0xEFFFF || c == 0xFFFFE || c == 0xFFFFF || c == 0x10FFFE ||
                    c == 0x10FFFF) {
                    return c;
                }
        }
    }

    function consume_numeric_entity(buffer, hex) {
        var allowed, radix;
        if (hex) {
            allowed = HTML5.HEX_DIGITS_R;
            radix = 16;
        } else {
            allowed = HTML5.DIGITS_R;
            radix = 10;
        }

        var chars = '';

        var c = buffer.char();
        while(c !== HTML5.EOF && allowed.test(c)) {
            chars = chars + c;
            c = buffer.char();
        }

        var charAsInt = parseInt(chars, radix);

        var replacement = replaceEntityNumbers(charAsInt);
        if (replacement) {
            parse_error("invalid-numeric-entity-replaced");
            charAsInt = replacement;
        }

        var char = String.fromCharCode(charAsInt);

        if (c !== ';') {
            parse_error("numeric-entity-without-semicolon");
            buffer.unget(c);
        } 

        return char;
    }

    function process_entity_in_attribute(buffer, allowed_char) {
        var entity = consume_entity(buffer, allowed_char, true);
        if (entity) {
            current_token.data.last().nodeValue += entity;
        } else {
            current_token.data.last().nodeValue += '&';
        }
    }

    function script_data_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            emitToken(HTML5.EOF_TOK);
            return false;
        } else if (data == '<') {
            newState(script_data_less_than_sign_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            emitToken({type: 'Characters', data: '\uFFFD'});
        } else {
            var chars = buffer.matchUntil("<|\u0000");
            emitToken({type: 'Characters', data: data + chars});
        }
        return true;
    }

    function script_data_less_than_sign_state(buffer) {
        var data = buffer.shift(1);
        if (data == "/") {
            temporaryBuffer = '';
            newState(script_data_end_tag_open_state);
        } else if (data == '!') {
            emitToken({type: 'Characters', data: '<!'});
            newState(script_data_escape_start_state);
        } else {
            emitToken({type: 'Characters', data: '<'});
            buffer.unget(data);
            newState(script_data_state);
        }
        return true;
    }

    function script_data_end_tag_open_state(buffer) {
        var data = buffer.shift(1);
        if (HTML5.ASCII_LETTERS_R.test(data)) {
            temporaryBuffer += data;
            newState(script_data_end_tag_name_state);
        } else {
            emitToken({type: 'Characters', data: '</'});
            buffer.unget(data);
            newState(script_data_state);
        }
        return true;
    }

    function script_data_end_tag_name_state(buffer) {
        var appropriate = current_token && (current_token.name == temporaryBuffer.toLowerCase());
        var data = buffer.shift(1);
        if (HTML5.SPACE_CHARACTERS_R.test(data) && appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            newState(before_attribute_name_state);
        } else if (data == '/' && appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            newState(self_closing_tag_state);
        } else if (data == '>' && appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            emit_current_token();
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            temporaryBuffer += data;
            buffer.commit();
        } else {
            emitToken({type: 'Characters', data: '</' + temporaryBuffer});
            buffer.unget(data);
            newState(script_data_state);
        }
        return true;
    }

    function script_data_escape_start_state(buffer) {
        var data = buffer.shift(1);
        if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_escape_start_dash_state);
        } else {
            buffer.unget(data);
            newState(script_data_state);
        }
        return true;
    }

    function script_data_escape_start_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_escaped_dash_dash_state);
        } else {
            buffer.unget(data);
            newState(script_data_state);
        }
        return true;
    }

    function script_data_escaped_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_escaped_dash_state);
        } else if (data == '<') {
            newState(script_data_escaped_less_then_sign_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            emitToken({type: 'Characters', data: '\uFFFD'});
            buffer.commit();
        } else {
            var chars = buffer.matchUntil('<|-|\u0000');
            emitToken({type: 'Characters', data: data + chars});
            buffer.commit();
        }
        return true;
    }

    function script_data_escaped_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_escaped_dash_dash_state);
        } else if (data == '<') {
            newState(script_data_escaped_less_then_sign_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            emitToken({type: 'Characters', data: '\uFFFD'});
            newState(script_data_escaped_state);
        } else {
            emitToken({type: 'Characters', data: data});
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_escaped_dash_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error('eof-in-script');
            buffer.unget(data);
            newState(data_state);
        } else if (data == '<') {
            newState(script_data_escaped_less_then_sign_state);
        } else if (data == '>') {
            emitToken({type: 'Characters', data: '>'});
            newState(script_data_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            emitToken({type: 'Characters', data: '\uFFFD'});
            newState(script_data_escaped_state);
        } else {
            emitToken({type: 'Characters', data: data});
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_escaped_less_then_sign_state(buffer) {
        var data = buffer.shift(1);
        if (data == '/') {
            temporaryBuffer = '';
            newState(script_data_escaped_end_tag_open_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            emitToken({type: 'Characters', data: '<' + data});
            temporaryBuffer = data;
            newState(script_data_double_escape_start_state);
        } else {
            emitToken({type: 'Characters', data: '<'});
            buffer.unget(data);
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_escaped_end_tag_open_state(buffer) {
        var data = buffer.shift(1);
        if (HTML5.ASCII_LETTERS_R.test(data)) {
            temporaryBuffer = data;
            newState(script_data_escaped_end_tag_name_state);
        } else {
            emitToken({type: 'Characters', data: '</'});
            buffer.unget(data);
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_escaped_end_tag_name_state(buffer) {
        var appropriate = current_token && (current_token.name == temporaryBuffer.toLowerCase());
        var data = buffer.shift(1);
        if (HTML5.SPACE_CHARACTERS_R.test(data) && appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            newState(before_attribute_name_state);
        } else if (data == '/' && appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            newState(self_closing_tag_state);
        } else if (data == '>' &&  appropriate) {
            current_token = {type: 'EndTag', name: 'script', data: [], self_closing: false};
            newState(data_state);
            emit_current_token();
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            temporaryBuffer += data;
            buffer.commit();
        } else {
            emitToken({type: 'Characters', data: '</' + temporaryBuffer});
            buffer.unget(data);
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_double_escape_start_state(buffer) {
        var data = buffer.shift(1);
        if (HTML5.SPACE_CHARACTERS_R.test(data) || data == '/' || data == '>') {
            emitToken({type: 'Characters', data: data});
            if (temporaryBuffer.toLowerCase() == 'script')
                newState(script_data_double_escaped_state);
            else
                newState(script_data_escaped_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            emitToken({type: 'Characters', data: data});
            temporaryBuffer += data;
            buffer.commit()
        } else {
            buffer.unget(data);
            newState(script_data_escaped_state);
        }
        return true;
    }

    function script_data_double_escaped_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error('eof-in-script');
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_double_escaped_dash_state);
        } else if (data == '<') {
            emitToken({type: 'Characters', data: '<'});
            newState(script_data_double_escaped_less_than_sign_state);
        } else if (data == '\u0000') {
            parse_error('invalid-codepoint');
            emitToken({type: 'Characters', data: '\uFFFD'});
            buffer.commit();
        } else {
            emitToken({type: 'Characters', data: data});
            buffer.commit();
        }
        return true;
    }

    function script_data_double_escaped_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error('eof-in-script');
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            newState(script_data_double_escaped_dash_dash_state);
        } else if (data == '<') {
            emitToken({type: 'Characters', data: '<'});
            newState(script_data_double_escaped_less_than_sign_state);
        } else if (data == '\u0000') {
            parse_error('invalid-codepoint');
            emitToken({type: 'Characters', data: '\uFFFD'});
            newState(script_data_double_escaped_state);
        } else {
            emitToken({type: 'Characters', data: data});
            newState(script_data_double_escaped_state);
        }
        return true;
    }

    function script_data_double_escaped_dash_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error('eof-in-script');
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            emitToken({type: 'Characters', data: '-'});
            buffer.commit();
        } else if (data == '<') {
            emitToken({type: 'Characters', data: '<'});
            newState(script_data_double_escaped_less_than_sign_state);
        } else if (data == '>') {
            emitToken({type: 'Characters', data: '>'});
            newState(script_data_state);
        } else if (data == '\u0000') {
            parse_error('invalid-codepoint');
            emitToken({type: 'Characters', data: '\uFFFD'});
            newState(script_data_double_escaped_state);
        } else {
            emitToken({type: 'Characters', data: data});
            newState(script_data_double_escaped_state);
        }
        return true;
    }

    function script_data_double_escaped_less_than_sign_state(buffer) {
        var data = buffer.shift(1);
        if (data == '/') {
            emitToken({type: 'Characters', data: '/'});
            temporaryBuffer = '';
            newState(script_data_double_escape_end_state);
        } else {
            buffer.unget(data);
            newState(script_data_double_escaped_state);
        }
        return true;
    }

    function script_data_double_escape_end_state(buffer) {
        var data = buffer.shift(1);
        if (HTML5.SPACE_CHARACTERS_R.test(data) || data == '/' || data == '>') {
            emitToken({type: 'Characters', data: data});
            if (temporaryBuffer.toLowerCase() == 'script')
                newState(script_data_escaped_state);
            else
                newState(script_data_double_escaped_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            emitToken({type: 'Characters', data: data});
            temporaryBuffer += data;
            buffer.commit();
        } else {
            buffer.unget(data);
            newState(script_data_double_escaped_state);
        }
        return true;
    }

    function tag_open_state(buffer) {
        var data = buffer.char();
        if (content_model == Models.PCDATA) {
            if (data === HTML5.EOF) {
                parse_error("bare-less-than-sign-at-eof");
                emitToken({type: 'Characters', data: '<'});
                buffer.unget(data);
                newState(data_state);
            } else if (HTML5.ASCII_LETTERS_R.test(data)) {
                current_token = {type: 'StartTag', name: data, data: []};
                newState(tag_name_state);
            } else if (data == '!') {
                newState(markup_declaration_open_state);
            } else if (data == '/') {
                newState(close_tag_open_state);
            } else if (data == '>') {
                parse_error("expected-tag-name-but-got-right-bracket");
                emitToken({type: 'Characters', data: "<>"});
                newState(data_state);
            } else if (data == '?') {
                parse_error("expected-tag-name-but-got-question-mark");
                buffer.unget(data);
                newState(bogus_comment_state);
            } else {
                parse_error("expected-tag-name");
                emitToken({type: 'Characters', data: "<"});
                buffer.unget(data);
                newState(data_state);
            }
        } else {
            if (data === '/') {
                newState(close_tag_open_state);
            } else {
                emitToken({type: 'Characters', data: "<"});
                buffer.unget(data);
                newState(data_state);
            }
        }
        return true;
    }

    function close_tag_open_state(buffer) {
        if (content_model == Models.RCDATA || content_model == Models.CDATA || content_model == Models.SCRIPT_CDATA) {
            var chars = '';
            if (current_token) {
                for(var i = 0; i <= current_token.name.length; i++) {
                    var c = buffer.char();
                    if (c === HTML5.EOF) break;
                    chars += c;
                }
                buffer.unget(chars);
            }

            if (current_token &&
                current_token.name.toLowerCase() == chars.slice(0, current_token.name.length).toLowerCase() &&
                (chars.length > current_token.name.length ? new RegExp('[' + HTML5.SPACE_CHARACTERS_IN + '></\0]').test(chars.substr(-1)) : true)
            ) {
                content_model = Models.PCDATA;
            } else {
                emitToken({type: 'Characters', data: '</'});
                newState(data_state);
                return true;
            }
        }

        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("expected-closing-tag-but-got-eof");
            emitToken({type: 'Characters', data: '</'});
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            current_token = {type: 'EndTag', name: data, data: []};
            newState(tag_name_state);
        } else if (data == '>') {
            parse_error("expected-closing-tag-but-got-right-bracket");
            newState(data_state);
        } else {
            parse_error("expected-closing-tag-but-got-char", {data: data}); // param 1 is datavars:
            buffer.unget(data);
            newState(bogus_comment_state);
        }
        return true;
    }

    function tag_name_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error('eof-in-tag-name');
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_attribute_name_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            current_token.name += data + buffer.matchWhile(HTML5.ASCII_LETTERS);
        } else if (data == '>') {
            emit_current_token();
        } else if (data == '/') {
            newState(self_closing_tag_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.name += "\uFFFD";
        } else { 
            current_token.name += data;
        }
        buffer.commit();

        return true;
    }

    function before_attribute_name_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("expected-attribute-name-but-got-eof");
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            buffer.matchWhile(HTML5.SPACE_CHARACTERS);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        } else if (data == '>') {
            emit_current_token();
        } else if (data == '/') {
            newState(self_closing_tag_state);
        } else if (data == "'" || data == '"' || data == '=' || data == '<') {
            parse_error("invalid-character-in-attribute-name");
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.push({nodeName: "\uFFFD", nodeValue: ""});
        } else {
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        }
        return true;
    }

    function attribute_name_state(buffer) {
        var data = buffer.shift(1);
        var leavingThisState = true;
        var emitToken = false;
        if (data === HTML5.EOF) {
            parse_error("eof-in-attribute-name");
            buffer.unget(data);
            newState(data_state);
            emitToken = true;
        } else if (data == '=') {
            newState(before_attribute_value_state);
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            current_token.data.last().nodeName += data + buffer.matchWhile(HTML5.ASCII_LETTERS);
            leavingThisState = false;
        } else if (data == '>') {
            emitToken = true;
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(after_attribute_name_state);
        } else if (data == '/') {
            newState(self_closing_tag_state);
        } else if (data == "'" || data == '"') {
            parse_error("invalid-character-in-attribute-name");
            current_token.data.last().nodeName += data;
            leavingThisState = false;
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.last().nodeName += "\uFFFD";
        } else {
            current_token.data.last().nodeName += data;
            leavingThisState = false;
        }

        if (leavingThisState) {
            var attributes = current_token.data;
            for (var k in attributes.slice(0, -1)) {
                if (attributes.last().nodeName == attributes[k].nodeName) {
                    parse_error("duplicate-attribute");
                    break; // Don't emit more than one of these errors
                }
            }
            if (emitToken) emit_current_token();
        } else {
            buffer.commit();
        }
        return true;
    }

    function after_attribute_name_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("expected-end-of-tag-but-got-eof");
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            buffer.matchWhile(HTML5.SPACE_CHARACTERS);
        } else if (data == '=') {
            newState(before_attribute_value_state);
        } else if (data == '>') {
            emit_current_token();
        } else if (HTML5.ASCII_LETTERS_R.test(data)) {
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        } else if (data == '/') {
            newState(self_closing_tag_state);
        } else if (data == "'" || data == '"' || data == '<') {
            parse_error("invalid-character-after-attribute-name");
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.push({nodeName: "\uFFFD", nodeValue: ""});
        } else {
            current_token.data.push({nodeName: data, nodeValue: ""});
            newState(attribute_name_state);
        }
        return true;
    }

    function before_attribute_value_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("expected-attribute-value-but-got-eof");
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            buffer.matchWhile(HTML5.SPACE_CHARACTERS);
        } else if (data == '"') {
            newState(attribute_value_double_quoted_state);
        } else if (data == '&') {
            newState(attribute_value_unquoted_state);
            buffer.unget(data);
        } else if (data == "'") {
            newState(attribute_value_single_quoted_state);
        } else if (data == '>') {
            parse_error("expected-attribute-value-but-got-right-bracket");
            emit_current_token();
        } else if (data == '=' || data == '<' || data == '`') {
            parse_error("unexpected-character-in-unquoted-attribute-value");
            current_token.data.last().nodeValue += data;
            newState(attribute_value_unquoted_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.last().nodeValue += "\uFFFD";
        } else {
            current_token.data.last().nodeValue += data;
            newState(attribute_value_unquoted_state);
        }

        return true;
    }

    function attribute_value_double_quoted_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-attribute-value-double-quote");
            buffer.unget(data);
            newState(data_state);
        } else if (data == '"') {
            newState(after_attribute_value_state);
        } else if (data == '&') {
            process_entity_in_attribute(buffer, '"');
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.last().nodeValue += "\uFFFD";
        } else {
            var s = buffer.matchUntil('\u0000|["&]');
            data = data + s;
            current_token.data.last().nodeValue += data;
        }
        return true;
    }

    function attribute_value_single_quoted_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-attribute-value-single-quote");
            buffer.unget(data);
            newState(data_state);
        } else if (data == "'") {
            newState(after_attribute_value_state);
        } else if (data == '&') {
            process_entity_in_attribute(buffer, "'");
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.last().nodeValue += "\uFFFD";
        } else {
            current_token.data.last().nodeValue += data + buffer.matchUntil("\u0000|['&]");
        }
        return true;
    }

    function attribute_value_unquoted_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-after-attribute-value");
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_attribute_name_state);
        } else if (data == '&') {
            process_entity_in_attribute(buffer, '>');
        } else if (data == '>') {
            emit_current_token();
        } else if (data == '"' || data == "'" || data == '=' || data == '`' || data == '<') {
            parse_error("unexpected-character-in-unquoted-attribute-value");
            current_token.data.last().nodeValue += data;
            buffer.commit();
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data.last().nodeValue += "\uFFFD";
        } else {
            var o = buffer.matchUntil("\u0000|["+ HTML5.SPACE_CHARACTERS_IN + '&<>"\'=`' +"]");
            if (o === HTML5.EOF) {
                parse_error("eof-in-attribute-value-no-quotes");
                emit_current_token();
            }
            buffer.commit();
            current_token.data.last().nodeValue += data + o;
        }
        return true;
    }

    function after_attribute_value_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-after-attribute-value");
            buffer.unget(data);
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_attribute_name_state);
        } else if (data == '>') {
            newState(data_state);
            emit_current_token();
        } else if (data == '/') {
            newState(self_closing_tag_state);
        } else {
            parse_error("unexpected-character-after-attribute-value");
            buffer.unget(data);
            newState(before_attribute_name_state);
        }
        return true;
    }

    function self_closing_tag_state(buffer) {
        var c = buffer.shift(1);
        if (c === HTML5.EOF) {
            parse_error("unexpected-eof-after-solidus-in-tag");
            buffer.unget(c);
            newState(data_state);
        } else if (c == '>') {
            current_token.self_closing = true;
            newState(data_state);
            emit_current_token();
        } else {
            parse_error("unexpected-character-after-solidus-in-tag");
            buffer.unget(c);
            newState(before_attribute_name_state);
        }
        return true;
    }

    function bogus_comment_state(buffer) {
        var s = buffer.matchUntil('>');
        s = s.replace(/\u0000/g, "\uFFFD");
        var tok = {type: 'Comment', data: s};
        buffer.char();
        emitToken(tok);
        newState(data_state);
        return true;
    }

    function markup_declaration_open_state(buffer) {
        var chars = buffer.shift(2);
        if (chars === '--') {
            current_token = {type: 'Comment', data: ''};
            newState(comment_start_state);
        } else {
            var newchars = buffer.shift(5);
            if (newchars === HTML5.EOF || chars === HTML5.EOF) {
                parse_error("expected-dashes-or-doctype");
                newState(bogus_comment_state);
                buffer.unget(chars);
                return true;
            }

            chars += newchars;
            if (chars.toUpperCase() == 'DOCTYPE') {
                current_token = {type: 'Doctype', name: '', publicId: null, systemId: null, correct: true};
                newState(doctype_state);
            } else if (tree.open_elements.last() && tree.open_elements.last().namespace && chars == '[CDATA[') {
                newState(cdata_section_state);
            } else {
                parse_error("expected-dashes-or-doctype");
                buffer.unget(chars);
                newState(bogus_comment_state);
            }
        }
        return true;
    }

    function cdata_section_state(buffer) {
        var data = buffer.matchUntil(']]>');
        buffer.shift(3);
        if (data) {
            emitToken({type: 'Characters', data: data});
        }
        newState(data_state);
        return true;
    }

    function comment_start_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            newState(comment_start_dash_state);
        } else if (data == '>') {
            parse_error("incorrect-comment");
            emitToken(current_token);
            newState(data_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data += "\uFFFD";
        } else {
            current_token.data += data + buffer.matchUntil('\u0000|-');
            newState(comment_state);
        }
        return true;
    }

    function comment_start_dash_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            newState(comment_end_state);
        } else if (data == '>') {
            parse_error("incorrect-comment");
            emitToken(current_token);
            newState(data_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data += "\uFFFD";
        } else {
            var s = buffer.matchUntil('\u0000|-');
            data = data + s;
            current_token.data += '-' + data;
            newState(comment_state);
        }
        return true;
    }

    function comment_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            newState(comment_end_dash_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data += "\uFFFD";
        } else {
            current_token.data += data + buffer.matchUntil('\u0000|-');
        }
        return true;
    }

    function comment_end_dash_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment-end-dash");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '-') {
            newState(comment_end_state);
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data += "-\uFFFD";
            newState(comment_state);
        } else {
            current_token.data += '-' + data + buffer.matchUntil('\u0000|-');
            buffer.char();
        }
        return true;
    }

    function comment_end_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment-double-dash");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '>') {
            emitToken(current_token);
            newState(data_state);
        } else if (data == '!') {
            parse_error("unexpected-bang-after-double-dash-in-comment");
            newState(comment_end_bang_state);
        } else if (data == '-') {
            parse_error("unexpected-dash-after-double-dash-in-comment");
            current_token.data += data;
        } else if (data == '\u0000') {
            parse_error("invalid-codepoint");
            current_token.data += "--\uFFFD";
            newState(comment_state);
        } else {
            parse_error("unexpected-char-in-comment");
            current_token.data += '--' + data;
            newState(comment_state);
        }
        return true;
    }

    function comment_end_bang_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-comment-end-bang-state");
            emitToken(current_token);
            buffer.unget(data);
            newState(data_state);
        } else if (data == '>') {
            emitToken(current_token);
            newState(data_state);
        } else if (data == '-') {
            current_token.data += '--!';
            newState(comment_end_dash_state);
        } else {
            current_token.data += '--!' + data;
            newState(comment_state);
        }
        return true;
    }

    function doctype_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("expected-doctype-name-but-got-eof");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_doctype_name_state);
        } else {
            parse_error("need-space-after-doctype");
            buffer.unget(data);
            newState(before_doctype_name_state);
        }
        return true;
    }

    function before_doctype_name_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("expected-doctype-name-but-got-eof");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '>') {
            parse_error("expected-doctype-name-but-got-right-bracket");
            current_token.correct = false;
            newState(data_state);
            emit_current_token();
        } else {
            if (HTML5.ASCII_LETTERS_R.test(data))
                data = data.toLowerCase();
            current_token.name = data;
            newState(doctype_name_state);
        }
        return true;
    }

    function doctype_name_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            current_token.correct = false;
            buffer.unget(data);
            parse_error("eof-in-doctype-name");
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(after_doctype_name_state);
        } else if (data == '>') {
            newState(data_state);
            emit_current_token();
        } else {
            if (HTML5.ASCII_LETTERS_R.test(data))
                data = data.toLowerCase();
            current_token.name += data;
            buffer.commit();
        }
        return true;
    }

    function after_doctype_name_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            current_token.correct = false;
            buffer.unget(data);
            parse_error("eof-in-doctype");
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '>') {
            newState(data_state);
            emit_current_token();
        } else {
            if (['p', 'P'].indexOf(data) > -1) {
                var expected = [['u', 'U'], ['b', 'B'], ['l', 'L'], ['i', 'I'], ['c', 'C']];
                var matched = expected.every(function(expected){
                    data = buffer.shift(1);
                    return expected.indexOf(data) > -1;
                });
                if (matched) {
                    newState(after_doctype_public_keyword_state);
                    return true;
                }
            } else if (['s', 'S'].indexOf(data) > -1) {
                var expected = [['y', 'Y'], ['s', 'S'], ['t', 'T'], ['e', 'E'], ['m', 'M']];
                var matched = expected.every(function(expected){
                    data = buffer.shift(1);
                    return expected.indexOf(data) > -1;
                });
                if (matched) {
                    newState(after_doctype_system_keyword_state);
                    return true;
                }
            }
            buffer.unget(data);
            current_token.correct = false;

            if (data === HTML5.EOF) {
                parse_error("eof-in-doctype");
                buffer.unget(data)
                newState(data_state);
                emit_current_token();
            } else {
                parse_error("expected-space-or-right-bracket-in-doctype", {data: data});
                newState(bogus_doctype_state);
            }
        }
        return true;
    }

    function after_doctype_public_keyword_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_doctype_public_identifier_state);
        } else if (data == "'" || data == '"') {
            parse_error("unexpected-char-in-doctype");
            buffer.unget(data);
            newState(before_doctype_public_identifier_state);
        } else {
            buffer.unget(data);
            newState(before_doctype_public_identifier_state);
        }
        return true;
    }

    function before_doctype_public_identifier_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '"') {
            current_token.publicId = '';
            newState(doctype_public_identifier_double_quoted_state);
        } else if (data == "'") {
            current_token.publicId = '';
            newState(doctype_public_identifier_single_quoted_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            newState(data_state);
            emit_current_token();
        } else {
            parse_error("unexpected-char-in-doctype");
            current_token.correct = false;
            newState(bogus_doctype_state);
        }
        return true;
    }

    function doctype_public_identifier_double_quoted_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (data == '"') {
            newState(after_doctype_public_identifier_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            newState(data_state);
            emit_current_token();
        } else {
            current_token.publicId += data;
        }
        return true;
    }

    function doctype_public_identifier_single_quoted_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            buffer.unget(data)
            newState(data_state);
            emit_current_token();
        } else if (data == "'") {
            newState(after_doctype_public_identifier_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            newState(data_state);
            emit_current_token();
        } else {
            current_token.publicId += data;
        }
        return true;
    }

    function after_doctype_public_identifier_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(between_doctype_public_and_system_identifiers_state);
        } else if (data == '>') {
            newState(data_state);
            emit_current_token();
        } else if (data == '"') {
            parse_error("unexpected-char-in-doctype");
            current_token.systemId = '';
            newState(doctype_system_identifier_double_quoted_state);
        } else if (data == "'") {
            parse_error("unexpected-char-in-doctype");
            current_token.systemId = '';
            newState(doctype_system_identifier_single_quoted_state);
        } else {
            parse_error("unexpected-char-in-doctype");
            current_token.correct = false;
            newState(bogus_doctype_state);
        }
        return true;
    }

    function between_doctype_public_and_system_identifiers_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '>') {
            emit_current_token();
            newState(data_state);
        } else if (data == '"') {
            current_token.systemId = '';
            newState(doctype_system_identifier_double_quoted_state);
        } else if (data == "'") {
            current_token.systemId = '';
            newState(doctype_system_identifier_single_quoted_state);
        } else {
            parse_error("unexpected-char-in-doctype");
            current_token.correct = false;
            newState(bogus_doctype_state);
        }
        return true;
    }

    function after_doctype_system_keyword_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
            newState(before_doctype_system_identifier_state);
        } else if (data == "'" || data == '"') {
            parse_error("unexpected-char-in-doctype");
            buffer.unget(data);
            newState(before_doctype_system_identifier_state);
        } else {
            buffer.unget(data);
            newState(before_doctype_system_identifier_state);
        }
        return true;
    }

    function before_doctype_system_identifier_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '"') {
            current_token.systemId = '';
            newState(doctype_system_identifier_double_quoted_state);
        } else if (data == "'") {
            current_token.systemId = '';
            newState(doctype_system_identifier_single_quoted_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            emit_current_token();
            newState(data_state);
        } else {
            parse_error("unexpected-char-in-doctype");
            current_token.correct = false;
            newState(bogus_doctype_state);
        }
        return true;
    }

    function doctype_system_identifier_double_quoted_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (data == '"') {
            newState(after_doctype_system_identifier_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            emit_current_token();
            newState(data_state);
        } else {
            current_token.systemId += data;
        }
        return true;
    }

    function doctype_system_identifier_single_quoted_state(buffer) {
        var data = buffer.char();
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (data == "'") {
            newState(after_doctype_system_identifier_state);
        } else if (data == '>') {
            parse_error("unexpected-end-of-doctype");
            current_token.correct = false;
            emit_current_token();
            newState(data_state);
        } else {
            current_token.systemId += data;
        }
        return true;
    }

    function after_doctype_system_identifier_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            parse_error("eof-in-doctype");
            current_token.correct = false;
            emit_current_token();
            buffer.unget(data)
            newState(data_state);
        } else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
        } else if (data == '>') {
            emit_current_token();
            newState(data_state);
        } else {
            parse_error("unexpected-char-in-doctype");
            newState(bogus_doctype_state);
        }
        return true;
    }

    function bogus_doctype_state(buffer) {
        var data = buffer.shift(1);
        if (data === HTML5.EOF) {
            buffer.unget(data);
            emit_current_token();
            newState(data_state);
        } else if (data == '>') {
            emit_current_token();
            newState(data_state);
        }
        return true;
    }

    function parse_error(message, context) {
        emitToken({type: 'ParseError', data: message, datavars: context});
        HTML5.debug('tokenizer.parseError', message, context);
    }

    function emit_current_token() {
        newState(data_state);
        var token = current_token;
        emitToken(token);
    }

    function normalize_token(token) {
        if (token.type == 'StartTag') {
            token.name = token.name.toLowerCase();
            if (token.data.length !== 0) {
                var data = {};
                token.data.reverse();
                token.data.forEach(function(e) {
                    data[e.nodeName.toLowerCase()] = e.nodeValue;
                });
                token.data = [];
                for(var k in data) {
                    token.data.push({nodeName: k, nodeValue: data[k]});
                }
                token.data.reverse();
            }
            if (token.self_closing && HTML5.VOID_ELEMENTS.indexOf(token.name) == -1) {
                parse_error('non-void-element-with-trailing-solidus', {name: token.name});
            }
        } else if (token.type == 'EndTag') {
            token.name = token.name.toLowerCase();
            if (token.self_closing) {
                parse_error('self-closing-flag-on-end-tag');
            }
            if (token.data.length !== 0) {
                parse_error('attributes-in-end-tag');
            }
        }

        return token;
    }

    if (typeof input === 'undefined') throw(new Error("No input given"));
    Object.defineProperty(this, 'content_model', {
        set: function(model) {
            HTML5.debug('tokenizer.content_model=', model);
            content_model = model;
        },
        get: function() {
            return content_model;
        }
    });

    Object.defineProperty(this, 'state', {
        set: function(state) {
            newState(state);
        },
        get: function() {
            return state;
        }
    });
    this.script_data_state = script_data_state;

    Object.defineProperty(this, 'position', {
        get:function() {
            return buffer.location();
        }
    });

    function newState(newstate) {
        HTML5.debug('tokenizer.state=', newstate.name);
        state = newstate;
        buffer.commit();
    }

    newState(data_state);

    if (input instanceof events.EventEmitter) {
        source = input;
        this.pump = null;
    } else {
        source = new events.EventEmitter();
        this.pump = function() {
            source.emit('data', input);
            source.emit('end');
        };
    }
    
    source.addListener('data', function(data) {
        if (typeof data !== 'string') data = data.toString();
        buffer.append(data);
        try {
            while(state(buffer));
        } catch(e) {
            if (e != HTML5.DRAIN) {
                throw(e);
            } else {
                HTML5.debug('tokenizer.drain', 'Drain');
                buffer.undo();
            }
        }
    });
    source.addListener('end', function() {
        buffer.eof = true;
        while(state(buffer));
        this.emit('end');
    }.bind(this));

};

util.inherits(Tokenizer, events.EventEmitter);

})()
},{"../core-upgrade":1,"../html5":"VxNTWn","./buffer":2,"events":15,"util":16}],12:[function(require,module,exports){
require('../core-upgrade');
var HTML5 = require('../html5');
var assert = require('assert');

var TreeBuilder = exports.TreeBuilder = HTML5.TreeBuilder = function() {
    this.reset();
    this.document = this.createDocument();
};

TreeBuilder.prototype.reset = function() {
    this.open_elements = [];
    this.activeFormattingElements = [];
};

TreeBuilder.prototype.createDocument = function() {};

TreeBuilder.prototype.createFragment = function() {};

TreeBuilder.prototype.createDoctype = function(name, publicId, systemId) {};

TreeBuilder.prototype.createElement = function(name, attributes, namespace) {};

TreeBuilder.prototype.createComment = function(data) {};

TreeBuilder.prototype.createText = function(data) {};

TreeBuilder.prototype.reconstructActiveFormattingElements = function() {
    if (this.activeFormattingElements.length == 0)
        return;
    var i = this.activeFormattingElements.length - 1;
    var entry = this.activeFormattingElements[i];
    if (entry == HTML5.Marker || this.open_elements.indexOf(entry) != -1)
        return;

    while (entry != HTML5.Marker && this.open_elements.indexOf(entry) == -1) {
        i -= 1;
        entry = this.activeFormattingElements[i];
        if (!entry)
            break;
    }

    while (true) {
        i += 1;
        var clone = this.activeFormattingElements[i].cloneNode();

        var element = this.insert_element(clone.tagName, clone.attributes);

        this.activeFormattingElements[i] = element;

        if (element == this.activeFormattingElements.last())
            break;
    }
};

TreeBuilder.prototype.clearActiveFormattingElements = function() {
    while (!(this.activeFormattingElements.length == 0 || this.activeFormattingElements.pop() == HTML5.Marker));
};

TreeBuilder.prototype.elementInActiveFormattingElements = function(name) {
    var els = this.activeFormattingElements;
    for (var i = els.length - 1; i >= 0; i--) {
        if (els[i] == HTML5.Marker)
            break;
        if (els[i].tagName.toLowerCase() == name)
            return els[i];
    }
    return false;
};

TreeBuilder.prototype.insert_root = function(name, attributes, namespace) {
    var element = this.createElement(name, attributes, namespace);
    this.open_elements.push(element);
    this.document.appendChild(element);
};

TreeBuilder.prototype.insert_doctype = function(name, publicId, systemId) {
    var doctype = this.createDoctype(name, publicId, systemId);
    this.document.appendChild(doctype);
};

TreeBuilder.prototype.insert_comment = function(data, parent) {
    if (!parent)
        parent = this.open_elements.last();
    var comment = this.createComment(data);
    parent.appendChild(comment);
};

TreeBuilder.prototype.insert_element = function(name, attributes, namespace) {
    HTML5.debug('treebuilder.insert_element', name);
    if (this.insert_from_table) {
        return this.insert_element_from_table(name, attributes, namespace);
    } else {
        return this.insert_element_normal(name, attributes, namespace);
    }
};

TreeBuilder.prototype.insert_foreign_element = function(name, attributes, namespace) {
    return this.insert_element(name, attributes, namespace);
};

TreeBuilder.prototype.insert_element_normal = function(name, attributes, namespace) {
    var element = this.createElement(name, attributes, namespace);
    this.open_elements.last().appendChild(element);
    this.open_elements.push(element);
    return element;
};

TreeBuilder.prototype.insert_element_from_table = function(name, attributes, namespace) {
    var element = this.createElement(name, attributes, namespace);
    if (HTML5.TABLE_INSERT_MODE_ELEMENTS.indexOf(this.open_elements.last().tagName.toLowerCase()) != -1) {
        var t = this.getTableMisnestedNodePosition();
        if (!t.insertBefore) {
            t.parent.appendChild(element);
        } else {
            t.parent.insertBefore(element, t.insertBefore);
        }
        this.open_elements.push(element);
    } else {
        return this.insert_element_normal(name, attributes, namespace);
    }
    return element;
};

TreeBuilder.prototype.insert_text = function(data, parent) {
    if (!parent)
        parent = this.open_elements.last();
    HTML5.debug('treebuilder.insert_text', data);
    var text = this.createText(data);
    if (!this.insert_from_table || HTML5.TABLE_INSERT_MODE_ELEMENTS.indexOf(this.open_elements.last().tagName.toLowerCase()) == -1) {
        parent.appendChild(text);
    } else {
        var t = this.getTableMisnestedNodePosition();
        t.parent.insertBefore(text, t.insertBefore);
    }
};


TreeBuilder.prototype.remove_open_elements_until = function(nameOrCb) {
    HTML5.debug('treebuilder.remove_open_elements_until', nameOrCb);
    var finished = false;
    while (!finished) {
        var element = this.open_elements.pop();
        finished = (typeof nameOrCb == 'function' ? nameOrCb(element) : element.tagName.toLowerCase() == nameOrCb);
    }
    return element;
};

TreeBuilder.prototype.pop_element = function() {
    var element = this.open_elements.pop();
    HTML5.debug('treebuilder.pop_element', element.tagName);
    return element;
};

TreeBuilder.prototype.getTableMisnestedNodePosition = function() {
    var lastTable, fosterParent, insertBefore;
    
    for(var i = this.open_elements.length - 1; i >= 0; i--) {
        var element = this.open_elements[i];
        if (element.tagName.toLowerCase() == 'table') {
            lastTable = element;
            break;
        }
    }

    if (lastTable) {
        if (lastTable.parentNode) {
            fosterParent = lastTable.parentNode;
            insertBefore = lastTable;
        } else {
            fosterParent = this.open_elements[this.open_elements.indexOf(lastTable) - 1];
        }
    } else {
        fosterParent = this.open_elements[0];
    }
    
    return {parent: fosterParent, insertBefore: insertBefore};
};

TreeBuilder.prototype.generateImpliedEndTags = function(exclude) {
    if (exclude)
        exclude = exclude.toLowerCase();
    if (this.open_elements.length == 0) {
        HTML5.debug('treebuilder.generateImpliedEndTags', 'no open elements');
        return;
    }
    var name = this.open_elements.last().tagName.toLowerCase();
    if (['dd', 'dt', 'li', 'p', 'td', 'th', 'tr'].indexOf(name) != -1 && name != exclude) {
        this.open_elements.pop();
        this.generateImpliedEndTags(exclude);
    }
};

TreeBuilder.prototype.reparentChildren = function(o, n) {
    while (o.firstChild) {
        var el = o.removeChild(o.firstChild);
        n.appendChild(el);
    }
};

TreeBuilder.prototype.getDocument = function() {
    return this.document;
};

TreeBuilder.prototype.getFragment = function() {
    var fragment = this.document.createDocumentFragment()
    this.reparentChildren(this.root_pointer, fragment)
    return fragment
}

TreeBuilder.prototype.create_structure_elements = function(container) {
    if(!this.html_pointer) {
        this.html_pointer = this.createElement('html');

        this.document.appendChild(this.html_pointer);
    }
}
},{"../core-upgrade":1,"../html5":"VxNTWn","assert":14}],13:[function(require,module,exports){
var HTML5 = require('../html5');
var events = require('events');
var util = require('util');

function error(msg) {
    return {type: 'SerializeError', data: msg};
}

function empty_tag(node) {
    if(node.hasChildNodes()) return error(_("Void element has children"));
    return {type: 'EmptyTag', name: node.tagName, data: node.attributes, namespace: node.namespace};
}

function start_tag(node) {
    return {type: 'StartTag', name: node.tagName, data: node.attributes, namespace: node.namespace};
}

function end_tag(node) {
    return {type: 'EndTag', name: node.tagName, namespace: node.namespace };
}

function text(data, target) {
    var m;
    if(m = new RegExp("^[" + HTML5.SPACE_CHARACTERS + "]+").exec(data)) {
        target.emit('token', {type: 'SpaceCharacters', data: m[0]});
        data = data.slice(m[0].length, data.length);
        if(data.length == 0) return;
    }
    
    if(m = new RegExp("["+HTML5.SPACE_CHARACTERS + "]+$").exec(data)) {
        target.emit('token', {type: 'Characters', data: data.slice(0, m.length)});
        target.emit('token', {type: 'SpaceCharacters', data: data.slice(m.index, data.length)});
    } else {
        target.emit('token', {type: 'Characters', data: data});
    }
}

function comment(data) {
    return {type: 'Comment', data: data};
}

function doctype(node) {
    return {type: 'Doctype', name: node.nodeName, publicId: node.publicId, systemId: node.systemId, correct: node.correct};
}

function unknown(node) {
    return error(_("unknown node: ")+ JSON.stringify(node));
}

function _(str) {
    return str;
}

HTML5.TreeWalker = function (document, dest) {
    if (dest instanceof Function) this.addListener('token', dest);
    walk(document, this);
};

function walk(node, dest) {
    switch(node.nodeType) {
    case node.DOCUMENT_FRAGMENT_NODE:
    case node.DOCUMENT_NODE:
        for(var child = 0; child < node.childNodes.length; ++child) {
            walk(node.childNodes[child], dest);
        }
        break;
    
    case node.ELEMENT_NODE:
        if(HTML5.VOID_ELEMENTS.indexOf(node.tagName.toLowerCase()) != -1) {
            dest.emit('token', empty_tag(node));
        } else {
            dest.emit('token', start_tag(node));
            for(var child = 0; child < node.childNodes.length; ++child) {
                walk(node.childNodes[child], dest);
            }
            dest.emit('token', end_tag(node));
        }
        break;

    case node.TEXT_NODE:
        text(node.nodeValue, dest);
        break;

    case node.COMMENT_NODE:
        dest.emit('token', comment(node.nodeValue));
        break;

    case node.DOCUMENT_TYPE_NODE:
        dest.emit('token', doctype(node));
        break;

    default:
        dest.emit('token', unknown(node));
    }
}       

util.inherits(HTML5.TreeWalker, events.EventEmitter);

},{"../html5":"VxNTWn","events":15,"util":16}],14:[function(require,module,exports){
(function(){// UTILITY
var util = require('util');
var Buffer = require("buffer").Buffer;
var pSlice = Array.prototype.slice;

function objectKeys(object) {
  if (Object.keys) return Object.keys(object);
  var result = [];
  for (var name in object) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      result.push(name);
    }
  }
  return result;
}

var assert = module.exports = ok;

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.message = options.message;
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
};
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (value === undefined) {
    return '' + value;
  }
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (typeof value === 'function' || value instanceof RegExp) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (typeof s == 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

assert.AssertionError.prototype.toString = function() {
  if (this.message) {
    return [this.name + ':', this.message].join(' ');
  } else {
    return [
      this.name + ':',
      truncate(JSON.stringify(this.actual, replacer), 128),
      this.operator,
      truncate(JSON.stringify(this.expected, replacer), 128)
    ].join(' ');
  }
};

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}
assert.fail = fail;

function ok(value, message) {
  if (!!!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  if (a.prototype !== b.prototype) return false;
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  if (ka.length != kb.length)
    return false;
  ka.sort();
  kb.sort();
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (expected instanceof RegExp) {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail('Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail('Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

})()
},{"buffer":18,"util":16}],15:[function(require,module,exports){
(function(process){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }
    this._events[type].push(listener);
  } else {
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

})(require("__browserify_process"))
},{"__browserify_process":20}],16:[function(require,module,exports){
var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          'regexp': 'red' }[styleType];

    if (style) {
      return '\u001b[' + styles[style][0] + 'm' + str +
             '\u001b[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    if (value && typeof value.inspect === 'function' &&
        value !== exports &&
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    if (value === null) {
      return stylize('null', 'null');
    }
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return Array.isArray(ar) ||
         (typeof ar === 'object' && Object.prototype.toString.call(ar) === '[object Array]');
}


function isRegExp(re) {
  typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]';
}


function isDate(d) {
  return typeof d === 'object' && Object.prototype.toString.call(d) === '[object Date]';
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

},{"events":15}],17:[function(require,module,exports){
exports.readIEEE754 = function(buffer, offset, isBE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isBE ? 0 : (nBytes - 1),
      d = isBE ? 1 : -1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.writeIEEE754 = function(buffer, value, offset, isBE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isBE ? (nBytes - 1) : 0,
      d = isBE ? -1 : 1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],18:[function(require,module,exports){
(function(){var assert = require('assert');
exports.Buffer = Buffer;
exports.SlowBuffer = Buffer;
Buffer.poolSize = 8192;
exports.INSPECT_MAX_BYTES = 50;

function Buffer(subject, encoding, offset) {
  if (!(this instanceof Buffer)) {
    return new Buffer(subject, encoding, offset);
  }
  this.parent = this;
  this.offset = 0;

  var type;
  if (typeof offset === 'number') {
    this.length = coerce(encoding);
    this.offset = offset;
  } else {
    switch (type = typeof subject) {
      case 'number':
        this.length = coerce(subject);
        break;

      case 'string':
        this.length = Buffer.byteLength(subject, encoding);
        break;

      case 'object': // Assume object is an array
        this.length = coerce(subject.length);
        break;

      default:
        throw new Error('First argument needs to be a number, ' +
                        'array or string.');
    }
    if (isArrayIsh(subject)) {
      for (var i = 0; i < this.length; i++) {
        if (subject instanceof Buffer) {
          this[i] = subject.readUInt8(i);
        }
        else {
          this[i] = subject[i];
        }
      }
    } else if (type == 'string') {
      this.length = this.write(subject, 0, encoding);
    } else if (type === 'number') {
      for (var i = 0; i < this.length; i++) {
        this[i] = 0;
      }
    }
  }
}

Buffer.prototype.get = function get(i) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i];
};

Buffer.prototype.set = function set(i, v) {
  if (i < 0 || i >= this.length) throw new Error('oob');
  return this[i] = v;
};

Buffer.byteLength = function (str, encoding) {
  switch (encoding || "utf8") {
    case 'hex':
      return str.length / 2;

    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(str).length;

    case 'ascii':
    case 'binary':
      return str.length;

    case 'base64':
      return base64ToBytes(str).length;

    default:
      throw new Error('Unknown encoding');
  }
};

Buffer.prototype.utf8Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(utf8ToBytes(string), this, offset, length);
};

Buffer.prototype.asciiWrite = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten =  blitBuffer(asciiToBytes(string), this, offset, length);
};

Buffer.prototype.binaryWrite = Buffer.prototype.asciiWrite;

Buffer.prototype.base64Write = function (string, offset, length) {
  var bytes, pos;
  return Buffer._charsWritten = blitBuffer(base64ToBytes(string), this, offset, length);
};

Buffer.prototype.base64Slice = function (start, end) {
  var bytes = Array.prototype.slice.apply(this, arguments)
  return require("base64-js").fromByteArray(bytes);
};

Buffer.prototype.utf8Slice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else
      tmp += "%" + bytes[i].toString(16);

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

Buffer.prototype.asciiSlice = function () {
  var bytes = Array.prototype.slice.apply(this, arguments);
  var ret = "";
  for (var i = 0; i < bytes.length; i++)
    ret += String.fromCharCode(bytes[i]);
  return ret;
}

Buffer.prototype.binarySlice = Buffer.prototype.asciiSlice;

Buffer.prototype.inspect = function() {
  var out = [],
      len = this.length;
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i]);
    if (i == exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...';
      break;
    }
  }
  return '<Buffer ' + out.join(' ') + '>';
};


Buffer.prototype.hexSlice = function(start, end) {
  var len = this.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; i++) {
    out += toHex(this[i]);
  }
  return out;
};


Buffer.prototype.toString = function(encoding, start, end) {
  encoding = String(encoding || 'utf8').toLowerCase();
  start = +start || 0;
  if (typeof end == 'undefined') end = this.length;
  if (+end == start) {
    return '';
  }

  switch (encoding) {
    case 'hex':
      return this.hexSlice(start, end);

    case 'utf8':
    case 'utf-8':
      return this.utf8Slice(start, end);

    case 'ascii':
      return this.asciiSlice(start, end);

    case 'binary':
      return this.binarySlice(start, end);

    case 'base64':
      return this.base64Slice(start, end);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Slice(start, end);

    default:
      throw new Error('Unknown encoding');
  }
};


Buffer.prototype.hexWrite = function(string, offset, length) {
  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  var strLen = string.length;
  if (strLen % 2) {
    throw new Error('Invalid hex string');
  }
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(byte)) throw new Error('Invalid hex string');
    this[offset + i] = byte;
  }
  Buffer._charsWritten = i * 2;
  return i;
};


Buffer.prototype.write = function(string, offset, length, encoding) {
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length;
      length = undefined;
    }
  } else {  // legacy
    var swap = encoding;
    encoding = offset;
    offset = length;
    length = swap;
  }

  offset = +offset || 0;
  var remaining = this.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = +length;
    if (length > remaining) {
      length = remaining;
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase();

  switch (encoding) {
    case 'hex':
      return this.hexWrite(string, offset, length);

    case 'utf8':
    case 'utf-8':
      return this.utf8Write(string, offset, length);

    case 'ascii':
      return this.asciiWrite(string, offset, length);

    case 'binary':
      return this.binaryWrite(string, offset, length);

    case 'base64':
      return this.base64Write(string, offset, length);

    case 'ucs2':
    case 'ucs-2':
      return this.ucs2Write(string, offset, length);

    default:
      throw new Error('Unknown encoding');
  }
};
Buffer.prototype.slice = function(start, end) {
  if (end === undefined) end = this.length;

  if (end > this.length) {
    throw new Error('oob');
  }
  if (start > end) {
    throw new Error('oob');
  }

  return new Buffer(this, end - start, +start);
};
Buffer.prototype.copy = function(target, target_start, start, end) {
  var source = this;
  start || (start = 0);
  if (end === undefined || isNaN(end)) {
    end = this.length;
  }
  target_start || (target_start = 0);

  if (end < start) throw new Error('sourceEnd < sourceStart');
  if (end === start) return 0;
  if (target.length == 0 || source.length == 0) return 0;

  if (target_start < 0 || target_start >= target.length) {
    throw new Error('targetStart out of bounds');
  }

  if (start < 0 || start >= source.length) {
    throw new Error('sourceStart out of bounds');
  }

  if (end < 0 || end > source.length) {
    throw new Error('sourceEnd out of bounds');
  }
  if (end > this.length) {
    end = this.length;
  }

  if (target.length - target_start < end - start) {
    end = target.length - target_start + start;
  }

  var temp = [];
  for (var i=start; i<end; i++) {
    assert.ok(typeof this[i] !== 'undefined', "copying undefined buffer bytes!");
    temp.push(this[i]);
  }

  for (var i=target_start; i<target_start+temp.length; i++) {
    target[i] = temp[i-target_start];
  }
};
Buffer.prototype.fill = function fill(value, start, end) {
  value || (value = 0);
  start || (start = 0);
  end || (end = this.length);

  if (typeof value === 'string') {
    value = value.charCodeAt(0);
  }
  if (!(typeof value === 'number') || isNaN(value)) {
    throw new Error('value is not a number');
  }

  if (end < start) throw new Error('end < start');
  if (end === start) return 0;
  if (this.length == 0) return 0;

  if (start < 0 || start >= this.length) {
    throw new Error('start out of bounds');
  }

  if (end < 0 || end > this.length) {
    throw new Error('end out of bounds');
  }

  for (var i = start; i < end; i++) {
    this[i] = value;
  }
}
Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer || b instanceof Buffer;
};

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) {
    throw new Error("Usage: Buffer.concat(list, [totalLength])\n \
      list should be an Array.");
  }

  if (list.length === 0) {
    return new Buffer(0);
  } else if (list.length === 1) {
    return list[0];
  }

  if (typeof totalLength !== 'number') {
    totalLength = 0;
    for (var i = 0; i < list.length; i++) {
      var buf = list[i];
      totalLength += buf.length;
    }
  }

  var buffer = new Buffer(totalLength);
  var pos = 0;
  for (var i = 0; i < list.length; i++) {
    var buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

function coerce(length) {
  length = ~~Math.ceil(+length);
  return length < 0 ? 0 : length;
}

function isArray(subject) {
  return (Array.isArray ||
    function(subject){
      return {}.toString.apply(subject) == '[object Array]'
    })
    (subject)
}

function isArrayIsh(subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
         subject && typeof subject === 'object' &&
         typeof subject.length === 'number';
}

function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}

function utf8ToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++)
    if (str.charCodeAt(i) <= 0x7F)
      byteArray.push(str.charCodeAt(i));
    else {
      var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16));
    }

  return byteArray;
}

function asciiToBytes(str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++ )
    byteArray.push( str.charCodeAt(i) & 0xFF );

  return byteArray;
}

function base64ToBytes(str) {
  return require("base64-js").toByteArray(str);
}

function blitBuffer(src, dst, offset, length) {
  var pos, i = 0;
  while (i < length) {
    if ((i+offset >= dst.length) || (i >= src.length))
      break;

    dst[i + offset] = src[i];
    i++;
  }
  return i;
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xFFFD); // UTF 8 invalid char
  }
}

Buffer.prototype.readUInt8 = function(offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  return buffer[offset];
};

function readUInt16(buffer, offset, isBigEndian, noAssert) {
  var val = 0;


  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    val = buffer[offset] << 8;
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1];
    }
  } else {
    val = buffer[offset];
    if (offset + 1 < buffer.length) {
      val |= buffer[offset + 1] << 8;
    }
  }

  return val;
}

Buffer.prototype.readUInt16LE = function(offset, noAssert) {
  return readUInt16(this, offset, false, noAssert);
};

Buffer.prototype.readUInt16BE = function(offset, noAssert) {
  return readUInt16(this, offset, true, noAssert);
};

function readUInt32(buffer, offset, isBigEndian, noAssert) {
  var val = 0;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return 0;

  if (isBigEndian) {
    if (offset + 1 < buffer.length)
      val = buffer[offset + 1] << 16;
    if (offset + 2 < buffer.length)
      val |= buffer[offset + 2] << 8;
    if (offset + 3 < buffer.length)
      val |= buffer[offset + 3];
    val = val + (buffer[offset] << 24 >>> 0);
  } else {
    if (offset + 2 < buffer.length)
      val = buffer[offset + 2] << 16;
    if (offset + 1 < buffer.length)
      val |= buffer[offset + 1] << 8;
    val |= buffer[offset];
    if (offset + 3 < buffer.length)
      val = val + (buffer[offset + 3] << 24 >>> 0);
  }

  return val;
}

Buffer.prototype.readUInt32LE = function(offset, noAssert) {
  return readUInt32(this, offset, false, noAssert);
};

Buffer.prototype.readUInt32BE = function(offset, noAssert) {
  return readUInt32(this, offset, true, noAssert);
};
Buffer.prototype.readInt8 = function(offset, noAssert) {
  var buffer = this;
  var neg;

  if (!noAssert) {
    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to read beyond buffer length');
  }

  if (offset >= buffer.length) return;

  neg = buffer[offset] & 0x80;
  if (!neg) {
    return (buffer[offset]);
  }

  return ((0xff - buffer[offset] + 1) * -1);
};

function readInt16(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt16(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x8000;
  if (!neg) {
    return val;
  }

  return (0xffff - val + 1) * -1;
}

Buffer.prototype.readInt16LE = function(offset, noAssert) {
  return readInt16(this, offset, false, noAssert);
};

Buffer.prototype.readInt16BE = function(offset, noAssert) {
  return readInt16(this, offset, true, noAssert);
};

function readInt32(buffer, offset, isBigEndian, noAssert) {
  var neg, val;

  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  val = readUInt32(buffer, offset, isBigEndian, noAssert);
  neg = val & 0x80000000;
  if (!neg) {
    return (val);
  }

  return (0xffffffff - val + 1) * -1;
}

Buffer.prototype.readInt32LE = function(offset, noAssert) {
  return readInt32(this, offset, false, noAssert);
};

Buffer.prototype.readInt32BE = function(offset, noAssert) {
  return readInt32(this, offset, true, noAssert);
};

function readFloat(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 3 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.readFloatLE = function(offset, noAssert) {
  return readFloat(this, offset, false, noAssert);
};

Buffer.prototype.readFloatBE = function(offset, noAssert) {
  return readFloat(this, offset, true, noAssert);
};

function readDouble(buffer, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset + 7 < buffer.length,
        'Trying to read beyond buffer length');
  }

  return require('./buffer_ieee754').readIEEE754(buffer, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.readDoubleLE = function(offset, noAssert) {
  return readDouble(this, offset, false, noAssert);
};

Buffer.prototype.readDoubleBE = function(offset, noAssert) {
  return readDouble(this, offset, true, noAssert);
};
function verifuint(value, max) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value >= 0,
      'specified a negative value for writing an unsigned value');

  assert.ok(value <= max, 'value is larger than maximum value for type');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

Buffer.prototype.writeUInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xff);
  }

  if (offset < buffer.length) {
    buffer[offset] = value;
  }
};

function writeUInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 2); i++) {
    buffer[offset + i] =
        (value & (0xff << (8 * (isBigEndian ? 1 - i : i)))) >>>
            (isBigEndian ? 1 - i : i) * 8;
  }

}

Buffer.prototype.writeUInt16LE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt16BE = function(value, offset, noAssert) {
  writeUInt16(this, value, offset, true, noAssert);
};

function writeUInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'trying to write beyond buffer length');

    verifuint(value, 0xffffffff);
  }

  for (var i = 0; i < Math.min(buffer.length - offset, 4); i++) {
    buffer[offset + i] =
        (value >>> (isBigEndian ? 3 - i : i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeUInt32BE = function(value, offset, noAssert) {
  writeUInt32(this, value, offset, true, noAssert);
};
function verifsint(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');

  assert.ok(Math.floor(value) === value, 'value has a fractional component');
}

function verifIEEE754(value, max, min) {
  assert.ok(typeof (value) == 'number',
      'cannot write a non-number as a number');

  assert.ok(value <= max, 'value larger than maximum allowed value');

  assert.ok(value >= min, 'value smaller than minimum allowed value');
}

Buffer.prototype.writeInt8 = function(value, offset, noAssert) {
  var buffer = this;

  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7f, -0x80);
  }

  if (value >= 0) {
    buffer.writeUInt8(value, offset, noAssert);
  } else {
    buffer.writeUInt8(0xff + value + 1, offset, noAssert);
  }
};

function writeInt16(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 1 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fff, -0x8000);
  }

  if (value >= 0) {
    writeUInt16(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt16(buffer, 0xffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt16LE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt16BE = function(value, offset, noAssert) {
  writeInt16(this, value, offset, true, noAssert);
};

function writeInt32(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifsint(value, 0x7fffffff, -0x80000000);
  }

  if (value >= 0) {
    writeUInt32(buffer, value, offset, isBigEndian, noAssert);
  } else {
    writeUInt32(buffer, 0xffffffff + value + 1, offset, isBigEndian, noAssert);
  }
}

Buffer.prototype.writeInt32LE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, false, noAssert);
};

Buffer.prototype.writeInt32BE = function(value, offset, noAssert) {
  writeInt32(this, value, offset, true, noAssert);
};

function writeFloat(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 3 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      23, 4);
}

Buffer.prototype.writeFloatLE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, false, noAssert);
};

Buffer.prototype.writeFloatBE = function(value, offset, noAssert) {
  writeFloat(this, value, offset, true, noAssert);
};

function writeDouble(buffer, value, offset, isBigEndian, noAssert) {
  if (!noAssert) {
    assert.ok(value !== undefined && value !== null,
        'missing value');

    assert.ok(typeof (isBigEndian) === 'boolean',
        'missing or invalid endian');

    assert.ok(offset !== undefined && offset !== null,
        'missing offset');

    assert.ok(offset + 7 < buffer.length,
        'Trying to write beyond buffer length');

    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }

  require('./buffer_ieee754').writeIEEE754(buffer, value, offset, isBigEndian,
      52, 8);
}

Buffer.prototype.writeDoubleLE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, false, noAssert);
};

Buffer.prototype.writeDoubleBE = function(value, offset, noAssert) {
  writeDouble(this, value, offset, true, noAssert);
};

})()
},{"./buffer_ieee754":17,"assert":14,"base64-js":19}],19:[function(require,module,exports){
(function (exports) {
    

    var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function b64ToByteArray(b64) {
        var i, j, l, tmp, placeHolders, arr;
    
        if (b64.length % 4 > 0) {
            throw 'Invalid string. Length must be a multiple of 4';
        }
        placeHolders = b64.indexOf('=');
        placeHolders = placeHolders > 0 ? b64.length - placeHolders : 0;
        arr = [];//new Uint8Array(b64.length * 3 / 4 - placeHolders);
        l = placeHolders > 0 ? b64.length - 4 : b64.length;

        for (i = 0, j = 0; i < l; i += 4, j += 3) {
            tmp = (lookup.indexOf(b64[i]) << 18) | (lookup.indexOf(b64[i + 1]) << 12) | (lookup.indexOf(b64[i + 2]) << 6) | lookup.indexOf(b64[i + 3]);
            arr.push((tmp & 0xFF0000) >> 16);
            arr.push((tmp & 0xFF00) >> 8);
            arr.push(tmp & 0xFF);
        }

        if (placeHolders === 2) {
            tmp = (lookup.indexOf(b64[i]) << 2) | (lookup.indexOf(b64[i + 1]) >> 4);
            arr.push(tmp & 0xFF);
        } else if (placeHolders === 1) {
            tmp = (lookup.indexOf(b64[i]) << 10) | (lookup.indexOf(b64[i + 1]) << 4) | (lookup.indexOf(b64[i + 2]) >> 2);
            arr.push((tmp >> 8) & 0xFF);
            arr.push(tmp & 0xFF);
        }

        return arr;
    }

    function uint8ToBase64(uint8) {
        var i,
            extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
            output = "",
            temp, length;

        function tripletToBase64 (num) {
            return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
        };
        for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
            temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
            output += tripletToBase64(temp);
        }
        switch (extraBytes) {
            case 1:
                temp = uint8[uint8.length - 1];
                output += lookup[temp >> 2];
                output += lookup[(temp << 4) & 0x3F];
                output += '==';
                break;
            case 2:
                temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1]);
                output += lookup[temp >> 10];
                output += lookup[(temp >> 4) & 0x3F];
                output += lookup[(temp << 2) & 0x3F];
                output += '=';
                break;
        }

        return output;
    }

    module.exports.toByteArray = b64ToByteArray;
    module.exports.fromByteArray = uint8ToBase64;
}());

},{}],20:[function(require,module,exports){

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[])
;
var HTML5 = require('./html5');
exports.Parser = HTML5.Parser;
exports.messages = HTML5.E;
});