import path from 'path'

import { IsolatedPackage } from './IsolatedPackage.mjs'
import { Project } from '@lerna/project'
import { mkdir } from 'fs/promises'
import { rmrf } from './fs.mjs'
import { extractPackageName, padScope } from './names.mjs'

export class IsolatedProject extends Project {
  constructor(root, { reporter } = {}) {
    super(root)
    this.handlers = {}
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

  async filterPackages({ scope, withScript, exact } = {}) {
    let packages = await this.getPackages()
    if (scope) {
      const projectScope = padScope(scope)
      packages = packages.filter(p => p.name.startsWith(`${projectScope}/`))
    }
    if (withScript) {
      packages = packages.filter(p => p.scripts[withScript])
    }
    if (exact) {
      packages = packages.filter(p => extractPackageName(p).startsWith(exact))
    }
    return packages
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
      this.announce('productAdded', { productPath })
    }
  }

  addTemp(tempPath) {
    this.temp.push(tempPath)
  }

  announce(event, props) {
    const handlers = this.handlers[event]
    if (handlers) {
      for (const handler of handlers) {
        handler(props)
      }
    }
  }

  on(event, handler) {
    if (!this.handlers[event]) {
      this.handlers[event] = []
    }
    this.handlers[event].push(handler)
  }

  async createDistDir() {
    await mkdir(this.distPath, { recursive: true })
  }

  async isolatePackages(pkgs, options = {}) {
    await this.reporter.runJobs(
      pkgs.map(pkg => ({
        name: `Isolate ${pkg.name}`,
        big: true,
        fn: async () => {
          await this.isolatePackage(pkg, options)
        },
        after: () => {
          this.announce('packageIsolated', pkg)
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
