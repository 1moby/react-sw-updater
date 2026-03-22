import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface UpdateCheckerNextOptions {
  /** Output filename for the version file. Default: 'version.json' */
  versionFile?: string;
  /** Directory to write version.json. Default: 'public' */
  publicDir?: string;
}

/**
 * Next.js integration for update-checker.
 *
 * Call this in next.config.js/ts to:
 * 1. Generate BUILD_VERSION and write version.json to public/
 * 2. Set NEXT_PUBLIC_BUILD_VERSION env var
 * 3. Optionally define __BUILD_VERSION__ via webpack (when webpack is used)
 *
 * Supports both Turbopack (Next.js 16 default) and webpack bundlers.
 *
 * Usage:
 *   // next.config.ts
 *   import { withUpdateChecker } from '@1moby/react-sw-updater/nextjs';
 *   export default withUpdateChecker({ /* your config *\/ });
 */
export function withUpdateChecker(
  nextConfig: Record<string, unknown> = {},
  options: UpdateCheckerNextOptions = {},
) {
  let gitHash = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
    }).trim();
  } catch {}

  const BUILD_VERSION = `${gitHash}-${Date.now()}`;

  // Write version.json to public directory at config time (runs during build)
  const publicDir = resolve(process.cwd(), options.publicDir ?? 'public');
  const versionFile = options.versionFile ?? 'version.json';
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }
  writeFileSync(
    resolve(publicDir, versionFile),
    JSON.stringify({
      version: BUILD_VERSION,
      gitHash,
      buildTime: new Date().toISOString(),
    }),
  );

  const result: Record<string, unknown> = {
    ...nextConfig,
    env: {
      ...(nextConfig.env as Record<string, string> | undefined),
      NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
    },
    // Ensure Turbopack compatibility — if no turbopack config exists, add an
    // empty one so Next.js 16+ doesn't error when it sees the webpack config.
    turbopack: (nextConfig.turbopack as Record<string, unknown>) ?? {},
    webpack(
      config: { plugins: unknown[] },
      webpackOptions: Record<string, unknown>,
    ) {
      const webpack = require('webpack');
      config.plugins.push(
        new webpack.DefinePlugin({
          __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
        }),
      );

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, webpackOptions);
      }
      return config;
    },
  };

  return result;
}
