'use strict';

const { reverseHash, assertSubset } = require('./utils');

// *********************************************************************************************************************

/**
 * This will be set to true by webpack in browser builds. It will determine some defaults and shim some modules
 * @type {boolean}
 */
const IS_BROWSER_BUILD = process.env.MAYAN_LOGGER_BROWSER_BUILD || false;

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

const LOGGER_FORMATS = {
  human: 'human',
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
     * One of LOGGER_FORMATS. Determines the kind of stuff logger will print out.
     * It defaults to "human", which will print human-readable strings, suitable for development.
     * It is recommended to use "json" in production, depending on your logging infrastructure.
     * @type {string}
     */
    this.format = LOGGER_FORMATS.human;

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

    /**
     * Javascript Console instance. Can be used to inject something for testing, or provide a custom shim.
     * Defaults to global.console in node.js and window.console in the browser.
     * @type {Console}
     */
    this.console = undefined;

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

    InvalidLogLevelError.assert(this.level);
    InvalidLoggerFormatError.assert(this.format);
  }

  static fromEnv(env = {}) {
    return new this({
      level: env[LOG_LEVEL_ENV],
      format: env.NODE_ENV === 'production' ? LOGGER_FORMATS.json : LOGGER_FORMATS.human,
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

    /** @type {*} */
    this.data = data;

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
  constructor(level) {
    super(`Invalid log level: ${level}`, 400);
  }

  static assert(level) {
    if (!LOG_LEVELS[level]) {
      throw new InvalidLogLevelError(level);
    }
  }
}

class InvalidLoggerFormatError extends MayanLoggerOptionsError {
  constructor(format) {
    super(
      `Invalid logger format: "${format}". It must be either "${LOGGER_FORMATS.human}" or "${LOGGER_FORMATS.json}"`,
      400
    );
    this.format = format;
  }

  static assert(format) {
    if (!LOGGER_FORMATS[format]) {
      throw new InvalidLoggerFormatError(format);
    }
  }
}

// *********************************************************************************************************************

module.exports = {
  IS_BROWSER_BUILD,

  LOG_LEVEL_ENV,

  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_FORMATS,
  DEFAULT_TERMINAL_COLORS,

  MayanLoggerOptions,
  MayanLogCollectorState,
  MayanLoggerMessage,
  MayanLoggerState,

  MayanLoggerError,
  MayanLoggerOptionsError,
  InvalidLogLevelError,
  InvalidLoggerFormatError,
};
