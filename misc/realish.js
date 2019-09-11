'use strict';

const { Logger, LOG_LEVELS, LOGGER_OUTPUTS } = require('../index');

function UserManager(logger) {
  const log = logger.for(UserManager);

  this.getUser = id => {
    const user = { id, name: 'User ' + id };
    log.info('Fetched user ' + id, user);
    return user;
  };

  log.addTracing(this);
}

const logger = new Logger({
  level: LOG_LEVELS.verbose,
  output: LOGGER_OUTPUTS.terminal,
  tracing: {
    enabled: true,
    level: LOG_LEVELS.debug,
  },
});
const userManager = new UserManager(logger);

userManager.getUser(123);

logger.setCollectorLevel('UserManager', LOG_LEVELS.debug);

userManager.getUser(456);
