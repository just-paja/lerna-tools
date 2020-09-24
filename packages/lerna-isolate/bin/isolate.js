#!/usr/bin/env node

const ora = require('ora')
const path = require('path')
const yargs = require('yargs')

const { isolatePackage, getPackages, readPackage } = require('../lib')

function log (message) {
  process.stdout.write(message)
  process.stdout.write('\n')
}

function advise (message) {
  process.stderr.write(message)
  process.stderr.write('\n')
}

async function isolatePackages (packages, options) {
  const results = []
  const spinner = ora('Isolating packages').start()

  for (const packagePath of packages) {
    const npmPackage = await readPackage(packagePath)
    spinner.text = `Isolating ${npmPackage.name}`
    results.push(
      await isolatePackage({ ...options, packagePath }, percent => {
        spinner.prefixText = `${Math.round(percent * 100)}%`
      })
    )
    spinner.prefixText = ''
    spinner.succeed(`Isolated ${npmPackage.name}`)
  }

  spinner.stop()

  if (results.some(result => result.configuredFiles)) {
    advise('Configured package.json to include bundled dependencies')
  }
  advise('Created:')
  results
    .reduce(
      (aggr, res) =>
        [
          ...aggr,
          path.relative(process.cwd(), res.archive),
          res.extractedPath
            ? path.relative(process.cwd(), res.extractedPath)
            : null,
          res.zipPath ? path.relative(process.cwd(), res.zipPath) : null
        ].filter(item => Boolean(item)),
      []
    )
    .sort((a, b) => a.localeCompare(b))
    .forEach(archive => log(`  ${archive}`))
}

async function resolvePackages (packageList) {
  const available = await getPackages()
  if (packageList.length) {
    return packageList.map(
      arg =>
        available.find(availablePkg => path.basename(availablePkg) === arg) ||
        path.resolve(arg)
    )
  }
  return available
}

async function bundleContent (packageList, options) {
  const packages = await resolvePackages(packageList)
  await isolatePackages(packages, options)
}

async function printPackages () {
  const packages = await getPackages()
  for (const pkg of packages) {
    log(path.basename(pkg))
  }
}

function exitOnError (func) {
  return async function (...args) {
    try {
      await func(...args)
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
}

async function main () {
  // eslint-disable-next-line no-unused-expressions
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
          .option('zip', {
            alias: 'z',
            type: 'boolean',
            description: 'Produce zip archive instead of npm package'
          })
          .alias('z', 'gcp')
      },
      argv => {
        const { extract, zip } = argv
        exitOnError(bundleContent)(argv.packages, { extract, zip })
      }
    )
    .command('list', 'list packages', exitOnError(printPackages))
    .help('h')
    .alias('h', 'help')
    .demandCommand().argv
}

main()
