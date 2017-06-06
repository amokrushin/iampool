# iampool
[![NPM Stable Version][npm-stable-version-image]][npm-url]
[![Build Status][travis-master-image]][travis-url]
[![Test Coverage][codecov-image]][codecov-url-master]
[![Dependency Status][david-image]][david-url-master]
[![Node.js Version][node-version-image]][node-version-url]
[![License][license-image]][license-url]

## Install
    npm i iampool

## Usage

```js
const pool = new Pool({
    acquire(cb) {
        // connection.createChannel(cb);
    },
    dispose(channel, cb) {
        // channel.close(cb);
    },
    max: 10,
    maxWaitingClients: 50,
    acquireTimeoutMs: 10000,
});

pool.acquire((err, channel) => {
    // ...
    pool.release(channel);
});
```

## API

[Documentation](https://amokrushin.github.io/iampool)


[npm-stable-version-image]: https://img.shields.io/npm/v/iampool.svg
[npm-url]: https://npmjs.com/package/iampool
[travis-master-image]: https://img.shields.io/travis/amokrushin/iampool/master.svg
[travis-url]: https://travis-ci.org/amokrushin/iampool
[codecov-image]: https://img.shields.io/codecov/c/github/amokrushin/iampool/master.svg
[codecov-url-master]: https://codecov.io/github/amokrushin/iampool?branch=master
[david-image]: https://img.shields.io/david/amokrushin/iampool.svg
[david-url-master]: https://david-dm.org/amokrushin/iampool
[node-version-image]: https://img.shields.io/node/v/iampool.svg
[node-version-url]: https://nodejs.org/en/download/
[license-image]: https://img.shields.io/npm/l/iampool.svg
[license-url]: https://raw.githubusercontent.com/amokrushin/iampool/master/LICENSE.txt