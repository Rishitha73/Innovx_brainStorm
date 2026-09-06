import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import extension modules
const {
  SCHEMAS,
  getSchema,
  registerSchema,
  getAllSchemas
} = require('../../../extension/schemas/index.js');
const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');
const {
  initializePortalConnection,
  runCrossVerification,
  setDocumentType,
  getCurrentPortalStatus
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Phase 9 Correction: Form-Driven Document Type & Schema Verification', () => {
  let verifier = null;
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  beforeEach(() => {
    verifier = new CrossVerifier();
    delete window.location;
    window.location = new URL('http://localhost:5173/apply');

    document.body.innerHTML = `
      <form id="scholarship-form">
        <input id="applicant-name" value="Rohan Sharma" />
        <input id="applicant-dob" value="2003-08-15" />
        <input id="cert-number" value="COMM-2024-555" />
        <select id="document-type">
          <option value="">Select document type</option>
          <option value="incomeCertificate">Income Certificate</option>
          <option value="communityCertificate">Community Certificate</option>
          <option value="residenceCertificate">Residence Certificate</option>
        </select>
        <input id="upload-certificate" type="file" />
        <button id="submit-application" type="submit">Submit</button>
      </form>
    `;
  });

  // =========================================================================
  // 1. FORM DATA SOURCE & INITIAL STATE
  // =========================================================================
  it('1. FormDetector reads #document-type selector from portal config', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'incomeCertificate';

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.documentType).toBeDefined();
    expect(formState.documentType.logicalName).toBe('documentType');
    expect(formState.documentType.value).toBe('incomeCertificate');
    expect(formState.documentType.type).toBe('select');
    expect(formState.documentType.found).toBe(true);

    detector.cleanup();
  });

  it('2. Initial document type is empty/null when form has no selection', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = '';

    initializePortalConnection();
    const status = getCurrentPortalStatus();

    expect(status.active).toBe(true);
    expect(status.documentType).toBeNull();
    expect(status.verification.overallStatus).toBe('WAITING_FOR_TYPE');
  });

  // =========================================================================
  // 2. FORM-BASED DOCUMENT TYPE DETECTION
  // =========================================================================
  it('3. Income Certificate form selection is detected', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'incomeCertificate';

    initializePortalConnection();
    const status = getCurrentPortalStatus();

    expect(status.documentType).toBe('incomeCertificate');
    expect(status.formFields.documentType.value).toBe('incomeCertificate');
  });

  it('4. Community Certificate form selection is detected', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'communityCertificate';

    initializePortalConnection();
    const status = getCurrentPortalStatus();

    expect(status.documentType).toBe('communityCertificate');
    expect(status.formFields.documentType.value).toBe('communityCertificate');
  });

  it('5. Residence Certificate form selection is detected', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'residenceCertificate';

    initializePortalConnection();
    const status = getCurrentPortalStatus();

    expect(status.documentType).toBe('residenceCertificate');
    expect(status.formFields.documentType.value).toBe('residenceCertificate');
  });

  // =========================================================================
  // 3. SCHEMA ACTIVATION
  // =========================================================================
  it('6. Income selection activates income schema', () => {
    const schema = getSchema('incomeCertificate');
    expect(schema).toBeDefined();
    expect(schema.documentType).toBe('incomeCertificate');
    expect(schema.extract).toEqual(['name', 'dob', 'certificateNumber']);
    expect(schema.fields.length).toBe(3);
  });

  it('7. Community selection activates community schema without DOB', () => {
    const schema = getSchema('communityCertificate');
    expect(schema).toBeDefined();
    expect(schema.documentType).toBe('communityCertificate');
    expect(schema.extract).toEqual(['name', 'certificateNumber']);
    expect(schema.extract).not.toContain('dob');
  });

  it('8. Residence selection activates residence schema with address', () => {
    const schema = getSchema('residenceCertificate');
    expect(schema).toBeDefined();
    expect(schema.documentType).toBe('residenceCertificate');
    expect(schema.extract).toEqual(['name', 'address']);
  });

  // =========================================================================
  // 4. VERIFICATION BEHAVIOR
  // =========================================================================
  it('9. No document type -> WAITING_FOR_TYPE without false MATCH', () => {
    const formData = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: 'COMM-2024-555',
      documentType: ''
    };
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Candidate Name: Rohan Sharma\nCaste Certificate No: COMM-2024-555'
    };

    const verif = verifier.verify(formData, ocrResult, null);
    expect(verif.status).toBe('waiting_for_schema');
    expect(verif.overallStatus).toBe('WAITING_FOR_TYPE');
    expect(verif.overallStatus).not.toBe('MATCH');
    expect(verif.reasons[0]).toContain('Waiting for document type');
  });

  it('10. Changing document type in form updates schema and drops irrelevant fields', () => {
    const incomeOcrMissingDob = {
      status: 'succeeded',
      confidence: 90,
      text: 'Candidate Name: Rohan Sharma\nCertificate No: COMM-2024-555' // Missing DOB
    };
    const formData = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: 'COMM-2024-555'
    };

    // Income schema expects DOB
    const verifIncome = verifier.verify(formData, incomeOcrMissingDob, 'incomeCertificate');
    expect(verifIncome.overallStatus).toBe('NEEDS_REVIEW');
    expect(verifIncome.fields.dob.status).toBe('NEEDS_REVIEW');

    // Community schema does not evaluate DOB
    const verifCommunity = verifier.verify(formData, incomeOcrMissingDob, 'communityCertificate');
    expect(verifCommunity.overallStatus).toBe('MATCH');
    expect(verifCommunity.fields.dob).toBeUndefined();
  });

  it('11. Changing document type recalculates verification immediately', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'incomeCertificate';
    document.getElementById('cert-number').value = 'INC-2024-98741';

    initializePortalConnection();
    const status = getCurrentPortalStatus();
    status.document.ocr = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };
    runCrossVerification();
    expect(status.verification.overallStatus).toBe('MATCH');
    expect(status.verification.fields.dob).toBeDefined();

    // User changes form dropdown to Community Certificate
    docTypeSelect.value = 'communityCertificate';
    runCrossVerification();

    expect(status.documentType).toBe('communityCertificate');
    expect(status.verification.documentType).toBe('communityCertificate');
    expect(status.verification.fields.dob).toBeUndefined();
  });

  it('12. OCR does not rerun when only document type changes', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'incomeCertificate';
    initializePortalConnection();

    const status = getCurrentPortalStatus();
    status.document.ocr = {
      status: 'succeeded',
      confidence: 92,
      text: 'Candidate Name: Rohan Sharma\nCertificate No: COMM-2024-555'
    };
    const ocrTimestamp = Date.now();
    status.document.ocr.timestamp = ocrTimestamp;

    // Change form document type
    docTypeSelect.value = 'communityCertificate';
    const verif = runCrossVerification();

    // OCR object and text remain completely untouched
    expect(status.document.ocr.status).toBe('succeeded');
    expect(status.document.ocr.timestamp).toBe(ocrTimestamp);
    expect(verif.documentType).toBe('communityCertificate');
    expect(verif.overallStatus).toBe('MATCH');
  });

  it('13. Document replacement preserves form-selected document type', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'communityCertificate';
    initializePortalConnection();

    const status = getCurrentPortalStatus();
    expect(status.documentType).toBe('communityCertificate');

    // Document 1 uploaded
    status.document = {
      file: { name: 'cert_1.png', sizeBytes: 1000 },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'succeeded', passed: true, reasons: [] },
      ocr: { status: 'succeeded', confidence: 90, text: 'Name: Rohan Sharma\nCertificate No: COMM-2024-555' }
    };
    runCrossVerification();
    expect(status.verification.overallStatus).toBe('MATCH');

    // Document 2 uploaded (replaces Document 1, resetting OCR)
    status.document = {
      file: { name: 'cert_2.png', sizeBytes: 1200 },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'processing', passed: null, reasons: [] },
      ocr: { status: 'not_run', text: '', confidence: 0, reasons: [] }
    };
    runCrossVerification();

    // Form document type remains preserved
    expect(status.documentType).toBe('communityCertificate');
    expect(status.verification.overallStatus).toBe('NEEDS_REVIEW');
  });

  it('14. Form-selected type survives OCR state transitions', () => {
    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'communityCertificate';
    initializePortalConnection();

    const status = getCurrentPortalStatus();

    // OCR in processing state
    status.document.ocr = { status: 'processing', text: '', confidence: 0, reasons: [] };
    const verifProcessing = runCrossVerification();
    expect(verifProcessing.status).toBe('processing');
    expect(status.documentType).toBe('communityCertificate');

    // OCR transitions to succeeded
    status.document.ocr = {
      status: 'succeeded',
      confidence: 90,
      text: 'Candidate Name: Rohan Sharma\nCertificate No: COMM-2024-555'
    };
    const verifSucceeded = runCrossVerification();
    expect(verifSucceeded.status).toBe('completed');
    expect(verifSucceeded.overallStatus).toBe('MATCH');
    expect(status.documentType).toBe('communityCertificate');
  });

  // =========================================================================
  // 5. POPUP UI CONTROLLER & SINGLE SOURCE OF TRUTH
  // =========================================================================
  it('15. Popup displays detected document type from form', () => {
    const popupHtmlPath = path.resolve(__dirname, '../../../extension/popup/popup.html');
    const html = fs.readFileSync(popupHtmlPath, 'utf8');

    expect(html).toContain('id="doc-type-section"');
    expect(html).toContain('id="doc-type-badge"');
    expect(html).toContain('id="doc-type-detected-value"');
    expect(html).toContain('Detected from form:');
    expect(html).toContain('The active schema is determined by the document type selected in the form.');
  });

  it('16. Popup has NO second document-type selector', () => {
    const popupHtmlPath = path.resolve(__dirname, '../../../extension/popup/popup.html');
    const html = fs.readFileSync(popupHtmlPath, 'utf8');

    // No popup-doc-type-select
    expect(html).not.toContain('id="popup-doc-type-select"');
    expect(html).not.toContain('popup-doc-type-select');

    // No <select> element inside doc-type-section
    const docTypeSectionMatch = html.match(/<div class="doc-type-section"[\s\S]*?<\/div>\s*<\/div>/);
    if (docTypeSectionMatch) {
      expect(docTypeSectionMatch[0]).not.toContain('<select');
    }
  });

  it('17. No duplicate document-type state controls user flow (single source of truth in form)', () => {
    const popupJsPath = path.resolve(__dirname, '../../../extension/popup/popup.js');
    const popupJs = fs.readFileSync(popupJsPath, 'utf8');

    // popup.js must NOT send SET_DOCUMENT_TYPE
    expect(popupJs).not.toContain('SET_DOCUMENT_TYPE');

    // popup.js reads document type from status (form detection)
    expect(popupJs).toContain('status.documentType');
    expect(popupJs).toContain('docTypeDetectedVal');
  });
});
