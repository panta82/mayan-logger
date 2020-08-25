'use strict';

const { assertSubset } = require('./utils');
const { LOG_LEVELS } = require('./types');

const LOG_LEVELS_TO_CONSOLE_FNS = {
  silent: null,
  error: 'error',
  warn: 'warn',
  info: 'log',
  verbose: 'debug',
  debug: 'debug',
  trace: 'debug',
};
assertSubset(LOG_LEVELS_TO_CONSOLE_FNS, LOG_LEVELS);

/**
 * @typedef {Object} MayanLoggerConsoleInterface
 * @description Wrapper around native console
 * @property {function(level: string, message: string, ...args)} write
 */

/**
 * @param {MayanLoggerOptions} options
 * @return MayanLoggerConsoleInterface
 */
function createConsoleInterface(options) {
  let consoleImpl = options.console;
  if (!consoleImpl) {
    consoleImpl = typeof console === 'object' ? console : null;
  }

  const logFnsByLevel = Object.keys(LOG_LEVELS_TO_CONSOLE_FNS).reduce((hash, level) => {
    hash[level] = makeConsoleWriterFn(level, LOG_LEVELS_TO_CONSOLE_FNS[level]);
    return hash;
  }, {});

  return {
    write,
  };

  /**
   * Write to javascript console based on given level
   * @param level
   * @param args
   */
  function write(level, ...args) {
    const logFn = logFnsByLevel[level];
    if (logFn) {
      logFn(...args);
    }
  }

  function makeConsoleWriterFn(level, consoleFnName) {
    if (!consoleImpl || !level) {
      // Empty shim
      return () => {};
    }

    if (!consoleImpl[consoleFnName]) {
      // Let's presume console is missing our special name, and fall back to console.log()
      consoleFnName = 'log';
      if (!consoleImpl[consoleFnName]) {
        // Nothing else we can do
        return () => {};
      }
    }

    // Not sure if bind is necessary, but let's be safe
    const consoleFn = consoleImpl[consoleFnName].bind(consoleImpl);

    return consoleFn;
  }
}

module.exports = {
  createConsoleInterface,
};
