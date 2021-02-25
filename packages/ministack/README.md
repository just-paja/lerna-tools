# `lerna-ministack`

Accelerates first steps when creating npm project with lerna. Includes tools for testing, linting, prettying and packaging.

## Installation

```shell
npm install --save-dev lerna-ministack
```

## Configuration

Change following in your package.json

```json
{
  "scripts": {
    "test": "jest"
  },
  "standard": {
    "env": [
      "jest"
    ],
    "parser": "babel-eslint"
  },
}
```

Create `jest.config.js`. If you wish to configure it further, see [lerna-jest](https://npmjs.com/package/lerna-jest).

```javascript
module.exports = require('lerna-jest').guessRootConfig(__dirname)
```

## What's inside

* [Standard.js](https://standardjs.com) for coding style
* [Prettier](https://prettier.io) for maintaining the coding style with preconfigured Standard.js
* [Jest](https://jestjs.io) for testing with autoconfiguration via [lerna-jest](https://www.npmjs.com/package/lerna-jest) for each lerna project
* [lerna-isolate](https://www.npmjs.com/package/lerna-isolate) for extraction of your private lerna packages
