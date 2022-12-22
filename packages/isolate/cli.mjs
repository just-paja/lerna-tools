import childProcess from 'child_process'

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