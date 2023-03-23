import childProcess from 'child_process'

export const log = (
  message,
  { clear = false, padding = 0, newline = true } = {}
) => {
  if (clear) {
    process.stdout.write('\r')
  }
  if (padding) {
    process.stdout.write(Array(padding).fill(' ').join(''))
  }
  process.stdout.write(message)
  if (newline) {
    process.stdout.write('\n')
  }
}

const coverProcess = cfg => {
  const terminate = signal => () => {
    cfg.inst.kill(signal)
  }
  const exit = terminate('SIGINT')
  const term = terminate('SIGTERM')
  const int = terminate('SIGINT')
  process.on('exit', exit)
  process.on('SIGTERM', term)
  process.on('SIGINT', int)
  return () => {
    process.removeListener('exit', exit)
    process.removeListener('SIGTERM', term)
    process.removeListener('SIGINT', int)
  }
}

export async function execute(cmd, args, options) {
  return await new Promise((resolve, reject) => {
    const cfg = {}
    const clear = coverProcess(cfg)
    let stderr = ''

    cfg.inst = childProcess.spawn(cmd, args, options)
    cfg.inst.stderr.on('data', data => (stderr += data))
    cfg.inst.on('close', code => {
      clear()
      if (code === 0) {
        resolve()
      } else {
        const err = new Error(
          `The npm command "${cmd} ${args.join(' ')}" failed`
        )
        err.code = code
        err.stack = err.stack += stderr
        reject(err)
      }
    })
    cfg.inst.on('error', e => {
      e.stack = e.stack += stderr
      reject(e)
    })
  })
}
