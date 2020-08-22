'use strict';

const { reverseHash, assertSubset } = require('./utils');

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
assertSubset(LOG_LEVEL_VALUES, LOG_LEVELS);

const LOG_LEVEL_VALUES_TO_LEVELS = reverseHash(LOG_LEVEL_VALUES);

const DEFAULT_TERMINAL_COLORS = /** @lends MayanLoggerTerminalColorOptions.prototype */ {
  silent: null,
  error: ['red', 'bold'],
  warn: ['yellow', 'bold'],
  info: 'green',
  verbose: 'cyan',
  debug: 'blueBright',
  trace: 'gray',

  timestamp: 'gray',
  tags: 'white',
  message: null,
};
assertSubset(DEFAULT_TERMINAL_COLORS, LOG_LEVELS);

class MayanLoggerOptions {
  constructor(/** MayanLoggerOptions */ source) {
    /**
     * Base log level. One of LOG_LEVELS. Alternatively, provide a value from 0 (error) to 5 (trade), or -1 for silence.
     * @type {string}
     */
    this.level = LOG_LEVELS.info;

    /**
     * Master switch, to enable all logging. If this is false, nothing will be logged anywhere
     * @type {boolean}
     */
    this.enabled = true;

    /**
     * One of LOGGER_OUTPUTS. Determined what will logger spew out.
     * @type {string}
     */
    this.output = LOGGER_OUTPUTS.terminal;

    /**
     * Lookup of collector initial levels, by collector key.
     * NOTE: Key will be something like Tag1_Tag2_Tag3
     * @type {Object.<string, string>}
     */
    this.collector_levels = {};

    /**
     * Whether to include timestamp in messages. You can also provide your own function to generate dates.
     * @type {function():Date | boolean | null}
     */
    this.timestamp = true;

    /**
     * Indent multiline logs. Only applies when logging to terminal.
     * @type {boolean}
     */
    this.indent_multiline = true;

    /**
     * Optional custom log listener, which will be called in addition to normal logging.
     * You can use this to plug in an external storage or collector (eg. Sentry).
     * @type{function(MayanLoggerMessage)}
     */
    this.on_log = undefined;

    /**
     * Tracing will automatically attach log statements around functions, AOP style.
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

    /**
     * Colors to use when outputting to terminal. Each value should be one of or an array of colorette style names
     * (https://www.npmjs.com/package/colorette#supported-styles)
     *    black	bgBlack	blackBright	bgBlackBright	dim
     *    red	bgRed	redBright	bgRedBright	bold
     *    green	bgGreen	greenBright	bgGreenBright	hidden
     *    yellow	bgYellow	yellowBright	bgYellowBright	italic
     *    blue	bgBlue	blueBright	bgBlueBright	underline
     *    magenta	bgMagenta	magentaBright	bgMagentaBright	strikethrough
     *    cyan	bgCyan	cyanBright	bgCyanBright	reset
     *    white	bgWhite	whiteBright	bgWhiteBright
     *  Defaults to DEFAULT_TERMINAL_COLORS
     *  @type {MayanLoggerTerminalColorOptions}
     */
    this.terminal_colors = null;

    this.assign(source);
  }

  assign(source) {
    Object.assign(this, {
      ...source,
      level: LOG_LEVEL_VALUES_TO_LEVELS[source.level] || source.level || this.level,
      tracing: {
        ...this.tracing,
        ...source.tracing,
      },
      terminal_colors: {
        ...DEFAULT_TERMINAL_COLORS,
        ...source.terminal_colors,
      },
    });

    if (!LOG_LEVELS[this.level]) {
      throw new InvalidLogLevelError(this.level, 500);
    }
    if (!LOGGER_OUTPUTS[this.output]) {
      throw new MayanLoggerError(`Invalid logger output: ${this.output}`);
    }
  }

  static fromEnv(env = {}) {
    return new this({
      level: env[LOG_LEVEL_ENV],
      output: env.NODE_ENV === 'production' ? LOGGER_OUTPUTS.json : LOGGER_OUTPUTS.terminal,
    });
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

// *********************************************************************************************************************

/**
 * Data carrier that contains information about logged message
 */
class MayanLoggerMessage {
  constructor(collector, level, message, error, data, timestamp, isTrace) {
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

    /** @type {Boolean} */
    this.is_trace = isTrace;
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
     * One of LOGGER_OUTPUTS. Determined what will logger spew out.
     * @type {string}
     */
    this.output = undefined;

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
     * Whether timestamps are generated
     * @type {boolean}
     */
    this.timestamps = undefined;

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

class MayanLoggerOptionsError extends MayanLoggerError {}

class InvalidLogLevelError extends MayanLoggerOptionsError {
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
  DEFAULT_TERMINAL_COLORS,

  MayanLoggerOptions,
  MayanLogCollectorState,
  MayanLoggerMessage,
  MayanLoggerState,

  MayanLoggerError,
  MayanLoggerOptionsError,
  InvalidLogLevelError,
};
