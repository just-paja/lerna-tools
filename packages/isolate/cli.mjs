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

export async function execute(cmd, options) {
  return await new Promise((resolve, reject) => {
    childProcess.exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stdout
        err.stderr = stderr
        reject(err)
      } else {
        resolve({ stderr, stdout })
      }
    })
  })
}
