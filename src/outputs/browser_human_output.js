'use strict';

const { LOG_LEVELS } = require('../types');

// Pad all level strings by this much, so things will align
const levelPadding = Object.keys(LOG_LEVELS).reduce((max, level) => Math.max(max, level.length), 0);

/**
 * Format info into a string suitable for writing to terminal
 * @param {MayanLoggerConsoleInterface} consoleInterface
 * @param {MayanLoggerNodePainter} painter
 * @param {boolean} indentMultiline
 */
function makeNodeHumanOutput(consoleInterface, painter, indentMultiline) {
  return nodeHumanOutput;
  
  /**
   * @param {MayanLoggerMessage} msg
   */
  function nodeHumanOutput(msg) {
    let prefixLength = 0;
    const parts = [];
    if (msg.timestamp) {
      const timestampStr = msg.timestamp.toISOString();
      parts.push(painter.timestamp(timestampStr));
      prefixLength += timestampStr.length;
    }
    
    const levelStr = msg.level.padStart(levelPadding) + ':';
    prefixLength += levelStr.length;
    parts.push(painter[msg.level](levelStr));
    
    if (msg.collector.tagString) {
      prefixLength += msg.collector.tagString.length;
      parts.push(painter.tags(msg.collector.tagString));
    }
    
    let message = msg.message;
    
    if (msg.error) {
      // Show more error info if we are not dealing with a "webby" client error
      const extendedDisplay = !(msg.error.code >= 400 && msg.error.code < 500);
      
      // From mayan/base CustomError
      let details = msg.error.errorDetails || '';
      if (details) {
        details =
          '\n' +
          details
            .split(/(\r\n|\n\r|\r|\n)/gm)
            .map(line => '|> ' + line)
            .join('\n');
      }
      
      if (!message) {
        // Replace empty message with error
        message =
          ((extendedDisplay && msg.error.stack) || msg.error.message || msg.error || '') + details;
      } else {
        // Extend given message
        if (extendedDisplay && msg.error.stack) {
          // Print the stack beneath
          message += details + '\n' + msg.error.stack;
        } else if (msg.error.message && !msg.message.includes(msg.error.message)) {
          // Attach error message if we don't already have it
          message += ': ' + msg.error.message + details;
        }
      }
    } else {
      // Make sure we are printing strings, just in case
      message = String(message);
    }
    
    if (indentMultiline) {
      // For each part we will add one ' ' delimiter.
      const indent = ' '.repeat(prefixLength + parts.length);
      message = message.replace(/(\r\n|\n\r|\r|\n)/gm, '$1' + indent);
    }
    
    parts.push(painter.message(message));
    
    const finalMessage = parts.join(' ');
    
    consoleInterface.write(msg.level, finalMessage);
  }
}

module.exports = {
  makeNodeHumanOutput,
};
