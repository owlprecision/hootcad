//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
    '@jscad/modeling': 'commonjs @jscad/modeling',
    '@jscad/regl-renderer': 'commonjs @jscad/regl-renderer'
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web', // Webview code runs in a web context
  mode: 'none',
  
  entry: './src/webview/renderer-entry.js', // the entry point for the webview
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: 'renderer.js',
    libraryTarget: 'module',
  },
  experiments: {
    outputModule: true, // Enable ES module output
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      // Ensure three.js is resolved from node_modules
      'three': path.resolve(__dirname, 'node_modules/three/build/three.module.js')
    }
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/webview/renderer.html', to: 'renderer.html' },
        { from: 'src/webview/preview.css', to: 'preview.css' }
      ]
    })
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/** @type WebpackConfig */
const mcpServerConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/mcpServer.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcpServer.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    // Bundle everything for the MCP server
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

module.exports = [ extensionConfig, webviewConfig, mcpServerConfig ];
