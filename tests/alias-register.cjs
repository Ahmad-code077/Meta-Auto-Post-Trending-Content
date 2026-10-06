/* eslint-disable @typescript-eslint/no-require-imports -- plain Node preload, not compiled by TypeScript */
// Test-only preload. Maps the "@/" import alias to the compiled test output, so the compiled
// modules can be loaded by plain Node. Used by `npm test`; nothing in the app uses it.
const Module = require('node:module');
const path = require('node:path');

const compiledRoot = path.join(process.cwd(), 'node_modules', '.cache', 'harness-tests');
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
    if (request.startsWith('@/')) {
        request = path.join(compiledRoot, request.slice(2));
    }
    return originalResolve.call(this, request, ...rest);
};
