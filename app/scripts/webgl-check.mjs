#!/usr/bin/env node
/*
 * Does headless Chromium give us WebGL2 here? Kip and the streak flame need it, and several e2e
 * tests assert the WebGL canvas (not the <img> fallback). On a CI runner there is no GPU, so we
 * rely on ANGLE + SwiftShader, the same flags as playwright.config.ts. If this fails, the e2e
 * failures that follow are about the machine, not the app.
 *
 *   node scripts/webgl-check.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const browser = await chromium.launch({ args: GL_ARGS });
try {
  const page = await browser.newPage();
  const info = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  });
  if (!info) {
    console.error('WebGL2 is NOT available in headless Chromium with', GL_ARGS.join(' '));
    process.exitCode = 1;
  } else {
    console.log(`WebGL2 ok: ${info.version} | ${info.renderer} | max texture ${info.maxTexture}`);
  }
} finally {
  await browser.close();
}
