const ora = require("ora");
const path = require("path");

const {
  backupConfig,
  configurePackageFiles,
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

const [, , ...args] = process.argv;

const toIsolate = args[0]
  ? args.map(arg => path.resolve(arg))
  : [process.cwd()];

isolatePackages(toIsolate)
  .finally(restoreBackups)
  .catch(e => {
    if (e.stdout) {
      console.error(e.stdout);
    }
    if (e.stderr) {
      console.error(e.stderr);
    }
    console.error(e);
    console.error(e.trace);
    process.exit(255);
  });
