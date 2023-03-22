import { findRoot } from './paths.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'
import { log } from './cli.mjs'

const extractProjectScope = p => p.name.split('/')[0]
const extractPackageName = p => p.name.split('/')[1]
const filterUnique = (item, index, src) => src.indexOf(item) === index

export const padScope = scope => {
  if (!scope) {
    return null
  }
  return scope.startsWith('@') ? scope : `@${scope}`
}

export const getPackages = async ({ exact, scope, withScript } = {}) => {
  const root = await findRoot()
  const project = new IsolatedProject(root)
  let packages = await project.getPackages()
  if (scope) {
    const projectScope = padScope(scope)
    packages = packages.filter(p => p.name.startsWith(`${projectScope}/`))
  }
  if (withScript) {
    packages = packages.filter(p => p.scripts[withScript])
  }
  if (exact) {
    packages = packages.filter(p => extractPackageName(p).startsWith(exact))
  }
  return packages
}

export const getPackageNames = async ({ noScope = false, ...args } = {}) => {
  const packages = await getPackages(args)
  if (noScope) {
    return packages.map(extractPackageName)
  }
  return packages.map(p => p.name)
}

export const getScopes = async args => {
  const packages = await getPackages(args)
  return packages.map(extractProjectScope).filter(filterUnique)
}

export const printScopes = async args => {
  const scopes = await getScopes(args)
  scopes.map(log)
}

export const printPackages = async args => {
  const packages = await getPackageNames({
    ...args,
    noScope: Boolean(args.scope),
  })
  packages.map(log)
}
