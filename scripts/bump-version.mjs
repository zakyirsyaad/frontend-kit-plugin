#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function getChangelogVersion(content) {
  const match = content.match(/^##\s+\[([0-9a-zA-Z.-]+)\]/m);
  return match ? match[1] : null;
}

export function readProjectVersions(rootDir) {
  const pluginJsonPath = path.join(rootDir, '.claude-plugin', 'plugin.json');
  const claudeMarketplaceJsonPath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
  const rootMarketplaceJsonPath = path.join(rootDir, 'marketplace.json');
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');

  const result = {
    pluginJson: null,
    claudeMarketplace: null,
    rootMarketplace: null,
    changelog: null,
    errors: [],
  };

  if (fs.existsSync(pluginJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      result.pluginJson = data.version || null;
    } catch (err) {
      result.errors.push(`Error reading ${pluginJsonPath}: ${err.message}`);
    }
  } else {
    result.errors.push(`Missing file: ${pluginJsonPath}`);
  }

  if (fs.existsSync(claudeMarketplaceJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(claudeMarketplaceJsonPath, 'utf8'));
      result.claudeMarketplace = data.plugins?.[0]?.version || null;
    } catch (err) {
      result.errors.push(`Error reading ${claudeMarketplaceJsonPath}: ${err.message}`);
    }
  } else {
    result.errors.push(`Missing file: ${claudeMarketplaceJsonPath}`);
  }

  if (fs.existsSync(rootMarketplaceJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rootMarketplaceJsonPath, 'utf8'));
      result.rootMarketplace = data.plugins?.[0]?.version || null;
    } catch (err) {
      result.errors.push(`Error reading ${rootMarketplaceJsonPath}: ${err.message}`);
    }
  } else {
    result.errors.push(`Missing file: ${rootMarketplaceJsonPath}`);
  }

  if (fs.existsSync(changelogPath)) {
    try {
      const content = fs.readFileSync(changelogPath, 'utf8');
      result.changelog = getChangelogVersion(content);
    } catch (err) {
      result.errors.push(`Error reading ${changelogPath}: ${err.message}`);
    }
  } else {
    result.errors.push(`Missing file: ${changelogPath}`);
  }

  return result;
}

export function checkVersions(rootDir, expectedVersion = null) {
  const versions = readProjectVersions(rootDir);
  const mismatches = [];

  if (versions.errors.length > 0) {
    return {
      synced: false,
      versions,
      errors: versions.errors,
      mismatches,
    };
  }

  const allVersions = [
    { target: '.claude-plugin/plugin.json', ver: versions.pluginJson },
    { target: '.claude-plugin/marketplace.json', ver: versions.claudeMarketplace },
    { target: 'marketplace.json', ver: versions.rootMarketplace },
    { target: 'CHANGELOG.md (latest entry)', ver: versions.changelog },
  ];

  const targetVer = expectedVersion || versions.pluginJson;

  if (expectedVersion && !SEMVER_REGEX.test(expectedVersion)) {
    return {
      synced: false,
      versions,
      errors: [`Invalid expected version format: "${expectedVersion}". Expected valid SemVer.`],
      mismatches,
    };
  }

  for (const item of allVersions) {
    if (item.ver !== targetVer) {
      mismatches.push(`${item.target}: "${item.ver}" !== "${targetVer}"`);
    }
  }

  return {
    synced: mismatches.length === 0,
    targetVersion: targetVer,
    versions,
    errors: [],
    mismatches,
  };
}

export function bumpVersion(rootDir, newVersion) {
  if (!SEMVER_REGEX.test(newVersion)) {
    throw new Error(`Invalid semver version: "${newVersion}"`);
  }

  const pluginJsonPath = path.join(rootDir, '.claude-plugin', 'plugin.json');
  const claudeMarketplaceJsonPath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
  const rootMarketplaceJsonPath = path.join(rootDir, 'marketplace.json');
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');

  // Update .claude-plugin/plugin.json
  if (fs.existsSync(pluginJsonPath)) {
    const data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    data.version = newVersion;
    fs.writeFileSync(pluginJsonPath, JSON.stringify(data, null, 2) + '\n');
  }

  // Update .claude-plugin/marketplace.json
  if (fs.existsSync(claudeMarketplaceJsonPath)) {
    const data = JSON.parse(fs.readFileSync(claudeMarketplaceJsonPath, 'utf8'));
    if (Array.isArray(data.plugins)) {
      for (const p of data.plugins) {
        p.version = newVersion;
      }
    }
    fs.writeFileSync(claudeMarketplaceJsonPath, JSON.stringify(data, null, 2) + '\n');
  }

  // Update marketplace.json
  if (fs.existsSync(rootMarketplaceJsonPath)) {
    const data = JSON.parse(fs.readFileSync(rootMarketplaceJsonPath, 'utf8'));
    if (Array.isArray(data.plugins)) {
      for (const p of data.plugins) {
        p.version = newVersion;
      }
    }
    fs.writeFileSync(rootMarketplaceJsonPath, JSON.stringify(data, null, 2) + '\n');
  }

  // Update CHANGELOG.md
  if (fs.existsSync(changelogPath)) {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    const existingVer = getChangelogVersion(content);

    if (existingVer !== newVersion) {
      const updated = content.replace(
        /^##\s+\[([0-9a-zA-Z.-]+)\].*$/m,
        `## [${newVersion}] - ${today}\n\n### Changed\n- Bump version to ${newVersion}.\n\n## [$1]`
      );
      fs.writeFileSync(changelogPath, updated);
    }
  }

  return checkVersions(rootDir, newVersion);
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const nonFlags = args.filter((a) => !a.startsWith('--'));
  const versionArg = nonFlags[0] || null;
  const rootDir = process.cwd();

  if (isCheck) {
    const result = checkVersions(rootDir, versionArg);
    if (!result.synced) {
      console.error('❌ Version check failed:');
      for (const err of result.errors) console.error(`  - ${err}`);
      for (const mismatch of result.mismatches) console.error(`  - ${mismatch}`);
      process.exit(1);
    }
    console.log(`✔ All version manifests and CHANGELOG are synchronized at v${result.targetVersion}`);
    process.exit(0);
  }

  if (!versionArg) {
    console.error('Usage: node scripts/bump-version.mjs <ver> [--check]');
    process.exit(1);
  }

  try {
    const result = bumpVersion(rootDir, versionArg);
    if (!result.synced) {
      console.error('❌ Bumped version but check failed:');
      for (const mismatch of result.mismatches) console.error(`  - ${mismatch}`);
      process.exit(1);
    }
    console.log(`✔ Successfully bumped all manifests and CHANGELOG to v${versionArg}`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Error bumping version: ${err.message}`);
    process.exit(1);
  }
}
