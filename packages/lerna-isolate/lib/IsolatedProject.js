const path = require('path')
const Project = require('@lerna/project')

const { IsolatedPackage } = require('./IsolatedPackage.js')
const {
  promises: { mkdir }
} = require('fs')

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

class IsolatedProject extends Project {
  onProgress = null
  isolated = {}
  tainted = []

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
