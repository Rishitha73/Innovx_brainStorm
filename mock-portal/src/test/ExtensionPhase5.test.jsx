import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

const { QualityAnalyzer, DEFAULT_QUALITY_RULES } = require('../../../extension/analyzers/qualityAnalyzer.js');
const { FileValidator } = require('../../../extension/validators/fileValidator.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

// Synthetic Image Data Generator for controlled document quality testing
function createMockImageFile(name, width, height, generator) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const [R, G, B, A] = generator(r, c, width, height);
      data[idx] = R;
      data[idx + 1] = G;
      data[idx + 2] = B;
      data[idx + 3] = A !== undefined ? A : 255;
    }
  }

  // PNG magic bytes header in front of buffer
  const pngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
  const fileBuffer = new Uint8Array(pngHeader.length + 100);
  fileBuffer.set(pngHeader, 0);

  const file = new File([fileBuffer], name, { type: 'image/png' });
  file.imageData = { width, height, data };
  return file;
}

describe('Phase 5: Document Quality Analysis (OpenCV.js & PDF.js)', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  let openCvInstance = null;
  let analyzer = null;
  let validator = null;

  beforeAll(async () => {
    const cvModule = require('@techstark/opencv-js');
    openCvInstance = await cvModule;
    analyzer = new QualityAnalyzer({}, openCvInstance);
    validator = new FileValidator();
  });

  // Test 1: Good Document
  it('analyzes a good high-resolution document and returns passed = true with all metrics passing', async () => {
    const goodDoc = createMockImageFile('good_certificate.png', 1000, 800, (r, c) => {
      // Clean document with 100px margins and clear dark text lines
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) {
        return [20, 20, 20, 255];
      }
      return [240, 240, 240, 255];
    });

    const result = await analyzer.analyze(goodDoc);

    expect(result.passed).toBe(true);
    expect(result.resolutionOk).toBe(true);
    expect(result.blurScore).toBeGreaterThan(50.0);
    expect(result.brightnessOk).toBe(true);
    expect(result.contrastOk).toBe(true);
    expect(result.croppingOk).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  // Test 2: Blurry Document
  it('detects a blurry document using Laplacian variance and flags blur failure', async () => {
    const blurryDoc = createMockImageFile('blurry_certificate.png', 1000, 800, (r) => {
      // Smooth sinusoidal gradient with no high-frequency edges
      const v = Math.floor(128 + 20 * Math.sin(r / 50));
      return [v, v, v, 255];
    });

    const result = await analyzer.analyze(blurryDoc);

    expect(result.passed).toBe(false);
    expect(result.blurScore).toBeLessThan(50.0);
    expect(result.reasons.some((r) => r.includes('Document appears blurry'))).toBe(true);
  });

  // Test 3: Low Resolution
  it('detects low resolution below the 800px minimum threshold and produces a dimension warning', async () => {
    const lowResDoc = createMockImageFile('low_res.png', 400, 300, () => [200, 200, 200, 255]);

    const result = await analyzer.analyze(lowResDoc);

    expect(result.passed).toBe(false);
    expect(result.resolutionOk).toBe(false);
    expect(result.reasons.some((r) => r.includes('Resolution too low') && r.includes('400 × 300 px'))).toBe(true);
  });

  // Test 4: Too Dark / Too Bright
  it('detects an underexposed (too dark) document via grayscale mean intensity', async () => {
    const darkDoc = createMockImageFile('dark_scan.png', 1000, 800, () => [20, 20, 20, 255]);

    const result = await analyzer.analyze(darkDoc);

    expect(result.passed).toBe(false);
    expect(result.brightnessOk).toBe(false);
    expect(result.reasons.some((r) => r.includes('too dark to read reliably'))).toBe(true);
  });

  it('detects an overexposed (too bright) document via grayscale mean intensity', async () => {
    const brightDoc = createMockImageFile('bright_scan.png', 1000, 800, () => [250, 250, 250, 255]);

    const result = await analyzer.analyze(brightDoc);

    expect(result.passed).toBe(false);
    expect(result.brightnessOk).toBe(false);
    expect(result.reasons.some((r) => r.includes('too bright or overexposed'))).toBe(true);
  });

  // Test 5: Low Contrast
  it('detects a low-contrast document via grayscale standard deviation', async () => {
    const lowContrastDoc = createMockImageFile('low_contrast.png', 1000, 800, (r, c) => {
      // Barely perceptible difference between background and text (std dev < 5)
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) {
        return [195, 195, 195, 255];
      }
      return [200, 200, 200, 255];
    });

    const result = await analyzer.analyze(lowContrastDoc);

    expect(result.passed).toBe(false);
    expect(result.contrastOk).toBe(false);
    expect(result.reasons.some((r) => r.includes('contrast is too low'))).toBe(true);
  });

  // Test 6: Likely Cropped Document
  it('detects page-edge cropping when content intersects the outer border', async () => {
    const croppedDoc = createMockImageFile('cropped_scan.png', 1000, 800, (r, c) => {
      // Text strokes extending directly off the top boundary
      if (r < 40 && c > 50 && c < 950 && (c % 10 < 5)) {
        return [20, 20, 20, 255];
      }
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) {
        return [20, 20, 20, 255];
      }
      return [240, 240, 240, 255];
    });

    const result = await analyzer.analyze(croppedDoc);

    expect(result.passed).toBe(false);
    expect(result.croppingOk).toBe(false);
    expect(result.reasons.some((r) => r.includes('Document may be cropped at the page edge.'))).toBe(true);
  });

  // Test 7: Invalid file does not reach quality analyzer
  it('stops at Phase 4 file validation when file format is invalid and does NOT run quality analysis', async () => {
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, analyzer);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');
    // Invalid GIF file
    const gifBytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00];
    const invalidFile = new File([new Uint8Array(gifBytes)], 'animated.gif', { type: 'image/gif' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    await new Promise((r) => setTimeout(r, 20));

    expect(latestDocState).not.toBeNull();
    expect(latestDocState.fileValidation.passed).toBe(false);
    expect(latestDocState.quality.status).toBe('not_run');
    expect(latestDocState.quality.passed).toBeNull();

    detector.cleanup();
  });

  // Test 8: Quality result integrates cleanly into FileDetector document state
  it('updates in-memory document state with full quality analysis result on valid file selection', async () => {
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, analyzer);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');
    const goodDoc = createMockImageFile('income_certificate.png', 1000, 800, (r, c) => {
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) {
        return [20, 20, 20, 255];
      }
      return [240, 240, 240, 255];
    });

    fireEvent.change(fileInput, { target: { files: [goodDoc] } });
    await new Promise((r) => setTimeout(r, 50));

    expect(latestDocState).not.toBeNull();
    expect(latestDocState.file.name).toBe('income_certificate.png');
    expect(latestDocState.fileValidation.passed).toBe(true);
    expect(latestDocState.quality.status).toBe('succeeded');
    expect(latestDocState.quality.passed).toBe(true);
    expect(latestDocState.quality.resolutionOk).toBe(true);
    expect(latestDocState.quality.blurScore).toBeGreaterThan(50);
    expect(latestDocState.quality.brightnessOk).toBe(true);
    expect(latestDocState.quality.contrastOk).toBe(true);
    expect(latestDocState.quality.croppingOk).toBe(true);

    detector.cleanup();
  });

  // Test 9: File replacement updates quality state reactively
  it('reacts to file replacement by re-analyzing quality for the newly selected file', async () => {
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, analyzer);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');

    // 1. First file: Good document -> QUALITY: PASS
    const firstGood = createMockImageFile('good_doc.png', 1000, 800, (r, c) => {
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) return [20, 20, 20, 255];
      return [240, 240, 240, 255];
    });
    fireEvent.change(fileInput, { target: { files: [firstGood] } });
    await new Promise((r) => setTimeout(r, 50));

    expect(latestDocState.file.name).toBe('good_doc.png');
    expect(latestDocState.quality.passed).toBe(true);

    // 2. Second file: Replaced with blurry document -> QUALITY: WARNING
    const secondBlurry = createMockImageFile('blurry_doc.png', 1000, 800, (r) => {
      const v = Math.floor(128 + 20 * Math.sin(r / 50));
      return [v, v, v, 255];
    });
    fireEvent.change(fileInput, { target: { files: [secondBlurry] } });
    await new Promise((r) => setTimeout(r, 50));

    expect(latestDocState.file.name).toBe('blurry_doc.png');
    expect(latestDocState.quality.passed).toBe(false);
    expect(latestDocState.quality.reasons.some((r) => r.includes('Document appears blurry'))).toBe(true);

    detector.cleanup();
  });

  // Test 10: Error handling in QualityAnalyzer
  it('handles unexpected analysis errors by setting quality.status = "failed" without crashing', async () => {
    const brokenAnalyzer = {
      analyze: async () => {
        throw new Error('Simulated WASM memory error');
      }
    };

    const detector = new FileDetector(mockPortalConfig, validator, brokenAnalyzer);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const goodDoc = createMockImageFile('doc.png', 1000, 800, () => [240, 240, 240, 255]);
    await detector.processFile(goodDoc);

    expect(latestDocState.fileValidation.passed).toBe(true);
    expect(latestDocState.quality.status).toBe('failed');
    expect(latestDocState.quality.passed).toBe(false);
    expect(latestDocState.quality.reasons[0]).toContain('Could not analyze document quality');

    detector.cleanup();
  });

  // Test 11: Manifest inclusion
  it('manifest.json includes lib/opencv.js and analyzers/qualityAnalyzer.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('lib/opencv.js');
    expect(contentScripts.js).toContain('analyzers/qualityAnalyzer.js');
  });

  // Test 12: Popup HTML contains Document Quality elements
  it('popup.html contains document quality elements for Phase 5', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('quality-section');
    expect(popupHtml).toContain('quality-status-badge');
    expect(popupHtml).toContain('quality-metrics-block');
    expect(popupHtml).toContain('metric-resolution-row');
    expect(popupHtml).toContain('metric-sharpness-row');
    expect(popupHtml).toContain('metric-brightness-row');
    expect(popupHtml).toContain('metric-contrast-row');
    expect(popupHtml).toContain('metric-cropping-row');
    expect(popupHtml).toContain('Phase 5 — Document Quality Analysis Active');
  });
});
