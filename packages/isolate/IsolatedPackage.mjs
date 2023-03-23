import archiver from 'archiver'
import path from 'path'
import tar from 'tar'
import tmp from 'tmp-promise'
import zlib from 'zlib'

import {
  readdirSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  writeFileSync,
} from 'fs'
import { copyFile, mkdir, readFile, stat } from 'fs/promises'
import { ensureUnlink } from './fs.mjs'
import { execute } from './cli.mjs'
import { Package } from '@lerna/package'
import { packageProject } from './npm.mjs'
import { resolveFlags } from './flags.mjs'
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
    this.manifest = pkg
    this.cfg = resolveFlags(pkg)
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

  get npmPackageNameDefault() {
    return `${this.safeName}-${this.version}.tgz`
  }

  get npmPackageName() {
    return this.cfg.versionNeutral
      ? `${this.safeName}.tgz`
      : this.npmPackageNameDefault
  }

  get zipPackageName() {
    return this.cfg.versionNeutral
      ? `${this.safeName}.zip`
      : `${this.safeName}-${this.version}.zip`
  }

  get npmPackagePathLocal() {
    return path.join(this.location, this.npmPackageName)
  }

  get npmPackagePathRoot() {
    return path.join(this.project.distPath, this.npmPackageName)
  }

  get zipPackagePathRoot() {
    return path.join(this.project.distPath, this.zipPackageName)
  }

  get zipPackagePathLocal() {
    return path.join(this.location, this.zipPackageName)
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

  async initialize() {
    if (!this.cfg) {
      const manifest = await this.readManifest()
      this.cfg = resolveFlags(manifest)
    }
    return this
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
    this.project.addTemp(tmpFile.path)
    copyFileSync(filePath, tmpFile.path)
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
        'npm',
        ['install', `${dep.name}@${dep.version}`, '--omit=dev', '--omit=peer'],
        {
          cwd: this.location,
        }
      )
    } catch (e) {
      if (e?.code === 1) {
        throw PackageDoesNotExistError.fromError(e)
      }
      throw e
    }
  }

  async integrateDependency(dep) {
    try {
      return await this.installPublishedVersion(dep)
    } catch (e) {
      if (
        e instanceof PrivatePackageError ||
        e instanceof PackageDoesNotExistError
      ) {
        await dep.initialize()
        await dep.isolate()
        return dep
      }
      throw e
    }
  }

  async integrateDependencies(deps) {
    const integrated = []

    for (const dep of deps) {
      const result = await this.integrateDependency(dep)
      if (result) {
        integrated.push(result)
      }
    }
    this.integratedDependencies = integrated
  }

  getDependencyPath(pkg) {
    return path.join(
      this.depsPath,
      `${this.isolatedPackagePrefix}${pkg.npmPackageName}`
    )
  }

  async storeDependency(dep) {
    await copyFile(dep.npmPackagePathTemp, this.getDependencyPath(dep))
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
    if (!this.manifest) {
      this.manifest = JSON.parse(await readFile(this.manifestLocation))
    }
    return this.manifest
  }

  writeManifest(data) {
    const JSON_PADDING = 2
    this.manifest = data
    writeFileSync(
      this.manifestLocation,
      JSON.stringify(data, null, JSON_PADDING)
    )
  }

  async referenceStoredDependency(dep) {
    const npmPackage = await this.readManifest()
    const versionRef = `file:isolated-${dep.npmPackageName}`
    npmPackage.dependencies[dep.name] = versionRef
    await this.writeManifest(npmPackage)
  }

  async referenceStoredDependencies() {
    for (const dep of this.integratedDependencies) {
      await this.referenceStoredDependency(dep)
    }
  }

  async isolateDeps() {
    const linkedDeps = await this.getLinkedDependencies()

    if (linkedDeps.length) {
      await this.integrateDependencies(linkedDeps)
      await this.storeIntegratedDependencies()
      await this.referenceStoredDependencies()
    }
  }

  async pack() {
    const dest = await packageProject({
      cwd: this.location,
      packageName: this.npmPackageNameDefault,
    })
    this.npmPackagePathTemp = dest.path
    this.project.addTemp(dest.path)
  }

  async storeFile(src, dest) {
    await copyFile(src, dest)
    this.project.addProduct(dest)
  }

  async storeNpmPackage() {
    if (this.cfg.storeLocal) {
      await this.storeFile(this.npmPackagePathTemp, this.npmPackagePathLocal)
    }
    if (this.cfg.storeRoot) {
      await this.storeFile(this.npmPackagePathTemp, this.npmPackagePathRoot)
    }
  }

  async storeZipPackage() {
    if (this.cfg.storeLocal) {
      await this.storeFile(this.zipPackagePathTemp, this.zipPackagePathLocal)
    }
    if (this.cfg.storeRoot) {
      await this.storeFile(this.zipPackagePathTemp, this.zipPackagePathRoot)
    }
  }

  async extract() {
    const dir = await tmp.dir()
    this.npmPackageExtractTempPath = dir.path
    this.project.addTemp(dir.path)
    await new Promise((resolve, reject) => {
      createReadStream(this.npmPackagePathTemp)
        .on('error', reject)
        .pipe(zlib.Unzip())
        .pipe(
          tar.x({
            C: dir.path,
            strip: 1,
          })
        )
        .on('finish', resolve)
    })
  }

  async zip() {
    const file = await tmp.file({ postfix: this.zipPackageName })
    this.project.addTemp(file.path)
    this.zipPackagePathTemp = file.path
    const output = createWriteStream(file.path)
    const archive = archiver('zip')
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
      archive.directory(this.npmPackageExtractTempPath, false)
      archive.pipe(output)
      archive.finalize()
    })
  }

  getIsolatedPackages() {
    const files = readdirSync(this.depsPath)
    return files
      .filter(fileName => fileName.startsWith('isolated'))
      .map(fileName => path.join(this.depsPath, fileName))
  }

  restoreFile(targetPath, tmpFile) {
    copyFileSync(tmpFile.path, targetPath)
  }

  cleanup() {
    ensureUnlink(this.manifestLockLocation)
    const isolated = this.getIsolatedPackages()
    for (const pkgFile of isolated) {
      ensureUnlink(pkgFile)
    }
    for (const [filePath, tmpFile] of Object.entries(this.backups)) {
      this.restoreFile(filePath, tmpFile)
    }
    this.backups = {}
  }

  async build() {
    await execute('lerna', ['run', 'build', '--scope', this.name])
  }

  nameJob(str) {
    return `${str} ${this.name}`
  }

  runJobs(jobs) {
    return this.reporter.runJobs(
      jobs.map(j => ({
        ...j,
        name: this.nameJob(j.name),
      }))
    )
  }

  ignore() {
    return this.runJobs([{ name: 'Ignore', fn: () => {} }])
  }

  async isolate() {
    if (this.cfg.ignore) {
      return this.ignore()
    }

    const jobs = []

    if (this.cfg.build) {
      jobs.push({ name: 'Build', fn: () => this.build() })
    }

    if (this.cfg.isolate) {
      jobs.push({ name: 'Configure', fn: () => this.configurePackage() })
      jobs.push({ name: 'Backup', fn: () => this.backupConfig() })
      jobs.push({ name: 'Isolate deps for', fn: () => this.isolateDeps() })
      jobs.push({ name: 'Package', fn: () => this.pack() })

      if (this.cfg.packNpm) {
        jobs.push({ name: 'Store', fn: () => this.storeNpmPackage() })
      }

      if (this.cfg.packRaw || this.cfg.packZip) {
        jobs.push({ name: 'Extract', fn: () => this.extract() })
      }

      if (this.cfg.packZip) {
        jobs.push({ name: 'Zip', fn: () => this.zip() })
        jobs.push({ name: 'Store Zip', fn: () => this.storeZipPackage() })
      }
    }
    return await this.runJobs(jobs)
  }
}
