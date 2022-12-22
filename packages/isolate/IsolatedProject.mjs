import path from 'path'

import { IsolatedPackage } from './IsolatedPackage.mjs'
import { Project } from '@lerna/project'
import { mkdir } from 'fs/promises'

export class IsolatedProject extends Project {
  constructor(root, { reporter } = {}) {
    super(root)
    this.isolated = {}
    this.onProgress = null
    this.products = []
    this.reporter = reporter
    this.tainted = []
  }

  async getPackages() {
    const bare = await super.getPackages()
    return bare.map(pkg =>
      IsolatedPackage.from(pkg, { project: this, reporter: this.reporter })
    )
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
          await this.cleanup()
        },
      }))
    )
  }

  async cleanup() {
    for (const project of this.tainted) {
      await project.cleanup()
    }
  }

  async isolatePackage(pkg, options) {
    if (this.isolated[pkg.name]) {
      return this.isolated[pkg.name]
    }
    pkg.project = this
    this.tainted.push(pkg)
    await this.createDistDir()
    await pkg.isolate(options)
    this.isolated[pkg.name] = pkg
    return pkg
  }

  reportProgress() {}
}
