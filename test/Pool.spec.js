const test = require('tape-async');
const Pool = require('../lib/Pool');
const { spy, stub } = require('sinon');
const pick = require('lodash.pick');

test('pool.size property', async (t) => {
    const settings = {
        acquire: () => Promise.resolve({}),
        dispose() {},
        min: 0,
        max: 2,
    };
    const pool = new Pool(settings);

    // acquire
    t.equal(pool.size, 0, 'initial -> size = 0');
    const res1 = await pool.acquire();
    t.equal(pool.size, 1, 'acquire -> size = 1');
    const res2 = await pool.acquire();
    t.equal(pool.size, 2, 'acquire -> size = 2');

    // max value reached
    const res3 = pool.acquire();
    t.equal(pool.size, 2, 'acquire -> size = 2');

    // release
    await pool.release(res1);
    t.equal(pool.size, 2, 'release -> size = 2');
    await pool.release(res2);
    t.equal(pool.size, 2, 'release -> size = 2');
    await pool.release(await res3);
    t.equal(pool.size, 2, 'release -> size = 2');
});

test('pool.available property', async (t) => {
    const settings = {
        acquire: () => Promise.resolve({}),
        dispose() {},
        min: 0,
        max: 2,
    };
    const pool = new Pool(settings);

    // acquire
    t.equal(pool.available, 0, 'initial -> available = 0');
    const res1 = await pool.acquire();
    t.equal(pool.available, 0, 'acquire -> available = 0');
    const res2 = await pool.acquire();
    t.equal(pool.available, 0, 'acquire -> available = 0');

    // max value reached
    const res3 = pool.acquire();
    t.equal(pool.available, 0, 'acquire -> available = 0');

    // release
    await pool.release(res1);
    t.equal(pool.available, 0, 'release -> available = 0');
    await pool.release(res2);
    t.equal(pool.available, 1, 'release -> available = 1');
    await pool.release(await res3);
    t.equal(pool.available, 2, 'release -> available = 2');
});

test('pool.borrowed property', async (t) => {
    const settings = {
        acquire: () => Promise.resolve({}),
        dispose() {},
        min: 0,
        max: 2,
    };
    const pool = new Pool(settings);

    // acquire
    t.equal(pool.borrowed, 0, 'initial -> borrowed = 0');
    const res1 = await pool.acquire();
    t.equal(pool.borrowed, 1, 'acquire -> borrowed = 1');
    const res2 = await pool.acquire();
    t.equal(pool.borrowed, 2, 'acquire -> borrowed = 2');

    // max value reached
    const res3 = pool.acquire();
    t.equal(pool.borrowed, 2, 'acquire -> borrowed = 2');

    // release
    await pool.release(res1);
    t.equal(pool.borrowed, 2, 'release -> borrowed = 2');
    await pool.release(res2);
    t.equal(pool.borrowed, 1, 'release -> borrowed = 1');
    await pool.release(await res3);
    t.equal(pool.borrowed, 0, 'release -> borrowed = 0');
});

test('pool.release method', (group) => {
    group.test('release not pooled resource', async (t) => {
        const settings = {
            acquire: stub().callsFake(() => Promise.resolve({})),
            dispose: stub(),
        };
        const pool = new Pool(settings);

        await pool.release()
            .catch((err) => {
                t.ok(/Trying to release not acquired resource/.test(err.message), 'yields error');
            });
    });
});

test('pool.destroy method', (group) => {
    group.test('without destroy', async (t) => {
        const settings = {
            acquire: stub().callsFake(() => Promise.resolve({})),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        const res1 = await pool.acquire();
        pool.release(res1);
        const res2 = await pool.acquire();
        pool.release(res2);
        t.equal(res1, res2, 'res1 is equal to res2');
        t.ok(settings.acquire.calledOnce, 'settings.acquire called once');
        t.ok(settings.dispose.notCalled, 'settings.dispose never called');
    });

    group.test('destroy borrowed once', async (t) => {
        const settings = {
            acquire: stub().callsFake(() => Promise.resolve({})),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        const res1 = await pool.acquire();
        await pool.destroy(res1);
        const res2 = await pool.acquire();
        await pool.release(res2);
        t.notEqual(res1, res2, 'res1 is not equal to res2');
        t.ok(settings.acquire.calledTwice, 'settings.acquire called twice');
        t.ok(settings.dispose.calledOnce, 'settings.dispose called once');
    });

    group.test('destroy available once', async (t) => {
        const settings = {
            acquire: stub().callsFake(() => Promise.resolve({})),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        const res1 = await pool.acquire();
        await pool.release(res1);
        await pool.destroy(res1);
        t.ok(settings.acquire.calledOnce, 'settings.acquire called once');
        t.ok(settings.dispose.calledOnce, 'settings.dispose called once');
    });

    group.test('destroy not pooled resource', async (t) => {
        const settings = {
            acquire: stub().callsFake(() => Promise.resolve({})),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        await pool.destroy()
            .catch(() => {
                t.fail('should not throw error');
            });
    });

    group.test('size property', async (t) => {
        const settings = {
            acquire: () => Promise.resolve({}),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        const res1 = await pool.acquire();
        const res2 = await pool.acquire();
        t.equal(pool.size, 2, 'initial size is equal to 2');
        pool.destroy(res1);
        t.equal(pool.size, 1, 'after destroy res1 size is equal to 1 (sync)');
        pool.destroy(res2);
        t.equal(pool.size, 0, 'after destroy res2 size is equal to 0 (sync)');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
    });

    group.test('available property', async (t) => {
        const settings = {
            acquire: () => Promise.resolve({}),
            dispose: stub(),
            min: 0,
            max: 2,
        };
        const pool = new Pool(settings);

        const res1 = await pool.acquire();
        const res2 = await pool.acquire();
        await pool.release(res1);
        await pool.release(res2);
        t.equal(pool.available, 2, 'initial available is equal to 2');
        pool.destroy(res1);
        t.equal(pool.available, 1, 'after destroy res1 available is equal to 1 (sync)');
        pool.destroy(res2);
        t.equal(pool.available, 0, 'after destroy res2 available is equal to 0 (sync)');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
    });
});

test('pool.end method', (group) => {
    group.test('end if pool has borrowed resources', async (t) => {
        let counter = 1;
        const settings = {
            acquire: () => Promise.resolve(counter++),
            dispose: spy(),
            min: 0,
            max: 10,
        };
        const pool = new Pool(settings);
        const drain = spy();
        pool.on('drain', drain);

        const res1 = await pool.acquire();
        const res2 = await pool.acquire();
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 2, available: 0, borrowed: 2 },
            'initial state match',
        );
        const end = pool.end();
        pool.release(res1);
        pool.release(res2);
        await end;
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 0, available: 0, borrowed: 0 },
            'final state match',
        );

        t.ok(drain.calledOnce, 'drain event emitted once');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
        t.ok(drain.calledAfter(settings.dispose), 'drain event emitted after destroy called');
    });

    group.test('end if pool has no borrowed resources', async (t) => {
        let counter = 1;
        const settings = {
            acquire: () => Promise.resolve(counter++),
            dispose: spy(),
            min: 0,
            max: 10,
        };
        const pool = new Pool(settings);
        const drain = spy();
        pool.on('drain', drain);

        const res1 = await pool.acquire();
        const res2 = await pool.acquire();
        await pool.release(res1);
        await pool.release(res2);
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 2, available: 2, borrowed: 0 },
            'initial state match',
        );
        await pool.end();
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 0, available: 0, borrowed: 0 },
            'final state match',
        );

        t.ok(drain.calledOnce, 'drain event emitted once');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
        t.ok(drain.calledBefore(settings.dispose), 'drain event emitted before destroy called');
    });

    group.test('end if pool has borrowed resources (force)', async (t) => {
        let counter = 1;
        const settings = {
            acquire: () => Promise.resolve(counter++),
            dispose: spy(),
            min: 0,
            max: 10,
        };
        const pool = new Pool(settings);
        const drain = spy();
        pool.on('drain', drain);

        await pool.acquire();
        await pool.acquire();
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 2, available: 0, borrowed: 2 },
            'initial state match',
        );
        await pool.end(true);
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 0, available: 0, borrowed: 0 },
            'final state match',
        );

        t.ok(drain.calledOnce, 'drain event emitted once');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
        t.ok(drain.calledAfter(settings.dispose), 'drain event emitted after destroy called');
    });

    group.test('callback', async (t) => {
        const settings = {
            acquire: () => Promise.resolve(),
            dispose: stub(),
            min: 0,
            max: 10,
        };
        const pool = new Pool(settings);

        pool.release(await pool.acquire());

        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 1, available: 1, borrowed: 0 },
            'initial state match',
        );
        await new Promise(resolve => pool.end(resolve));
        t.deepEqual(
            pick(pool, ['size', 'available', 'borrowed']),
            { size: 0, available: 0, borrowed: 0 },
            'final state match',
        );
    });

    group.test('acquire after end called', async (t) => {
        const settings = {
            acquire: () => Promise.resolve(),
            dispose: stub(),
            min: 0,
            max: 10,
        };
        const pool = new Pool(settings);

        const res = await pool.acquire();
        const end = pool.end();
        try {
            await pool.acquire();
        } catch (err) {
            t.equal(err.message, 'Pool is ending', 'error "Pool is ending"');
        }
        await pool.release(res);
        await end;
        try {
            await pool.acquire();
        } catch (err) {
            t.equal(err.message, 'Pool is destroyed', 'error "Pool is destroyed"');
        }

        t.ok(settings.dispose.calledOnce, 'settings.dispose called once');
    });
});

test('pool acquire setting', (group) => {
    group.test('create/destroy (promise) ok', async (t) => {
        let counter = 1;
        const settings = {
            acquire: () => Promise.resolve(`resource-${counter++}`),
            dispose: () => Promise.resolve(),
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        t.equal(await pool.acquire(), 'resource-1', 'first acquire yields `resource-1`');
        t.equal(await pool.acquire(), 'resource-2', 'second acquire yields `resource-2`');
        await pool.release('resource-1');
        t.pass('`resource-1` released');
        t.equal(await pool.acquire(), 'resource-1', 'third acquire yields `resource-1`');
        await pool.destroy('resource-1');
        await pool.destroy('resource-2');
        t.ok(settings.acquire.calledTwice, 'settings.acquire called twice');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
    });

    group.test('create/destroy (callback) ok', async (t) => {
        let counter = 1;
        const settings = {
            acquire(cb) {
                cb(null, `resource-${counter++}`);
            },
            dispose(resource, cb) {
                cb();
            },
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        t.equal(await pool.acquire(), 'resource-1', 'first acquire yields `resource-1`');
        t.equal(await pool.acquire(), 'resource-2', 'second acquire yields `resource-2`');
        await pool.release('resource-1');
        t.pass('`resource-1` released');
        t.equal(await pool.acquire(), 'resource-1', 'third acquire yields `resource-1`');
        await pool.destroy('resource-1');
        await pool.destroy('resource-2');
        t.ok(settings.acquire.calledTwice, 'settings.acquire called twice');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
    });

    group.test('create/destroy (sync) ok', async (t) => {
        let counter = 1;
        const settings = {
            acquire: () => `resource-${counter++}`,
            dispose() {},
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        t.equal(await pool.acquire(), 'resource-1', 'first acquire yields `resource-1`');
        t.equal(await pool.acquire(), 'resource-2', 'second acquire yields `resource-2`');
        await pool.release('resource-1');
        t.pass('`resource-1` released');
        t.equal(await pool.acquire(), 'resource-1', 'third acquire yields `resource-1`');
        await pool.destroy('resource-1');
        await pool.destroy('resource-2');
        t.ok(settings.acquire.calledTwice, 'settings.acquire called twice');
        t.ok(settings.dispose.calledTwice, 'settings.dispose called twice');
    });
});

test('pool acquire/dispose setting error handling', (group) => {
    group.test('settings.acquire (promise) fail', async (t) => {
        const createError = new Error('create error');
        const settings = {
            acquire: () => Promise.reject(createError),
            dispose: () => Promise.resolve(),
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);
        const createErrorStub = spy();

        await pool.acquire()
            .catch(createErrorStub)
            .then(() => {
                t.ok(createErrorStub.calledOnce, 'create error catched once');
                t.ok(createErrorStub.calledWith(createError), 'create error `err` match');
            });
    });

    group.test('acquire (promise) without catch', async (t) => {
        const createError = new Error('create error');
        const settings = {
            acquire: () => Promise.reject(createError),
            dispose: () => Promise.resolve(),
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        try {
            await pool.acquire();
        } catch (err) {
            t.equal(err, createError, 'create error `err` match');
        }
    });

    group.test('settings.dispose (promise) fail', async (t) => {
        const destroyError = new Error('create error');
        const destroyErrorStub = spy();
        const settings = {
            acquire: () => Promise.resolve(),
            dispose: () => Promise.reject(destroyError),
            min: 0,
            max: 10,
        };
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        await pool.destroy(await pool.acquire())
            .catch(destroyErrorStub)
            .then(() => {
                t.ok(destroyErrorStub.calledOnce, 'destroy error catched once');
                t.ok(destroyErrorStub.calledWith(destroyError), 'destroy error `err` match');
            });
    });

    group.test('settings.acquire (callback) fail', async (t) => {
        const createError = new Error('create error');
        const settings = {
            acquire: cb => cb(createError),
            dispose() {},
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        spy(settings, 'dispose');
        const pool = new Pool(settings);
        const createErrorStub = spy();

        await pool.acquire()
            .catch(createErrorStub)
            .then(() => {
                t.ok(createErrorStub.calledOnce, 'create error catched once');
                t.ok(createErrorStub.calledWith(createError), 'create error `err` match');
            });
    });

    group.test('settings.dispose (callback) fail', async (t) => {
        const destroyError = new Error('create error');
        const destroyErrorStub = spy();
        const settings = {
            acquire() {},
            dispose: (resource, cb) => cb(destroyError),
            min: 0,
            max: 10,
        };
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        await pool.destroy(await pool.acquire())
            .catch(destroyErrorStub)
            .then(() => {
                t.ok(destroyErrorStub.calledOnce, 'destroy error catched once');
                t.ok(destroyErrorStub.calledWith(destroyError), 'destroy error `err` match');
            });
    });

    group.test('settings.acquire (sync) fail', async (t) => {
        const createError = new Error('create error');
        const createErrorStub = spy();
        const settings = {
            acquire() {
                throw createError;
            },
            dispose() {},
            min: 0,
            max: 10,
        };
        spy(settings, 'acquire');
        const pool = new Pool(settings);

        await pool.acquire()
            .catch(createErrorStub)
            .then(() => {
                t.ok(createErrorStub.calledOnce, 'create error catched once');
                t.ok(createErrorStub.calledWith(createError), 'create error `err` match');
            });
    });

    group.test('settings.dispose (sync) fail', async (t) => {
        const destroyError = new Error('create error');
        const destroyErrorStub = spy();
        const settings = {
            acquire() {},
            dispose() {
                throw destroyError;
            },
            min: 0,
            max: 10,
        };
        spy(settings, 'dispose');
        const pool = new Pool(settings);

        await pool.destroy(await pool.acquire())
            .catch(destroyErrorStub)
            .then(() => {
                t.ok(destroyErrorStub.calledOnce, 'destroy error catched once');
                t.ok(destroyErrorStub.calledWith(destroyError), 'destroy error `err` match');
            });
    });
});

test('pool maxWaitingClients option', (group) => {
    group.test('error if max waiting clients count exceeded', async (t) => {
        const settings = {
            acquire: () => Promise.resolve(),
            dispose: () => Promise.resolve(),
            min: 0,
            max: 1,
            maxWaitingClients: 2,
        };
        const pool = new Pool(settings);

        const res1 = pool.acquire();
        const res2 = pool.acquire();
        try {
            await pool.acquire();
        } catch (err) {
            t.equal(err.message, 'Max waiting clients count exceeded [2]', 'error message match');
        }
        await pool.release(await res1);
        await pool.release(await res2);
        await pool.acquire();
    });
});

test('pool timeout options', (group) => {
    group.test('acquireTimeoutMs', async (t) => {
        const settings = {
            acquire(cb) {
                setTimeout(cb, 15);
            },
            dispose: () => Promise.resolve(),
            min: 0,
            max: 1,
            acquireTimeoutMs: 10,
        };
        const pool = new Pool(settings);
        try {
            await pool.acquire();
        } catch (err) {
            t.equal(err.code, 'ETIMEDOUT', 'error code is ETIMEDOUT');
        }
    });

    group.test('releaseTimeoutMs', async (t) => {
        const settings = {
            acquire: () => Promise.resolve(),
            dispose(resource, cb) {
                setTimeout(cb, 15);
            },
            min: 0,
            max: 1,
            releaseTimeoutMs: 10,
        };
        const pool = new Pool(settings);
        const res = await pool.acquire();
        try {
            await pool.release(res);
        } catch (err) {
            t.equal(err.code, 'ETIMEDOUT', 'error code is ETIMEDOUT');
        }
    });
});
