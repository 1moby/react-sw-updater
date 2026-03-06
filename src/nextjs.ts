import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
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
 * Call this in next.config.js to:
 * 1. Generate BUILD_VERSION and write version.json to public/
 * 2. Define __BUILD_VERSION__ as a webpack global
 *
 * Usage:
 *   // next.config.js
 *   const { withUpdateChecker } = require('update-checker/nextjs');
 *   module.exports = withUpdateChecker({
 *     // your Next.js config
 *   });
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
  writeFileSync(
    resolve(publicDir, versionFile),
    JSON.stringify({
      version: BUILD_VERSION,
      gitHash,
      buildTime: new Date().toISOString(),
    }),
  );

  return {
    ...nextConfig,
    env: {
      ...(nextConfig.env as Record<string, string> | undefined),
      NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
    },
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
}
