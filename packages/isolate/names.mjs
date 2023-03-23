export const extractProjectScope = p => p.name.split('/')[0]
export const extractPackageName = p => p.name.split('/')[1]
export const filterUnique = (item, index, src) => src.indexOf(item) === index

export const padScope = scope => {
  if (!scope) {
    return null
  }
  return scope.startsWith('@') ? scope : `@${scope}`
}
