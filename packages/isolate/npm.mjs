import { execute } from './cli.mjs'
import { file, dir } from 'tmp-promise'
import { join } from 'path'
import { rename } from 'fs/promises'
import { rmrf } from './fs.mjs'

export const packageProject = async ({ cwd, packageName }) => {
  const tmpDir = await dir()
  const dest = await file({ postfix: packageName })
  await execute('npm', ['pack', '--pack-destination', tmpDir.path], {
    cwd,
  })
  await rename(join(tmpDir.path, packageName), dest.path)
  await rmrf(tmpDir.path)
  return dest
}
