import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

const { OcrEngine, DEFAULT_OCR_OPTIONS } = require('../../../extension/ocr/ocrEngine.js');
const { QualityAnalyzer } = require('../../../extension/analyzers/qualityAnalyzer.js');
const { FileValidator } = require('../../../extension/validators/fileValidator.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

// Synthetic Image Generator helper
function createMockDocFile(name, width, height, generator) {
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

  const pngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
  const fileBuffer = new Uint8Array(pngHeader.length + 100);
  fileBuffer.set(pngHeader, 0);

  const file = new File([fileBuffer], name, { type: 'image/png' });
  file.imageData = { width, height, data };
  return file;
}

describe('Phase 6: Document OCR & Preprocessing (Tesseract.js & OpenCV.js)', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  let openCvInstance = null;
  let ocrEngine = null;
  let qualityAnalyzer = null;
  let validator = null;

  beforeAll(async () => {
    const cvModule = require('@techstark/opencv-js');
    openCvInstance = await cvModule;
    qualityAnalyzer = new QualityAnalyzer({}, openCvInstance);
    validator = new FileValidator();
  });

  // Test 1: OcrEngine initialization
  it('initializes with default English language and custom options', () => {
    const engine = new OcrEngine({ minConfidence: 70 }, openCvInstance, null);
    expect(engine.options.minConfidence).toBe(70);
    expect(engine.options.language).toBe('eng');
    expect(engine.options.usePreprocessing).toBe(true);
  });

  // Test 2: OpenCV Preprocessing (Grayscale -> Blur -> Otsu Binarization)
  it('preprocesses image with OpenCV.js: grayscale, Gaussian blur, and Otsu thresholding', async () => {
    const engine = new OcrEngine({}, openCvInstance, null);
    
    // Create RGBA image with dark and light pixels
    const width = 100;
    const height = 100;
    const srcMat = new openCvInstance.Mat(height, width, openCvInstance.CV_8UC4);
    for (let i = 0; i < height * width * 4; i += 4) {
      srcMat.data[i] = 200;
      srcMat.data[i + 1] = 200;
      srcMat.data[i + 2] = 200;
      srcMat.data[i + 3] = 255;
    }

    const processedMat = engine.preprocessMat(srcMat);
    expect(processedMat).not.toBeNull();
    expect(processedMat.rows).toBe(height);
    expect(processedMat.cols).toBe(width);
    expect(processedMat.channels()).toBe(4); // RGBA format for Tesseract/canvas rendering

    srcMat.delete();
    processedMat.delete();
  });

  // Test 3: Text Extraction and Confidence Capture with Tesseract Runner
  it('extracts raw text and confidence score from document image data', async () => {
    const mockTesseractRunner = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: 'GOVERNMENT OF KARNATAKA\nINCOME AND CASTE CERTIFICATE\nName: Rahul Kumar\nDOB: 15/08/2000\nCertificate No: RD0038291029',
          confidence: 88.5
        }
      })
    };

    const engine = new OcrEngine({}, openCvInstance, mockTesseractRunner);
    const mockDoc = createMockDocFile('income_cert.png', 800, 600, () => [240, 240, 240, 255]);

    const result = await engine.process(mockDoc);

    expect(result.status).toBe('succeeded');
    expect(result.text).toContain('GOVERNMENT OF KARNATAKA');
    expect(result.text).toContain('Rahul Kumar');
    expect(result.text).toContain('Certificate No: RD0038291029');
    expect(result.confidence).toBe(88.5);
    expect(result.reasons.length).toBe(0);
    expect(mockTesseractRunner.recognize).toHaveBeenCalled();
  });

  // Test 4: Low Confidence Warning
  it('records a non-blocking warning in reasons when OCR confidence is below threshold', async () => {
    const mockTesseractRunner = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: 'G0V3RNM3NT 0F K4RN4T4K4 R@hul Kuma!',
          confidence: 42.0
        }
      })
    };

    const engine = new OcrEngine({ minConfidence: 60.0 }, openCvInstance, mockTesseractRunner);
    const mockDoc = createMockDocFile('noisy_cert.png', 800, 600, () => [200, 200, 200, 255]);

    const result = await engine.process(mockDoc);

    expect(result.status).toBe('succeeded');
    expect(result.confidence).toBe(42.0);
    expect(result.reasons.some((r) => r.includes('Low OCR confidence (42%)'))).toBe(true);
  });

  // Test 5: Full Pipeline Integration with FileDetector
  it('executes file validation -> quality analysis -> OCR and updates document.ocr in state', async () => {
    const mockTesseractRunner = {
      recognize: vi.fn().mockResolvedValue({
        data: {
          text: 'Scholarship Application Certificate\nName: Priya Sharma\nDOB: 1999-05-12',
          confidence: 91.2
        }
      })
    };

    const engine = new OcrEngine({}, openCvInstance, mockTesseractRunner);
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, qualityAnalyzer, engine);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');
    const goodDoc = createMockDocFile('certificate.png', 1000, 800, (r, c) => {
      if (r > 100 && r < 700 && c > 100 && c < 700 && (r % 25 < 6)) return [20, 20, 20, 255];
      return [240, 240, 240, 255];
    });

    fireEvent.change(fileInput, { target: { files: [goodDoc] } });
    await new Promise((r) => setTimeout(r, 60));

    expect(latestDocState).not.toBeNull();
    expect(latestDocState.fileValidation.passed).toBe(true);
    expect(latestDocState.quality.status).toBe('succeeded');
    expect(latestDocState.ocr.status).toBe('succeeded');
    expect(latestDocState.ocr.confidence).toBe(91.2);
    expect(latestDocState.ocr.text).toContain('Priya Sharma');

    detector.cleanup();
  });

  // Test 6: File Replacement Resets OCR State Reactively
  it('resets OCR state when a file is replaced and performs fresh recognition', async () => {
    let callCount = 0;
    const mockTesseractRunner = {
      recognize: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { data: { text: 'Document 1 Text', confidence: 95 } };
        }
        return { data: { text: 'Document 2 Replaced Text', confidence: 80 } };
      })
    };

    const engine = new OcrEngine({}, openCvInstance, mockTesseractRunner);
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, qualityAnalyzer, engine);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');

    // First file
    const firstDoc = createMockDocFile('doc1.png', 1000, 800, () => [240, 240, 240, 255]);
    fireEvent.change(fileInput, { target: { files: [firstDoc] } });
    await new Promise((r) => setTimeout(r, 60));

    expect(latestDocState.ocr.text).toBe('Document 1 Text');
    expect(latestDocState.ocr.confidence).toBe(95);

    // Replaced with second file
    const secondDoc = createMockDocFile('doc2.png', 1000, 800, () => [240, 240, 240, 255]);
    fireEvent.change(fileInput, { target: { files: [secondDoc] } });
    await new Promise((r) => setTimeout(r, 60));

    expect(latestDocState.ocr.text).toBe('Document 2 Replaced Text');
    expect(latestDocState.ocr.confidence).toBe(80);

    detector.cleanup();
  });

  // Test 7: Invalid File Format Does NOT Run OCR
  it('does NOT run OCR when file validation fails', async () => {
    const mockTesseractRunner = {
      recognize: vi.fn()
    };

    const engine = new OcrEngine({}, openCvInstance, mockTesseractRunner);
    const { container } = render(<App />);
    const detector = new FileDetector(mockPortalConfig, validator, qualityAnalyzer, engine);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');
    const invalidDoc = new File([new Uint8Array([0x00, 0x11, 0x22])], 'corrupt.xyz', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidDoc] } });
    await new Promise((r) => setTimeout(r, 20));

    expect(latestDocState.fileValidation.passed).toBe(false);
    expect(latestDocState.ocr.status).toBe('not_run');
    expect(mockTesseractRunner.recognize).not.toHaveBeenCalled();

    detector.cleanup();
  });

  // Test 8: OCR Error Handling & Resilience
  it('handles recognition crashes cleanly without propagating uncaught exceptions', async () => {
    const brokenRunner = {
      recognize: vi.fn().mockRejectedValue(new Error('Tesseract worker crashed unexpectedly'))
    };

    const engine = new OcrEngine({}, openCvInstance, brokenRunner);
    const mockDoc = createMockDocFile('error_doc.png', 800, 600, () => [240, 240, 240, 255]);

    const result = await engine.process(mockDoc);

    expect(result.status).toBe('failed');
    expect(result.confidence).toBe(0);
    expect(result.text).toBe('');
    expect(result.reasons.some((r) => r.includes('OCR engine error') || r.includes('crashed unexpectedly'))).toBe(true);
  });

  // Test 9: Manifest Script Inclusions
  it('manifest.json includes lib/tesseract.min.js and ocr/ocrEngine.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('lib/tesseract.min.js');
    expect(contentScripts.js).toContain('ocr/ocrEngine.js');
  });

  // Test 10: Local Tesseract Bundles Exist
  it('verifies that local tesseract distribution scripts exist in extension/lib/', () => {
    const tesseractBundle = path.join(extensionDir, 'lib/tesseract.min.js');
    const workerBundle = path.join(extensionDir, 'lib/worker.min.js');

    expect(fs.existsSync(tesseractBundle)).toBe(true);
    expect(fs.statSync(tesseractBundle).size).toBeGreaterThan(10000);
    expect(fs.existsSync(workerBundle)).toBe(true);
    expect(fs.statSync(workerBundle).size).toBeGreaterThan(1000);
  });

  // Test 11: Popup HTML contains Document OCR elements
  it('popup.html contains document OCR elements for Phase 6', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('ocr-section');
    expect(popupHtml).toContain('ocr-status-badge');
    expect(popupHtml).toContain('ocr-confidence-val');
    expect(popupHtml).toContain('ocr-text-display');
    expect(popupHtml).toContain('ocr-failure-box');
  });
});
