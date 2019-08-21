'use strict';

const {
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  LOGGER_OUTPUTS,
  LoggerOptions,
  LogCollector,
  LogCollectorState,
  LoggerMessage,
  LoggerState,
  LoggerError,
  InvalidLogLevelError,
} = require('./types');
const { inspectCompact, isFunction } = require('./utils');
const { makeConsoleWriter } = require('./writers');
const { formatAsJSON, formatForTerminal } = require('./formats');

/**
 * Master logger coordinator. Can create log interfaces for individual services, attach tracing...
 * @param {LoggerOptions} options
 */
function Logger(options) {
  const thisLogger = this;

  if (!(options instanceof LoggerOptions)) {
    options = new LoggerOptions(options);
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

    const msg = new LoggerMessage(collector, level, message, error, args, options.date_provider());

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
   * @return {LoggerState}
   */
  this.getState = () => {
    return new LoggerState({
      enabled: _enabled,
      tracing_enabled: !!(options.tracing && options.tracing.enabled),
      level: _level,
      collectors: Object.values(_collectors).map(c => c.state),
    });
  };

  /**
   * Change general logger level
   * @param newLevel
   * @return {LoggerState}
   */
  this.setLevel = newLevel => {
    if (!LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }

    _level = newLevel;

    return this.getState();
  };

  /**
   * Change enabled state
   */
  this.setEnabled = enabled => {
    _enabled = enabled;
  };

  /**
   * Change level of an individual collector
   * @param key
   * @param newLevel
   * @return {LoggerState}
   */
  this.setCollectorLevel = (key, newLevel) => {
    if (newLevel && !LOG_LEVELS[newLevel]) {
      throw new InvalidLogLevelError(newLevel);
    }

    const collector = _collectors[key];
    if (!collector) {
      throw new LoggerError(`Invalid collector key: ${key}`, 400);
    }
    collector.state.level = newLevel;

    return this.getState();
  };
}

module.exports = {
  Logger,
};
