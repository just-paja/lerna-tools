#!/usr/bin/env node

import fg from 'fast-glob'
import rimraf from 'rimraf'
import yargs from 'yargs'

import { access } from 'fs/promises'
import { hideBin } from 'yargs/helpers'
import { findRoot } from './paths.mjs'
import { join, relative } from 'path'
import { JobRunner } from './JobRunner.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'
import { promisify } from 'util'

const rmrf = promisify(rimraf)

function log(message) {
  process.stdout.write(message)
  process.stdout.write('\n')
}

async function isolatePackages(packages, options) {
  const root = findRoot()
  const jobRunner = new JobRunner()
  await jobRunner.initialize()
  const project = new IsolatedProject(root, { reporter: jobRunner })
  const available = await project.getPackages()
  const toIsolate = await resolvePackages(available, packages)
  await project.isolatePackages(toIsolate, options)

  log('Created:')
  project.products
    .map(archive => relative(process.cwd(), archive))
    .sort((a, b) => a.localeCompare(b))
    .forEach(archive => log(`  ${archive}`))
}

function resolvePackages(available, packageList) {
  if (packageList.length) {
    return packageList.map(arg =>
      available.find(availablePkg => arg === availablePkg.name)
    )
  }
  return available
}

async function printPackages() {
  const root = findRoot()
  const project = new IsolatedProject(root)
  const packages = await project.getPackageNames()
  for (const pkgName of packages) {
    log(pkgName)
  }
}

async function cleanPackages() {
  const baseDir = findRoot()
  const formatPath = (...args) => join(baseDir, ...args)

  const verboseRemove = async dir => {
    process.stdout.write(`Remove ${relative(baseDir, dir)}\n`)
    await rmrf(dir)
  }

  const exists = async path => {
    try {
      await access(path)
      return path
    } catch (e) {
      if (e.code === 'ENOENT') {
        return null
      }
      throw e
    }
  }

  const dirs = await Promise.all(
    [
      formatPath('dist'),
      formatPath('packages', 'banner-template-server', '.dist'),
    ].map(exists)
  )

  const packages = (await fg('packages/*/*.(tgz|zip)')).filter(
    path => !path.match(/\/__/)
  )
  const rmlist = [...dirs, ...packages].filter(Boolean)

  if (rmlist.length > 0) {
    process.stdout.write(`Cleaning ${baseDir}\n`)
    for (const dir of rmlist) {
      await verboseRemove(dir)
    }
  } else {
    process.stdout.write('Nothing to do\n')
  }
}

yargs(hideBin(process.argv))
  .command(
    'bundle [packages..]',
    'bundle packages',
    y => {
      y.positional('packages', {
        describe: 'list of packages',
      })
        .option('extract', {
          alias: 'e',
          type: 'boolean',
          description: 'Leave generated output extracted',
        })
        .option('neutral', {
          alias: 'n',
          type: 'boolean',
          description: 'Keep only version neutral outputs',
        })
        .option('zip', {
          alias: 'z',
          type: 'boolean',
          description: 'Produce zip archive instead of npm package',
        })
        .alias('z', 'gcp')
    },
    async argv =>
      await isolatePackages(argv.packages, {
        extract: Boolean(argv.extract),
        neutral: Boolean(argv.neutral),
        zip: Boolean(argv.zip),
      })
  )
  .command('list', 'list packages', printPackages)
  .command('clean', 'clean artifacts', cleanPackages)
  .help('h')
  .alias('h', 'help')
  .demandCommand()
  .parse()
