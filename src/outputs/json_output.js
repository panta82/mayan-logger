'use strict';

/**
 * Output that produces full JSON-s of each message
 * @param {MayanLoggerConsoleInterface} consoleInterface
 */
function makeJSONOutput(consoleInterface) {
  return mayanLoggerJSONOutput;

  /**
   * @param {MayanLoggerMessage} msg
   */
  function mayanLoggerJSONOutput(msg) {
    const payload = { ...msg };

    payload.tags = msg.collector.tags;
    delete payload.collector;

    if (payload.error) {
      if (!(Object.getOwnPropertyDescriptor(payload, 'stack') || {}).enumerable) {
        // This error object doesn't contain enumerable properties which will show up in JSON. Fix that.
        const err = payload.error;
        payload.error = { ...err };
        payload.error.message = err.message;
        payload.error.stack = err.stack;
      }

      // Transplant error message to payload message
      if (!payload.message) {
        payload.message = payload.error.message || payload.error;
      }
    }

    const message = JSON.stringify(payload);
    consoleInterface.write(msg.level, message);
  }
}

module.exports = {
  makeJSONOutput,
};
