const archiver = require('archiver')
const path = require('path')
const tar = require('tar')
const tmp = require('tmp-promise')
const zlib = require('zlib')
const rmfr = require('rmfr')

const { IsolatedProject } = require('./IsolatedProject')
const { promisify } = require('util')
const { execute } = require('./cli')
const { installStoredDeps, storeDeps } = require('./deps')
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
  getDepsPath,
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
let tainted = []

const writeFd = promisify(write)

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

async function clearDirectory (workPath) {
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
  await rmfr(getDepsPath(workPath))
}

async function clearDirectories () {
  for (const packagePath of tainted) {
    await clearDirectory(packagePath)
  }
  tainted = []
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

async function isolatePackageDeps (jobConfig, onProgress) {
  const { packagePath, root } = jobConfig
  await readPackage(packagePath)
  const linkedModules = await getLinkedModules(packagePath, root)

  if (linkedModules.length) {
    const packedDeps = await integrateModules(
      { ...jobConfig, linkedModules },
      onProgress
    )
    const storedDeps = await storeDeps(packagePath, packedDeps)
    await installStoredDeps(packagePath, storedDeps)
  }
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

async function exists (filePath) {
  try {
    await stat(filePath)
    return true
  } catch (e) {
    return false
  }
}

const isolated = {}

async function isolatePackage1 (opts, onProgress) {
  try {
    return await isolatePackageInner(opts, onProgress)
  } finally {
    await clearDirectories()
    await restoreBackups()
  }
}

async function isolatePackage ({ extract, pkg, zip }, onProgress) {
  const root = await findRoot(pkg.location)
  const project = new IsolatedProject(root, {
    onProgress
  })
  await project.isolatePackage(pkg, { extract, zip })
}

module.exports = {
  backupConfig,
  configurePackageFiles,
  getModulesPath,
  getPackages: IsolatedProject.getPackages,
  isolatePackage,
  isolatePackageDeps,
  readPackage,
  readPackageLock,
  restoreBackups,
  packModule
}
