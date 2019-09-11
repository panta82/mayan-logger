# mayan-logger

Logger for use in xcalibra or related projects.

### Quick start

```bash
npm install --save mayan-logger
```

```javascript
const { log } = require('mayan-logger');

log.info('Some message');
```

### A bit more elaborate

```javascript
const logger = require('mayan-logger');

const log = logger.for('service1');
log.info('Some message');

//...

const log = logger.for('service2');
log.error(new Error('Something happened!'));
```

### Real-ish app usage

```javascript
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

## Ecosystem note

While this logger is part of the "mayan" suite of services, it is not directly connected to `@mayan/base` or any other shared "bedrock" library.

Why is that? Because I want this logger to be used in banker nodes. And bankers might be made by 3rd party developers, contractors, etc. So we might not want to go to trouble to giving them access to our infrastructure.

On the other hand, since bankers will operate within our infrastructure, we want their output to be predictable and follow the same format and conventions as our core team apps (so we can collect and organize logs).

Therefore, this logger is made disconnected from all other internal services. If it ever comes a time we want to have an outsider work on banker, we can easily publish this module to npm.js and stipulate they have to use that for their logging.
 