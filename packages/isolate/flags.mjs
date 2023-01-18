export const IsolateOptions = {
  ignore: 'ignore',
  isolate: 'isolate',
  versionNeutral: 'version:neutral',
}

export const StoreOptions = {
  root: 'store:root',
  local: 'store:local',
}

export const PackageOptions = {
  npm: 'pack:npm',
  raw: 'pack:raw',
  zip: 'pack:zip',
}

const readFlag = (src, flag, def = false) => {
  const val = src[flag]
  return typeof val === 'undefined' ? def : val
}

class IsolateConfig {
  constructor(manifest) {
    const src = manifest?.isolation || {}
    this.cfg = {
      build: Boolean(manifest.scripts?.build),
      ignore: readFlag(src, IsolateOptions.ignore),
      isolate: readFlag(src, IsolateOptions.isolate, true),
      package: {
        npm: readFlag(src, PackageOptions.npm),
        raw: readFlag(src, PackageOptions.raw),
        zip: readFlag(src, PackageOptions.zip),
      },
      store: {
        root: readFlag(src, StoreOptions.root),
        local: readFlag(src, StoreOptions.local),
      },
      versionNeutral: readFlag(src, IsolateOptions.versionNeutral),
    }
  }

  get build() {
    return this.cfg.build
  }

  get versionNeutral() {
    return this.cfg.versionNeutral
  }

  get ignore() {
    return this.cfg.ignore
  }

  get isolate() {
    return this.cfg.isolate
  }

  get packNpm() {
    return this.cfg.package.npm
  }

  get packRaw() {
    return this.cfg.package.raw
  }

  get packZip() {
    return this.cfg.package.zip
  }

  get storeRoot() {
    return this.cfg.store.root
  }

  get storeLocal() {
    return this.cfg.store.local
  }
}

export const resolveFlags = manifest => new IsolateConfig(manifest)
