const fs = require('fs')
const path = require('path')

const configName = 'lerna.json'

async function findRoot (start) {
  start = start || module.parent.filename
  if (typeof start === 'string') {
    if (start[start.length - 1] !== path.sep) {
      start += path.sep
    }
    start = path.normalize(start)
    start = start.split(path.sep)
  }
  if (!start.length) {
    throw new Error('Could not find lerna root')
  }
  start.pop()
  var dir = start.join(path.sep)
  var fullPath = path.join(dir, configName)
  if (fs.existsSync(fullPath)) {
    if (!fs.lstatSync(fullPath).isDirectory()) {
      return dir
    }
    return path.normalize(fullPath)
  } else {
    return findRoot(start)
  }
}

function getModulesPath (workPath) {
  return path.join(workPath, 'node_modules')
}

function getDepsPath (workPath) {
  return path.join(workPath, 'node_deps')
}

function getPackageJsonPath (workPath) {
  return path.join(workPath, 'package.json')
}

function getPackageLockPath (workPath) {
  return path.join(workPath, 'package-lock.json')
}

function getDistPath (workPath) {
  return path.join(workPath, 'dist')
}

module.exports = {
  findRoot,
  getDepsPath,
  getDistPath,
  getModulesPath,
  getPackageJsonPath,
  getPackageLockPath
}
