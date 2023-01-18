import archiver from 'archiver'
import path from 'path'
import tar from 'tar'
import tmp from 'tmp-promise'
import zlib from 'zlib'

import { createReadStream, createWriteStream } from 'fs'
import { execute } from './cli.mjs'
import { Package } from '@lerna/package'
import { ensureSymlink, ensureUnlink } from './fs.mjs'

import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'fs/promises'
import {
  PackageDoesNotExistError,
  PrivatePackageError,
  MisconfiguredFilesError,
} from './errors.mjs'

export class IsolatedPackage extends Package {
  static from(pkgInstance, config) {
    return new IsolatedPackage(
      pkgInstance.toJSON(),
      pkgInstance.location,
      pkgInstance.rootPath,
      config
    )
  }

  constructor(pkg, location, rootPath, { project, reporter } = {}) {
    super(pkg, location, rootPath)
    this.backups = {}
    this.integratedDependencies = []
    this.isolatedPackagePrefix = 'isolated-'
    this.parentPackage = null
    this.project = project
    this.reporter = reporter
    this.storedDependencies = []
  }

  get safeName() {
    return this.name.replace('@', '').replace('/', '-')
  }

  get packageName() {
    return `${this.safeName}-${this.version}.tgz`
  }

  get packagePath() {
    return path.join(this.project.distPath, this.packageName)
  }

  get versionNeutralPackageName() {
    return `${this.safeName}.tgz`
  }

  get versionNeutralZipPackageName() {
    return `${this.safeName}.zip`
  }

  get versionNeutralPackagePath() {
    return path.join(this.project.distPath, this.versionNeutralPackageName)
  }

  get versionNeutralZipPath() {
    return path.join(this.project.distPath, this.versionNeutralZipPackageName)
  }

  get packageDefaultPath() {
    return path.join(this.location, this.packageName)
  }

  get extractedPath() {
    return path.join(this.project.distPath, this.safeName)
  }

  get zipPackageName() {
    return `${this.safeName}-${this.version}.zip`
  }

  get zipPath() {
    return path.join(this.project.distPath, this.zipPackageName)
  }

  get zipDefaultPath() {
    return path.join(this.location, this.zipPackageName)
  }

  get depsDirName() {
    return 'node_deps'
  }

  get depsPath() {
    return path.join(this.location)
  }

  get manifestLockLocation() {
    return path.join(this.location, 'package-lock.json')
  }

  get depsPathLevel() {
    if (!this.parent) {
      return 0
    }
    return 1 + this.parent.depsPathLevel
  }

  async isPacked() {
    try {
      return Boolean(await stat(this.packageDefaultPath))
    } catch (e) {
      return false
    }
  }

  async configurePackage() {
    const files = this.get('files')
    if (!files) {
      throw new MisconfiguredFilesError(this.name)
    }
    const lernaRecord = `${this.isolatedPackagePrefix}*.tgz`
    if (!files.includes(lernaRecord)) {
      this.set('files', [...files])
    }
    await this.serialize()
  }

  async backupFile(filePath) {
    if (this.backups[filePath]) {
      return this.backups[filePath]
    }
    try {
      await stat(filePath)
    } catch (e) {
      return null
    }
    const tmpFile = await tmp.file()
    await copyFile(filePath, tmpFile.path)
    this.backups[filePath] = tmpFile
    return tmpFile
  }

  backupConfig() {
    return Promise.all([
      this.backupFile(this.manifestLocation),
      this.backupFile(this.manifestLockLocation),
    ])
  }

  async getLinkedDependencies() {
    const available = await this.project.getPackages()
    const required = Object.keys(this.dependencies || {})
    return available
      .filter(pkg => required.includes(pkg.name))
      .map(pkg => {
        pkg.parentPackage = this
        return pkg
      })
  }

  async installPublishedVersion(dep) {
    if (dep.private) {
      throw new PrivatePackageError(
        `Cannot install ${dep.name}@${dep.version} because it is private`
      )
    }
    try {
      await execute(
        `npm install ${dep.name}@${dep.version} --only=production`,
        {
          cwd: this.location,
        }
      )
    } catch (e) {
      if (e.code === 1) {
        throw PackageDoesNotExistError.fromError(e)
      }
      throw e
    }
  }

  async integrateDependency(dep, isolateOps) {
    try {
      return await this.installPublishedVersion(dep)
    } catch (e) {
      if (
        e instanceof PrivatePackageError ||
        e instanceof PackageDoesNotExistError
      ) {
        await dep.isolate(isolateOps)
        return dep
      }
      throw e
    }
  }

  async integrateDependencies(deps, isolateOps) {
    const integrated = []

    for (const dep of deps) {
      const result = await this.integrateDependency(dep, isolateOps)
      if (result) {
        integrated.push(result)
      }
    }
    this.integratedDependencies = integrated
  }

  getDependencyPath(pkg) {
    return path.join(
      this.depsPath,
      `${this.isolatedPackagePrefix}${pkg.packageName}`
    )
  }

  async storeDependency(dep) {
    await copyFile(dep.packageDefaultPath, this.getDependencyPath(dep))
    await this.storeDependencies(await dep.getLinkedDependencies())
  }

  async storeDependencies(dependencies) {
    for (const dep of dependencies) {
      await this.storeDependency(dep)
    }
  }

  async storeIntegratedDependencies() {
    if (this.integratedDependencies.length) {
      try {
        await mkdir(this.depsPath)
      } catch (e) {
        // Assume directory already exists
      }
    }
    this.storeDependencies(this.integratedDependencies)
  }

  async readManifest() {
    if (!this.manifestData) {
      this.manifestData = JSON.parse(await readFile(this.manifestLocation))
    }
    return this.manifestData
  }

  async writeManifest(data) {
    const JSON_PADDING = 2
    this.manifestData = data
    await writeFile(
      this.manifestLocation,
      JSON.stringify(data, null, JSON_PADDING)
    )
  }

  async referenceStoredDependency(dep) {
    const npmPackage = await this.readManifest()
    const versionRef = `file:isolated-${dep.packageName}`
    npmPackage.dependencies[dep.name] = versionRef
    await this.writeManifest(npmPackage)
  }

  async referenceStoredDependencies() {
    for (const dep of this.integratedDependencies) {
      await this.referenceStoredDependency(dep)
    }
  }

  async isolateDeps(isolateOps) {
    const linkedDeps = await this.getLinkedDependencies()

    if (linkedDeps.length) {
      await this.integrateDependencies(linkedDeps, isolateOps)
      await this.storeIntegratedDependencies()
      await this.referenceStoredDependencies()
    }
  }

  async pack() {
    await execute('npm pack', {
      cwd: this.location,
    })
    this.project.addProduct(this.packageDefaultPath)
  }

  async store({ neutral }) {
    const packagePath = neutral
      ? this.versionNeutralPackagePath
      : this.packagePath
    await ensureSymlink(this.packageDefaultPath, packagePath)
    this.project.addProduct(packagePath)
  }

  async extract() {
    await mkdir(this.extractedPath, { recursive: true })
    await new Promise((resolve, reject) => {
      createReadStream(this.packageDefaultPath)
        .on('error', reject)
        .pipe(zlib.Unzip())
        .pipe(
          tar.x({
            C: this.extractedPath,
            strip: 1,
          })
        )
        .on('finish', resolve)
    })
    this.project.addProduct(this.extractedPath)
  }

  async zip({ neutral }) {
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

  async getIsolatedPackages() {
    const files = await readdir(this.depsPath)
    return files
      .filter(fileName => fileName.startsWith('isolated'))
      .map(fileName => path.join(this.depsPath, fileName))
  }

  async restoreFile(targetPath, tmpFile) {
    await copyFile(tmpFile.path, targetPath)
    await tmpFile.cleanup()
  }

  async cleanup() {
    await ensureUnlink(this.manifestLockLocation)
    const isolated = await this.getIsolatedPackages()
    for (const pkgFile of isolated) {
      await ensureUnlink(pkgFile)
    }
    for (const [filePath, tmpFile] of Object.entries(this.backups)) {
      await this.restoreFile(filePath, tmpFile)
    }
    this.backups = {}
  }

  async build() {
    await execute(`lerna run build --scope ${this.name}`)
  }

  async isolate({ extract, neutral, zip } = {}) {
    const jobs = []
    if (!(await this.isPacked())) {
      const manifest = await this.readManifest()
      if (manifest.scripts?.build) {
        jobs.push({ name: `Build ${this.name}`, fn: () => this.build() })
      }
      jobs.push({
        name: `Configure ${this.name}`,
        fn: () => this.configurePackage(),
      })
      jobs.push({ name: `Backup ${this.name}`, fn: () => this.backupConfig() })
      jobs.push({
        name: `Isolate ${this.name} dependencies`,
        fn: () =>
          this.isolateDeps({
            extract,
            neutral,
            zip,
          }),
      })
      jobs.push({ name: `Package ${this.name}`, fn: () => this.pack() })
    } else {
      this.project.addProduct(this.packageDefaultPath)
    }
    jobs.push({
      name: `Store ${this.name}`,
      fn: () => this.store({ neutral }),
    })
    if (extract || zip) {
      jobs.push({ name: `Extract ${this.name}`, fn: () => this.extract() })
    }
    if (zip) {
      jobs.push({
        name: `Zip ${this.name}`,
        fn: () => this.zip({ neutral }),
      })
    }
    await this.reporter.runJobs(jobs)
  }
}
