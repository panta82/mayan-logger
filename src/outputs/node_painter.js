'use strict';

const colorette = require('colorette');

const { assertSubset } = require('../utils');
const { MayanLoggerOptionsError, DEFAULT_TERMINAL_COLORS } = require('../types');

class MayanLoggerNodePainter {
  /**
   * @param {MayanLoggerTerminalColorOptions} terminalColors
   */
  constructor(terminalColors) {
    terminalColors = terminalColors || DEFAULT_TERMINAL_COLORS;

    this.silent = makeColorFn('silent');
    this.error = makeColorFn('error');
    this.warn = makeColorFn('warn');
    this.info = makeColorFn('info');
    this.verbose = makeColorFn('verbose');
    this.debug = makeColorFn('debug');
    this.trace = makeColorFn('trace');

    this.timestamp = makeColorFn('timestamp');
    this.tags = makeColorFn('tags');
    this.message = makeColorFn('message');

    assertSubset(this, DEFAULT_TERMINAL_COLORS);

    /**
     * @param name
     * @return {function(string): string}
     */
    function makeColorFn(name) {
      let spec = terminalColors[name];
      if (!spec) {
        // Don't use any formatting
        return str => str;
      }

      if (typeof spec === 'string') {
        spec = [spec];
      }
      if (!Array.isArray(spec)) {
        throw new MayanLoggerOptionsError(
          `Specs must be arrays or strings, but "${name}" was instead given: ${JSON.stringify(
            spec
          )}`
        );
      }

      const fns = spec.map(fnName => {
        const fn = colorette[fnName];
        if (!fn) {
          throw new MayanLoggerOptionsError(
            `Terminal color style "${fnName}" for spec "${name}" is not valid. See the documentation for the list of valid style names`
          );
        }
        return fn;
      });
      const fnCount = fns.length;

      return str => {
        for (let i = fnCount - 1; i >= 0; i--) {
          str = fns[i](str);
        }
        return str;
      };
    }
  }
}

module.exports = {
  MayanLoggerNodePainter,
};
