import { findRoot } from './paths.mjs'
import { IsolatedProject } from './IsolatedProject.mjs'
import { log } from './cli.mjs'
import {
  extractPackageName,
  extractProjectScope,
  filterUnique,
} from './names.mjs'

export const getPackages = async kwargs => {
  const root = await findRoot()
  const project = new IsolatedProject(root)
  return await project.filterPackages(kwargs)
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
