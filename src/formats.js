'use strict';

const { assertSubset } = require('./utils');
const {
  IS_BROWSER_BUILD,
  LOG_LEVELS,
  LOGGER_OUTPUTS,
  MayanLoggerOptionsError,
  DEFAULT_TERMINAL_COLORS,
} = require('./types');

// *********************************************************************************************************************

// Pad all level strings by this much, so things will align
const levelPadding = Object.keys(LOG_LEVELS).reduce((max, level) => Math.max(max, level.length), 0);

class TerminalPainter {
  /**
   * @param {MayanLoggerTerminalColorOptions} terminalColors
   */
  constructor(terminalColors) {
    // Only needs this if we are formatting for terminal and we are not in browser
    let colorette;
    if (!IS_BROWSER_BUILD) {
      colorette = require('colorette');
    }

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
      if (!colorette) {
        // Can't apply styles
        return str => str;
      }

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

/**
 * Format info into a string suitable for writing to terminal
 * @param {boolean} indentMultiline
 * @param {TerminalPainter} painter
 * @param {MayanLoggerMessage} msg
 */
function formatForTerminal(indentMultiline, painter, msg) {
  let prefixLength = 0;
  const parts = [];
  if (msg.timestamp) {
    const timestampStr = msg.timestamp.toISOString();
    parts.push(painter.timestamp(timestampStr));
    prefixLength += timestampStr.length;
  }

  const levelStr = msg.level.padStart(levelPadding) + ':';
  prefixLength += levelStr.length;
  parts.push(painter[msg.level](levelStr));

  if (msg.collector.tagString) {
    prefixLength += msg.collector.tagString.length;
    parts.push(painter.tags(msg.collector.tagString));
  }

  let message = msg.message;

  if (msg.error) {
    // Show more error info if we are not dealing with a "webby" client error
    const extendedDisplay = !(msg.error.code >= 400 && msg.error.code < 500);

    // From mayan/base CustomError
    let details = msg.error.errorDetails || '';
    if (details) {
      details =
        '\n' +
        details
          .split(/(\r\n|\n\r|\r|\n)/gm)
          .map(line => '|> ' + line)
          .join('\n');
    }

    if (!message) {
      // Replace empty message with error
      message =
        ((extendedDisplay && msg.error.stack) || msg.error.message || msg.error || '') + details;
    } else {
      // Extend given message
      if (extendedDisplay && msg.error.stack) {
        // Print the stack beneath
        message += details + '\n' + msg.error.stack;
      } else if (msg.error.message && !msg.message.includes(msg.error.message)) {
        // Attach error message if we don't already have it
        message += ': ' + msg.error.message + details;
      }
    }
  } else {
    // Make sure we are printing strings, just in case
    message = String(message);
  }

  if (indentMultiline) {
    // For each part we will add one ' ' delimiter.
    const indent = ' '.repeat(prefixLength + parts.length);
    message = message.replace(/(\r\n|\n\r|\r|\n)/gm, '$1' + indent);
  }

  parts.push(painter.message(message));

  return parts.join(' ');
}

// *********************************************************************************************************************

/**
 * Format info into a JSON string
 * @param {MayanLoggerMessage} msg
 */
function formatAsJSON(msg) {
  const payload = { ...msg };

  payload.tags = msg.collector.tags;
  delete payload.collector;

  if (payload.error) {
    if (!(Object.getOwnPropertyDescriptor(payload, 'stack') || {}).enumerable) {
      // This error object doesn't contain enumerable properties which will show up in JSON. Fix that.
      const err = payload.error;
      payload.error = { ...err };
      payload.error.message = err.message;
      payload.error.stack = err.stack;
    }

    // Transplant error message to payload message
    if (!payload.message) {
      payload.message = payload.error.message || payload.error;
    }
  }

  return JSON.stringify(payload);
}

// *********************************************************************************************************************

/**
 * @param {MayanLoggerOptions} options
 */
function makeFormatter(options) {
  switch (options.output) {
    case LOGGER_OUTPUTS.terminal:
      return formatForTerminal.bind(
        null,
        options.indent_multiline,
        new TerminalPainter(options.terminal_colors)
      );
    case LOGGER_OUTPUTS.json:
      return formatAsJSON;
  }

  throw new MayanLoggerOptionsError(
    `Invalid output "${options.output}". Must be either "${LOGGER_OUTPUTS.terminal}" or "${LOGGER_OUTPUTS.json}"`
  );
}

// *********************************************************************************************************************

module.exports = {
  TerminalPainter,
  formatForTerminal,
  formatAsJSON,
  makeFormatter,
};
