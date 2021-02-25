const { filterSuiteName, guessRootConfig } = require('lerna-jest')

filterSuiteName(name => name.replace(/^ig11-/, ''))

module.exports = guessRootConfig(__dirname)
