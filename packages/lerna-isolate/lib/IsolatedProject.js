const path = require('path')
const Project = require('@lerna/project')

const { IsolatedPackage } = require('./IsolatedPackage.js')
const { promises } = require('fs')
const { mkdir } = promises

class IsolatedProject extends Project {
  onProgress = null
  isolated = {}
  tainted = []
  products = []

  static async getPackages () {
    const bare = await super.getPackages()
    return bare.map(pkg => IsolatedPackage.from(pkg))
  }

  async getPackages () {
    const bare = await super.getPackages()
    return bare.map(pkg =>
      IsolatedPackage.from(pkg, { project: this, reporter: this.reporter })
    )
  }

  constructor (root, { reporter }) {
    super(root)
    this.reporter = reporter
  }

  get distPath () {
    return path.join(this.rootPath, 'dist')
  }

  addProduct (productPath) {
    if (!this.products.includes(productPath)) {
      this.products.push(productPath)
    }
  }

  async createDistDir () {
    await mkdir(this.distPath, { recursive: true })
  }

  async isolatePackages (pkgs, options) {
    await this.reporter.runJobs(
      pkgs.map(pkg => ({
        name: `Isolate ${pkg.name}`,
        big: true,
        fn: async () => {
          await this.isolatePackage(pkg, options)
          await this.cleanup()
        }
      }))
    )
  }

  async cleanup () {
    for (const project of this.tainted) {
      await project.cleanup()
    }
  }

  async isolatePackage (pkg, options) {
    if (this.isolated[pkg.name]) {
      return this.isolated[pkg.name]
    }
    pkg.project = this
    this.tainted.push(pkg)
    await this.createDistDir()
    await pkg.isolate(options)
    this.isolated[pkg.name] = pkg
  }

  reportProgress () {}
}

module.exports = {
  IsolatedProject
}
