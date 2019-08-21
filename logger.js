'use strict';

const lodash = require('lodash');
const chalk = require('chalk');

const { ServiceBase } = require('../lib/services');
const { Model, CustomError, Options, Schema, assert } = require('../types/base');
const { LOG_LEVELS, EVENTS, ADMIN_PERMISSIONS, logLevelSchema } = require('../types/consts');
const { reverseHash, inspectCompact } = require('./tools');

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
assert.keysMatch(LOG_LEVELS, LOG_LEVEL_VALUES);

const LOG_LEVEL_VALUES_TO_LEVELS = reverseHash(LOG_LEVEL_VALUES);

const LOGGER_OUTPUTS = {
  terminal: 'terminal',
  json: 'json',
};

const LOG_LEVELS_STDERR = {
  [LOG_LEVELS.warn]: LOG_LEVELS.warn,
  [LOG_LEVELS.error]: LOG_LEVELS.error,
};

const LOG_LEVEL_COLORS = {
  silent: str => str,
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.green,
  verbose: chalk.cyan,
  debug: chalk.blueBright,
  trace: chalk.gray,
};

// *********************************************************************************************************************

class LoggerOptions extends Options {
  constructor(/** LoggerOptions */ source) {
    super();
    
    /**
     * Base log level. One of LOG_LEVELS.
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
    
    this.assign(source);
  }
  
  static get coercers() {
    return {
      level: level => LOG_LEVEL_VALUES_TO_LEVELS[level] || level,
    };
  }
  
  static get schema() {
    return super.schema.refine({
      properties: {
        output: Schema.enum(Object.keys(LOGGER_OUTPUTS), 'LoggerOutput'),
        collector_levels: logLevelSchema.dictionaryOf(),
      },
    });
  }
}

// *********************************************************************************************************************

/**
 * Master logger coordinator. Can create log interfaces for individual services, attach tracing...
 * @extends ServiceBase
 * @param {LoggerOptions} options
 */
function Logger(options) {
  const thisLogger = this;
  
  options = LoggerOptions.createValid(options);
  
  /**
   * Keep track of logged errors, so we don't log them twice
   */
  const _loggedErrors = new WeakSet();
  
  /**
   * Reference all object where we've added tracing
   */
  const _tracingTargets = new WeakSet();
  
  /**
   * Current global log level
   */
  let _level = options.level;
  
  /**
   * Whether logging is enabled at all
   */
  let _enabled = options.enabled;
  
  /**
   * All registered collectors
   * @type {Object.<string, LogCollectorState>}
   */
  const _collectors = {};
  
  /**
   * Formatter will take a LoggerMessage instance and produce a string that can be fed to writer
   * @type {function(LoggerMessage)}
   */
  this._formatMessage =
    options.output === LOGGER_OUTPUTS.terminal ? formatForTerminal : formatAsJSON;
  
  /**
   * Writer will actually write the message to stdout or stderr
   * @type {loggerWriter}
   */
  this._writeMessage = makeConsoleWriter();
  
  /**
   * Returns true if we should log at given level
   * @param {LogCollectorState} collector Logging collector that is submitting a log
   * @param level
   * @returns boolean
   */
  this._shouldLog = (collector, level) => {
    if (!_enabled) {
      return false;
    }
    
    const effectiveLevel = collector.level || _level;
    
    if (LOG_LEVEL_VALUES[level] > LOG_LEVEL_VALUES[effectiveLevel]) {
      return false;
    }
    
    return true;
  };
  
  /**
   * Log message at a certain level and emit it as event. Early exit in case we are currently
   * set at higher level than given message. This is meant to be called internally, by a specific collector.
   * @param {LogCollectorState} collector Logging collector that is submitting this log
   * @param level Level at which this should be logged
   * @param message
   * @param args
   */
  this._log = function(collector, level, message, ...args) {
    if (!this._shouldLog(collector, level)) {
      return;
    }
    
    let error;
    
    if (message instanceof Error) {
      // User has logged error directly, but without message
      error = message;
      message = '';
    } else if (lodash.isFunction(message)) {
      // User has logged a function or constructor, stringify it
      message = `${message.name || 'function'}()`;
    }
    
    // User did something like log.error(`Couldn't do X`, err);
    // Extract error from data
    if (!error && args && args[0] instanceof Error) {
      error = args[0];
      args = args.slice(1);
    }
    
    if (error) {
      if (_loggedErrors.has(error)) {
        // Prevent logging the same error multiple times
        return;
      }
      _loggedErrors.add(error);
    }
    
    const msg = new LoggerMessage(collector, level, message, error, args, this._now());
    
    // Emit log payload, for others to consume
    this.emit(EVENTS.log, msg);
    
    // Write it out
    const txtMessage = this._formatMessage(msg);
    this._writeMessage(msg.level, txtMessage);
  };
  
  /**
   * Create or get a log collector for given tag or list of tags. You need to call this in order to collect logs.
   * @param {string|string[]|function} tags
   * @return {LogCollector}
   */
  this.for = (...tags) => {
    tags = tags
      .map(x => {
        if (x && x.name) {
          // Special case, we are given a function (constructor). Take its name as tag.
          return x.name;
        }
        return String(x);
      })
      .filter(Boolean);
    
    const collectorKey = tags.join('_');
    if (_collectors[collectorKey]) {
      // We already have a collector for this key
      return _collectors[collectorKey];
    }
    
    const state = new LogCollectorState({
      key: collectorKey,
      tags,
      level: (options.collector_levels && options.collector_levels[collectorKey]) || undefined,
    });
    
    const collector = new LogCollector(state, this);
    _collectors[collectorKey] = collector;
    
    return collector;
  };
  
  this._tracingArgToString = ob => inspectCompact(ob);
  
  this._makeTracingWrapper = (collector, name, fn) => {
    return function tracingWrapper() {
      if (!thisLogger._shouldLog(collector, options.tracing.level)) {
        return;
      }
      
      if (fn.name) {
        name = fn.name;
      }
      const args = Array.prototype.map.call(arguments, thisLogger._tracingArgToString).join(', ');
      const message = `[TRACE] ${name}(${args})`;
      thisLogger._log(collector, options.tracing.level, message);
      
      return fn.apply(this, arguments);
      
      // TODO: We can add performance tracing here
      // TODO: Measure duration of function execution. If Promise is returned, measure the time before it fails or resolves
    };
  };
  
  this.isTracingEnabled = () => !!(_enabled && options.tracing && options.tracing.enabled);
  
  /**
   * Add tracing wrapper around all function properties on an object
   * NOTE: This will mutate the object!
   * @param {LogCollectorState} collector
   * @param {Object} target
   * @param {WeakSet<function>} untracedMethods
   */
  this._addTracing = (collector, target, untracedMethods) => {
    if (!target || !target.hasOwnProperty) {
      throw new LoggerError(`Tracing target must be an object, given value: ${target}`);
    }
    
    if (!this.isTracingEnabled()) {
      // Tracing is disabled, do nothing
      return target;
    }
    
    if (_tracingTargets.has(target)) {
      // Already added tracing for this object
      return target;
    }
    
    for (const key in target) {
      if (
        target.hasOwnProperty(key) &&
        lodash.isFunction(target[key]) &&
        (!untracedMethods || !untracedMethods.has(target[key]))
      ) {
        target[key] = this._makeTracingWrapper(collector, key, target[key]);
      }
    }
    return target;
  };
  
  // *******************************************************************************************************************
  
  /**
   * @param {Passport} passport
   * @return {LoggerState}
   */
  this.getState = passport => {
    passport.assertAdmin(ADMIN_PERMISSIONS.developer);
    
    return new LoggerState({
      enabled: _enabled,
      tracing_enabled: !!(options.tracing && options.tracing.enabled),
      level: _level,
      collectors: Object.values(_collectors).map(c => c.state),
    });
  };
  
  /**
   * Change general logger level
   * @param {Passport} passport
   * @param newLevel
   * @return {LoggerState}
   */
  this.setLevel = (passport, newLevel) => {
    passport.assertAdmin(ADMIN_PERMISSIONS.developer);
    
    if (!LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }
    
    _level = newLevel;
    
    return this.getState(passport);
  };
  
  /**
   * Change enabled state
   */
  this.setEnabled = enabled => {
    _enabled = enabled;
  };
  
  /**
   * Change level of an individual collector
   * @param {Passport} passport
   * @param key
   * @param newLevel
   * @return {LoggerState}
   */
  this.setCollectorLevel = (passport, key, newLevel) => {
    passport.assertAdmin(ADMIN_PERMISSIONS.developer);
    
    if (newLevel && !LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }
    
    const collector = _collectors[key];
    if (!collector) {
      throw new LoggerError(`Invalid collector key: ${key}`, 400);
    }
    collector.state.level = newLevel;
    
    return this.getState(passport);
  };
  
  this._internal(() => ({ options, _collectors, _level }));
}
ServiceBase.superOf(Logger);

Logger.EVENTS = [EVENTS.log];

// *********************************************************************************************************************

class LoggerState extends Model {
  constructor(/** LoggerState */ source) {
    super();
    
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
     * @type {LogCollectorState[]}
     */
    this.collectors = undefined;
    
    this.assign(source);
  }
  
  static get schema() {
    return super.schema.refine({
      properties: {
        level: logLevelSchema,
        collectors: LogCollectorState.schema.arrayOf(),
      },
    });
  }
}

// *********************************************************************************************************************

/**
 * Model that presents the state part of a log collector configuration
 */
class LogCollectorState extends Model {
  constructor(/** LogCollectorState */ source) {
    super();
    
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
    
    this.assign(source);
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
  
  static get schema() {
    return super.schema.refine({
      properties: {
        level: logLevelSchema.toRef(),
      },
    });
  }
}

/**
 * This is used by services to actually collect logs. Each service that wants to use logger should get an
 * instance of LogCollector for itself.
 * @param {LogCollectorState} state
 * @param {Logger} logger
 */
function LogCollector(state, logger) {
  /**
   * @type {LogCollectorState}
   */
  this.state = state;
  
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

// *********************************************************************************************************************

/**
 * Data carrier that contains information about logged message
 */
class LoggerMessage {
  constructor(collector, level, message, error, data, timestamp) {
    /**
     * Collector that has submitted message
     * @type {LogCollectorState}
     */
    this.collector = collector;
    
    /** One of logger levels */
    this.level = level;
    
    /** Message */
    this.message = message;
    
    /** @type {CustomError} */
    this.error = error;
    
    /** @type {Array} */
    this.data = data && data.length ? data : undefined;
    
    /** @type {Date} */
    this.timestamp = timestamp;
  }
}

// *********************************************************************************************************************

class LoggerError extends CustomError {}

class InvalidLogLevelError extends CustomError {
  constructor(level) {
    super(`Invalid log level: ${level}`, 400);
  }
}

// *********************************************************************************************************************

const nullLogger = new Logger({
  enabled: false,
});

// *********************************************************************************************************************

module.exports = {
  LoggerState,
  LogCollectorState,
  
  Logger,
  
  /** @type Logger */
  nullLogger,
};
