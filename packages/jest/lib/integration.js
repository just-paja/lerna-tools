const { configureSuite } = require('./suite')
const {
  getSetupFiles,
  getSetupFilesAfterEnv,
  getTransforms
} = require('./plugins')

function configureIntegration (rootDir, config = {}) {
  return configureSuite(rootDir, 'integration', {
    ...config,
    transform: getTransforms(config.transforms),
    setupFiles: getSetupFiles(rootDir, config.setupFiles),
    setupFilesAfterEnv: getSetupFilesAfterEnv(
      rootDir,
      config.setupFilesAfterEnv
    )
  })
}

module.exports = {
  configureIntegration
}
