'use strict';

const {
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_OUTPUTS,
  MayanLoggerOptions,
  MayanLogCollectorState,
  MayanLoggerMessage,
  MayanLoggerState,
  MayanLoggerError,
  InvalidLogLevelError,
} = require('./types');
const { inspectCompact, isFunction } = require('./utils');
const { MayanLogCollector } = require('./collector');
const { makeConsoleWriter } = require('./writers');
const { formatAsJSON, formatForTerminal } = require('./formats');

/**
 * Master logger coordinator. Can create log interfaces for individual services, attach tracing...
 * @param {MayanLoggerOptions} options
 */
function MayanLogger(options) {
  const thisLogger = this;

  if (!(options instanceof MayanLoggerOptions)) {
    options = new MayanLoggerOptions(options);
  }

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

  let _makeTimestamp = makeTimestampMaker(options.timestamp);

  /**
   * All registered collectors
   * @type {Object.<string, MayanLogCollectorState>}
   */
  const _collectors = {};

  /**
   * Formatter will take a MayanLoggerMessage instance and produce a string that can be fed to writer
   * @type {function(MayanLoggerMessage)}
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
   * @param {MayanLogCollectorState} collector Logging collector that is submitting a log
   * @param level
   * @returns boolean
   */
  this._shouldLog = (collector, level) => {
    if (!_enabled) {
      return false;
    }

    const effectiveLevel = collector.level || _level;

    return LOG_LEVEL_VALUES[level] <= LOG_LEVEL_VALUES[effectiveLevel];
  };

  /**
   * Log message at a certain level and emit it as event. Early exit in case we are currently
   * set at higher level than given message. This is meant to be called internally, by a specific collector.
   * @param {MayanLogCollectorState} collector Logging collector that is submitting this log
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
    } else if (isFunction(message)) {
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

    const msg = new MayanLoggerMessage(collector, level, message, error, args, _makeTimestamp());

    if (options.on_log) {
      try {
        options.on_log(msg);
      } catch (err) {
        console.error(
          `Unexpected error raised by "on_log" handler.`,
          err,
          `\nMessage that caused the error: ${msg}`
        );
        throw err;
      }
    }

    // Write it out
    const txtMessage = this._formatMessage(msg);
    this._writeMessage(msg.level, txtMessage);
  };

  /**
   * Create or get a log collector for given tag or list of tags. You need to call this in order to collect logs.
   * @param {string|string[]|function} tags
   * @return {MayanLogCollector}
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

    const state = new MayanLogCollectorState({
      key: collectorKey,
      tags,
      level: (options.collector_levels && options.collector_levels[collectorKey]) || undefined,
    });

    const collector = new MayanLogCollector(state, this);
    _collectors[collectorKey] = collector;

    return collector;
  };

  this._tracingArgToString = ob => inspectCompact(ob);

  this._makeTracingWrapper = (collector, name, fn) => {
    return function tracingWrapper() {
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
   * @param {MayanLogCollectorState} collector
   * @param {Object} target
   * @param {WeakSet<function>} untracedMethods
   */
  this._addTracing = (collector, target, untracedMethods) => {
    if (!target || !target.hasOwnProperty) {
      throw new MayanLoggerError(`Tracing target must be an object, given value: ${target}`);
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
        isFunction(target[key]) &&
        (!untracedMethods || !untracedMethods.has(target[key]))
      ) {
        target[key] = this._makeTracingWrapper(collector, key, target[key]);
      }
    }
    return target;
  };

  // *******************************************************************************************************************

  /**
   * @return {MayanLoggerState}
   */
  this.getState = () => {
    return new MayanLoggerState({
      enabled: _enabled,
      level: _level,
      timestamps: !!_makeTimestamp(),
      tracing_enabled: !!(options.tracing && options.tracing.enabled),
      collectors: Object.values(_collectors).map(c => c.state),
    });
  };

  /**
   * Change general logger level
   * @param newLevel
   * @return {MayanLogger}
   */
  this.setLevel = newLevel => {
    if (!LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }

    _level = newLevel;
    return this;
  };

  /**
   * Change enabled state
   * @return {MayanLogger}
   */
  this.setEnabled = enabled => {
    _enabled = enabled;
    return this;
  };

  /**
   * Change timestamp option
   * @type {function():Date | boolean | null}
   * @return {MayanLogger}
   */
  this.setTimestamp = timestamp => {
    _makeTimestamp = makeTimestampMaker(timestamp);
    return this;
  };

  /**
   * Change level of an individual collector
   * @param key
   * @param newLevel
   * @return {MayanLogger}
   */
  this.setCollectorLevel = (key, newLevel) => {
    if (newLevel && !LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }

    const collector = _collectors[key];
    if (!collector) {
      throw new MayanLoggerError(`Invalid collector key: ${key}`, 400);
    }

    collector.state.level = newLevel;
    return this;
  };

  /**
   * Default collector, without any tags. Can be used with logger.log.info();
   * @type {MayanLogCollector}
   */
  this.log = this.for();
}

function makeTimestampMaker(timestamp) {
  return timestamp ? (isFunction(timestamp) ? timestamp : () => new Date()) : () => null;
}

module.exports = {
  MayanLogger,
};
