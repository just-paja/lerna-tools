const path = require('path')
const rimraf = require('rimraf')
const tar = require('tar')
const zlib = require('zlib')

const { createReadStream } = require('fs')
const { dir } = require('tmp-promise')
const { readFile } = require('fs/promises')
const { IsolatedProject } = require('..')

class DummyReporter {
  async runJobs (jobs) {
    for (const job of jobs) {
      await job.fn.call()
    }
  }
}

const extractPackage = async pkgPath => {
  const d = await dir({ unsafeCleanup: true })
  await new Promise((resolve, reject) => {
    createReadStream(pkgPath)
      .on('error', reject)
      .pipe(zlib.Unzip())
      .pipe(
        tar.x({
          C: d.path,
          strip: 1
        })
      )
      .on('finish', resolve)
  })

  return { dir: d, path: d.path }
}

describe('IsolateProject', () => {
  const testRoot = path.resolve(__dirname, '..', '__fixtures__', 'trivial')
  const reporter = new DummyReporter()

  afterEach(() => {
    rimraf.sync(path.join(testRoot, 'dist'))
    rimraf.sync(path.join(testRoot, '**', 'node_modules'))
    rimraf.sync(path.join(testRoot, '**', '*.tgz'))
  })

  describe('with trivial example', () => {
    const project = new IsolatedProject(testRoot, { reporter })

    it('getPackageNames lists all package names', async () => {
      const packages = await project.getPackageNames()
      expect(packages).toEqual(['a', 'b'])
    })

    describe('after build', () => {
      let pkg

      beforeAll(async () => {
        const packages = await project.getPackages()
        await project.isolatePackages(packages)
        pkg = await extractPackage(path.join(testRoot, 'dist', 'b-0.0.0.tgz'))
      })

      afterAll(async () => {
        pkg.dir.cleanup()
      })

      it('keeps local dependency in package b', async () => {
        const npmPackagePath = path.join(
          testRoot,
          'packages',
          'b',
          'package.json'
        )
        const npmPackage = JSON.parse(await readFile(npmPackagePath))
        expect(npmPackage.dependencies).toHaveProperty('a', 'file:../a')
      })

      it('sets artifact dependency in package b', async () => {
        const npmPackagePath = path.join(pkg.path, 'package.json')
        const npmPackage = JSON.parse(await readFile(npmPackagePath))
        expect(npmPackage.dependencies).toHaveProperty(
          'a',
          'file:isolated-a-0.0.0.tgz'
        )
      })
    })
  })
})
