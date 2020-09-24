const archiver = require('archiver')
const os = require('os')
const path = require('path')
const tar = require('tar')
const tmp = require('tmp-promise')
const zlib = require('zlib')

const { createReadStream, createWriteStream } = require('fs')
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

async function extractStoredModule (workPath, module) {
  const root = await findRoot(workPath)
  const extractedPath = path.join(getDistPath(root), module.name)
  await mkdir(extractedPath, { recursive: true })
  await new Promise((resolve, reject) => {
    createReadStream(module.archive)
      .on('error', reject)
      .pipe(zlib.Unzip())
      .pipe(
        tar.x({
          C: extractedPath,
          strip: 1
        })
      )
      .on('finish', resolve)
  })
  return { ...module, extractedPath }
}

async function zipExtractedModule (workPath, module) {
  const root = await findRoot(workPath)
  const zipPath = path.join(
    getDistPath(root),
    `${module.name}-${module.version}.zip`
  )
  const output = createWriteStream(zipPath)
  const archive = archiver('zip')
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.directory(module.extractedPath, false)
    archive.pipe(output)
    archive.finalize()
  })
  return { ...module, zipPath }
}

async function isolatePackage ({ extract, packagePath, zip }, onProgress) {
  const TOTAL_STEPS = 11
  try {
    const available = await getPackages()
    const reportProgress = status => onProgress(status / TOTAL_STEPS)
    const npmPackage = await readPackage(packagePath)
    reportProgress(1)
    await createDistDir(packagePath)
    reportProgress(2)
    const configured = await configurePackageFiles(packagePath)
    reportProgress(3)
    let lock
    try {
      lock = await readPackageLock(packagePath)
    } catch (e) {}
    reportProgress(4)
    await installDeps(packagePath)
    reportProgress(5)
    await backupConfig(packagePath)
    reportProgress(6)
    await isolatePackageDeps(packagePath, available)
    reportProgress(7)
    let module = await packModule({
      modulePath: packagePath,
      name: npmPackage.name,
      configuredFiles: Boolean(configured),
      configuredLock: !lock,
      version: npmPackage.version
    })
    reportProgress(8)
    module = await storeIsolatedModule(packagePath, module)
    reportProgress(9)
    if (extract || zip) {
      module = await extractStoredModule(packagePath, module)
    }
    reportProgress(10)
    if (zip) {
      module = await zipExtractedModule(packagePath, module)
    }
    return module
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
