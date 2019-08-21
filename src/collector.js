const { LOG_LEVELS } = require('./types');

/**
 * This is used by services to actually collect logs. Each service that wants to use logger should get an
 * instance of MayanLogCollector for itself.
 * @param {MayanLogCollectorState} state
 * @param {MayanLogger} logger
 */
function MayanLogCollector(state, logger) {
  /**
   * @type {MayanLogCollectorState}
   */
  this.state = state;

  /**
   * @type {MayanLogger}
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

module.exports = {
  MayanLogCollector,
};
