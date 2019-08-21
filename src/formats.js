const chalk = require('chalk');

const { assertKeysMatch } = require('./utils');
const { LOG_LEVELS } = require('./types');

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

/**
 * Format info into a string suitable for writing to terminal
 * @param {LoggerMessage} msg
 */
function formatForTerminal(msg) {
  const parts = [
    chalk.gray(msg.timestamp.toISOString()),
    LOG_LEVEL_COLORS[msg.level](msg.level) + ':',
  ];
  if (msg.collector.tagString) {
    parts.push(chalk.white(msg.collector.tagString));
  }

  let message = msg.message;

  if (msg.error) {
    // Show more error info in case of internal server errors
    const extendedDisplay = !msg.error.code || msg.error.code >= 500;

    if (!message) {
      // Replace empty message with error
      message = (extendedDisplay && msg.error.stack) || msg.error.message || msg.error;
    } else if (extendedDisplay && msg.error.stack) {
      // Print the stack beneath the message
      message += '\n' + msg.error.stack;
    } else if (msg.error.message && !msg.message.includes(msg.error.message)) {
      message += ': ' + msg.error.message;
    }
  }

  parts.push(message);

  return parts.join(' ');
}

/**
 * Format info into a JSON string
 * @param {LoggerMessage} msg
 */
function formatAsJSON(msg) {
  const payload = { ...msg };
  payload.tags = msg.collector.tags;
  delete payload.collector;
  return JSON.stringify(payload);
}

module.exports = {
  formatForTerminal,
  formatAsJSON,
};
