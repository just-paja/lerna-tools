# `lerna-jest`

Oversimplify jest configuration for common use cases.

## Install

```
npm install -d jest lerna-jest
```

## Configure

1. Create file `jest.config.js` in your lerna root.

```
const { guessRootConfig } = require('lerna-jest')
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

## Magic setup files

Create these files on the lerna root level or inside the project and they will be automatically used to configure jest environment:

* `jest.setup.js` goes in [setupFiles](https://jestjs.io/docs/en/configuration#setupfiles-array).
* `jest.afterEnv.js` goes in [setupFilesAfterEnv](https://jestjs.io/docs/en/configuration#setupfilesafterenv-array)

## Magic plugins

Some plugins are automatically recognized, you only need to install them:

* [jest-date-mock](https://www.npmjs.com/package/jest-date-mock)
* [jest-enzyme](https://www.npmjs.com/package/jest-enzyme)
* [jest-extended](https://www.npmjs.com/package/jest-extended)
* [jest-runner-eslint](https://www.npmjs.com/package/jest-runner-eslint)
* [jest-runner-standard](https://www.npmjs.com/package/jest-runner-standard)
* [jest-watch-select-projects](https://www.npmjs.com/package/jest-watch-select-projects)
* [jest-watch-typeahead](https://www.npmjs.com/package/jest-watch-typeahead)
