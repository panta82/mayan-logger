const { LOG_LEVELS } = require('./types');

const LOG_LEVELS_STDERR = {
  [LOG_LEVELS.warn]: LOG_LEVELS.warn,
  [LOG_LEVELS.error]: LOG_LEVELS.error,
};

/**
 * @callback loggerWriter
 * @param {string} level
 * @param {string} message
 */

/**
 * Create a writer function that writes output to console depending on level
 * @return loggerWriter
 */
function makeConsoleWriter() {
  const writeErr = console._stderr ? str => console._stderr.write(str + '\n') : console.error;
  const writeOut = console._stdout ? str => console._stdout.write(str + '\n') : console.log;

  return (level, message) => {
    return LOG_LEVELS_STDERR[level] ? writeErr(message) : writeOut(message);
  };
}

module.exports = {
  makeConsoleWriter,
};
