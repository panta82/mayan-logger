'use strict';

const { IS_BROWSER_BUILD, LOGGER_FORMATS, InvalidLoggerFormatError } = require('../types');

/**
 * @callback mayanLoggerOutput
 * @param {MayanLoggerMessage} message
 */

/**
 * Create an appropriate output based on options
 * @param {MayanLoggerOptions} options
 * @param {MayanLoggerConsoleInterface} consoleInterface
 * @return {mayanLoggerOutput}
 */
function makeOutput(options, consoleInterface) {
  switch (options.format) {
    case LOGGER_FORMATS.human: {
      if (IS_BROWSER_BUILD) {
        return require('./browser_human_output')(options, consoleInterface);
      }

      const { MayanLoggerNodePainter } = require('./node_painter');
      const painter = new MayanLoggerNodePainter(options.terminal_colors);
      return require('./node_human_output').makeNodeHumanOutput(
        consoleInterface,
        painter,
        options.indent_multiline
      );
    }

    case LOGGER_FORMATS.json:
      return require('./json_output').makeJSONOutput(consoleInterface);
  }

  throw new InvalidLoggerFormatError(options.format);
}

module.exports = {
  makeOutput,
};
