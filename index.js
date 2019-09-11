'use strict';

const { MayanLogger } = require('./src/logger');
const {
  LOG_LEVEL_ENV,
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_OUTPUTS,
  MayanLoggerOptions,
  MayanLoggerState,
  MayanLogCollectorState,
} = require('./src/types');

/**
 * Default logger, with a few basic options loaded from env
 * @type {MayanLogger}
 */
module.exports = new MayanLogger(MayanLoggerOptions.fromEnv(process.env));

/**
 * Include default logger in export
 * @type {MayanLogger}
 */
module.exports.logger = module.exports;

/**
 * Default log collector for default logger. For quick satisfaction, you can just do require('mayan-logger').log.info('test');
 * @type {MayanLogCollector}
 */
module.exports.log = module.exports.for();

module.exports.LOG_LEVEL_ENV = LOG_LEVEL_ENV;
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.LOG_LEVEL_VALUES = LOG_LEVEL_VALUES;
module.exports.LOGGER_OUTPUTS = LOGGER_OUTPUTS;

module.exports.Logger = MayanLogger;
module.exports.LoggerOptions = MayanLoggerOptions;
module.exports.LoggerState = MayanLoggerState;
module.exports.LogCollectorState = MayanLogCollectorState;

/**
 * Null logger, which will never output anything, but has the normal logger API
 * @type {MayanLogger}
 */
module.exports.nullLogger = new MayanLogger({
  enabled: false,
});
