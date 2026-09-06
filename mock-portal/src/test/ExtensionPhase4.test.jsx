import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

const { FileValidator } = require('../../../extension/validators/fileValidator.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

// Helper to create synthetic File objects with exact byte buffers
function createSyntheticFile(filename, mimeType, byteSequence, sizeBytes = null) {
  const finalSize = sizeBytes || byteSequence.length;
  const buffer = new Uint8Array(finalSize);
  for (let i = 0; i < byteSequence.length; i++) {
    buffer[i] = byteSequence[i];
  }
  return new File([buffer], filename, { type: mimeType });
}

describe('Phase 4: File Detection + Client-Side File Validation', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  const validator = new FileValidator();

  // Signatures
  const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, 0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, 0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, 0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46];
  const JPG_BYTES = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00];
  const PNG_BYTES = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
  const GIF_BYTES = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00];

  it('validates and accepts a valid PDF file under 2 MB', async () => {
    const file = createSyntheticFile('income_certificate.pdf', 'application/pdf', PDF_BYTES, 1024 * 50); // 50 KB
    const result = await validator.validate(file);

    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
    expect(result.file.name).toBe('income_certificate.pdf');
    expect(result.file.mimeType).toBe('application/pdf');
    expect(result.file.sizeBytes).toBe(1024 * 50);
  });

  it('validates and accepts a valid JPG image under 2 MB', async () => {
    const file = createSyntheticFile('community_cert.jpg', 'image/jpeg', JPG_BYTES, 1024 * 200); // 200 KB
    const result = await validator.validate(file);

    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
    expect(result.file.name).toBe('community_cert.jpg');
  });

  it('validates and accepts a valid PNG image under 2 MB', async () => {
    const file = createSyntheticFile('residence_doc.png', 'image/png', PNG_BYTES, 1024 * 300); // 300 KB
    const result = await validator.validate(file);

    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
    expect(result.file.name).toBe('residence_doc.png');
  });

  it('rejects unsupported file formats (e.g., GIF)', async () => {
    const file = createSyntheticFile('animation.gif', 'image/gif', GIF_BYTES, 1024 * 10);
    const result = await validator.validate(file);

    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('Invalid file format. Expected PDF, JPG, or PNG.');
  });

  it('rejects a fake extension when file signature does not match claimed format (e.g. JPG renamed as .pdf)', async () => {
    const file = createSyntheticFile('fake_certificate.pdf', 'application/pdf', JPG_BYTES, 1024 * 50);
    const result = await validator.validate(file);

    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('File content does not match its reported file type'))).toBe(true);
  });

  it('rejects files exceeding the 2 MB maximum limit', async () => {
    const oversizedSize = Math.floor(4.2 * 1024 * 1024); // 4.2 MB
    const file = createSyntheticFile('huge_certificate.pdf', 'application/pdf', PDF_BYTES, oversizedSize);
    const result = await validator.validate(file);

    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('File too large. Maximum size is 2 MB. Selected file is 4.2 MB.'))).toBe(true);
  });

  it('rejects deliberately corrupted or truncated PDF files', async () => {
    const truncatedBytes = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x00, 0x00];
    const file = createSyntheticFile('corrupted.pdf', 'application/pdf', truncatedBytes, truncatedBytes.length);
    const result = await validator.validate(file);

    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('PDF could not be opened'))).toBe(true);
  });

  it('FileDetector correctly detects file input changes on the mock portal upload selector', async () => {
    const { container } = render(<App />);

    const detector = new FileDetector(mockPortalConfig, validator);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');
    const validFile = createSyntheticFile('test_cert.pdf', 'application/pdf', PDF_BYTES, 1024 * 100);

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await new Promise((r) => setTimeout(r, 20));

    expect(latestDocState).not.toBeNull();
    expect(latestDocState.file.name).toBe('test_cert.pdf');
    expect(latestDocState.fileValidation.passed).toBe(true);

    detector.cleanup();
  });

  it('handles file replacement cleanly by updating state to reflect only the latest file', async () => {
    const { container } = render(<App />);

    const detector = new FileDetector(mockPortalConfig, validator);
    detector.initialize();

    let latestDocState = null;
    detector.onFileValidated((state) => {
      latestDocState = state;
    });

    const fileInput = container.querySelector('#upload-certificate');

    // 1. First file: valid PDF
    const firstFile = createSyntheticFile('first_cert.pdf', 'application/pdf', PDF_BYTES, 1024 * 50);
    fireEvent.change(fileInput, { target: { files: [firstFile] } });
    await new Promise((r) => setTimeout(r, 20));

    expect(latestDocState.file.name).toBe('first_cert.pdf');
    expect(latestDocState.fileValidation.passed).toBe(true);

    // 2. Second file: replaced with oversized file
    const secondFile = createSyntheticFile('second_huge.pdf', 'application/pdf', PDF_BYTES, 3 * 1024 * 1024);
    fireEvent.change(fileInput, { target: { files: [secondFile] } });
    await new Promise((r) => setTimeout(r, 20));

    expect(latestDocState.file.name).toBe('second_huge.pdf');
    expect(latestDocState.fileValidation.passed).toBe(false);
    expect(latestDocState.fileValidation.reasons.some((r) => r.includes('File too large'))).toBe(true);

    detector.cleanup();
  });

  it('syncWithDom retrieves and validates file directly when popup queries after file selection (Regression Fix)', async () => {
    const { container } = render(<App />);

    const detector = new FileDetector(mockPortalConfig, validator);
    detector.initialize();

    // User selects file directly in DOM input
    const fileInput = container.querySelector('#upload-certificate');
    const validFile = createSyntheticFile('verified_income.pdf', 'application/pdf', PDF_BYTES, 1024 * 80);

    // Set files on DOM input directly
    Object.defineProperty(fileInput, 'files', {
      value: [validFile],
      writable: true
    });

    // Popup queries syncWithDom()
    const docState = await detector.syncWithDom();

    expect(docState).not.toBeNull();
    expect(docState.file).not.toBeNull();
    expect(docState.file.name).toBe('verified_income.pdf');
    expect(docState.fileValidation.passed).toBe(true);

    detector.cleanup();
  });

  it('manifest.json includes validators/fileValidator.js and detectors/fileDetector.js', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('validators/fileValidator.js');
    expect(contentScripts.js).toContain('detectors/fileDetector.js');
  });

  it('popup.html contains document validation elements for Phase 4', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('doc-status-badge');
    expect(popupHtml).toContain('doc-file-name');
    expect(popupHtml).toContain('doc-validation-summary');
  });
});
