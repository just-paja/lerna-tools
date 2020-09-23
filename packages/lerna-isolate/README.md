# lerna-isolate

Extract your app from lerna repository with local package dependencies ready to be shipped to your server. Very helpful when using docker.

**Danger!** This tool is at experimental stage. Feel free to test it on your apps, but beware that this covers only very basic scenarios.

## What does this do

Let's say you have multiple packages in your monorepo and they depend on some local packages. There is an example of the minimal monorepo.

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
lerna-isolate app
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
$ lerna-isolate list
```

### Bundle packages

Bundle one or more packages. A package name(s) or a path(s) can be given.

```shell
$ lerna isolate bundle app
```
