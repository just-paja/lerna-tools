const fs = require('fs')

const { promisify } = require('util')
const { getPackageJsonPath, getPackageLockPath } = require('./paths')

const copyFile = promisify(fs.copyFile)
const mkdir = promisify(fs.mkdir)
const readFile = promisify(fs.readFile)
const rename = promisify(fs.rename)
const stat = promisify(fs.stat)
const unlink = promisify(fs.unlink)
const writeFile = promisify(fs.writeFile)
const write = promisify(fs.write)

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
  readFile,
  readJsonFile,
  readPackage,
  readPackageLock,
  rename,
  stat,
  unlink,
  write,
  writeFile
}
