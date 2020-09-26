const archiver = require('archiver')
const os = require('os')
const path = require('path')
const tar = require('tar')
const tmp = require('tmp-promise')
const zlib = require('zlib')

const { promisify } = require('util')
const { execute } = require('./cli')
const { installDeps, installStoredDeps, storeDeps } = require('./deps')
const { readPackage, readPackageLock } = require('./fs')
const {
  createReadStream,
  createWriteStream,
  promises: { readFile, mkdir, rename, stat, symlink, unlink, writeFile },
  write
} = require('fs')
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

const writeFd = promisify(write)

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
      `npm install ${name}@${linkedPackage.version} --only=production`,
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

async function integrateModule (jobConfig, onProgress) {
  const { packagePath, linkedModule } = jobConfig
  try {
    return await installPublishedVersion(packagePath, linkedModule)
  } catch (e) {
    if (
      e instanceof PrivatePackageError ||
      e instanceof PackageDoesNotExistError
    ) {
      return await isolatePackage(
        { ...jobConfig, packagePath: linkedModule.modulePath },
        onProgress
      )
    } else {
      throw e
    }
  }
}

async function integrateModules (jobConfig, onProgress) {
  const { linkedModules } = jobConfig
  const results = []

  for (const linkedModule of linkedModules) {
    const result = await integrateModule(
      { ...jobConfig, linkedModule },
      onProgress
    )
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
  try {
    await stat(filePath)
  } catch (e) {
    return null
  }
  const tmpFile = await tmp.file()
  await writeFd(tmpFile.fd, await readFile(filePath))
  backups[filePath] = tmpFile
  return tmpFile
}

async function restoreBackups (workPath) {
  const packageLockPath = getPackageLockPath(workPath)
  if (!backups[packageLockPath]) {
    try {
      await unlink(packageLockPath)
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e
      }
    }
  }
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

async function isolatePackageDeps (jobConfig, onProgress) {
  const { available, packagePath } = jobConfig
  const availablePkgs = available.map(item => ({
    name: path.basename(item),
    modulePath: item
  }))
  await readPackage(packagePath)
  const linkedModules = await getLinkedModules(packagePath, availablePkgs)

  if (linkedModules.length) {
    const packedDeps = await integrateModules(
      { ...jobConfig, linkedModules },
      onProgress
    )
    const storedDeps = await storeDeps(packagePath, packedDeps)
    await installStoredDeps(packagePath, storedDeps)
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

async function linkVersionNeutralOutputs (workPath, module) {
  const root = await findRoot(workPath)
  const distPath = getDistPath(root)
  const outputs = ['archive', 'zipPath']
  const links = await Promise.all(
    outputs
      .filter(output => module[output])
      .map(async output => {
        const extension = path
          .basename(module[output])
          .substr(`${module.name}-${module.version}.`.length)
        const neutralPath = path.join(distPath, `${module.name}.${extension}`)
        try {
          await unlink(neutralPath)
        } catch (e) {}
        await symlink(module[output], neutralPath)
        return neutralPath
      })
  )
  return { ...module, links }
}

function createReporter (initialSteps, onProgress) {
  let steps = initialSteps
  let status = 0

  function reportProgress (jump = 1) {
    status += jump
    onProgress(status / steps)
  }

  function escalate (extraSteps, p) {
    steps += extraSteps
    return reportProgress
  }

  reportProgress.escalate = escalate
  return reportProgress
}

async function exists (filePath) {
  try {
    await stat(filePath)
    return true
  } catch (e) {
    return false
  }
}

async function isolatePackage ({ extract, packagePath, zip }, onProgress) {
  const TOTAL_STEPS = 11
  try {
    const available = await getPackages()
    const reportProgress = onProgress.escalate
      ? onProgress.escalate(TOTAL_STEPS)
      : createReporter(TOTAL_STEPS, onProgress)
    const npmPackage = await readPackage(packagePath)
    const root = await findRoot(packagePath)
    const fileName = `${npmPackage.name}-${npmPackage.version}.tgz`
    const archive = path.join(getDistPath(root), fileName)
    let module = {
      modulePath: packagePath,
      name: npmPackage.name,
      version: npmPackage.version,
      configuredFiles: false,
      configuredLock: false,
      archive
    }

    if (await exists(archive)) {
      reportProgress(9)
    } else {
      reportProgress()
      await createDistDir(packagePath)
      reportProgress()
      const configured = await configurePackageFiles(packagePath)
      reportProgress()
      let lock
      try {
        lock = await readPackageLock(packagePath)
      } catch (e) {}
      reportProgress()
      await backupConfig(packagePath)
      reportProgress()
      await installDeps(packagePath)
      reportProgress()
      await isolatePackageDeps(
        { extract, packagePath, zip, available },
        reportProgress
      )
      reportProgress()
      module = await packModule({
        ...module,
        configuredFiles: Boolean(configured),
        configuredLock: !lock
      })
      reportProgress()
      module = await storeIsolatedModule(packagePath, module)
      reportProgress()
    }
    if (extract || zip) {
      module = await extractStoredModule(packagePath, module)
    }
    reportProgress()
    if (zip) {
      module = await zipExtractedModule(packagePath, module)
    }
    reportProgress()
    module = await linkVersionNeutralOutputs(packagePath, module)
    return module
  } finally {
    await restoreBackups(packagePath)
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
