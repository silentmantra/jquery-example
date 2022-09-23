
{
    /*
        adds support for event:param format

        for our custom events devined in jQuery.fn.special
        we can provide additional parameters using a colon, for example:
        elem.on('attr:readonly:disabled', (e, val, old) => console.log(val, old));

        in the example above we listen for changes of readonly and disabled attributes on an element and
        print the changed attribute's current and old name & value objects to the console

    */

    let _on = jQuery.fn.on;

    jQuery.fn.on = function() {

        const self = this;

        let name = arguments[0];
        let args = [].copy(arguments);
        if (typeof name !== 'string') {
            return _on.apply(self, args);
        }

        args.shift();

        let names = name.words();
        if (names.length > 1) {
            for (let i = 0, len = names.length; i < len; i++) {
                jQuery.fn.on.apply(self, [names[i]].append(args));
            }
            return self;
        }

        if (name.includes(':')) {
            if (!Object.keys(jQuery.event.special).includes(name)) {
                let ps = name.split(':');
                let match = ps.shift();

                if (jQuery.event.special[match]) {

                    let params = {flags: ps};

                    if (typeof args[0] === 'object') { // merge params
                        $.extend(params, args.shift());
                    }

                    return _on.apply(self, [match, params].append(args));
                }
            }
        }
        return _on.apply(self, [name].append(args));


    };
}

{

    // adds support for attr:attributeName1:attributeName2 jQuery event
    // todo: the code was copied from the custom resize event, consider to combine common logic into 1 class and parameterize it

    let defs = {
        'attr': {},
    };

    const observer = new MutationObserver(events => {

        // todo: optimize

        events = events.filter(processObserved);

        if (!events.length) {
            return;
        }

        for (let elem of elems.values()) {
            elem.process(events);
        }

    });

    let elems = new Map;
    let observed = new Map;
    let observedHistory = new Map;

    function processObserved(event) {

        let data = observed.get(event.target);
        if (!data) { // already removed
            return false;
        }

        let name = event.attributeName;

        if (!(name in data.attributes)) {
            return false;
        }

        return true;
    }

    function Elem(elem) {

        this.process = process;
        this.observe = observe;
        this.unobserve = unobserve;

        let data = jQuery._data(elem);
        let handled = new Map;

        function process(events) {

            // todo: optimize

            for (let name in data.events) {

                if (!defs[name]) {
                    continue;
                }

                for (let handler of data.events[name]) {

                    let affected = events.filter(event =>
                        handled.get(handler).includes(event.target) && handler.data.flags.includes(event.attributeName),
                    );

                    if (!affected.length) {
                        return;
                    }

                    let current = {};
                    let old = {};

                    for (let i = 0, len = affected.length; i < len; i++) {
                        let event = affected[i];
                        let name = event.attributeName;

                        current[name] = event.target.getAttribute(name);
                        old[name] = event.attributeOldValue;

                    }

                    if (handler.data.flags.length === 1 && !handler.data.names) {
                        for (let name in current) {
                            $(elem).triggerHandler(handler.type, current[name], old[name]);
                        }
                        return;
                    }

                    $(elem).triggerHandler(handler.type, current, old);


                }
            }
        }


        function observe(handler, elem) {

            if (elem instanceof jQuery) {
                elem.each(function() {
                    observe(handler, this);
                });
                return;
            }

            let data = observed.ensure(elem, () => {

                // todo: observe only needed attrs
                // we cannot observe the same element with the same observer because
                // that disconnects all other observers from the element

                if (!observedHistory.has(elem)) {
                    observer.observe(elem, {attributes: true});
                    observedHistory.set(elem, true);
                }

                return {
                    attributes: {},
                };
            });

            for (let i = 0, len = handler.data.flags.length; i < len; i++) {
                let name = handler.data.flags[i];

                let attr = data.attributes[name];
                if (attr) {
                    attr.count++;
                } else {
                    data.attributes[name] = {
                        count: 1,
                    };
                }

            }

            handled.ensure(handler, []).push(elem);
        }

        function unobserve(handler) {

            handled.pop(handler).each(elem => {

                let data = observed.get(elem);

                for (let i = 0, len = handler.data.flags.length; i < len; i++) {
                    let name = handler.data.flags[i];
                    let attr = data.attributes[name];
                    if (!--attr.count) {
                        delete data.attributes[name];
                        if (!Object.keys(data.attributes).length) {
                            observed.delete(elem);
                        }
                    }
                }

            });

            for (let name in data.events) {
                if (defs[name] && data.events[name].length) {
                    return;
                }
            }

            elems.delete(elem);
        }

    }

    let special = {

        add: function(handler) {

            let elem = elems.ensure(this, () => new Elem(this));

            if (!iif_.func(defs[handler.type].add, handler, elem, this)) {
                elem.observe(handler, this);
            }


        },
        remove: function(handler) {

            if (this === window) {
                return;
            }

            elems.get(this).unobserve(handler);

        },
    };

    Object.keys(defs).each(name => jQuery.event.special[name] = special);

}

{

    let defs = {
        'child:add': {
            params: ({added}) => added.length ? [added] : null,
            type: 'child:add-remove',
        },
        'child:remove': {
            params: ({removed}) => removed.length ? [removed] : null,
            type: 'child:add-remove',
        },
        'child:add-remove': {
            params: ({added, removed}) => added.length || removed.length ? [added, removed] : null,
            type: 'child:add-remove',
        },
        'child:show-hide': {
            params: e => {
                return null;
            },
            type: 'child:show-hide',
        },
    };

    let types = {
        'child:show-hide': {
            observe: {subtree: true, attributeFilter: 'class style'.words()},
            add: (elem, data) => {
                elem.children().each(function() {
                    let elem = $(this);
                    let data = jQuery._data(this);
                    data.visible = elem.is(':visible');
                });
            },
            handler: (events, elem, data, event) => {

                let visible = [], hidden = [];

                for (let e of events) {

                    if (event.data?.exclude?.is(e.target)) {
                        continue;
                    }

                    let idx = elem.children().index(e.target);
                    if (idx === -1) {
                        continue;
                    }
                    let v = $(e.target).is(':visible');
                    if (v !== data.visible) {
                        if (v) {
                            visible.push(e.target);
                        } else {
                            hidden.push(e.target);
                        }
                        data.visible = v;
                    }

                }


                if (visible.length || hidden.length) {
                    $(elem).triggerHandler(event.type, visible, hidden);
                }

            },
        },


        'child:add-remove': {
            observe: {childList: true},
            handler: (events, elem, data, event) => {
                let mapped = new Map;

                for (let e of events) {

                    let observed = mapped.get(e.target);
                    if (!observed) {
                        observed = {added: [], removed: []};
                        mapped.set(e.target, observed);
                    }

                    for (let node of e.addedNodes) {
                        if (node.nodeType === 3) {
                            continue;
                        }
                        observed.added.push(node);
                    }
                    for (let node of e.removedNodes) {
                        if (node.nodeType === 3) {
                            continue;
                        }
                        observed.removed.push(node);
                    }

                }

                for (let [elem, observed] of mapped) {

                    for (let def of getEvents(data, event.type)) {
                        let params = def.params(observed);
                        params && $(elem).triggerHandler(event.type, ...params);
                    }

                }
            },
        },
    };

    function getEvents(data, type) {

        let out = [];

        for (let name in defs) {

            if (defs[name].type !== type) {
                continue;
            }
            if (data.events[name]?.length) {
                out.push(defs[name]);
            }

        }

        return out;

    }

    function hasEvents(data, type) {

        for (let name in defs) {

            if (defs[name].type !== type) {
                continue;
            }
            if (data.events[name]?.length) {
                return true;
            }

        }

        return false;

    }

    let special = {

        add: function(e) {

            let data = jQuery._data(this);

            let def = defs[e.type];

            if (!data.observers) {
                data.observers = {};
            }

            if (data.observers[def.type]) {
                return;
            }

            let type = types[def.type];
            type.add?.($(this));
            let observer = new MutationObserver(events => type.handler(events, $(this), data, e));

            data.observers[def.type] = {
                observer,
            };

            observer.observe(this, type.observe);

        },

        remove: function(e) {

            let data = jQuery._data(this);

            if (!hasEvents(data, e.type)) {
                data.observers?.[e.type]?.observer.disconnect();
                delete data.observers?.[e.type];
            }

        },
    };

    Object.keys(defs).each(name => jQuery.event.special[name] = special);
}
{

    // adds support for resize jQuery event for DOM elements
    // todo: the code was reused for the custom attr event by copying, consider to combine common logic into 1 class and parameterize it

    let params = elem => {
        let data = observed.get(elem);
        return [data.rect, data.rectPrev];
    };

    let defs = {
        'resize:parents': {
            add: (handler, elem, node) => elem.observe(handler, $(node).parents()),
            params: (elem, affected) => [affected],
        },
        'resize': {
            equal: (a, b) => a.width === b.width && a.height === b.height,
            params,
        },
        'resize:trigger': {
            trigger: true,
            equal: (a, b) => a.width === b.width && a.height === b.height,
            params,
        },
        'resize:width': {
            equal: (a, b) => a.width === b.width,
            params,
        },
        'resize:height': {
            equal: (a, b) => a.height === b.height,
            params,
        },
    };

    const observer = new ResizeObserver(events => {

        events = events.filter(processObserved);

        if (!events.length) {
            return;
        }

        for (let elem of elems.values()) {
            elem.process(events);
        }

    });

    let elems = new Map;
    let observed = new Map;

    function processObserved(event) {

        let data = observed.get(event.target);

        data.rectPrev = data.rect;
        data.rect = event.contentRect;

        if (!data.skipped) {
            data.skipped = true;
            return false;
        }

        return !defs.resize.equal(data.rect, data.rectPrev);

    }

    function Elem(elem) {

        this.process = process;
        this.observe = observe;
        this.unobserve = unobserve;

        let data = jQuery._data(elem);
        let handled = new Map;

        function process(events) {

            for (let name in data.events) {
                if (!defs[name]) {
                    continue;
                }
                for (let handler of data.events[name]) {

                    let affected = events.filter(event => handled.get(handler).includes(event.target));

                    if (affected.length) {

                        let params = defs[handler.type].params(elem, affected);

                        $(elem).triggerHandler(handler.type, params);
                    }
                }
            }
        }


        function observe(handler, elem) {

            if (elem instanceof jQuery) {
                elem.each(function() {
                    observe(handler, this);
                });
                return;
            }

            observed.ensure(elem, () => {
                observer.observe(elem);
                return {
                    count: 0,
                    rect: elem.getBoundingClientRect(),
                };
            }).count++;

            handled.ensure(handler, []).push(elem);
        }

        function unobserve(handler) {

            handled.pop(handler).each(elem => {

                let data = observed.get(elem);

                if (!--data.count) {
                    observer.unobserve(elem);
                    observed.delete(elem);
                }

            });

            for (let name in data.events) {
                if (defs[name] && data.events[name].length) {
                    return;
                }
            }
            elems.delete(elem);
        }

    }

    let special = {

        add: function(handler) {

            if (this === window) { // handled by jQuery
                return;
            }

            let elem = elems.ensure(this, () => new Elem(this));

            if (!iif_.func(defs[handler.type].add, handler, elem, this)) {
                elem.observe(handler, this);
            }


        },
        remove: function(handler) {

            if (this === window) {
                return;
            }

            elems.get(this).unobserve(handler);

        },
    };

    Object.keys(defs).each(name => jQuery.event.special[name] = special);

}