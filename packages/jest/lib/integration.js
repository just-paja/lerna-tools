const { configureSuite } = require('./suite')
const {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms,
} = require('./plugins')

const testMatch = ['<rootDir>/**/__tests__/*.{cjs,js,jsx,mjs}']

function configureIntegration(rootDir, config = {}) {
  return configureSuite(rootDir, 'integration', {
    ...config,
    testMatch,
    modulePathIgnorePatterns: ['__fixtures__'],
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
