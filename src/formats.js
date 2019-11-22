'use strict';

const chalk = require('chalk');

const { assertKeysMatch } = require('./utils');
const { LOG_LEVELS, LOGGER_OUTPUTS, MayanLoggerError } = require('./types');

const LOG_LEVEL_COLORS = {
  silent: str => str,
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.green,
  verbose: chalk.cyan,
  debug: chalk.blueBright,
  trace: chalk.gray,
};
assertKeysMatch(LOG_LEVEL_COLORS, LOG_LEVELS);

// Pad all level strings by this much, so things will align
const levelPadding = Object.keys(LOG_LEVELS).reduce((max, level) => Math.max(max, level.length), 0);

/**
 * Format info into a string suitable for writing to terminal
 * @param {boolean} indentMultiline
 * @param {MayanLoggerMessage} msg
 */
function formatForTerminal(indentMultiline, msg) {
  let prefixLength = 0;
  const parts = [];
  if (msg.timestamp) {
    const timestampStr = msg.timestamp.toISOString();
    parts.push(chalk.gray(timestampStr));
    prefixLength += timestampStr.length;
  }

  const levelStr = msg.level.padStart(levelPadding) + ':';
  prefixLength += levelStr.length;
  parts.push(LOG_LEVEL_COLORS[msg.level](levelStr));

  if (msg.collector.tagString) {
    prefixLength += msg.collector.tagString.length;
    parts.push(chalk.white(msg.collector.tagString));
  }

  let message = msg.message;

  if (msg.error) {
    // Show more error info if we are not dealing with a "webby" client error
    const extendedDisplay = !(msg.error.code >= 400 && msg.error.code < 500);

    if (!message) {
      // Replace empty message with error
      message = (extendedDisplay && msg.error.stack) || msg.error.message || msg.error;
    } else if (extendedDisplay && msg.error.stack) {
      // Print the stack beneath the message
      message += '\n' + msg.error.stack;
    } else if (msg.error.message && !msg.message.includes(msg.error.message)) {
      message += ': ' + msg.error.message;
    } else {
      // Make sure we are printing strings, just in case
      message = String(message);
    }
  }

  if (indentMultiline) {
    // For each part we will add one ' ' delimiter.
    const indent = ' '.repeat(prefixLength + parts.length);
    message = message.replace(/(\r\n|\n\r|\r|\n)/gm, '$1' + indent);
  }

  parts.push(message);

  return parts.join(' ');
}

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

/**
 * @param {MayanLoggerOptions} options
 */
function makeFormatter(options) {
  switch (options.output) {
    case LOGGER_OUTPUTS.terminal:
      return formatForTerminal.bind(null, options.indent_multiline);
    case LOGGER_OUTPUTS.json:
      return formatAsJSON;
  }

  throw new MayanLoggerError(
    `Invalid output "${options.output}". Must be either "${LOGGER_OUTPUTS.terminal}" or "${LOGGER_OUTPUTS.json}"`
  );
}

module.exports = {
  formatForTerminal,
  formatAsJSON,
  makeFormatter,
};
