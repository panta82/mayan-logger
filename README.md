# mayan-logger

Node.js logger done right.

It has just the right mix of features I found essential during my many years of experience developing node.js projects.

- Configurable colorful terminal or JSON output
- Log levels roughly matching winston
- Tagging
- Change log level for individual tag, *live* (you just need to expose an API endpoint)
- Smart handling of error objects
- Tracing (rudimentary)
- Can be used with DI or as singleton, depending on the scale of a project
- Solid JSDoc coverage
- Customizable colors
- Minimal dependencies

### Quick start

```bash
npm install --save mayan-logger
```

```javascript
const { log } = require('mayan-logger');

log.info('Some message');
```

#### A bit more elaborate

```javascript
const logger = require('mayan-logger');

const log = logger.for('service1');
log.info('Some message');

//...

const log = logger.for('service2');
log.error(new Error('Something happened!'));
```

#### Real-ish app usage

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

### Docs

There are two concepts to know:
- `Logger` is a main instance of logger, where all the options and api endpoints live. You should generally have only one instance in your app.
- `Collector` is an interface created by `Logger` which has a certain collection of tags and a custom log level. This is where you call methods like `log.info()` and similar.

##### Creating

Logger module comes with one default `logger` instance. This is available as default export and as `logger`. Each logger instance comes with one default `Collector` without any tags, under `logger.log`.

```javascript
const logger = require('mayan-logger');
logger.log.warn('I am the default collector');
```

Default logger will pick up some options directly from `process.env`.

- `LOG_LEVEL` will set the log level
- `NODE_ENV=production` will switch output type to `json`.

In a bigger project, you might want to create and customize your own logger instance.

```javascript
const { Logger, LOG_LEVELS, LOGGER_OUTPUTS } = require('mayan-logger');

const logger = new Logger({
  // Some options
});
```

##### Options

- `level`  
  Base log level. One of LOG_LEVELS. Alternatively, provide a value from 0 (error) to 5 (trade), or -1 for silence.

- `enabled`  
  Master switch, to enable all logging. If this is false, nothing will be logged anywhere. You might toggle this in tests.

- `output`  
  One of LOGGER_OUTPUTS (terminal, json). Determined what will logger spew out.

- `collector_levels`  
  Lookup of collector initial levels, by collector key.
  NOTE: Key will be something like Tag1_Tag2_Tag3  

- `timestamp`  
  Whether to include timestamp in messages. You can also provide your own function to generate dates.

- `indent_multiline  `
  Indent multiline logs. Only applies when logging to terminal.
     
- `on_log`   
  Optional custom log listener, which will be called in addition to normal logging.
  You can use this to plug in an external storage or collector (eg. Sentry).

- `tracing`  
  Tracing will automatically attach log statements around functions, AOP style.
  An object with these options:
  - `enabled`  
  Set to false to disable adding tracing shims
  - `level`  
  Level to use for function tracing. Defaults to "`trace`"
  - `tag`  
  Tag to add for tracing

- `terminal_colors`  
  Options for customizing terminal colors. This is an object where keys represent part of the log line to paint (logger levels, `timestamp`, `tags` and `message`), and values are styles from the [colorette](https://www.npmjs.com/package/colorette#supported-styles) library. You can provide a single string style, an array of styles (to be applied in sequence) or `null` (no styling). Default colors are exported as `DEFAULT_TERMINAL_COLORS`, and they can be seen in [types.js](./src/types.js).

##### Logger API

- `for(...tags)`  
  Main logger method. Creates a `Collector` for a given list of tags.
  Example:
  ```javascript
  logger.for('WebServer').info('Listening on port 8000');
  ```

- `getState()`  
  Returns instance of [MayanLoggerState](./src/types.js). This contains all the customizable parameters and levels of all collectors. This could be useful for instrumenting logger in a web API.

- `setLevel(newLevel)`  
  Set log level of the entire logger.

- `setEnabled(enabled)`  
  Enable or disable logger.

- `setTimestamp(timestamp)`  
  Change timestamp option (custom function or hard-coded date or off)

- `setCollectorLevel(key, newLevel)`  
  Change log level of an individual collector. Key for a collector will be all its tags joined with underscore ("_"). If you only use one tag per collector, then it will simply be that tag. 

##### Collector API

Collector has one log method for each log level:
- `error(message, ...)`
- `warn(message, ...)`
- `info(message, ...)`
- `verbose(message, ...)`
- `debug(message, ...)`
- `trace(message, ...)`

Each one takes a mandatory `message` as first parameter and an any number of additional context objects, which will be included fully in json output.

If you provide an `Error` instance as either message or the second argument, logger will employ special handling (extract stack trace and similar).

Collector also has these additional methods:

- `errorHandler(err)`  
  Error handler method which will log an error, if given

- `addTracing(target)`  
  Wrap each method on a given object with a tracing wrapper

### Change log

##### 1.5.0

- Exposed `terminal_colors` as an option for customizing colors.

### License

[MIT](./LICENSE)
