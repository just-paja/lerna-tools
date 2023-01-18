#!/usr/bin/env node

import fg from 'fast-glob'
import yargs from 'yargs'

import { exists, rmrf } from './fs.mjs'
import { hideBin } from 'yargs/helpers'
import { findRoot } from './paths.mjs'
import { join, relative } from 'path'
import { JobRunner } from './JobRunner.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'

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

  if (project.products.length > 0) {
    log('Created:')
    project.products
      .map(archive => relative(process.cwd(), archive))
      .sort((a, b) => a.localeCompare(b))
      .forEach(archive => log(`  ${archive}`))
  }
}

function findMatchingPackage(available, pkg) {
  const match = available.find(availablePkg => pkg === availablePkg.name)
  if (match) {
    return match
  }

  throw new Error(`Failed to find package "${pkg}"`)
}

function resolvePackages(available, packageList) {
  if (packageList.length) {
    return packageList.map(arg => findMatchingPackage(available, arg))
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

  const dirs = await Promise.all([formatPath('dist')].map(exists))
  const packages = (await fg('packages/*/*.(tgz|zip)')).filter(
    path => !path.match(/\/__/)
  )
  const dist = (await fg('packages/*/dist')).filter(path => !path.match(/\/__/))
  const rmlist = [...dirs, ...packages, ...dist].filter(Boolean)

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
  .help('h')
  .alias('h', 'help')
  .command(
    'bundle [packages..]',
    'bundle packages',
    y => {
      y.positional('packages', {
        describe: 'list of packages',
      })
    },
    async argv => await isolatePackages(argv.packages, {})
  )
  .command('list', 'list packages', printPackages)
  .command('clean', 'clean artifacts', cleanPackages)
  .demandCommand()
  .parse()
