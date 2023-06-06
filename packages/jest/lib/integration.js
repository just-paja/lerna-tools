const { configureSuite } = require('./suite.js')
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
