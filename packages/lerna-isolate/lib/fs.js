const fs = require('fs')

const { promisify } = require('util')
const { getPackageJsonPath, getPackageLockPath } = require('./paths')

const copyFile = promisify(fs.copyFile)
const mkdir = promisify(fs.mkdir)
const readFile = promisify(fs.readFile)
const rename = promisify(fs.rename)
const write = promisify(fs.write)
const writeFile = promisify(fs.writeFile)

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
  copyFile,
  mkdir,
  rename,
  readFile,
  readJsonFile,
  readPackage,
  readPackageLock,
  write,
  writeFile
}
