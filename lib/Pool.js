const asyncQueue = require('async/queue');
const asyncEach = require('async/each');
const asyncify = require('async/asyncify');
const timeout = require('async/timeout');
const { promisify, inspect } = require('util');
const assert = require('assert');
const EventEmitter = require('events');

inspect.defaultOptions.colors = true;
inspect.defaultOptions.depth = 0;

function noop() {}

function assertUnknownOptionsKeys(options, knownKeys) {
    const keys = Object.keys(options);
    for (let i = 0; i < keys.length; i++) {
        if (!knownKeys.includes(keys[i])) {
            throw new Error(`Unknown options key "${keys[i]}"`);
        }
    }
}

/**
 * A pool object
 *
 * @param {Object} options
 * @param {function} options.acquire
 *      The function that acquires a resource (e.g. opens a database connection) on behalf of the pool.
 *      Accepts a node-style callback, callback returning a promise or callback returning a value.
 * @param {function} options.dispose
 *      The function that disposes a resource (e.g. gracefully closes a database connection) on behalf of the pool.
 *      Accepts the resource to dispose of, which is the same object returned by the acquire function
 *      and a node-style callback, callback returning a promise or callback returning a value.
 * @param {number} [options.min = 0]
 *      Minimum number of resources to keep in pool at any given time.
 * @param {number} [options.max = 1]
 *      Maximum number of resources to create at any given time.
 * @param {number} [options.maxWaitingClients = 10]
 *      Maximum number of queued requests allowed, additional acquire calls will be callback with an error.
 * @param {number} [options.acquireTimeoutMs = 30000]
 *      Max milliseconds an acquire call will wait for a resource acquiring before timing out.
 * @param {number} [options.releaseTimeoutMs = 30000]
 *      Max milliseconds an release call will wait for a resource disposing before timing out.
 * @param {boolean} [options.fifo = false]
 *      If true the oldest resources will be first to be allocated. If false the most recently released
 *      resources will be the first to be allocated.
 */
class Pool extends EventEmitter {
    constructor(options) {
        super();

        assert.equal(typeof options, 'object', 'options must be an object');
        assert.equal(typeof options.acquire, 'function', 'options.acquire must be a function');
        assert.equal(typeof options.dispose, 'function', 'options.dispose must be a function');
        assertUnknownOptionsKeys(options, [
            'acquire',
            'dispose',
            'min',
            'max',
            'maxWaitingClients',
            'acquireTimeoutMs',
            'releaseTimeoutMs',
            'fifo',
        ]);

        this._factory = {
            acquire: options.acquire.length === 1 ? options.acquire : asyncify(options.acquire),
            dispose: options.dispose.length === 2 ? options.dispose : asyncify(options.dispose),
        };

        options = options || {};

        this._options = {
            min: options.min || 0,
            max: options.max || 1,
            maxWaitingClients: options.maxWaitingClients || 10,
            fifo: options.fifo || false,

            acquireTimeoutMs: options.acquireTimeoutMs || 10000,
            releaseTimeoutMs: options.releaseTimeoutMs || 5000,
        };

        this._rSet = new Set();
        this._rDestroyed = new Map();
        this._rBorrowed = new Map();
        this._rAvailable = [];
        this._rReleased = [];
        this._ending = false;
        this._ended = false;

        this._queue = asyncQueue(
            (handler, next) => {
                this._getResource((err, resource) => {
                    if (err) {
                        handler(err);
                        next();
                    } else {
                        this._rBorrowed.set(resource, (cb) => {
                            this._releaseResource(resource, (e) => {
                                cb(e);
                                next();
                            });
                        });
                        handler(null, resource);
                    }
                });
            },
            this._options.max,
        );

        this._queue.saturated = () => this.emit('saturated');
        this._queue.unsaturated = () => this.emit('unsaturated');
        this._queue.empty = () => this.emit('empty');
        this._queue.drain = () => this.emit('drain');
        this._queue.error = err => this.emit('error', err);

        this._acquire = timeout(this._acquire.bind(this), this._options.acquireTimeoutMs, 'Acquire timed out');
        this._release = timeout(this._release.bind(this), this._options.releaseTimeoutMs, 'Release timed out');
    }

    /**
     * @return {number}
     *      Returns number of resources in the pool regardless of whether they are free or in use
     */
    get size() {
        return this._rSet.size;
    }

    /**
     * @return {Number}
     *      Returns number of unused resources in the pool
     */
    get available() {
        return this._rAvailable.length;
    }

    /**
     * @return {number}
     *      Returns number of resources that are currently acquired by userland code
     */
    get borrowed() {
        return this._rBorrowed.size;
    }

    get stats() {
        return {
            size: this.size,
            available: this.available,
            borrowed: this.borrowed,
        };
    }

    /**
     * Acquire a resource from the pool.
     * Calls to acquire after calling end will be rejected with the error "Pool is ending"
     * or "Pool is destroyed" once shutdown has completed.
     *
     * @param {function(err, resource:*)} [cb]
     * @returns {undefined|Promise}
     *      Returns a promise if callback isn't provided.
     */
    acquire(cb) {
        if (typeof cb !== 'function') {
            return this.acquireAsync();
        }
        if (this._ending) {
            return cb(new Error('Pool is ending'));
        }
        if (this._ended) {
            return cb(new Error('Pool is destroyed'));
        }
        if (this._queue.length() >= this._options.maxWaitingClients) {
            return cb(new Error(`Max waiting clients count exceeded [${this._options.maxWaitingClients}]`));
        }
        this._acquire(cb);
    }

    _acquire(cb) {
        this._queue.push(cb);
    }

    /**
     * Return a resource to the pool.
     *
     * @param {*} resource
     * @param {function(err)} [cb]
     * @returns {undefined|Promise}
     *      Returns a promise if callback isn't provided.
     */
    release(resource, cb) {
        if (typeof cb !== 'function') {
            return this.releaseAsync(resource);
        }
        this._release(resource, cb);
    }

    _release(resource, cb) {
        const releaseCb = this._rBorrowed.get(resource);
        if (releaseCb) {
            releaseCb(cb);
        } else {
            return cb(new Error(`Trying to release not acquired resource: ${inspect(resource)}`));
        }
    }

    /**
     * Remove a resource from the pool gracefully.
     *
     * @param {*} resource
     * @param {function(err)} [cb]
     * @returns {undefined|Promise}
     *      Returns a promise if callback isn't provided.
     */
    destroy(resource, cb) {
        if (typeof cb !== 'function') {
            return this.destroyAsync(resource);
        }
        if (this._rSet.has(resource)) {
            this._rDestroyed.set(resource, (c) => {
                this._factory.dispose(resource, (err) => {
                    this._deleteResource(resource);
                    c(err);
                });
            });
            if (this._rBorrowed.has(resource)) {
                this.release(resource, cb);
            } else {
                const indexOfResource = this._rAvailable.indexOf(resource);
                this._rAvailable.splice(indexOfResource, 1);
                this._rDestroyed.get(resource)(cb);
            }
        } else {
            return cb();
        }
    }

    /**
     * Attempt to gracefully close the pool.
     *
     * @param {boolean} force
     * @param {function(err)} cb
     * @returns {undefined|Promise}
     *      Returns a promise if callback isn't provided.
     */
    end(force, cb) {
        if (typeof force === 'function') {
            cb = force;
        }
        if (typeof cb !== 'function') {
            return this.endAsync(force);
        }

        this._ending = true;
        const onEnd = (err) => {
            this._ended = true;
            this._ending = false;
            cb(err);
        };

        if (force && force !== cb) {
            asyncEach(Array.from(this._rSet.values()), (resource, c) => {
                this.destroy(resource, c);
            }, onEnd);
        } else {
            this._rAvailable.slice(0).forEach((resource) => {
                this.destroy(resource, noop);
            });

            if (this._queue.idle()) {
                onEnd();
            } else {
                this.once('drain', onEnd);
            }
        }
    }

    _releaseResource(resource, cb) {
        this._rBorrowed.delete(resource);
        const destroyCb = this._rDestroyed.get(resource);
        if (destroyCb) {
            destroyCb(cb);
        } else if (this._ending) {
            this.destroy(resource, cb);
        } else if (this._options.fifo) {
            this._rAvailable.unshift(resource);
            cb();
        } else {
            this._rAvailable.push(resource);
            cb();
        }
    }

    _deleteResource(resource) {
        this._rSet.delete(resource);
        this._rDestroyed.delete(resource);
        this._rBorrowed.delete(resource);
    }

    _getResource(cb) {
        if (this._rAvailable.length) {
            cb(null, this._rAvailable.pop());
        } else {
            this._factory.acquire((err, resource) => {
                if (err) {
                    cb(err);
                } else {
                    this._rSet.add(resource);
                    cb(null, resource);
                }
            });
        }
    }
}

Pool.prototype.acquireAsync = promisify(Pool.prototype.acquire);
Pool.prototype.releaseAsync = promisify(Pool.prototype.release);
Pool.prototype.destroyAsync = promisify(Pool.prototype.destroy);
Pool.prototype.endAsync = promisify(Pool.prototype.end);

module.exports = Pool;
