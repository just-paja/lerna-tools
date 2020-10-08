#!/usr/bin/env node

const path = require('path')
const yargs = require('yargs')

const { findRoot, IsolatedProject, JobRunner } = require('../lib')

function log (message) {
  process.stdout.write(message)
  process.stdout.write('\n')
}

function advise (message) {
  process.stderr.write(message)
  process.stderr.write('\n')
}

async function isolatePackages (packages, options) {
  const root = await findRoot()
  const jobRunner = new JobRunner()
  const project = new IsolatedProject(root, { reporter: jobRunner })
  const available = await project.getPackages()
  const toIsolate = await resolvePackages(available, packages)
  await project.isolatePackages(toIsolate, options)

  advise('Created:')
  project.products
    .map(archive => path.relative(process.cwd(), archive))
    .sort((a, b) => a.localeCompare(b))
    .forEach(archive => log(`  ${archive}`))
}

async function resolvePackages (available, packageList) {
  if (packageList.length) {
    return packageList.map(arg =>
      available.find(availablePkg => arg === availablePkg.name)
    )
  }
  return available
}

async function printPackages () {
  const root = await findRoot()
  const project = new IsolatedProject(root)
  const packages = await project.getPackageNames()
  for (const pkgName of packages) {
    log(pkgName)
  }
}

async function main () {
  try {
    yargs
      .command(
        'bundle [packages..]',
        'bundle packages',
        yargs => {
          yargs
            .positional('packages', {
              describe: 'list of packages'
            })
            .option('extract', {
              alias: 'e',
              type: 'boolean',
              description: 'Leave generated output extracted'
            })
            .option('neutral', {
              alias: 'n',
              type: 'boolean',
              description: 'Keep only version neutral outputs'
            })
            .option('zip', {
              alias: 'z',
              type: 'boolean',
              description: 'Produce zip archive instead of npm package'
            })
            .alias('z', 'gcp')
        },
        async argv =>
          await isolatePackages(argv.packages, {
            extract: Boolean(argv.extract),
            neutral: Boolean(argv.neutral),
            zip: Boolean(argv.zip)
          })
      )
      .command('list', 'list packages', printPackages)
      .help('h')
      .alias('h', 'help')
      .demandCommand()
      .parse()
  } catch (e) {
    if (e.stdout) {
      console.error(e.stdout)
    }
    if (e.stderr) {
      console.error(e.stderr)
    }
    console.error(e)
    process.exit(255)
  }
}

main()
