'use strict';

const { MayanLogger, MayanLoggerOptions, log } = require('../src');

/**
 * @param {MayanLogCollector} log
 */
function tryItOut(log) {
  log.trace('Tracing...');
  log.debug('Debugging now');
  log.verbose('With increased verbosity\nMultiline too');
  console.log('One normal console log');
  for (let i = 0; i < 10; i++) {
    log.info('just some info'.repeat(i));
  }
  log.warn('Warn warn!');
  log.error('Error !', new Error('some message'));
}

tryItOut(
  new MayanLogger({
    level: 'trace',
  }).for('')
);

tryItOut(
  new MayanLogger({
    level: 'trace',
    output: 'json',
  }).for(['Service', 'Worker'])
);

tryItOut(
  new MayanLogger({
    level: 'debug',
    timestamp: false,
  }).for('Service')
);

tryItOut(
  new MayanLogger(
    new MayanLoggerOptions({
      level: 'debug',
      terminal_colors: {
        timestamp: 'bgYellowBright',
        tags: 'blue',
        message: ['bgCyan', 'magenta'],
        info: ['strikethrough', 'bgGreen'],
        warn: [],
      },
    })
  ).for('Service')
);

tryItOut(log);
