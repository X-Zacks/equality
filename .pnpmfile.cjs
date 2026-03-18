// Allow build scripts for native/bundler packages
function readPackage(pkg) {
  return pkg
}

module.exports = {
  hooks: { readPackage },
  allowedDeprecatedVersions: {},
  // Approve build scripts for these packages
  onlyBuiltDependencies: ['esbuild', 'better-sqlite3', 'node-dpapi'],
}
