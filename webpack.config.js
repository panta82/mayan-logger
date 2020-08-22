'use strict';

const libPath = require('path');

module.exports = {
  entry: './src/index.js',
  mode: 'production',
  devtool: 'source-map',
  target: 'web',
  output: {
    path: libPath.resolve(__dirname, 'dist'),
    filename: 'mayan-logger.js',
    library: 'mayanLogger',
    libraryTarget: 'umd',
  },
  module: {
    rules: [{ test: /\.js$/, loader: 'babel-loader' }],
  },
  externals: ['colorette'],
};
