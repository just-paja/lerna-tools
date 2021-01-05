# `lerna-jest`

Oversimplify jest configuration for common use cases.

## Install

```
npm install -d lerna-jest
```

## Configure

1. Create file `jest.config.js` in your lerna root.

```
const { guessRootConfig } = require('@lerna-tools/jest')
process.env.NODE_PATH = require('path').join(__dirname, 'packages')
module.exports = guessRootConfig(__dirname)
```

2. Configure test script in lerna root `package.json`.

```
{
  "scripts": {
    "test": "jest"
  }
}
```

If you fit the common use cases = you've got some tests and a linter, then you're done for all of your projects. Now you can just use common npm interface to run tests.

```
npm test -- --watch
```
