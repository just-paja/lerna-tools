#!/usr/bin/env node

import fg from 'fast-glob'
import yargs from 'yargs'

import { exists, rmrf } from './fs.mjs'
import { hideBin } from 'yargs/helpers'
import { findRoot } from './paths.mjs'
import { join, relative } from 'path'
import { JobRunner } from './JobRunner.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'
import { runScopeCommand } from './runner.mjs'
import { printPackages, printScopes } from './scopes.mjs'
import { log } from './cli.mjs'

async function isolatePackages(argv) {
  const root = findRoot()
  const jobRunner = new JobRunner()
  await jobRunner.initialize()
  const project = new IsolatedProject(root, { reporter: jobRunner })
  const available = await project.filterPackages(argv)
  const toIsolate = await resolvePackages(available, argv.packages)
  await project.isolatePackages(toIsolate)

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
      }).option('scope', {
        alias: 's',
        describe: 'project scope, like "@foo" or "foo"',
        string: true,
      })
    },
    isolatePackages
  )
  .command(
    'run [scope] [pkg]',
    'run scripts on project scope',
    y => {
      y.positional('scope', {
        describe: 'project scope, like "@foo" or "foo"',
      })
        .positional('pkg', {
          describe: 'package name',
        })
        .option('all', {
          alias: 'a',
          boolean: true,
          default: false,
        })
        .option('script', {
          alias: 's',
          default: 'dev',
          describe: 'run this npm script',
          string: true,
        })
    },
    runScopeCommand
  )
  .command(
    'packages',
    'work with packages',
    y => {
      y.option('scope', {
        alias: 's',
        describe: 'filter packages from this scope',
        string: true,
      }).option('with-script', {
        alias: 'w',
        describe: 'filter scopes supporting this npm script',
        string: true,
      })
    },
    printPackages
  )
  .command(
    'scopes',
    'work with project scopes',
    y => {
      y.option('with-script', {
        alias: 'w',
        describe: 'filter scopes supporting this npm script',
        string: true,
      })
    },
    printScopes
  )
  .command('clean', 'clean artifacts', cleanPackages)
  .demandCommand()
  .parse()
