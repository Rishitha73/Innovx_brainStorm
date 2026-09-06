import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

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

describe('URGENT REGRESSION FIX — Live Form State & Cross-Verification Verification', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  it('TEST 1: Reads existing populated DOM values on initialization', () => {
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

  it('TEST 2: Real-time update when Name is changed (Rohan Sharma -> Rahul Sharma)', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const nameInput = container.querySelector('#applicant-name');
    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();
    expect(detector.getFormState().name.value).toBe('Rohan Sharma');

    await user.clear(nameInput);
    await user.type(nameInput, 'Rahul Sharma');

    const updated = detector.getFormState();
    expect(updated.name.value).toBe('Rahul Sharma');
    detector.cleanup();
  });

  it('TEST 3: Real-time update when Date of Birth is changed', () => {
    const { container } = render(<App />);
    const dobInput = container.querySelector('#applicant-dob');

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    expect(detector.getFormState().dob.value).toBe('2003-08-15');

    fireEvent.change(dobInput, { target: { value: '2004-12-25' } });
    expect(detector.getFormState().dob.value).toBe('2004-12-25');
    detector.cleanup();
  });

  it('TEST 4: Real-time update when Certificate Number is changed', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const certInput = container.querySelector('#cert-number');

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    await user.type(certInput, 'INC-2024-98741');
    expect(detector.getFormState().certificateNumber.value).toBe('INC-2024-98741');

    await user.clear(certInput);
    await user.type(certInput, 'INC-2024-99999');
    expect(detector.getFormState().certificateNumber.value).toBe('INC-2024-99999');
    detector.cleanup();
  });

  it('TEST 5: OCR and file upload do not clear or reset form values', async () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();

    const mockValidator = { validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'cert.png' } }) };
    const mockOcr = { recognize: vi.fn().mockResolvedValue({ status: 'succeeded', confidence: 92, text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741' }) };
    const fileDetector = new FileDetector(mockPortalConfig, mockValidator, null, mockOcr);
    fileDetector.initialize();

    // Start file processing
    const file = createMockDocFile('cert.png');
    await fileDetector.processFile(file);

    // Verify form state is 100% intact after OCR
    const formState = formDetector.getFormState();
    expect(formState.name.value).toBe('Rohan Sharma');
    expect(formState.dob.value).toBe('2003-08-15');
    expect(formState.certificateNumber.value).toBe('INC-2024-98741');

    // Document state is also populated
    const fileState = fileDetector.getFileState();
    expect(fileState.ocr.status).toBe('succeeded');

    formDetector.cleanup();
    fileDetector.cleanup();
  });

  it('TEST 6: Cross-Verification receives non-empty form values and matches successfully', () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();
    const liveForm = formDetector.getFormState();

    const verifier = new CrossVerifier();
    const ocrResult = {
      status: 'succeeded',
      confidence: 95,
      text: 'GOVERNMENT OF STATE\nCertificate No: INC-2024-98741\nApplicant Name: Rohan Sharma\nDate of Birth: 15-08-2003'
    };

    const verif = verifier.verify(liveForm, ocrResult);

    expect(verif.overallStatus).toBe('MATCH');
    expect(verif.fields.name.formValue).toBe('Rohan Sharma');
    expect(verif.fields.dob.formValue).toBe('2003-08-15');
    expect(verif.fields.certificateNumber.formValue).toBe('INC-2024-98741');
    expect(verif.fields.name.documentValue).toBe('Rohan Sharma');
    expect(verif.fields.dob.documentValue).toBe('15-08-2003');
    expect(verif.fields.certificateNumber.documentValue).toBe('INC-2024-98741');

    formDetector.cleanup();
  });

  it('TEST 7: Document replacement updates document state while keeping form values unchanged', async () => {
    const { container } = render(<App />);
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();

    const mockValidator = { validate: vi.fn().mockImplementation(async (f) => ({ passed: true, reasons: [], file: { name: f.name } })) };
    const mockOcr = {
      recognize: vi.fn().mockImplementation(async (input) => {
        return { status: 'succeeded', confidence: 90, text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741' };
      })
    };
    const fileDetector = new FileDetector(mockPortalConfig, mockValidator, null, mockOcr);
    fileDetector.initialize();

    // Document A
    const fileA = createMockDocFile('income_doc_A.png');
    await fileDetector.processFile(fileA);
    expect(fileDetector.getFileState().file.name).toBe('income_doc_A.png');
    expect(formDetector.getFormState().name.value).toBe('Rohan Sharma');

    // Document B (replacement)
    const fileB = createMockDocFile('income_doc_B.png');
    await fileDetector.processFile(fileB);
    expect(fileDetector.getFileState().file.name).toBe('income_doc_B.png');

    // Form state MUST remain completely unchanged
    expect(formDetector.getFormState().name.value).toBe('Rohan Sharma');
    expect(formDetector.getFormState().dob.value).toBe('2003-08-15');
    expect(formDetector.getFormState().certificateNumber.value).toBe('INC-2024-98741');

    formDetector.cleanup();
    fileDetector.cleanup();
  });

  it('TEST 8: React preset button click synchronizes DOM values into FormDetector', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();

    // Initially empty
    expect(formDetector.getFormState().name.value).toBe('');

    // Click quick preset
    const presetBtn = container.querySelector('button[title*="Standard Valid Income Cert"]') ||
      container.querySelectorAll('.preset-btn')[0];
    await user.click(presetBtn);

    // FormDetector synchronizes with DOM
    const state = formDetector.getFormState();
    expect(state.name.value).toBe('Rohan Sharma');
    expect(state.dob.value).toBe('2003-08-15');
    expect(state.certificateNumber.value).toBe('INC-2024-98741');

    formDetector.cleanup();
  });

  it('TEST 6b: Unrelated document containing none of the expected fields produces NEEDS_REVIEW (not MISMATCH, not MATCH)', () => {
    const liveForm = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: 'INC-2024-98741'
    };

    const verifier = new CrossVerifier();
    const unrelatedOcr = {
      status: 'succeeded',
      confidence: 90,
      text: 'GENERAL PUBLIC NOTICE\nThis document contains rules for applications.\nAnnual budget: Rs. 50,00,000.\nNo applicant details.'
    };

    const verif = verifier.verify(liveForm, unrelatedOcr);
    expect(verif.overallStatus).toBe('NEEDS_REVIEW');
    expect(verif.overallStatus).not.toBe('MISMATCH');
    expect(verif.overallStatus).not.toBe('MATCH');
    expect(verif.fields.name.status).toBe('NEEDS_REVIEW');
    expect(verif.fields.dob.status).toBe('NEEDS_REVIEW');
    expect(verif.fields.certificateNumber.status).toBe('NEEDS_REVIEW');
  });

  it('TEST 7b: Form change after OCR re-verifies reactively without re-running OCR', () => {
    const verifier = new CrossVerifier();
    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Applicant Name: Rohan Sharma\nDOB: 15-08-2003\nCert No: INC-2024-98741'
    };

    // 1. Initial matching form
    const formA = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const resA = verifier.verify(formA, ocrResult);
    expect(resA.overallStatus).toBe('MATCH');

    // 2. User edits name in form to mismatch
    const formB = { name: 'Vikram Singh', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const resB = verifier.verify(formB, ocrResult);
    expect(resB.overallStatus).toBe('MISMATCH');
    expect(resB.fields.name.status).toBe('MISMATCH');
    expect(resB.fields.dob.status).toBe('MATCH');
    expect(resB.fields.certificateNumber.status).toBe('MATCH');
  });

  it('TEST 9: Rapid document replacement ensures latest file result wins and discards stale OCR', async () => {
    const mockValidator = { validate: vi.fn().mockImplementation(async (f) => ({ passed: true, reasons: [], file: { name: f.name } })) };
    
    // Slow OCR for doc 1, fast OCR for doc 2
    let resolveDoc1;
    const doc1Promise = new Promise((resolve) => { resolveDoc1 = resolve; });

    const mockOcr = {
      recognize: vi.fn().mockImplementation(async (input) => {
        if (input.name === 'doc_slow.png') {
          return await doc1Promise;
        }
        return { status: 'succeeded', confidence: 95, text: 'Document 2 Fast Result' };
      })
    };

    const fileDetector = new FileDetector(mockPortalConfig, mockValidator, null, mockOcr);
    fileDetector.initialize();

    const file1 = createMockDocFile('doc_slow.png');
    const file2 = createMockDocFile('doc_fast.png');

    // Start processing file 1 (slow)
    const p1 = fileDetector.processFile(file1);

    // Immediately start processing file 2 (fast)
    const p2 = fileDetector.processFile(file2);
    await p2;

    expect(fileDetector.getFileState().ocr.text).toBe('Document 2 Fast Result');

    // Now let doc 1 finish late
    resolveDoc1({ status: 'succeeded', confidence: 80, text: 'Stale Document 1 Result' });
    await p1;

    // Stale doc 1 result MUST NOT overwrite doc 2
    expect(fileDetector.getFileState().ocr.text).toBe('Document 2 Fast Result');
    fileDetector.cleanup();
  });

  it('TEST 10: Invalid file upload is stopped at Phase 4 and does not run quality or OCR', async () => {
    const invalidFile = new File(['not a valid image or pdf'], 'corrupt.exe', { type: 'application/x-msdownload' });
    
    const mockValidator = { validate: vi.fn().mockResolvedValue({ passed: false, reasons: ['Invalid file format.'], file: { name: 'corrupt.exe' } }) };
    const mockQa = { analyze: vi.fn() };
    const mockOcr = { recognize: vi.fn() };

    const fileDetector = new FileDetector(mockPortalConfig, mockValidator, mockQa, mockOcr);
    fileDetector.initialize();

    await fileDetector.processFile(invalidFile);

    const state = fileDetector.getFileState();
    expect(state.fileValidation.passed).toBe(false);
    expect(state.quality.status).toBe('not_run');
    expect(state.ocr.status).toBe('not_run');
    expect(mockQa.analyze).not.toHaveBeenCalled();
    expect(mockOcr.recognize).not.toHaveBeenCalled();

    fileDetector.cleanup();
  });
});
