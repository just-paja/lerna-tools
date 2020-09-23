const os = require('os')
const path = require('path')
const tmp = require('tmp-promise')

const { execute } = require('./cli')
const {
  readFile,
  rename,
  mkdir,
  write,
  writeFile,
  readPackage,
  readPackageLock
} = require('./fs')
const { installDeps, installStoredDeps, storeDeps } = require('./deps')
const {
  findRoot,
  getModulesPath,
  getDistPath,
  getPackageLockPath,
  getPackageJsonPath
} = require('./paths')
const {
  PrivatePackageError,
  PackageDoesNotExistError,
  MisconfiguredFilesError
} = require('./errors')

let backups = {}

async function getLinkedModules (workPath, available) {
  const pkg = await readPackage(workPath)
  const deps = Object.keys(pkg.dependencies || {})
  return available.filter(mod => deps.includes(mod.name))
}

async function packModule (linkedModule) {
  const { modulePath } = linkedModule
  const { stdout } = await execute('npm pack', {
    cwd: modulePath
  })
  return {
    ...linkedModule,
    archive: path.join(modulePath, stdout.trim())
  }
}

async function installPublishedVersion (workPath, linkedModule) {
  const { modulePath, name } = linkedModule
  const linkedPackage = await readPackage(modulePath)
  if (linkedPackage.private) {
    throw new PrivatePackageError(
      `Cannot install ${name}@${linkedPackage.version} because it is private`
    )
  }
  try {
    await execute(
      `npm install ${name}@${linkedPackage.version} --only=production --no-optional`,
      {
        cwd: workPath
      }
    )
  } catch (e) {
    if (e.code === 1) {
      throw PackageDoesNotExistError.fromError(e)
    }
    throw e
  }
}

async function integrateModule (workPath, linkedModule) {
  try {
    return await installPublishedVersion(workPath, linkedModule)
  } catch (e) {
    if (
      e instanceof PrivatePackageError ||
      e instanceof PackageDoesNotExistError
    ) {
      return await packModule(linkedModule)
    } else {
      throw e
    }
  }
}

async function integrateModules (workPath, linkedModules) {
  const results = []

  for (const linkedModule of linkedModules) {
    const result = await integrateModule(workPath, linkedModule)
    if (result) {
      results.push(result)
    }
  }
  return results
}

async function configurePackageFiles (workPath) {
  const npmPackage = await readPackage(workPath)
  if (!npmPackage.files) {
    throw new MisconfiguredFilesError(npmPackage.name)
  }
  const depsPattern = 'node_deps'
  if (!npmPackage.files.includes(depsPattern)) {
    const configured = {
      ...npmPackage,
      files: [...npmPackage.files, depsPattern]
    }
    await writeFile(
      getPackageJsonPath(workPath),
      JSON.stringify(configured, undefined, 2)
    )
    return configured
  }
}

async function backupFile (filePath) {
  const tmpFile = await tmp.file()
  await write(tmpFile.fd, await readFile(filePath))
  backups[filePath] = tmpFile
  return tmpFile
}

async function restoreBackups () {
  for (const [filePath, tmpFile] of Object.entries(backups)) {
    await writeFile(filePath, await readFile(tmpFile.path))
    await tmpFile.cleanup()
  }
  backups = {}
}

async function backupConfig (workPath) {
  return Promise.all([
    backupFile(getPackageJsonPath(workPath)),
    backupFile(getPackageLockPath(workPath))
  ])
}

async function isolatePackageDeps (workPath, available) {
  const availablePkgs = available.map(item => ({
    name: path.basename(item),
    modulePath: item
  }))
  await readPackage(workPath)
  const linkedModules = await getLinkedModules(workPath, availablePkgs)

  if (linkedModules.length) {
    const packedDeps = await integrateModules(workPath, linkedModules)
    const storedDeps = await storeDeps(workPath, packedDeps)
    await installStoredDeps(workPath, storedDeps)
  }
}

async function getPackages () {
  const root = await findRoot(process.cwd())
  const { stdout } = await execute('lerna list -a --loglevel=error')
  const modulesPath = getModulesPath(root)
  return stdout
    .split(os.EOL)
    .filter(row => row.includes('PRIVATE'))
    .map(row => row.split(' '))
    .map(([pkg]) => path.resolve(path.join(modulesPath, pkg)))
}

async function createDistDir (workPath) {
  const root = await findRoot(workPath)
  await mkdir(getDistPath(root), { recursive: true })
}

async function storeIsolatedModule (workPath, module) {
  const root = await findRoot(workPath)
  const fileName = path.basename(module.archive)
  const archive = path.join(getDistPath(root), fileName)
  await rename(module.archive, archive)
  return {
    ...module,
    archive
  }
}

async function isolatePackage (workingPath, onProgress) {
  try {
    const available = await getPackages()
    const reportProgress = status => onProgress(status / 9)
    const npmPackage = await readPackage(workingPath)
    reportProgress(1)
    await createDistDir(workingPath)
    reportProgress(2)
    const configured = await configurePackageFiles(workingPath)
    reportProgress(3)
    let lock
    try {
      lock = await readPackageLock(workingPath)
    } catch (e) {}
    reportProgress(4)
    await installDeps(workingPath)
    reportProgress(5)
    await backupConfig(workingPath)
    reportProgress(6)
    await isolatePackageDeps(workingPath, available)
    reportProgress(7)
    const module = await packModule({
      modulePath: workingPath,
      name: npmPackage.name,
      configuredFiles: Boolean(configured),
      configuredLock: !lock,
      version: npmPackage.version
    })
    reportProgress(8)
    return await storeIsolatedModule(workingPath, module)
  } finally {
    await restoreBackups()
  }
}

module.exports = {
  backupConfig,
  configurePackageFiles,
  getModulesPath,
  getPackages,
  isolatePackage,
  isolatePackageDeps,
  readPackage,
  readPackageLock,
  restoreBackups,
  packModule
}
