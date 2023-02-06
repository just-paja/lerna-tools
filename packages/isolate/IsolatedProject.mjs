import path from 'path'

import { IsolatedPackage } from './IsolatedPackage.mjs'
import { Project } from '@lerna/project'
import { mkdir } from 'fs/promises'
import { rmrf } from './fs.mjs'

export class IsolatedProject extends Project {
  constructor(root, { reporter } = {}) {
    super(root)
    this.isolated = {}
    this.mappedPackages = null
    this.onProgress = null
    this.products = []
    this.reporter = reporter
    this.tainted = []
    this.temp = []
  }

  async getPackages() {
    if (!this.mappedPackages) {
      const bare = await super.getPackages()
      const mapped = bare.map(pkg =>
        IsolatedPackage.from(pkg, { project: this, reporter: this.reporter })
      )
      this.mappedPackages = await Promise.all(
        mapped.map(pkg => pkg.initialize())
      )
    }
    return this.mappedPackages
  }

  async getPackageNames() {
    const packages = await this.getPackages()
    return packages.map(pkg => pkg.name)
  }

  get distPath() {
    return path.join(this.rootPath, 'dist')
  }

  addProduct(productPath) {
    if (!this.products.includes(productPath)) {
      this.products.push(productPath)
    }
  }

  addTemp(tempPath) {
    this.temp.push(tempPath)
  }

  async createDistDir() {
    await mkdir(this.distPath, { recursive: true })
  }

  async isolatePackages(pkgs, options) {
    await this.reporter.runJobs(
      pkgs.map(pkg => ({
        name: `Isolate ${pkg.name}`,
        big: true,
        fn: async () => {
          await this.isolatePackage(pkg, options)
        },
      }))
    )
    await this.cleanup()
  }

  async cleanup() {
    for (const project of this.tainted) {
      await project.cleanup()
    }
    for (const tmpPath of this.temp) {
      await rmrf(tmpPath)
    }
  }

  async isolatePackage(pkg, options) {
    if (this.isolated[pkg.name]) {
      return this.isolated[pkg.name]
    }
    pkg.project = this
    this.tainted.push(pkg)
    await this.createDistDir()
    await pkg.initialize()
    await pkg.isolate(options)
    this.isolated[pkg.name] = pkg
    return pkg
  }

  reportProgress() {}
}
