import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

export interface UpdateCheckerPluginOptions {
  /**
   * Path to SW template file (relative to project root).
   * __BUILD_VERSION__ placeholders will be replaced with the generated version.
   * If not provided, no SW processing is done.
   */
  swSrc?: string;
  /** Output filename for the processed SW. Default: 'sw.js' */
  swDest?: string;
  /** Output filename for the version file. Default: 'version.json' */
  versionFile?: string;
}

/**
 * Vite plugin that handles everything needed for update-checker:
 *
 * 1. Generates a deterministic BUILD_VERSION (gitHash-timestamp)
 * 2. Defines __BUILD_VERSION__ as a global constant in the JS bundle
 * 3. Writes version.json to the output directory
 * 4. Processes SW template (replaces __BUILD_VERSION__ placeholder)
 * 5. Deduplicates React (prevents dual-instance issues with local installs)
 *
 * Usage:
 *   import { updateChecker } from 'update-checker/vite'
 *   export default defineConfig({
 *     plugins: [react(), tailwindcss(), updateChecker({ swSrc: 'src/sw.js' })],
 *   })
 */
export function updateChecker(
  options: UpdateCheckerPluginOptions = {},
): Plugin {
  let gitHash = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
    }).trim();
  } catch {}

  const BUILD_VERSION = `${gitHash}-${Date.now()}`;
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'update-checker',

    config() {
      return {
        define: {
          __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
        },
        resolve: {
          dedupe: ['react', 'react-dom'],
        },
      };
    },

    configResolved(config) {
      resolvedConfig = config;
    },

    closeBundle() {
      const outDir = resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      );

      // Write version.json
      const versionFile = options.versionFile ?? 'version.json';
      writeFileSync(
        resolve(outDir, versionFile),
        JSON.stringify({
          version: BUILD_VERSION,
          gitHash,
          buildTime: new Date().toISOString(),
        }),
      );

      // Process SW template if provided
      if (options.swSrc) {
        const swSrcPath = resolve(resolvedConfig.root, options.swSrc);
        if (existsSync(swSrcPath)) {
          const swSource = readFileSync(swSrcPath, 'utf-8');
          const swDest = options.swDest ?? 'sw.js';
          writeFileSync(
            resolve(outDir, swDest),
            swSource.replace(/__BUILD_VERSION__/g, BUILD_VERSION),
          );
        } else {
          console.warn(
            `  [update-checker] SW source not found: ${swSrcPath}`,
          );
        }
      }

      console.log(`\n  [update-checker] Build version: ${BUILD_VERSION}\n`);
    },
  };
}
