const MayanLogger = require('../index');

/**
 * @param {LogCollector} log
 */
function tryItOut(log) {
  log.trace('Tracing...');
  log.debug('Debugging now');
  log.verbose('With increased verbosity');
  log.info('Just an ordinary logger');
  log.warn('Warn warn!');
  log.error('Error !', new Error('some message'));
}

tryItOut(MayanLogger);

tryItOut(
  new MayanLogger.Logger({
    level: 'trace',
  }).for('')
);
