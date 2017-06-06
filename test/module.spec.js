const test = require('tape');
const m = require('..');

test('module', (t) => {
    t.equal(typeof m, 'function', 'module exports object');
    t.equal(m.name, 'Pool', 'module exports Pool class');
    t.end();
});
