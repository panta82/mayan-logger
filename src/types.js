const { reverseHash, assertKeysMatch } = require('./utils');

// *********************************************************************************************************************

const LOG_LEVEL_ENV = 'LOG_LEVEL';

const LOG_LEVELS = {
  silent: 'silent',
  error: 'error',
  warn: 'warn',
  info: 'info',
  verbose: 'verbose',
  debug: 'debug',
  trace: 'trace',
};

const LOGGER_OUTPUTS = {
  terminal: 'terminal',
  json: 'json',
};

// *********************************************************************************************************************

const LOG_LEVEL_VALUES = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  trace: 5,
};
assertKeysMatch(LOG_LEVEL_VALUES, LOG_LEVELS);

const LOG_LEVEL_VALUES_TO_LEVELS = reverseHash(LOG_LEVEL_VALUES);

class MayanLoggerOptions {
  constructor(/** MayanLoggerOptions */ source) {
    /**
     * Base log level. One of LOG_LEVELS. Alternatively, provide a value from 0 (error) to 5 (trade), or -1 for silence.
     */
    this.level = LOG_LEVELS.info;

    /**
     * Master switch, to enable all logging. If this is false, nothing will be logged anywhere
     * @type {boolean}
     */
    this.enabled = true;

    /**
     * One of LOGGER_OUTPUTS. Determined what will logger spew out.
     */
    this.output = LOGGER_OUTPUTS.terminal;

    /**
     * Lookup of collector initial levels, by collector key.
     * NOTE: Key will be something like Tag1_Tag2_Tag3
     * @type {Object.<string, string>}
     */
    this.collector_levels = {};

    /**
     * Function that will provide current date. Might want to override in testing scenarios.
     * @type {function():Date}
     */
    this.date_provider = () => new Date();

    /**
     * Optional custom log listener, which will be called in addition to normal logging.
     * You can use this to plug in an external storage or collector (eg. Sentry).
     * @type{function(MayanLoggerMessage)}
     */
    this.on_log = undefined;

    /**
     * Tracing will
     */
    this.tracing = {
      /**
       * Set to false to disable adding tracing shims
       */
      enabled: false,

      /**
       * Level to use for function tracing
       * @type {string}
       */
      level: LOG_LEVELS.trace,

      /**
       * Tag to add for tracing
       */
      tag: 'trace',
    };

    if (source) {
      Object.assign(this, {
        ...source,
        level: LOG_LEVEL_VALUES_TO_LEVELS[source.level] || source.level || this.level,
        tracing: {
          ...this.tracing,
          ...source.tracing,
        },
      });
    }

    this.assert();
  }

  assert() {
    if (!LOG_LEVELS[this.level]) {
      throw new InvalidLogLevelError(this.level, 500);
    }
    if (!LOGGER_OUTPUTS[this.output]) {
      throw new MayanLoggerError(`Invalid logger output: ${this.output}`);
    }
    if (!this.date_provider) {
      throw new MayanLoggerError(`"date_provider" can't be empty`);
    }
  }
}

// *********************************************************************************************************************

/**
 * Model that presents the state part of a log collector configuration
 */
class MayanLogCollectorState {
  constructor(/** MayanLogCollectorState */ source) {
    /**
     * Key uniquely identifying this state
     */
    this.key = undefined;

    /**
     * List of tags that belong to this collector
     * @type {string[]}
     */
    this.tags = undefined;

    /**
     * Level override just for this collector. If not set, we will log at main logger's level
     * @type {LOG_LEVELS}
     */
    this.level = undefined;

    Object.assign(this, source);
  }

  /**
   * String representation of tags
   * @type {string}
   */
  get tagString() {
    if (!this._tagString) {
      this._tagString = this.tags.length ? '[' + this.tags.join(' > ') + ']' : '';
    }
    return this._tagString;
  }
}

/**
 * This is used by services to actually collect logs. Each service that wants to use logger should get an
 * instance of MayanLogCollector for itself.
 * @param {MayanLogCollectorState} state
 * @param {Logger} logger
 */
function MayanLogCollector(state, logger) {
  /**
   * @type {MayanLogCollectorState}
   */
  this.state = state;

  /**
   * @type {Logger}
   */
  this.logger = logger;

  /**
   * If some method is marked as untraced, we will "remember" that here
   */
  const _untracedMethods = new WeakSet();

  const makeLogMethod = level => {
    const logMethod = (message, ...args) => {
      return logger._log(this.state, level, message, ...args);
    };

    Object.defineProperty(logMethod, 'on', {
      get: () => logger._shouldLog(this.state, level),
    });

    return logMethod;
  };

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.error = makeLogMethod(LOG_LEVELS.error);

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.warn = makeLogMethod(LOG_LEVELS.warn);

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.info = makeLogMethod(LOG_LEVELS.info);

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.verbose = makeLogMethod(LOG_LEVELS.verbose);

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.debug = makeLogMethod(LOG_LEVELS.debug);

  /**
   * @param {string} message
   * @param {...*} args
   * @property {boolean} on
   */
  this.trace = makeLogMethod(LOG_LEVELS.trace);

  /**
   * Add tracing wrapper around all function properties on an object
   * NOTE: This will mutate the object!
   * @param {Object} target
   */
  this.addTracing = target => {
    return logger._addTracing(this.state, target, _untracedMethods);
  };

  /**
   * You can use this function as a quick error callback. Error will be logged if it exists.
   * @param err
   */
  this.errorHandler = err => {
    if (!err) {
      return;
    }

    return logger._log(LOG_LEVELS.error, this.state, err);
  };

  /**
   * Mark given method as untraced, meaning this logger will not wrap it for tracing support
   * @template T
   * @param {T} method
   * @return T
   */
  this.untraced = method => {
    _untracedMethods.add(method);
    return method;
  };
}

// *********************************************************************************************************************

/**
 * Data carrier that contains information about logged message
 */
class MayanLoggerMessage {
  constructor(collector, level, message, error, data, timestamp) {
    /**
     * Collector that has submitted message
     * @type {MayanLogCollectorState}
     */
    this.collector = collector;

    /** One of logger levels */
    this.level = level;

    /** Message */
    this.message = message;

    /** @type {Error} */
    this.error = error;

    /** @type {Array} */
    this.data = data && data.length ? data : undefined;

    /** @type {Date} */
    this.timestamp = timestamp;
  }
}

// *********************************************************************************************************************

class MayanLoggerState {
  constructor(/** MayanLoggerState */ source) {
    /**
     * Master switch, enabling/disabling logging
     * @type {Boolean}
     */
    this.enabled = undefined;

    /**
     * Is tracing enabled
     * @type {Boolean}
     */
    this.tracing_enabled = undefined;

    /**
     * Logger level
     * @type {LOG_LEVELS}
     */
    this.level = undefined;

    /**
     * All registered collectors
     * @type {MayanLogCollectorState[]}
     */
    this.collectors = undefined;

    Object.assign(this, source);
  }
}

// *********************************************************************************************************************

class MayanLoggerError extends Error {
  constructor(message, code = 500) {
    super(message);
    this.code = code;
  }
}

class InvalidLogLevelError extends MayanLoggerError {
  constructor(level, code = 400) {
    super(`Invalid log level: ${level}`, code);
  }
}

// *********************************************************************************************************************

module.exports = {
  LOG_LEVEL_ENV,

  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_OUTPUTS,

  MayanLoggerOptions,

  MayanLogCollectorState,
  MayanLogCollector,

  MayanLoggerMessage,

  MayanLoggerState,

  MayanLoggerError,
  InvalidLogLevelError,
};
