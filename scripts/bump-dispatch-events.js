#!/usr/bin/env node

/**
 * Bump @theharuspex/notion-dispatch-events dependency
 * 
 * Usage:
 *   node scripts/bump-dispatch-events.js           # bumps to latest
 *   node scripts/bump-dispatch-events.js 1.2.3     # bumps to specific version
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = '@theharuspex/notion-dispatch-events';
const PACKAGE_PATH = path.join(__dirname, '..', 'node_modules', PACKAGE_NAME, 'package.json');

// Get version from command line args (skip 'node' and script path)
const args = process.argv.slice(2);
const versionArg = args.find(arg => !arg.startsWith('--'));
const version = versionArg || 'latest';

console.log(`Bumping ${PACKAGE_NAME} to ${version}...`);

try {
  // Run npm install
  const installCmd = `npm install ${PACKAGE_NAME}@${version}`;
  console.log(`Running: ${installCmd}`);
  execSync(installCmd, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  // Verify package exists and read version
  if (!fs.existsSync(PACKAGE_PATH)) {
    console.error(`Error: ${PACKAGE_NAME} not found in node_modules after install`);
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  const installedVersion = packageJson.version;

  if (!installedVersion) {
    console.error(`Error: Could not read version from ${PACKAGE_PATH}`);
    process.exit(1);
  }

  console.log(`\n✅ Successfully installed ${PACKAGE_NAME}@${installedVersion}`);
  console.log('\nSuggested commit message:');
  console.log(`chore(deps): bump notion-dispatch-events to ${installedVersion}`);
  console.log('\nNext steps:');
  console.log('  git add package.json package-lock.json');
  console.log(`  git commit -m "chore(deps): bump notion-dispatch-events to ${installedVersion}"`);
  console.log('  git push origin main');

} catch (error) {
  console.error(`\n❌ Failed to bump ${PACKAGE_NAME}:`, error.message);
  process.exit(1);
}
