'use strict';

const logger = require('../index');

/**
 * @param {MayanLogCollector} log
 */
function tryItOut(log) {
  log.trace('Tracing...');
  log.debug('Debugging now');
  log.verbose('With increased verbosity');
  for (let i = 0; i < 10; i++) {
    log.info('just some info'.repeat(i));
  }
  log.warn('Warn warn!');
  log.error('Error !', new Error('some message'));
}

tryItOut(logger.log);

tryItOut(
  new logger.MayanLogger({
    level: 'trace',
  }).for('')
);

tryItOut(
  new logger.MayanLogger({
    level: 'trace',
    output: 'json',
  }).for(['Service', 'Worker'])
);

tryItOut(
  new logger.MayanLogger({
    level: 'debug',
    timestamp: false,
  }).for('Service')
);
