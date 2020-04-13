const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const { promisify } = require("util");

const access = promisify(fs.access);
const copyFile = promisify(fs.copyFile);
const exec = promisify(childProcess.exec);
const lstat = promisify(fs.lstat);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const realpath = promisify(fs.realpath);

function log(message) {
  process.stderr.write(message);
  process.stderr.write("\n");
}

function getModulesPath(workPath) {
  return path.join(workPath, "node_modules");
}

function getDepsPath(workPath) {
  return path.join(workPath, "node_deps");
}

async function readJsonFile(packagePath) {
  return JSON.parse(await readFile(packagePath));
}

async function readPackage(packageDir) {
  return readJsonFile(path.join(packageDir, "package.json"));
}

async function getLinkedModules(modulesPath) {
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
  log(`Packing ${name}`);
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
    log(`Installed ${name}@${linkedPackage.version} from registry`);
  } catch (e) {
    if (e.code === 1) {
      throw PackageDoesNotExistError.fromError(e);
    }
    throw e;
  }
}

async function storeModule(workPath, packedModule) {
  log(`Storing ${packedModule.name}`);
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

async function ensureModulesInstalled(workPath) {
  if (!(await hasModules(workPath))) {
    log(`Installing node modules`);
    await execute("npm ci --only=production --no-optional", {
      cwd: workPath
    });
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
  log(`Installing local dependencies`);
  const deps = storedDeps.map(storedDep => storedDep.packagePath);
  await execute(
    `npm install ${deps.join(" ")} --only=production --no-optional`,
    {
      cwd: workPath
    }
  );
}

async function debootstrap(workPath) {
  const npmPackage = await readPackage(workPath);

  await ensureModulesInstalled(workPath);
  const modulesPath = getModulesPath(workPath);
  const linkedModules = await getLinkedModules(modulesPath);

  if (linkedModules.length) {
    log(`Isolating ${npmPackage.name}`);
    const packedDeps = await integrateModules(workPath, linkedModules);
    const storedDeps = await storeDeps(workPath, packedDeps);
    await installStoredDeps(workPath, storedDeps);
  }

  log(`Isolated ${npmPackage.name}`);
  await packModule({
    modulePath: workPath,
    name: npmPackage.name
  });
}

const [, , ...args] = process.argv;

debootstrap(args[0] ? path.resolve(args[0]) : process.cwd()).catch(e => {
  if (e.stdout) {
    console.error(e.stdout);
  }
  if (e.stderr) {
    console.error(e.stderr);
  }
  console.error(e);
  process.exit(255);
});
