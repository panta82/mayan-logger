'use strict';

const { DEFAULT_TERMINAL_COLORS } = require('../src/types');
const { formatForTerminal, TerminalPainter } = require('../src/outputs');

describe('formats', () => {
  const msg = (/** MayanLoggerMessage */ partialMsg = {}) => {
    return {
      message: 'Message line 1\nMessage line 2\n\n',
      level: 'info',
      timestamp: new Date('2020-08-22T21:34:42.016Z'),
      collector: {
        tags: ['a', 'b'],
        level: 'verbose',
      },
      data: {
        prop1: '1',
        prop2: '2',
      },
      is_trace: false,
      ...partialMsg,
    };
  };

  describe('formatForTerminal', () => {
    it('will properly output info messages', () => {
      expect(formatForTerminal(false, new TerminalPainter(DEFAULT_TERMINAL_COLORS), msg())).toEqual(
        '[90m2020-08-22T21:34:42.016Z[39m [32m   info:[39m Message line 1\n' + 'Message line 2\n' + '\n'
      );
    });

    it('will indent multiline messages if specified', () => {
      expect(formatForTerminal(true, new TerminalPainter(DEFAULT_TERMINAL_COLORS), msg())).toEqual(
        '[90m2020-08-22T21:34:42.016Z[39m [32m   info:[39m Message line 1\n' +
          '                                  Message line 2\n' +
          '                                  \n' +
          '                                  '
      );
    });

    it('will allow custom colors', () => {
      expect(
        formatForTerminal(
          true,
          new TerminalPainter({
            warn: null,
            timestamp: null,
            message: 'blue',
          }),
          msg({
            level: 'warn',
          })
        )
      ).toEqual(
        '2020-08-22T21:34:42.016Z    warn: [34mMessage line 1\n' +
          '                                  Message line 2\n' +
          '                                  \n' +
          '                                  [39m'
      );
    });
  });
});
