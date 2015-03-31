var $cmanager = new ComponentManager();
var COM_DATA_BIND_SELECTOR = 'input[data-component-bind],textarea[data-component-bind],select[data-component-bind]';
var COM_ATTR = '[data-component]';
var COM_ATTR_U = 'data-component-url';
var COM_ATTR_URL = '[' + COM_ATTR_U + ']';
var COM_ATTR_B = 'data-component-bind';
var COM_ATTR_P = 'data-component-path';
var COM_ATTR_T = 'data-component-template';
var COM_ATTR_I = 'data-component-init';
var COM_ATTR_C = 'data-component-class';

$.fn.component = function() {
    return this.data(COM_ATTR);
};

$.components = function(container) {
    if ($cmanager.isCompiling)
        return $.components;
    return $.components.compile(container);
};

$.components.compile = function(container) {

    $cmanager.isCompiling = true;
    $.components.$inject();

    if ($cmanager.pending.length > 0) {
        $cmanager.pending.push(function() {
            $.components.compile(container);
        });
        return $.components;
    }

    var els = container ? container.find(COM_ATTR) : $(COM_ATTR);
    var skip = false;

    els.each(function() {

        if (skip)
            return;

        var el = $(this);
        var name = el.attr('data-component');

        if (el.data(COM_ATTR))
            return;

        var component = $cmanager.register[name || ''];
        if (!component)
            return;

        var obj = component(el);

        obj.$init = el.attr(COM_ATTR_I) || null;
        obj.type = el.attr('data-component-type') || '';

        // A reference to implementation
        el.data(COM_ATTR, obj);

        var template = el.attr(COM_ATTR_T) || obj.template;
        if (template)
            obj.template = template;

        if (el.attr(COM_ATTR_U))
            throw new Error('You cannot use [data-component-url] for the component: ' + obj.name + '[' + obj.path + ']. Instead of it you must use data-component-template.');

        if (typeof(template) === 'string') {
            var fn = function(data) {
                if (obj.prerender)
                    data = prerender(data);
                if (typeof(obj.make) === 'function')
                    obj.make(data);
                component_init(el, obj);
            };

            var c = template.substring(0, 1);
            if (c === '.' || c === '#' || c === '[')
                fn($(c).html());
            else
                $.get($components_url(template), fn);
            return;
        }

        if (typeof(obj.make) === 'string') {

            if (obj.make.indexOf('<') !== -1) {
                if (obj.prerender)
                    obj.make = obj.prerender(obj.make);
                el.html(obj.make);
                component_init(el, obj);
                return;
            }

            $.get($components_url(obj.make), function(data) {
                if (obj.prerender)
                    data = prerender(data);
                el.html(data);
                component_init(el, obj);
            });

            return;
        }

        if (obj.make) {
            if (obj.make())
                skip = true;
        }

        component_init(el, obj);
    });

    if (skip) {
        $.components.compile();
        return;
    }

    if (container !== undefined) {
        $cmanager.next();
        return;
    }

    if ($cmanager.toggle.length === 0) {
        $cmanager.next();
        return;
    }

    component_async($cmanager.toggle, function(item, next) {
        for (var i = 0, length = item.toggle.length; i < length; i++)
            item.element.toggleClass(item.toggle[i]);
        next();
    }, function() {
        $cmanager.next();
    });
};

$.components.$version = '';
$.components.$language = '';
$.components.$formatter = [];
$.components.$parser = [];

$.components.$inject = function() {

    var els = $(COM_ATTR_URL);
    var arr = [];
    var count = 0;

    els.each(function() {
        var el = $(this);
        if (el.data(COM_ATTR_URL))
            return;
        el.data(COM_ATTR_URL, '1');
        arr.push({ element: el, cb: el.attr(COM_ATTR_I), path: el.attr(COM_ATTR_P), url: el.attr(COM_ATTR_U), toggle: (el.attr(COM_ATTR_C) || '').split(' ') });
    });

    if (arr.length === 0)
        return;

    component_async(arr, function(item, next) {
        item.element.load($components_url(item.url), function() {

            if (item.path) {
                var com = item.element.find(COM_ATTR);
                com.each(function() {
                    var el = $(this);
                    $.each(this.attributes, function() {
                        if (!this.specified)
                            return;
                        el.attr(this.name, this.value.replace('$', item.path));
                    });
                });
            }

            if (item.toggle.length > 0 && item.toggle[0] !== '')
                $cmanager.toggle.push(item);

            if (item.cb && !item.element.attr('data-component')) {
                var cb = $cmanager.get(item.cb);
                if (typeof(cb) === 'function')
                    cb(item.element);
            }

            count++;
            next();
        });

    }, function() {
        $cmanager.clear();
        if (count === 0)
            return;
        $.components.compile();
    });
};

$.components.inject = function(url, target, callback) {

    if (typeof(target) === 'function') {
        timeout = callback;
        callback = target;
        target = 'body';
    }

    if (!target)
        target = 'body';

    var extension = url.lastIndexOf('.');
    if (extension !== -1)
        extension = url.substring(extension).toLowerCase();
    else
        extension = '';

    if (extension === '.js') {
        var script = d.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onload = function(){
            if (callback)
                callback();
        };
        script.src = Url;
        document.getElementsByTagName('head')[0].appendChild(script);
        return;
    }

    if (extension === '.css') {
        var style = document.createElement('link');
        style.type = 'text/css';
        style.rel = 'stylesheet';
        style.href = 'style.css';
        document.getElementsByTagName('head')[0].appendChild(style);
        return;
    }

    if (target === 'body') {
        var random = Math.floor(Math.random() * 100000);
        var id = 'data-component-injector="' + random +'"';
        $(target).append('<div ' + id + '></div>');
        target = $(target).find('> div[' + id + ']');
    }

    $(target).load($components_url(url), function() {
        $.components.compile();
        if (callback)
            callback();
    });

    return $.components;
};

$.components.parseQuery = function(value) {

    if (!value)
        value = window.location.search;

    if (value.substring(0, 1) === '?')
        value = value.substring(1);

    var arr = value.split('&');
    var obj = {};
    for (var i = 0, length = arr.length; i < length; i++) {
        var sub = arr[i].split('=');
        var key = sub[0];
        var val = decodeURIComponent(sub[1] || '');

        if (!obj[key]) {
            obj[key] = val;
            continue;
        }

        if (!(obj[key] instanceof Array))
            obj[key] = [obj[key]];
        obj[key].push(val);
    }
    return obj;
};

$.components.POST = function(url, data, callback, timeout, error) {

    if (!url)
        url = window.location.pathname;

    if (typeof(callback) === 'number') {
        timeout = callback;
        callback = undefined;
    }

    if (typeof(timeout) !== 'number') {
        var tmp = error;
        error = timeout;
        timeout = tmp;
    }

    setTimeout(function() {
        $.ajax($components_url(url), { type: 'POST', data: JSON.stringify(data), success: function(r) {
            if (typeof(callback) === 'string')
                return $.components.set(callback, r);
            if (callback)
                callback(r);
        }, error: function(req, status, r) {
            if (typeof(error) === 'string')
                return $.components.set(error, r);
            if (error)
                error(r, req.status, status);
        }, contentType: 'application/json' });
    }, timeout || 0);
    return $.components;
};

$.components.PUT = function(url, data, callback, timeout, error) {

    if (!url)
        url = window.location.pathname;

    if (typeof(callback) === 'number') {
        timeout = callback;
        callback = undefined;
    }

    if (typeof(timeout) !== 'number') {
        var tmp = error;
        error = timeout;
        timeout = tmp;
    }

    setTimeout(function() {
        $.ajax($components_url(url), { type: 'PUT', data: JSON.stringify(data), success: function(r) {
            if (typeof(callback) === 'string')
                return $.components.set(callback, r);
            if (callback)
                callback(r);
        }, error: function(req, status, r) {
            if (typeof(error) === 'string')
                return $.components.set(error, r);
            if (error)
                error(r, req.status, status);
        }, contentType: 'application/json' });
    }, timeout || 0);
    return $.components;
};

$.components.GET = function(url, data, callback, timeout, error) {

    if (!url)
        url = window.location.pathname;

    if (typeof(callback) === 'number') {
        timeout = callback;
        callback = undefined;
    }

    if (typeof(timeout) !== 'number') {
        var tmp = error;
        error = timeout;
        timeout = tmp;
    }

    setTimeout(function() {
        $.ajax($components_url(url), { type: 'GET', data: data, success: function(r) {
            if (typeof(callback) === 'string')
                return $.components.set(callback, r);
            if (callback)
                callback(r);
        }, error: function(req, status, r) {
            if (typeof(error) === 'string')
                return $.components.set(error, r);
            if (error)
                error(r, req.status, status);
        }});
    }, timeout || 0);
    return $.components;
};

$.components.DELETE = function(url, data, callback, timeout, error) {

    if (!url)
        url = window.location.pathname;

    if (typeof(callback) === 'number') {
        timeout = callback;
        callback = undefined;
    }

    if (typeof(timeout) !== 'number') {
        var tmp = error;
        error = timeout;
        timeout = tmp;
    }

    setTimeout(function() {
        $.ajax($components_url(url), { type: 'DELETE', data: data, success: function(r) {
            if (typeof(callback) === 'string')
                return $.components.set(callback, r);
            if (callback)
                callback(r);
        }, error: function(req, status, r) {
            if (typeof(error) === 'string')
                return $.components.set(error, r);
            if (error)
                error(r, req.status, status);
        }});
    }, timeout || 0);
    return $.components;
};

$.components.ready = function(fn) {
    $cmanager.ready.push(fn);
    return $.components;
};

function $components_url(url) {
    var index = url.indexOf('?');
    var builder = [];

    if ($.components.$version)
        builder.push('version=' + encodeURIComponent($.components.$version));

    if ($.components.$language)
        builder.push('language=' + encodeURIComponent($.components.$language));

    if (builder.length === 0)
        return url;

    if (index !== -1)
        url += '&';
    else
        url += '?';

    return url + builder.join('&');
}

function $components_ready() {
    clearTimeout($cmanager.timeout);
    $cmanager.timeout = setTimeout(function() {

        $cmanager.initialize();

        var count = $cmanager.components.length;
        $(document).trigger('components', [count]);

        if (!$cmanager.isReady) {
            $cmanager.clear();
            $cmanager.isReady = true;
            $.components.emit('init');
            $.components.emit('ready');
        }

        $cmanager.isCompiling = false;

        if (!$cmanager.ready)
            return;

        var arr = $cmanager.ready;
        for (var i = 0, length = arr.length; i < length; i++)
            arr[i](count);

        delete $cmanager.ready;

    }, 100);
}

$.components.watch = function(path, fn) {
    $.components.on('watch', path, fn);
    return $.components;
};

$.components.on = function(name, path, fn) {

    if (typeof(path) === 'function') {
        fn = path;
        path = '';
    } else
        path = path.replace('.*', '');

    if (!$cmanager.events[path]) {
        $cmanager.events[path] = {};
        $cmanager.events[path][name] = [];
    } else if (!$cmanager.events[path][name])
        $cmanager.events[path][name] = [];
    $cmanager.events[path][name].push({ fn: fn, id: this._id });
    return $.components;
};

function component_init(el, obj) {

    var type = el.get(0).tagName;
    var collection;

    // autobind
    if (type === 'INPUT' || type === 'SELECT' || type === 'TEXTAREA') {
        obj.$input = true;
        collection = obj.element;
    } else
        collection = el.find(COM_DATA_BIND_SELECTOR);

    collection.each(function() {
        if (!this.$component)
            this.$component = obj;
    });

    $cmanager.components.push(obj);
    $cmanager.init.push(obj);
    $.components.compile(el);
    $components_ready();
}

$.components.version = 'v1.5.1';

$.components.valid = function(path, value) {

    var key = 'valid' + path;

    if (typeof(value) !== 'boolean' && $cmanager.cache[key] !== undefined)
        return $cmanager.cache[key];

    var valid = true;
    var arr = value !== undefined ? [] : null;

    $.components.each(function(obj) {

        if (value !== undefined) {
            if (obj.state)
                arr.push(obj);
            obj.$valid = value;
            obj.$validate = false;
        }

        if (obj.$valid === false)
            valid = false;

    }, path);

    $cmanager.cache[key] = valid;
    $.components.state(arr, 1);

    return valid;
};

$.components.$emit2 = function(name, path, args) {

    var e = $cmanager.events[path];

    if (!e)
        return false;

    e = e[name];
    if (!e)
        return false;

    for (var i = 0, length = e.length; i < length; i++)
        e[i].fn.apply(e[i].context, args);

    return true;
};

$.components.$emitonly = function(name, paths, type, path) {

    var unique = {};
    var keys = Object.keys(paths);

    for (var a = 0, al = keys.length; a < al; a++) {
        var arr = keys[a].split('.');
        var p = '';
        for (var b = 0, bl = arr.length; b < bl; b++) {
            p += (p ? '.' : '') + arr[b];
            unique[p] = paths[p];
        }
    }

    $.components.$emit2(name, '*', [path, unique[path]]);

    Object.keys(unique).forEach(function(key) {
        // OLDER: $.components.$emit2(name, key, [key, unique[key]]);
        $.components.$emit2(name, key, [path, unique[key]]);
    });

    return this;
};

$.components.$emit = function(name, path) {

    if (!path)
        return;

    var arr = path.split('.');
    var args = [];

    for (var i = name === 'watch' ? 1 : 2, length = arguments.length; i < length; i++)
        args.push(arguments[i]);

    $.components.$emit2(name, '*', args);

    var p = '';
    for (var i = 0, length = arr.length; i < length; i++) {

        var k = arr[i];
        var a = arr[i];

        if (k === '*')
            continue;

        if (a.substring(a.length - 1, a.length) === ']') {
            var beg = a.lastIndexOf('[');
            a = a.substring(0, beg);
        }

        p += (i > 0 ? '.' : '');

        args[1] = $.components.get(p + k);
        $.components.$emit2(name, p + k, args);
        if (k !== a)
            $.components.$emit2(name, p + a, args);
        p += k;
    }

    return true;
};

$.components.emit = function(name) {

    var e = $cmanager.events[''];
    if (!e)
        return false;

    e = $cmanager.events[''][name];
    if (!e)
        return false;

    var args = [];

    for (var i = 1, length = arguments.length; i < length; i++)
        args.push(arguments[i]);

    for (var i = 0, length = e.length; i < length; i++)
        e[i].fn.apply(e[i].context, args);

    return true;
};

$.components.change = function(path, value) {
    if (value === undefined)
        return !$.components.dirty(path);
    return !$.components.dirty(path, !value);
};

$.components.dirty = function(path, value) {

    var key = 'dirty' + path;

    if (typeof(value) !== 'boolean' && $cmanager.cache[key] !== undefined)
        return $cmanager.cache[key];

    var dirty = true;
    var arr = value !== undefined ? [] : null;

    $.components.each(function(obj) {

        if (value !== undefined) {
            if (obj.state)
                arr.push(obj);
            obj.$dirty = value;
        }

        if (obj.$dirty === false)
            dirty = false;

    }, path);

    $cmanager.cache[key] = dirty;
    $.components.state(arr, 2);

    return dirty;
};

// 1 === by developer
// 2 === by input
$.components.update = function(path) {

    path = path.replace('.*', '');

    var state = [];
    var length = path.length;
    var was = false;
    var updates = {};

    $.components.each(function(component) {

        if (length > 0 && (!component.path || component.path.substring(0, length) !== path))
            return;

        var result = component.get();

        if (component.setter)
            component.setter(result, 1);

        component.$ready = true;

        if (component.validate)
            component.valid(component.validate(result), true);

        if (component.state)
            state.push(component);

        if (component.path === path)
            was = true;

        updates[component.path] = result;
    });

    if (!updates[path])
        updates[path] = $.components.get(path);

    for (var i = 0, length = state.length; i < length; i++)
        state[i].state(1);

    $.components.$emitonly('watch', updates, 1, path);
    return $.components;
};

// 1 === by developer
// 2 === by input
$.components.set = function(path, value, type) {

    $cmanager.set(path, value);

    if (typeof(value) === 'object' && !(value instanceof Array) && value !== null && value !== undefined)
        return $.components.update(path);

    var result = $cmanager.get(path);
    var state = [];

    if (type === undefined)
        type = 1;

    $.components.each(function(component) {
        if (component.setter)
            component.setter(result, type);
        component.$ready = true;
        if (component.validate)
            component.valid(component.validate(result), true);
        if (component.state)
            state.push(component);
    }, path);

    for (var i = 0, length = state.length; i < length; i++)
        state[i].state(type);

    $.components.$emit('watch', path, undefined, type);
    return $.components;
};

$.components.clean = function() {
    $cmanager.cleaner();
    return $.components;
}

$.components.get = function(path) {
    return $cmanager.get(path);
};

$.components.remove = function(path) {
    $cmanager.clear();
    $.components.each(function(obj) {
        obj.remove(true);
    }, path);
    $cmanager.cleaner();
    return $.components;
};

$.components.validate = function(path) {

    var arr = [];
    var valid = true;

    $.components.each(function(obj) {

        var current = obj.path;

        if (obj.state)
            arr.push(obj);

        obj.$validate = true;

        if (obj.validate) {
            obj.$valid = obj.validate($cmanager.get(current));
            if (!obj.$valid)
                valid = false;
        }

    }, path);

    $cmanager.clear('valid');

    if (arr.length > 0)
        $.components.state(arr, 1);
    $.components.$emit('validate', path);
    return valid;
};

$.components.invalid = function(path) {
    var arr = [];
    $.components.each(function(obj) {
        if (obj.$valid === false)
            arr.push(obj);
    }, path);
    return arr;
};

$.components.can = function(path) {
    return !$.components.dirty(path) && $.components.valid(path);
};

$.components.disable = function(path) {
    return $.components.dirty(path) || !$.components.valid(path);
};

$.components.state = function(arr, type) {

    if (!arr || arr.length === 0)
        return;

    for (var i = 0, length = arr.length; i < length; i++)
        arr[i].state(type);
};

$.components.reset = function(path) {

    var arr = [];
    $.components.each(function(obj) {
        if (obj.state)
            arr.push(obj);
        obj.$dirty = true;
        obj.$valid = true;
        obj.$validate = false;
        if (obj.validate)
            obj.$valid = obj.validate(obj.get(), 3);

    }, path);

    $cmanager.clear();
    $.components.state(arr, 3);
    $.components.$emit('reset', path);
    return $.components;
};

$.components.findByName = function(name, path, callback) {

    if (typeof(path) === 'function') {
        callback = path;
        path = undefined;
    }

    var isCallback = typeof(callback) === 'function';
    var com;

    $.components.each(function(component) {

        if (component.name !== name)
            return;

        if (isCallback) {
            callback(component);
            return;
        }

        com = component;
        return true; // stop

    }, path);

    return isCallback ? $.components : com;
};

$.components.findByPath = function(path, callback) {

    if (typeof(path) === 'function') {
        callback = path;
        path = undefined;
    }

    var isCallback = typeof(callback) === 'function';
    var com;

    $.components.each(function(component) {

        if (isCallback) {
            callback(component);
            return;
        }

        com = component;
        return true; // stop

    }, path);

    return isCallback ? $.components : com;
};

$.components.findById = function(id, path, callback) {

    if (typeof(path) === 'function') {
        callback = path;
        path = undefined;
    }


    var isCallback = typeof(callback) === 'function';
    var com;

    $.components.each(function(component) {

        if (component.id !== id)
            return;

        if (isCallback) {
            callback(component);
            return;
        }

        com = component;
        return true; // stop

    }, path);

    return isCallback ? $.components : com;
};

$.components.schema = function(name, declaration, callback) {

    if (!declaration)
        return $.extend(true, {}, $cmanager.schemas[name]);

    if (typeof(declaration) === 'object') {
        $cmanager.schemas[name] = declaration;
        return declaration;
    }

    if (typeof(declaration) === 'function') {
        var f = declaration();
        $cmanager.schemas[name] = f;
        return f;
    }

    if (typeof(declaration) !== 'string')
        return undefined;

    var a = declaration.substring(0, 1);
    var b = declaration.substring(declaration.length - 1);

    if ((a === '"' && b === '"') || (a === '[' && b === ']') || (a === '{' && b === '}')) {
        var d = JSON.parse(declaration);
        $cmanager.schemas[name] = d;
        if (callback)
            callback(d)
        return d;
    }

    // url?
    $.get($components_url(declaration), function(d) {
        if (typeof(d) === 'string')
            d = JSON.parse(d);
        $cmanager.schemas[name] = d;
        if (callback)
            callback(d);
    });
};

$.components.each = function(fn, path) {

    var isAsterix = path ? path.lastIndexOf('*') !== -1 : false;

    if (isAsterix)
        path = path.replace('.*', '').replace('*', '');

    for (var i = 0, length = $cmanager.components.length; i < length; i++) {

        var component = $cmanager.components[i];
        if (path) {
            if (!component.path)
                continue;
            if (isAsterix) {
                if (component.path.indexOf(path) !== 0)
                    continue;
            } else {
                if (path !== component.path)
                    continue;
            }
        }

        if (component && !component.$removed) {
            var stop = fn(component);
            if (stop === true)
                return $.components;
        }
    }

    return $.components;
};

function Component(name) {

    this._id = 'component' + Math.floor(Math.random() * 100000);

    this.$dirty = true;
    this.$valid = true;
    this.$validate = false;
    this.$parser = [];
    this.$formatter = [];
    this.$skip = false;
    this.$ready = false;

    this.name = name;
    this.path;
    this.type;
    this.id;

    this.make;
    this.done;
    this.prerender;
    this.destroy;
    this.state;

    this.validate;

    this.getter = function(value, type) {
        value = this.parser(value);
        if (type === 2)
            this.$skip = true;
        if (value === this.get())
            return this;
        this.set(this.path, value, type);
        return this;
    };

    this.setter = function(value, type) {

        var self = this;

        if (type === 2) {
            if (self.$skip === true) {
                self.$skip = false;
                return self;
            }
        }

        var selector = self.$input === true ? this.element : this.element.find(COM_DATA_BIND_SELECTOR);
        value = self.formatter(value);

        selector.each(function() {

            var path = this.$component.path;

            if (path && path.length > 0 && path !== self.path)
                return;

            if (this.type === 'checkbox') {
                var tmp = value !== null && value !== undefined ? value.toString().toLowerCase() : '';
                this.checked = tmp === 'true' || tmp === '1' || tmp === 'on';
                return;
            }

            if (value === undefined || value === null)
                value = '';

            if (this.type === 'select-one' || this.type === 'select') {
                $(this).val(value);
                return;
            }

            this.value = value;
        });
    };

    this.$parser.push(function(path, value, type) {

        if (type === 'number' || type === 'currency' || type === 'float') {
            if (typeof(value) === 'string')
                value = value.replace(/\s/g, '').replace(/,/g, '.');
            var v = parseFloat(value);
            if (isNaN(v))
                v = null;
            return v;
        }

        return value;
    });
}

Component.prototype.html = function(value) {
    return this.element.html(value);
};

Component.prototype.isInvalid = function() {
    var is = !this.$valid;
    if (is && !this.$validate)
        is = !this.$dirty;
    return is;
};

Component.prototype.watch = function(path, fn) {

    var self = this;

    if (typeof(path) === 'function') {
        fn = path;
        path = self.path;
    }

    self.on('watch', path, fn);
    return self;
};

Component.prototype.valid = function(value, noEmit) {
    if (value === undefined)
        return this.$valid;

    this.$valid = value;
    this.$validate = false;

    $cmanager.clear('valid');

    if (noEmit)
        return this;

    if (this.state)
        this.state(1);

    return this;
};

Component.prototype.style = function(value) {
    STYLE(value);
    return this;
};

Component.prototype.change = function(value) {
    if (value === undefined)
        return !this.dirty();
    return this.dirty(!value);
};

Component.prototype.dirty = function(value) {

    if (value === undefined)
        return this.$dirty;

    this.$dirty = value;
    $cmanager.clear('dirty');

    if (this.state)
        this.state(2);

    return this;
};
Component.prototype.remove = function(noClear) {

    if (this.destroy)
        this.destroy();

    this.element.removeData(COM_ATTR);
    this.element.find(COM_DATA_BIND_SELECTOR).unbind('change');
    this.element.remove();

    if (!noClear)
        $cmanager.clear();

    $.components.$removed = true;
    $.components.state(undefined, 'destroy', this);
    $.components.$emit('destroy', this.name, this.element.attr(COM_ATTR_P));

    if (!noClear)
        $cmanager.cleaner();
    else
        $cmanager.refresh();

};

Component.prototype.on = function(name, path, fn) {

    if (typeof(path) === 'function') {
        fn = path;
        path = '';
    } else
        path = path.replace('.*', '');

    if (!$cmanager.events[path]) {
        $cmanager.events[path] = {};
        $cmanager.events[path][name] = [];
    } else if (!$cmanager.events[path][name])
        $cmanager.events[path][name] = [];
    $cmanager.events[path][name].push({ fn: fn, context: this, id: this._id });
    return this;
};

Component.prototype.formatter = function(value, g) {
    var a = g ? $.components.$formatter : this.$formatter;
    for (var i = 0, length = a.length; i < length; i++)
        value = a[i].call(this, this.path, value, this.type);
    return value;
};

Component.prototype.parser = function(value, g) {
    var a = g ? $.components.$parser : this.$parser;
    for (var i = 0, length = a.length; i < length; i++)
        value = a[i].call(this, this.path, value, this.type);
    return value;
};

Component.prototype.emit = function() {
    $.components.emit.apply($.components, arguments);
};

Component.prototype.get = function(path) {
    if (!path)
        path = this.path;
    if (!path)
        return;
    return $cmanager.get(path);
};

Component.prototype.update = function(path) {
    $.components.update(path || this.path);
};

Component.prototype.set = function(path, value, type) {

    var self = this;

    if (value === undefined) {
        value = path;
        path = this.path;
    }

    if (!path)
        return self;

    $.components.set(path, value, type, self);
    return self;
};

function component(type, declaration) {
    return COMPONENT(type, declaration);
}

function COMPONENT(type, declaration) {

    var fn = function(el) {
        var obj = new Component(type);
        obj.element = el;
        obj.path = el.attr(COM_ATTR_P) || obj._id;
        declaration.call(obj);
        return obj;
    };

    $cmanager.register[type] = fn;
}

function component_async(arr, fn, done) {

    var item = arr.shift();
    if (item === undefined) {
        if (done)
            done();
        return;
    }

    fn(item, function() {
        component_async(arr, fn, done);
    });
}

function ComponentManager() {
    this.isReady = false;
    this.isCompiling = false;
    this.init = [];
    this.register = {};
    this.cache = {};
    this.temp = {};
    this.model = {};
    this.components = [];
    this.schemas = {};
    this.toggle = [];
    this.ready = [];
    this.events = {};
    this.timeout;
    this.pending = [];
    this.timeoutStyles;
    this.styles = [];
    this.operations = {};
}

ComponentManager.prototype.initialize = function() {
    var item = this.init.pop();

    if (item === undefined) {
        $.components.compile();
        return this;
    }

    if (!item.$removed)
        this.prepare(item);

    this.initialize();
    return this;
};

ComponentManager.prototype.prepare = function(obj) {

    if (!obj)
        return this;

    var value = obj.get();
    var el = obj.element;
    obj.id = el.attr('data-component-id') || obj._id;

    if (obj.setter) {
        if (!obj.$ready) {
            obj.setter(value);
            obj.$ready = true;
        }
    }

    if (obj.validate)
        obj.$valid = obj.validate(obj.get(), true);

    if (obj.done)
        obj.done();

    if (obj.state)
        obj.state(0);

    if (obj.$init) {
        setTimeout(function() {
            if ($cmanager.isOperation(obj.$init)) {
                var op = OPERATION(obj.$init);
                if (op)
                    op.call(obj, obj);
                else if (console)
                    console.warn('Operation ' + obj.$init + ' not found.');
                delete obj.$init;
                return;
            }
            var fn = $.components.get(obj.$init);
            if (typeof(fn) === 'function')
                fn.call(obj, obj);
            delete obj.$init;
        }, 2);
    }

    el.trigger('component');
    el.off('component');

    var cls = el.attr(COM_ATTR_C);
    if (cls) {
        cls = cls.split(' ');
        for (var i = 0, length = cls.length; i < length; i++)
            el.toggleClass(cls[i]);
    }

    if (obj.id)
        $.components.emit('#' + obj.id, obj);

    $.components.emit('component', obj);
    return this;
};

ComponentManager.prototype.next = function() {
    var next = this.pending.shift();
    if (next === undefined) {
        if (this.isReady)
            this.isCompiling = false;
        return this;
    }
    next();
};

/**
 * Clear cache
 * @param {String} name
 * @return {ComponentManager}
 */
ComponentManager.prototype.clear = function(name) {

    var self = this;
    var arr = Object.keys(self.cache);

    for (var i = 0, length = arr.length; i < length; i++) {
        var key = arr[i];

        if (!name) {
            delete self.cache[key];
            continue;
        }

        if (key.substring(0, name.length) !== name)
            continue;
        delete self.cache[key];
    }

    return self;
};

/**
 * Refresh component instances
 * @return {ComponentManager}
 */
ComponentManager.prototype.refresh = function() {

    var self = this;
    self.components = [];

    $(COM_ATTR).each(function() {
        var component = $(this).data(COM_ATTR);
        if (!component || !component.element)
            return;
        self.components.push(component);
    });

    return self;
};

ComponentManager.prototype.isArray = function(path) {
    var index = path.lastIndexOf('[');
    if (index === -1)
        return false;
    path = path.substring(index + 1, path.length - 1).substring(0, 1);
    if (path === '"' || path === '\'')
        return false;
    return true;
};

ComponentManager.prototype.isOperation = function(name) {
    if (name.charCodeAt(0) === 35)
        return true;
    return false;
};
/**
 * Get value from a model
 * @param {String} path
 * @return {Object}
 */
ComponentManager.prototype.get = function(path) {

    if (path.charCodeAt(0) === 35) {
        var op = OPERATION(path);
        if (op)
            return op;
        else if (console)
            console.warn('Operation ' + path.substring(1) + ' not found.');
        return function(){};
    }

    var cachekey = '=' + path;
    var self = this;
    if (self.temp[cachekey])
        return self.temp[cachekey](window);

    var arr = path.split('.');
    var builder = [];
    var p = '';

    for (var i = 0, length = arr.length - 1; i < length; i++) {
        p += (p !== '' ? '.' : '') + arr[i];
        builder.push('if(!w.' + p + ')return');
    }

    var fn = (new Function('w', builder.join(';') + ';return w.' + path.replace(/\'/, '\'')));
    self.temp[cachekey] = fn;
    return fn(window);
};

/**
 * Set value to a model
 * @param {String} path
 * @param {Object} value
 */
ComponentManager.prototype.set = function(path, value) {
    if (path.charCodeAt(0) === 35) {
        var op = OPERATION(path);
        if (op)
            op(value, path);
        else if (console)
            console.warn('Operation ' + path + ' not found.');
        return self;
    }
    var cachekey = '+' + path;
    var self = this;

    if (self.temp[cachekey])
        return self.cache[cachekey](window, value);

    var arr = path.split('.');
    var builder = [];
    var p = '';

    for (var i = 0, length = arr.length; i < length; i++) {
        p += (p !== '' ? '.' : '') + arr[i];
        var type = self.isArray(arr[i]) ? '[]' : '{}';
        if (i !== length - 1) {
            builder.push('if(typeof(w.' + p + ')!=="object")w.' + p + '=' + type);
            continue;
        }

        if (type === '{}')
            break;

        p = p.substring(0, p.lastIndexOf('['));
        builder.push('if(!(w.' + p + ' instanceof Array))w.' + p + '=' + type);
        break;
    }

    var fn = (new Function('w', 'a', 'b', builder.join(';') + ';var v=typeof(a) === \'function\' ? a($cmanager.get(b)) : a;w.' + path.replace(/\'/, '\'') + '=v;return v'));
    self.cache[cachekey] = fn;
    fn(window, value, path);
    return self;
};

/**
 * Event cleaner
 * @return {ComponentManager}
 */
ComponentManager.prototype.cleaner = function() {

    var self = this;
    var aks = Object.keys(self.events);
    var is = false;

    for (var a = 0, al = aks.length; a < al; a++) {

        var ak = aks[a];

        if (!self.events[ak])
            continue;

        var bks = Object.keys(self.events[ak]);

        for (var b = 0, bl = bks.length; b < bl; b++) {

            var bk = bks[b];
            var arr = self.events[ak][bk];

            if (!arr)
                continue;

            var index = 0;

            while (true) {

                var item = arr[index++];
                if (item === undefined)
                    break;

                if (item.context === undefined)
                    continue;

                if (item.context === null || (item.context.element && item.context.element.closest(document.documentElement)))
                    continue;

                if (item.context && item.context.element)
                    item.context.element.remove();

                item.context.$removed = true;
                item.context = null;
                self.events[ak][bk].splice(index - 1, 1);

                if (self.events[ak][bk].length === 0) {
                    delete self.events[ak][bk];
                    if (Object.keys(self.events[ak]).length === 0)
                        delete self.events[ak];
                }

                index -= 2;
                is = true;
            }

        }
    }

    if (!is)
        return self;

    self.refresh();
    return self;
};

/**
 * Default component
 */
COMPONENT('', function() {

    this.make = function() {
        var type = this.element.get(0).tagName;

        if (type !== 'INPUT' && type !== 'SELECT' && type !== 'TEXTAREA') {
            this.getter = null;
            this.setter = function(value) {
                value = this.formatter(value, true);
                this.element.html(value);
            };
            return;
        }

        if (!this.element.attr(COM_ATTR_B))
            this.element.attr(COM_ATTR_B, this.path);

        this.$parser.push.apply(this.$parser, $.components.$parser);
        this.$formatter.push.apply(this.$formatter, $.components.$formatter);
        this.element.$component = this;
    };
});

setInterval(function() {
    $cmanager.cleaner();
}, 1000 * 60);

setInterval(function() {
    $cmanager.temp = {};
}, (1000 * 60) * 5);

$.components.compile();
$(document).ready(function() {
    $(document).on('change keyup blur focus', 'input[data-component-bind],textarea[data-component-bind],select[data-component-bind]', function(e) {

        var self = this;

        if (e.type === 'focusin') {
            self.$value = self.value;
            return;
        }

        if (self.$skip && e.type === 'focusout') {
            self.$skip = false;
            return;
        }

        if (!self.$component || self.$component.$removed || !self.$component.getter || !self.$component.setter)
            return;

        var old = self.$value;
        var value;

        // cleans old value
        self.$value = null;

        if (self.type === 'checkbox' || self.type === 'radio') {
            if (e.type === 'keyup')
                return;
            var value = self.checked;
            self.$component.dirty(false);
            self.$component.getter(value, 2);
            self.$component.$skip = false;
            return;
        }

        if (self.tagName === 'SELECT') {
            if (e.type === 'keyup')
                return
            var selected = self[self.selectedIndex];
            value = selected.value;
            self.$component.dirty(false);
            self.$component.getter(value, 2);
            self.$component.$skip = false;
            return;
        }

        if (self.$delay === undefined)
            self.$delay = parseInt(self.getAttribute('data-component-keypress-delay') || '0');

        if (self.$nokeypress === undefined)
            self.$nokeypress = self.getAttribute('data-component-keypress') === 'false';

        var delay = self.$delay;

        if (self.$nokeypress) {
            if (e.type === 'keyup' || e.type === 'blur')
                return;
            if (delay === 0)
                delay = 1;
        } else if (delay === 0)
            delay = 300;

        value = self.value;
        clearTimeout(self.$timeout);
        self.$timeout = setTimeout(function() {
            if (value === old)
                return;
            self.$timeout = null;
            self.$component.dirty(false);
            self.$component.getter(self.value, 2);
            if (e.type === 'keyup')
                return;
            self.$skip = true;
            self.$component.$skip = false;
            self.$component.setter(self.value, 2);
        }, delay);
    });

    setTimeout(function() {
        $.components.compile();
    }, 2);

    setTimeout(function() {
        $cmanager.cleaner();
    }, 3000);
});

function SET(name, value) {
    return $.components.set(name, value);
}

function RESET(path) {
    return $.components.reset(path);
}

function WATCH(path, callback) {
    return $.components.on('watch', path, callback);
}

function GET(name) {
    return $.components.get(name);
}

function UPDATE(path) {
    return $.components.update(path);
}

function CHANGE(path, value) {
    return $.components.change(path, value);
}

function INJECT(url, target, callback, timeout) {
    return $.components.inject(url, target, callback, timeout);
}

function SCHEMA(name, declaration, callback) {
    return $.components.schema(name, declaration, callback);
}

function OPERATION(name, fn) {
    if (!fn) {
        if (name.charCodeAt(0) === 35)
            return $cmanager.operations[name.substring(1)];
        return $cmanager.operations[name];
    }
    $cmanager.operations[name] = fn;
    return fn;
};

function STYLE(value) {
    clearTimeout($cmanager.timeoutStyles);
    $cmanager.styles.push(value);
    $cmanager.timeoutStyles = setTimeout(function() {
        $('<style type="text/css">' + $cmanager.styles.join('') + '</style>').appendTo('head');
        $cmanager.styles = [];
    }, 50);
}