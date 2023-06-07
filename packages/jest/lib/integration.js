const { configureSuite } = require('./suite.js')
const { join } = require('path')
const {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms,
} = require('./plugins.js')

const testMatch = [
  '<rootDir>/**/__tests__/*.{cjs,js,jsx,mjs}',
  '<rootDir>/**/__tests__/*.{ts,tsx,cts,mts,ctsx,mtsx}',
]

function configureIntegration(rootDir, config = {}) {
  return configureSuite(rootDir, 'integration', {
    ...config,
    testMatch,
    moduleNameMapper: {
      '\\.(md|jpg|ico|jpeg|png|gif|eot|otf|webp|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
        join(__dirname, '__mocks__', 'fileMock.mjs'),
      ...config.moduleNameMapper,
    },
    transform: getTransforms(config.transforms),
    setupFiles: getSetupFiles(rootDir, config.setupFiles),
    setupFilesAfterEnv: getSetupFilesAfterEnv(
      rootDir,
      config.setupFilesAfterEnv
    ),
  })
}

module.exports = {
  configureIntegration,
}
