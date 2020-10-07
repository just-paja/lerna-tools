const archiver = require('archiver')
const Package = require('@lerna/package')
const path = require('path')
const tar = require('tar')
const tmp = require('tmp-promise')
const zlib = require('zlib')

const { createReadStream, createWriteStream, promises, write } = require('fs')
const { copyFile, mkdir, readFile, stat, symlink, unlink, writeFile } = promises
const { execute } = require('./cli')
const { promisify } = require('util')
const {
  PackageDoesNotExistError,
  PrivatePackageError,
  MisconfiguredFilesError
} = require('./errors')

const writeFd = promisify(write)

async function ensureSymlink (...args) {
  try {
    await symlink(...args)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

async function ensureUnlink (...args) {
  try {
    await unlink(...args)
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e
    }
  }
}

class IsolatedPackage extends Package {
  backups = {}
  integratedDependencies = []
  storedDependencies = []
  parentPackage = null
  project = null

  static from (pkgInstance, config) {
    return new IsolatedPackage(
      pkgInstance.toJSON(),
      pkgInstance.location,
      pkgInstance.rootPath,
      config
    )
  }

  constructor (pkg, location, rootPath, { project, reporter } = {}) {
    super(pkg, location, rootPath)
    this.project = project
    this.reporter = reporter
  }

  get packageName () {
    return `${this.name}-${this.version}.tgz`
  }

  get packagePath () {
    return path.join(this.project.distPath, this.packageName)
  }

  get versionNeutralPackageName () {
    return `${this.name}.tgz`
  }

  get versionNeutralZipPackageName () {
    return `${this.name}.zip`
  }

  get versionNeutralPackagePath () {
    return path.join(this.project.distPath, this.versionNeutralPackageName)
  }

  get versionNeutralZipPath () {
    return path.join(this.project.distPath, this.versionNeutralZipPackageName)
  }

  get packageDefaultPath () {
    return path.join(this.location, this.packageName)
  }

  get extractedPath () {
    return path.join(this.project.distPath, this.name)
  }

  get zipPackageName () {
    return `${this.name}-${this.version}.zip`
  }

  get zipPath () {
    return path.join(this.project.distPath, this.zipPackageName)
  }

  get zipDefaultPath () {
    return path.join(this.location, this.zipPackageName)
  }

  get depsDirName () {
    return 'node_deps'
  }

  get depsPath () {
    return path.join(this.location)
  }

  get manifestLockLocation () {
    return path.join(this.location, 'package-lock.json')
  }

  get depsPathLevel () {
    if (!this.parent) {
      return 0
    }
    return 1 + this.parent.depsPathLevel
  }

  isPacked = async () => {
    try {
      return Boolean(await stat(this.packageDefaultPath))
    } catch (e) {
      return false
    }
  }

  configurePackage = async () => {
    const files = this.get('files')
    if (!files) {
      throw new MisconfiguredFilesError(this.name)
    }
    this.set('files', [...files, 'isolated-*.tgz'])
    await this.serialize()
  }

  backupFile = async filePath => {
    try {
      await stat(filePath)
    } catch (e) {
      return null
    }
    const tmpFile = await tmp.file()
    await writeFd(tmpFile.fd, await readFile(filePath))
    this.backups[filePath] = tmpFile
    return tmpFile
  }

  backupConfig = async () => {
    return Promise.all([
      this.backupFile(this.manifestLocation),
      this.backupFile(this.manifestLockLocation)
    ])
  }

  getLinkedDependencies = async () => {
    const available = await this.project.getPackages()
    const required = Object.keys(this.dependencies)
    return available
      .filter(pkg => required.includes(pkg.name))
      .map(pkg => {
        pkg.parentPackage = this
        return pkg
      })
  }

  installPublishedVersion = async dep => {
    if (dep.private) {
      throw new PrivatePackageError(
        `Cannot install ${dep.name}@${dep.version} because it is private`
      )
    }
    try {
      await execute(
        `npm install ${dep.name}@${dep.version} --only=production`,
        {
          cwd: this.location
        }
      )
    } catch (e) {
      if (e.code === 1) {
        throw PackageDoesNotExistError.fromError(e)
      }
      throw e
    }
  }

  integrateDependency = async (dep, isolateOps) => {
    try {
      return await this.installPublishedVersion(dep)
    } catch (e) {
      if (
        e instanceof PrivatePackageError ||
        e instanceof PackageDoesNotExistError
      ) {
        await dep.isolate(isolateOps)
        return dep
      } else {
        throw e
      }
    }
  }

  integrateDependencies = async (deps, isolateOps) => {
    const integrated = []

    for (const dep of deps) {
      const result = await this.integrateDependency(dep, isolateOps)
      if (result) {
        integrated.push(result)
      }
    }
    this.integratedDependencies = integrated
  }

  getDependencyPath = pkg =>
    path.join(this.depsPath, `isolated-${pkg.packageName}`)

  storeDependency = async dep => {
    await copyFile(dep.packageDefaultPath, this.getDependencyPath(dep))
    await this.storeDependencies(await dep.getLinkedDependencies())
  }

  storeDependencies = async dependencies => {
    for (const dep of dependencies) {
      await this.storeDependency(dep)
    }
  }

  storeIntegratedDependencies = async () => {
    if (this.integratedDependencies.length) {
      try {
        await mkdir(this.depsPath)
      } catch (e) {}
    }
    this.storeDependencies(this.integratedDependencies)
  }

  installStoredDependencies = async () => {
    const paths = this.integratedDependencies
      .map(this.getDependencyPath)
      .map(depPath => `./${path.relative(this.location, depPath)}`)
    await execute(`npm install ${paths.join(' ')} --only=production`, {
      cwd: this.location
    })
  }

  isolateDeps = async isolateOps => {
    const linkedDeps = await this.getLinkedDependencies()

    if (linkedDeps.length) {
      await this.integrateDependencies(linkedDeps, isolateOps)
      await this.storeIntegratedDependencies()
      await this.installStoredDependencies()
    }
  }

  pack = async () => {
    await execute('npm pack', {
      cwd: this.location
    })
    this.project.addProduct(this.packageDefaultPath)
  }

  store = async ({ neutral }) => {
    const packagePath = neutral
      ? this.versionNeutralPackagePath
      : this.packagePath
    await ensureSymlink(this.packageDefaultPath, packagePath)
    this.project.addProduct(packagePath)
  }

  extract = async () => {
    await mkdir(this.extractedPath, { recursive: true })
    await new Promise((resolve, reject) => {
      createReadStream(this.packageDefaultPath)
        .on('error', reject)
        .pipe(zlib.Unzip())
        .pipe(
          tar.x({
            C: this.extractedPath,
            strip: 1
          })
        )
        .on('finish', resolve)
    })
    this.project.addProduct(this.extractedPath)
  }

  zip = async ({ neutral }) => {
    const output = createWriteStream(this.zipDefaultPath)
    const archive = archiver('zip')
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
      archive.directory(this.extractedPath, false)
      archive.pipe(output)
      archive.finalize()
    })
    this.project.addProduct(this.zipDefaultPath)
    const zipPath = neutral ? this.versionNeutralZipPath : this.zipPath
    await ensureSymlink(this.zipDefaultPath, zipPath)
    this.project.addProduct(zipPath)
  }

  cleanup = async () => {
    return
    await ensureUnlink(this.manifestLockLocation)
    // await rmfr(this.depsPath) @TODO: Clean dependencies
    for (const [filePath, tmpFile] of Object.entries(this.backups)) {
      await writeFile(filePath, await readFile(tmpFile.path))
      await tmpFile.cleanup()
    }
    this.backups = {}
  }

  isolate = async ({ extract, neutral, zip }) => {
    const jobs = []
    if (!(await this.isPacked())) {
      jobs.push({ name: `Configure ${this.name}`, fn: this.configurePackage })
      jobs.push({ name: `Backup ${this.name}`, fn: this.backupConfig })
      jobs.push({
        name: `Isolate ${this.name} dependencies`,
        fn: async () =>
          await this.isolateDeps({
            extract,
            neutral,
            zip
          })
      })
      jobs.push({ name: `Package ${this.name}`, fn: this.pack })
    } else {
      this.project.addProduct(this.packageDefaultPath)
    }
    jobs.push({
      name: `Store ${this.name}`,
      fn: async () => await this.store({ neutral })
    })
    if (extract || zip) {
      jobs.push({ name: `Extract ${this.name}`, fn: this.extract })
    }
    if (zip) {
      jobs.push({
        name: `Zip ${this.name}`,
        fn: async () => await this.zip({ neutral })
      })
    }
    await this.reporter.runJobs(jobs)
  }
}

module.exports = {
  IsolatedPackage
}
