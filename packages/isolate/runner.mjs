import { findRoot } from './paths.mjs'
import { getPackageNames, getScopes } from './scopes.mjs'
import { join } from 'path'
import { log } from './cli.mjs'
import { spawn } from 'child_process'

const serializeFilter = filter => {
  return JSON.stringify(filter)
}

const printAvailableScopes = async script => {
  const scopes = await getScopes({ withScript: script })
  log(`Available "${script}" project scopes:`)
  scopes.map(s => log(s, { padding: 2 }))
}

const printAvailablePackages = async (scope, script) => {
  const scopes = await getPackageNames({ scope, withScript: script })
  log(`Available "${script}" packages${scope ? ` from scope "${scope}"` : ''}:`)
  scopes.map(s => log(s, { padding: 2 }))
}

export const runScopeCommand = async ({ all, scope, pkg, script } = {}) => {
  if (!pkg && !all) {
    return printAvailablePackages(scope, script)
  }
  if (!scope && !all) {
    return printAvailableScopes(script)
  }
  const packages = await getPackageNames({
    exact: pkg,
    scope,
    withScript: script,
  })

  if (!packages.length) {
    log(
      `No packages after filtering for ${serializeFilter({
        scope,
        pkg,
        script,
      })}`
    )
    process.exit(1)
  }

  log(`Starting ${packages.length} projects\n`)
  for (const pack of packages) {
    log(`* ${pack}\n`)
  }
  const baseDir = await findRoot()
  const lerna = join(baseDir, 'node_modules', '.bin', 'lerna')
  const noPrefix = packages.length <= 1
  const lernaArgs = [
    'run',
    script,
    noPrefix && '--no-prefix',
    '--stream',
    '--parallel',
    ...packages.map(p => ['--scope', p]).flat(),
  ].filter(Boolean)
  return await runCommand({ baseDir, binary: lerna, args: lernaArgs })
}

const runCommand = async ({ baseDir, binary, args }) => {
  const cmd = await spawn(binary, args, {
    cwd: baseDir,
    env: process.env,
  })

  const terminate = signal => () => {
    cmd.kill(signal)
  }

  process.on('exit', terminate('SIGINT'))
  process.on('SIGTERM', terminate('SIGTERM'))
  process.on('SIGINT', terminate('SIGINT'))

  cmd.stdout.on('data', data => log(data))
  cmd.stderr.on('data', data => process.stderr.write(data))
  cmd.on('close', code => {
    log(`Lerna terminated with code ${code}\n`)
  })
}
