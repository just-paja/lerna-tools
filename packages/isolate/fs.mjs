import rimraf from 'rimraf'

import { access, symlink, unlink } from 'fs/promises'

export const rmrf = rimraf

export async function ensureSymlink(...args) {
  try {
    await symlink(...args)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

export async function ensureUnlink(...args) {
  try {
    await unlink(...args)
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e
    }
  }
}

export const exists = async path => {
  try {
    await access(path)
    return path
  } catch (e) {
    if (e.code === 'ENOENT') {
      return null
    }
    throw e
  }
}
