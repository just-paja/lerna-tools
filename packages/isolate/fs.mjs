import { access, symlink } from 'fs/promises'
import { rimraf } from 'rimraf'
import { unlinkSync } from 'fs'

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

export function ensureUnlink(...args) {
  try {
    unlinkSync(...args)
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
