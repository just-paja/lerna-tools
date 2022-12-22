const { guessRootConfig } = require('lerna-jest')

module.exports = guessRootConfig(__dirname)
module.exports.watchPathIgnorePatterns = ['.*/__fixtures__/.*']
