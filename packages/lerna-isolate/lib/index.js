const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const tmp = require("tmp-promise");

const { promisify } = require("util");

const access = promisify(fs.access);
const copyFile = promisify(fs.copyFile);
const exec = promisify(childProcess.exec);
const lstat = promisify(fs.lstat);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const read = promisify(fs.read);
const readFile = promisify(fs.readFile);
const realpath = promisify(fs.realpath);
const write = promisify(fs.write);
const writeFile = promisify(fs.writeFile);

const backups = {};

function getModulesPath(workPath) {
  return path.join(workPath, "node_modules");
}

function getDepsPath(workPath) {
  return path.join(workPath, "node_deps");
}

function getPackageJsonPath(workPath) {
  return path.join(workPath, "package.json");
}

function getPackageLockPath(workPath) {
  return path.join(workPath, "package-lock.json");
}

async function readJsonFile(workPath) {
  return JSON.parse(await readFile(workPath));
}

async function readPackage(workPath) {
  return readJsonFile(getPackageJsonPath(workPath));
}

async function getLinkedModules(workPath) {
  const modulesPath = getModulesPath(workPath);
  const nodes = await readdir(modulesPath, { withFileTypes: true });
  const links = await Promise.all(
    nodes
      .filter(item => item.isSymbolicLink())
      .map(link =>
        realpath(path.join(modulesPath, link.name)).then(modulePath => ({
          modulePath,
          name: link.name
        }))
      )
  );
  return links;
}

async function execute(cmd, options) {
  return await new Promise((resolve, reject) => {
    childProcess.exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stderr, stdout });
      }
    });
  });
}

async function packModule(linkedModule) {
  const { modulePath, name } = linkedModule;
  const { stdout } = await execute("npm pack", {
    cwd: modulePath
  });
  return {
    ...linkedModule,
    archive: path.join(modulePath, stdout.trim())
  };
}

class PrivatePackageError extends Error {
  isPrivate = true;
}

class PackageDoesNotExistError extends Error {
  static fromError(error) {
    const result = new this(error.message);
    result.code = error.code;
    result.signal = error.signal;
    result.killed = error.killed;
    return result;
  }
}

class MisconfiguredFilesError extends Error {
  constructor(packageName) {
    super(
      `Module ${packageName} does not have "files" key configured in package.json`
    );
    this.packageName = packageName;
  }
}

async function installPublishedVersion(workPath, linkedModule) {
  const { modulePath, name } = linkedModule;
  const linkedPackage = await readPackage(modulePath);
  if (linkedPackage.private) {
    throw new PrivatePackageError(
      `Cannot install ${name}@${linkedPackage.version} because it is private`
    );
  }
  try {
    await execute(
      `npm install ${name}@${linkedPackage.version} --only=production --no-optional`,
      {
        cwd: workPath
      }
    );
  } catch (e) {
    if (e.code === 1) {
      throw PackageDoesNotExistError.fromError(e);
    }
    throw e;
  }
}

async function storeModule(workPath, packedModule) {
  const packagePath = path.join(
    getDepsPath(workPath),
    path.basename(packedModule.archive)
  );
  await copyFile(packedModule.archive, packagePath);
  return {
    ...packedModule,
    packagePath
  };
}

async function storeDeps(workPath, packedModules) {
  const results = [];
  if (packedModules.length) {
    try {
      await mkdir(getDepsPath(workPath));
    } catch (e) {}
  }
  for (const packedModule of packedModules) {
    results.push(await storeModule(workPath, packedModule));
  }
  return results;
}

async function integrateModule(workPath, linkedModule) {
  try {
    return await installPublishedVersion(workPath, linkedModule);
  } catch (e) {
    if (
      e instanceof PrivatePackageError ||
      e instanceof PackageDoesNotExistError
    ) {
      return await packModule(linkedModule);
    } else {
      throw e;
    }
  }
}

async function hasModules(workPath) {
  try {
    await access(getModulesPath(workPath));
    return true;
  } catch (e) {
    return false;
  }
}

async function installDepsSafe(workPath) {
  return await execute("npm ci --only=production --no-optional", {
    cwd: workPath
  });
}

async function installDepsFresh(workPath) {
  return await execute("npm install --only=production --no-optional", {
    cwd: workPath
  });
}

async function installDeps(workPath) {
  try {
    await readPackageLock(workPath);
    return await installDepsSafe(workPath);
  } catch (e) {
    return await installDepsFresh(workPath);
  }
}

async function integrateModules(workPath, linkedModules) {
  const results = [];

  for (const linkedModule of linkedModules) {
    const result = await integrateModule(workPath, linkedModule);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

async function installStoredDeps(workPath, storedDeps) {
  const deps = storedDeps.map(storedDep => storedDep.packagePath);
  await execute(
    `npm install ${deps.join(" ")} --only=production --no-optional`,
    {
      cwd: workPath
    }
  );
}

async function configurePackageFiles(workPath) {
  const npmPackage = await readPackage(workPath);
  if (!npmPackage.files) {
    throw new MisconfiguredFilesError(npmPackage.name);
  }
  const depsPattern = "node_deps";
  if (!npmPackage.files.includes(depsPattern)) {
    const configured = {
      ...npmPackage,
      files: [...npmPackage.files, depsPattern]
    };
    await writeFile(
      getPackageJsonPath(workPath),
      JSON.stringify(configured, undefined, 2)
    );
    return configured;
  }
}

async function readPackageLock(workPath) {
  return readJsonFile(getPackageLockPath(workPath));
}

async function backupFile(filePath) {
  const tmpFile = await tmp.file();
  await write(tmpFile.fd, await readFile(filePath));
  backups[filePath] = tmpFile;
  return tmpFile;
}

async function restoreBackups() {
  for (const [filePath, tmpFile] of Object.entries(backups)) {
    await writeFile(filePath, await readFile(tmpFile.path));
    await tmpFile.cleanup();
  }
}

async function backupConfig(workPath) {
  return Promise.all([
    backupFile(getPackageJsonPath(workPath)),
    backupFile(getPackageLockPath(workPath))
  ]);
}

async function isolatePackageDeps(workPath) {
  const npmPackage = await readPackage(workPath);
  const linkedModules = await getLinkedModules(workPath);

  if (linkedModules.length) {
    const packedDeps = await integrateModules(workPath, linkedModules);
    const storedDeps = await storeDeps(workPath, packedDeps);
    await installStoredDeps(workPath, storedDeps);
  }
}

module.exports = {
  backupConfig,
  configurePackageFiles,
  installDeps,
  isolatePackageDeps,
  readPackage,
  readPackageLock,
  restoreBackups,
  packModule
};
