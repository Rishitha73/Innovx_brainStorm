import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import App from '../App';

// Import portal config, FormDetector, FileDetector, and CrossVerifier
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');

function createMockDocFile(name, width = 800, height = 600) {
  const pngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
  const fileBuffer = new Uint8Array(pngHeader.length + 100);
  fileBuffer.set(pngHeader, 0);

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 240;
    data[i + 2] = 240;
    data[i + 3] = 255;
  }

  const file = new File([fileBuffer], name, { type: 'image/png' });
  file.imageData = { width, height, data };
  return file;
}

describe('Phase 3: Form Detector & Real-Time Form Data Reading', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  it('reads initial empty form field values on activation', () => {
    render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.name).toBeDefined();
    expect(formState.name.value).toBe('');
    expect(formState.name.type).toBe('text');

    expect(formState.dob).toBeDefined();
    expect(formState.dob.value).toBe('');
    expect(formState.dob.type).toBe('date');

    expect(formState.certificateNumber).toBeDefined();
    expect(formState.certificateNumber.value).toBe('');
    expect(formState.certificateNumber.type).toBe('text');

    detector.cleanup();
  });

  it('reads pre-populated initial values from the DOM correctly on initialization', () => {
    const { container } = render(<App />);

    // Pre-populate input values in DOM
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.name.value).toBe('Rohan Sharma');
    expect(formState.dob.value).toBe('2003-08-15');
    expect(formState.certificateNumber.value).toBe('INC-2024-98741');

    detector.cleanup();
  });

  it('tracks real-time Name field changes via input events and notifies subscribers', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const changeCallback = vi.fn();
    detector.onFieldChange(changeCallback);

    const nameInput = container.querySelector('#applicant-name');
    await user.type(nameInput, 'Rohan Kumar');

    const latestState = detector.getFormState();
    expect(latestState.name.value).toBe('Rohan Kumar');
    expect(changeCallback).toHaveBeenCalled();

    detector.cleanup();
  });

  it('tracks real-time Date of Birth changes via change events', () => {
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const dobInput = container.querySelector('#applicant-dob');
    fireEvent.change(dobInput, { target: { value: '2004-12-25' } });

    const latestState = detector.getFormState();
    expect(latestState.dob.value).toBe('2004-12-25');

    detector.cleanup();
  });

  it('tracks real-time Certificate Number changes', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const certInput = container.querySelector('#cert-number');
    await user.type(certInput, 'COMM-2024-55412');

    const latestState = detector.getFormState();
    expect(latestState.certificateNumber.value).toBe('COMM-2024-55412');

    detector.cleanup();
  });

  it('updates state to empty string when a field is cleared without crashing', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const nameInput = container.querySelector('#applicant-name');
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    expect(detector.getFormState().name.value).toBe('John Doe');

    await user.clear(nameInput);
    expect(detector.getFormState().name.value).toBe('');

    detector.cleanup();
  });

  it('handles missing form fields gracefully with a warning and preserves other fields', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<App />);

    // Mutate cert-number id to simulate missing field
    const certInput = container.querySelector('#cert-number');
    certInput.removeAttribute('id');

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing configured form field: certificateNumber')
    );

    expect(formState.name.found).toBe(true);
    expect(formState.dob.found).toBe(true);
    expect(formState.certificateNumber.found).toBe(false);

    detector.cleanup();
    consoleWarnSpy.mockRestore();
  });

  it('manifest.json includes detectors/formDetector.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('detectors/formDetector.js');
    expect(contentScripts.js).toContain('content.js');
  });

  it('popup.html contains Live Form State debug container for Phase 3', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('val-name');
    expect(popupHtml).toContain('val-dob');
    expect(popupHtml).toContain('val-cert');
    expect(popupHtml).toContain('Live Form State');
  });

  // --- Regression Tests for Live Form Synchronization & Cross-Verification ---
  it('captures existing populated fields on FormDetector initialization', () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-88912' } });

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.name.value).toBe('Rohan Sharma');
    expect(formState.dob.value).toBe('2003-08-15');
    expect(formState.certificateNumber.value).toBe('INC-2024-88912');
    detector.cleanup();
  });

  it('syncWithDom updates form state when React preset is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    // Click "Standard Valid Income Cert" preset button
    const presetBtn = container.querySelector('button[title*="Standard Valid Income Cert"]') ||
      container.querySelectorAll('.preset-btn')[0];
    await user.click(presetBtn);

    const latestState = detector.getFormState();
    expect(latestState.name.value).toBe('Rohan Sharma');
    expect(latestState.dob.value).toBe('2003-08-15');
    expect(latestState.certificateNumber.value).toBe('INC-2024-98741');

    detector.cleanup();
  });

  it('file upload and OCR processing do not clear existing form state', async () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();

    expect(formDetector.getFormState().name.value).toBe('Rohan Sharma');

    // Simulate file validator & file detector
    const mockValidator = { validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'cert.png' } }) };
    const mockOcr = { recognize: vi.fn().mockResolvedValue({ status: 'succeeded', confidence: 95, text: 'Name: Rohan Sharma' }) };
    const fileDetector = new FileDetector(mockPortalConfig, mockValidator, null, mockOcr);
    fileDetector.initialize();

    const file = createMockDocFile('cert.png');
    await fileDetector.processFile(file);

    // Form state must be intact after file validation / OCR
    const formStateAfterUpload = formDetector.getFormState();
    expect(formStateAfterUpload.name.value).toBe('Rohan Sharma');
    expect(formStateAfterUpload.dob.value).toBe('2003-08-15');
    expect(formStateAfterUpload.certificateNumber.value).toBe('INC-2024-98741');

    // Replacing document with doc B also preserves form state
    const file2 = createMockDocFile('cert2.png');
    await fileDetector.processFile(file2);

    const formStateAfterReplace = formDetector.getFormState();
    expect(formStateAfterReplace.name.value).toBe('Rohan Sharma');
    expect(formStateAfterReplace.dob.value).toBe('2003-08-15');
    expect(formStateAfterReplace.certificateNumber.value).toBe('INC-2024-98741');

    formDetector.cleanup();
    fileDetector.cleanup();
  });

  it('cross-verification receives non-empty form state and computes MATCH', () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();
    const liveForm = detector.getFormState();

    const verifier = new CrossVerifier();
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const verifResult = verifier.verify(liveForm, ocrResult);
    expect(verifResult.overallStatus).toBe('MATCH');
    expect(verifResult.fields.name.formValue).toBe('Rohan Sharma');
    expect(verifResult.fields.dob.formValue).toBe('2003-08-15');
    expect(verifResult.fields.certificateNumber.formValue).toBe('INC-2024-98741');
    expect(verifResult.fields.name.status).toBe('MATCH');
    expect(verifResult.fields.dob.status).toBe('MATCH');
    expect(verifResult.fields.certificateNumber.status).toBe('MATCH');

    detector.cleanup();
  });
});
