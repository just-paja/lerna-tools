const os = require("os");
const fs = require("fs");
const ora = require("ora");
const path = require("path");
const yargs = require("yargs");

const {
  backupConfig,
  configurePackageFiles,
  execute,
  getModulesPath,
  installDeps,
  isolatePackageDeps,
  packModule,
  readPackage,
  readPackageLock,
  restoreBackups
} = require("../lib");

function log(message) {
  process.stdout.write(message);
  process.stdout.write("\n");
}

function advise(message) {
  process.stderr.write(message);
  process.stderr.write("\n");
}

async function isolatePackage(workingPath, onProgress) {
  try {
    const reportProgress = status => onProgress(status / 7);
    const npmPackage = await readPackage(workingPath);
    reportProgress(1);
    const configured = await configurePackageFiles(workingPath);
    reportProgress(2);
    let lock;
    try {
      lock = await readPackageLock(workingPath);
    } catch (e) {}
    reportProgress(3);
    await installDeps(workingPath);
    reportProgress(4);
    await backupConfig(workingPath);
    reportProgress(5);
    await isolatePackageDeps(workingPath);
    reportProgress(6);
    return await packModule({
      modulePath: workingPath,
      name: npmPackage.name,
      configuredFiles: Boolean(configured),
      configuredLock: !lock,
      version: npmPackage.version
    });
  } finally {
    await restoreBackups();
  }
}

async function isolatePackages(packages) {
  const results = [];
  const spinner = ora("Isolating packages").start();

  for (const packagePath of packages) {
    const npmPackage = await readPackage(packagePath);
    spinner.text = `Isolating ${npmPackage.name}`;
    results.push(
      await isolatePackage(packagePath, percent => {
        spinner.prefixText = `${Math.round(percent * 100)}%`;
      })
    );
    spinner.prefixText = "";
    spinner.succeed(`Isolated ${npmPackage.name}`);
  }

  spinner.stop();

  if (results.some(result => result.configuredFiles)) {
    advise(`Configured package.json to include bundled dependencies`);
  }
  if (results.some(result => result.configuredLock)) {
    advise(
      `Created package-lock.json. Consider store this file inside the repository so you can track dependency changes.`
    );
  }
  advise("Created:");
  const paths = results
    .map(res => path.relative(process.cwd(), res.archive))
    .forEach(archive => log(`  ${archive}`));
}

const configName = "lerna.json";

async function findRoot(start) {
  start = start || module.parent.filename;
  if (typeof start === "string") {
    if (start[start.length - 1] !== path.sep) {
      start += path.sep;
    }
    start = path.normalize(start);
    start = start.split(path.sep);
  }
  if (!start.length) {
    throw new Error(`Could not find lerna root`);
  }
  start.pop();
  var dir = start.join(path.sep);
  var fullPath = path.join(dir, configName);
  if (fs.existsSync(fullPath)) {
    if (!fs.lstatSync(fullPath).isDirectory()) {
      return dir;
    }
    return path.normalize(fullPath);
  } else {
    return findRoot(start);
  }
}

async function getPackages() {
  const root = await findRoot(process.cwd());
  const { stdout } = await execute("lerna list -a --loglevel=error");
  const modulesPath = getModulesPath(root);
  return stdout
    .split(os.EOL)
    .filter(row => row.includes("PRIVATE"))
    .map(row => row.split(" "))
    .map(([pkg]) => path.resolve(path.join(modulesPath, pkg)));
}

async function resolvePackages(packageList) {
  const available = await getPackages();
  if (packageList.length) {
    return packageList.map(
      arg =>
        available.find(availablePkg => path.basename(availablePkg) === arg) ||
        path.resolve(arg)
    );
  }
  return available;
}

async function bundleContent(packageList) {
  try {
    const packages = await resolvePackages(packageList);
    await isolatePackages(packages);
  } catch (e) {
    if (e.stdout) {
      console.error(e.stdout);
    }
    if (e.stderr) {
      console.error(e.stderr);
    }
    console.error(e);
    console.error(e.trace);
    process.exit(255);
  }
}

async function printPackages() {
  const packages = await getPackages();
  for (const pkg of packages) {
    log(path.basename(pkg));
  }
}

argv = yargs
  .command(
    "bundle [packages..]",
    "bundle packages",
    yargs => {
      yargs.positional("packages", {
        describe: "list of packages"
      });
    },
    argv => bundleContent(argv.packages)
  )
  .command("list", "list packages", printPackages)
  .help("h")
  .alias("h", "help")
  .demandCommand().argv;
