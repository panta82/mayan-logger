const { Logger } = require('./src/logger');
const {
  LOG_LEVEL_ENV,
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_OUTPUTS,
  LoggerOptions,
  LoggerState,
  LogCollectorState,
} = require('./src/types');

/**
 * Default log collector for default logger. If you only need to log something without much ceremony.
 * @type {LogCollector}
 */
module.exports = new Logger({
  enabled: true,
  level: process.env[LOG_LEVEL_ENV],
  output: process.env.NODE_ENV === 'production' ? LOGGER_OUTPUTS.json : LOGGER_OUTPUTS.terminal,
}).for();

module.exports.LOG_LEVEL_ENV = LOG_LEVEL_ENV;
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.LOG_LEVEL_VALUES = LOG_LEVEL_VALUES;
module.exports.LOGGER_OUTPUTS = LOGGER_OUTPUTS;

module.exports.Logger = Logger;
module.exports.LoggerOptions = LoggerOptions;
module.exports.LoggerState = LoggerState;
module.exports.LogCollectorState = LogCollectorState;

/**
 * Null logger, which will never output anything, but has the normal logger API
 * @type {Logger}
 */
module.exports.NULL = new Logger({
  enabled: false,
});
