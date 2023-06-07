const { existsSync } = require('fs')
const { join, resolve } = require('path')

function parsePluginName(pluginName) {
  return Array.isArray(pluginName) ? pluginName[0] : pluginName
}

function testPluginExistence(pluginName) {
  try {
    return require.resolve(parsePluginName(pluginName))
  } catch (e) {
    return null
  }
}

function getTransforms(extra) {
  return Object.fromEntries(
    [
      ['\\.([cm]?[jt]sx?)$', ['babel-jest', { rootMode: 'upward' }]],
      ['\\.(svg)$', 'jest-svg-transformer'],
      ['\\.(svg)$', 'jest-transformer-svg'],
      ['\\.(css|styl|less|sass|scss)$', 'jest-css-modules-transform'],
      ...(extra ? Object.entries(extra) : []),
    ].filter(([, transformModule]) => testPluginExistence(transformModule))
  )
}

function getWatchPlugins(extra) {
  return [
    ...[
      'jest-runner-eslint/watch-fix',
      'jest-watch-select-projects',
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname',
    ].filter(testPluginExistence),
    ...(extra || []),
  ]
}

function getSetupFiles(directory, extra) {
  return [
    ...['jest-date-mock'].filter(testPluginExistence),
    ...[
      resolve(directory, '..', '..', 'jest.setup.js'),
      resolve(directory, '..', 'jest.setup.js'),
      join(directory, 'jest.setup.js'),
    ].filter(existsSync),
    ...(extra || []),
  ]
}

function getSetupFilesAfterEnv(directory, extra) {
  return [
    ...['jest-enzyme', 'jest-extended'].filter(testPluginExistence),
    ...[
      resolve(directory, '..', '..', 'jest.afterEnv.js'),
      resolve(directory, '..', 'jest.afterEnv.js'),
      join(directory, 'jest.afterEnv.js'),
    ].filter(existsSync),
    ...(extra || []),
  ]
}

function setPluginEnvVars(directory) {
  if (testPluginExistence('jest-css-modules-transform')) {
    const configPath = join(directory, 'jest.cssModules.cjs')
    if (existsSync(configPath)) {
      process.env.JEST_CSS_MODULES_TRANSFORM_CONFIG = configPath
    }
  }
}

module.exports = {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms,
  getWatchPlugins,
  setPluginEnvVars,
  testPluginExistence,
}
