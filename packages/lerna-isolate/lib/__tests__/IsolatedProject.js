const path = require('path')

const { IsolatedProject } = require('..')

class DummyReporter {
  async runJobs (jobs) {
    for (const job of jobs) {
      await job.fn.call()
    }
  }
}

describe('IsolateProject', () => {
  const testRoot = path.join(__dirname, '__fixtures__', 'trivial')
  const reporter = new DummyReporter()

  describe('with trivial example', () => {
    const project = new IsolatedProject(testRoot, { reporter })

    it('getPackageNames lists all package names', async () => {
      const packages = await project.getPackageNames()
      expect(packages).toEqual(['a', 'b'])
    })

    it('does not throw bundling trivial package', async () => {
      const packages = await project.getPackages()
      await project.isolatePackages(packages)
    })
  })
})
