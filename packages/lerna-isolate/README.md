# lerna-isolate

**Extract your app** or lib as npm package from lerna repository **with local**/private package **dependencies** ready to be shipped to your server. Very helpful when using Continuous deployment with lerna and Docker bundling.

## What does this do

Let's say you have multiple packages in your monorepo and they depend on some local packages. There is an example of the minimal monorepo. Lerna isolate will put outputs into your lerna root `dist` directory, so make sure you've got it in `.gitignore`.

```
├── lerna.json
├── node_modules
├── package.json
├── package-lock.json
└── packages
    ├── lib1 (published to npm repo)
    ├── lib2 (private)
    └── app
```

**Also**, let's say that app depends on lib1 and lib2.

### Problems

1. You can't deploy the app before lib1 is published to registry
2. You can't deploy the app without lib2, which is a private package

### Solution

Bundle it together.

```shell
lerna-isolate bundle app
```

The isolation script will bundle only packages that are not available in the configured npm registry. It also changes `package.json` and `package-lock.json` inside the package.

The output will be `npm packed` package compressed as `tgz`.

## Installation

Either install this globally

```shell
npm -g install lerna-isolate
```

Or just use npx

```shell
npx lerna-isolate
```

## Usage

Leverage the CLI text help for your convenience.

### List available packages

List packages that can be bundled

```shell
lerna-isolate list
```

### Bundle packages

Bundle one or more packages. A package name(s) or a path(s) can be given.

```shell
lerna isolate bundle app
```

### Produce extracted outputs

This is useful when you want to examine contents of the isolated build.

```shell
lerna isolate bundle -e
```

### Produce zip

Sometimes, it is more useful to produce zip file instead of npm package. One example could be that you're uploading Google Cloud Platform Function archive. Private dependencies are still bundled in.

```shell
lerna isolate bundle -e
```
