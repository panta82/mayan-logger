const log = require('../index');

/**
 * @param {MayanLogCollector} log
 */
function tryItOut(log) {
  log.trace('Tracing...');
  log.debug('Debugging now');
  log.verbose('With increased verbosity');
  log.info('Just an ordinary logger');
  log.warn('Warn warn!');
  log.error('Error !', new Error('some message'));
}

tryItOut(log);

tryItOut(
  new log.Logger({
    level: 'trace',
  }).for('')
);

tryItOut(
  new log.Logger({
    level: 'trace',
    output: 'json',
  }).for(['Service', 'Worker'])
);
