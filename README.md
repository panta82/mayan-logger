# mayan-logger

Logger for use in xcalibra or related projects.

### Quick start

```
npm install --save mayan-logger
```

```
const { log } = require('mayan-logger');

log.info('Some message');
```

### A bit more elaborate

```
const logger = require('mayan-logger');

const log = logger.for('service1');
log.info('Some message');

//...

const log = logger.for('service2');
log.error(new Error('Something happened!'));
```

### Real-ish app usage

```
const { Logger, LOG_LEVELS, LOGGER_OUTPUTS } = require('mayan-logger');

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
```

Outputs:

```
2019-08-21T12:44:10.580Z info: [UserManager] Fetched user 123
2019-08-21T12:44:10.582Z debug: [UserManager] [TRACE] getUser(456)
2019-08-21T12:44:10.582Z info: [UserManager] Fetched user 456
```

TODO: Real readme, this is 'nuff for now.