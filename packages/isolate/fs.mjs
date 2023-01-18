import { symlink, unlink } from 'fs/promises'

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
