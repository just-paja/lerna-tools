const {
  promises: { readFile }
} = require('fs')

const { getPackageJsonPath, getPackageLockPath } = require('./paths')

async function readJsonFile (workPath) {
  return JSON.parse(await readFile(workPath))
}

async function readPackage (workPath) {
  return readJsonFile(getPackageJsonPath(workPath))
}

async function readPackageLock (workPath) {
  return readJsonFile(getPackageLockPath(workPath))
}

module.exports = {
  readJsonFile,
  readPackage,
  readPackageLock
}
