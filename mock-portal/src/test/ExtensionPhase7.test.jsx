import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import App from '../App';

const { CrossVerifier, DEFAULT_VERIFICATION_RULES } = require('../../../extension/validators/crossVerifier.js');
const { OcrEngine } = require('../../../extension/ocr/ocrEngine.js');
const { QualityAnalyzer } = require('../../../extension/analyzers/qualityAnalyzer.js');
const { FileValidator } = require('../../../extension/validators/fileValidator.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

// Synthetic Image Generator helper
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

describe('Phase 7: Cross-Verification (Form Inputs vs Document OCR)', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  let verifier = null;

  beforeAll(() => {
    verifier = new CrossVerifier();
  });

  // --- 1. OCR Field Extraction Tests ---
  it('extracts Name, DOB, and Certificate Number from structured OCR text', () => {
    const ocrText = `
      GOVERNMENT OF KARNATAKA
      INCOME AND CASTE CERTIFICATE
      Name: Rohan Sharma
      Date of Birth: 15/08/2003
      Certificate No: INC-2024-98741
      Issuing Authority: Revenue Officer
    `;

    const extracted = verifier.extractFields(ocrText);
    expect(extracted.name).toBe('Rohan Sharma');
    expect(extracted.dob).toBe('15/08/2003');
    expect(extracted.certificateNumber).toBe('INC-2024-98741');
  });

  it('supports label variations like Applicant Name, D.O.B., and Cert No.', () => {
    const ocrText = `
      Applicant Name: Ananya Verma
      D.O.B.: 10-04-2002
      Cert No: COMM-2024-55412
    `;

    const extracted = verifier.extractFields(ocrText);
    expect(extracted.name).toBe('Ananya Verma');
    expect(extracted.dob).toBe('10-04-2002');
    expect(extracted.certificateNumber).toBe('COMM-2024-55412');
  });

  it('returns null for missing fields without inventing values', () => {
    const ocrText = `
      UNIDENTIFIED SCAN
      Annual Income: Rs. 1,00,000
    `;

    const extracted = verifier.extractFields(ocrText);
    expect(extracted.name).toBeNull();
    expect(extracted.dob).toBeNull();
    expect(extracted.certificateNumber).toBeNull();
  });

  // --- 2. Name Normalization and Fuzzy Comparison Tests ---
  it('identifies exact name matches and case/whitespace variations as MATCH', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name:   ROHAN   SHARMA  \nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.name.status).toBe('MATCH');
    expect(result.fields.name.score).toBe(1.0);
  });

  it('strips honorific titles like Mr./Shri during name normalization', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Shri Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.name.status).toBe('MATCH');
  });

  it('tolerates minor fuzzy differences above 0.85 threshold', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      // 1 char missing on length 12: score = 1 - 1/12 = 0.917 >= 0.85
      text: 'Name: Rohan Sharm\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.name.status).toBe('MATCH');
    expect(result.fields.name.score).toBeGreaterThanOrEqual(0.85);
  });

  it('identifies distinctly different names as MISMATCH', () => {
    const formData = { name: 'Rahul Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Priya Verma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.name.status).toBe('MISMATCH');
    expect(result.fields.name.reason).toContain('does not match document name');
  });

  it('sets name to NEEDS_REVIEW when document OCR misses name', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'DOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.name.status).toBe('NEEDS_REVIEW');
  });

  // --- 3. DOB Normalization and Comparison Tests ---
  it('matches DOB across standard date formats (YYYY-MM-DD vs DD/MM/YYYY)', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.dob.status).toBe('MATCH');
    expect(result.fields.dob.normalizedFormValue).toBe('2003-08-15');
    expect(result.fields.dob.normalizedDocumentValue).toBe('2003-08-15');
  });

  it('flags different dates as strict MISMATCH without fuzzy tolerance', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 25/12/2004\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.dob.status).toBe('MISMATCH');
    expect(result.fields.dob.reason).toContain('does not match document DOB');
  });

  it('marks unparseable or missing OCR dates as NEEDS_REVIEW', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: INVALID_DATE_STRING\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.dob.status).toBe('NEEDS_REVIEW');
  });

  // --- 4. Certificate Number Comparison Tests ---
  it('matches certificate numbers exactly and normalizes case/whitespace', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: inc-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.certificateNumber.status).toBe('MATCH');
  });

  it('flags differing certificate numbers as MISMATCH without fuzzy tolerance', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98742'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.certificateNumber.status).toBe('MISMATCH');
  });

  it('marks missing OCR certificate number as NEEDS_REVIEW', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.fields.certificateNumber.status).toBe('NEEDS_REVIEW');
  });

  // --- 5. Overall Result Aggregation Tests ---
  it('aggregates to overall MATCH when all 3 fields match', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.overallStatus).toBe('MATCH');
    expect(result.reasons.length).toBe(0);
  });

  it('aggregates to overall MISMATCH if ANY field is MISMATCH', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nDOB: 2004-12-25\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.overallStatus).toBe('MISMATCH');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('aggregates to overall NEEDS_REVIEW if a field is NEEDS_REVIEW and no field is MISMATCH', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nCertificate No: INC-2024-98741' // Missing DOB
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.overallStatus).toBe('NEEDS_REVIEW');
  });

  it('marks fields as NEEDS_REVIEW when OCR confidence is below threshold (<60%)', () => {
    const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const ocrResult = {
      status: 'succeeded',
      confidence: 45, // Below 60%
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const result = verifier.verify(formData, ocrResult);
    expect(result.overallStatus).toBe('NEEDS_REVIEW');
    expect(result.fields.name.status).toBe('NEEDS_REVIEW');
    expect(result.fields.dob.status).toBe('NEEDS_REVIEW');
    expect(result.fields.certificateNumber.status).toBe('NEEDS_REVIEW');
  });

  // --- 6. Full Reactive Pipeline Integration Tests ---
  it('re-verifies reactively when form data changes without re-running OCR', () => {
    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    // 1. Initial matching form data
    const initialForm = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const verif1 = verifier.verify(initialForm, ocrResult);
    expect(verif1.overallStatus).toBe('MATCH');

    // 2. User modifies form name to mismatch
    const updatedForm = { name: 'Rahul Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
    const verif2 = verifier.verify(updatedForm, ocrResult);
    expect(verif2.overallStatus).toBe('MISMATCH');
    expect(verif2.fields.name.status).toBe('MISMATCH');
  });

  it('updates verification state when document is replaced', () => {
    const form = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };

    // Document 1 (Matching)
    const doc1Ocr = { status: 'succeeded', confidence: 90, text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCert No: INC-2024-98741' };
    const res1 = verifier.verify(form, doc1Ocr);
    expect(res1.overallStatus).toBe('MATCH');

    // Document 2 (Replaced with different applicant)
    const doc2Ocr = { status: 'succeeded', confidence: 90, text: 'Name: Ananya Verma\nDOB: 10/04/2002\nCert No: COMM-2024-55412' };
    const res2 = verifier.verify(form, doc2Ocr);
    expect(res2.overallStatus).toBe('MISMATCH');
    expect(res2.fields.name.status).toBe('MISMATCH');
    expect(res2.fields.dob.status).toBe('MISMATCH');
    expect(res2.fields.certificateNumber.status).toBe('MISMATCH');
  });

  // --- 7. Manifest & Popup UI Assertions ---
  it('manifest.json includes validators/crossVerifier.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('validators/crossVerifier.js');
  });

  it('popup.html contains Cross-Verification elements for Phase 7', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('verification-section');
    expect(popupHtml).toContain('verification-overall-badge');
    expect(popupHtml).toContain('verif-status-name');
    expect(popupHtml).toContain('verif-status-dob');
    expect(popupHtml).toContain('verif-status-cert');
    expect(popupHtml).toContain('Phase 7 — Cross-Verification Active');
  });
});
