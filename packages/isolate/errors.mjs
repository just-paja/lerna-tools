export class PrivatePackageError extends Error {}

PrivatePackageError.prototype.isPrivate = true

export class PackageDoesNotExistError extends Error {
  static fromError(error) {
    const result = new this(error.message)
    result.code = error.code
    result.signal = error.signal
    result.killed = error.killed
    return result
  }
}

export class MisconfiguredFilesError extends Error {
  constructor(packageName) {
    super(
      `Module ${packageName} does not have "files" key configured in package.json`
    )
    this.packageName = packageName
  }
}
