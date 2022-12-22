#!/usr/bin/env node

import path from 'path'
import yargs from 'yargs'

import { hideBin } from 'yargs/helpers'
import { findRoot } from './paths.mjs'
import { JobRunner } from './JobRunner.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'

function log(message) {
  process.stdout.write(message)
  process.stdout.write('\n')
}

async function isolatePackages(packages, options) {
  const root = findRoot()
  const jobRunner = new JobRunner()
  const project = new IsolatedProject(root, { reporter: jobRunner })
  const available = await project.getPackages()
  const toIsolate = await resolvePackages(available, packages)
  await project.isolatePackages(toIsolate, options)

  log('Created:')
  project.products
    .map(archive => path.relative(process.cwd(), archive))
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
  .help('h')
  .alias('h', 'help')
  .demandCommand()
  .parse()
