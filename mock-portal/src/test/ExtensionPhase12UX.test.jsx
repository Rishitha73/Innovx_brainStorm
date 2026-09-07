import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Modules under test
const { SubmitGuard } = require('../../../extension/guards/submitGuard.js');
const { InPageUI } = require('../../../extension/ui/inPageUI.js');
const {
  initializePortalConnection,
  runCrossVerification,
  revalidateField,
  setDocumentType,
  getCurrentPortalStatus,
  getActiveSubmitGuard,
  getActiveInPageUI,
  getActiveFileDetector,
  getActiveFormDetector
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Phase 12 UX Refinement: Clean Form, Disabled Submit Button, & Floating Error Popup', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  let formElement;
  let submitBtn;
  let nativeSubmitHandler;

  beforeEach(() => {
    delete window.location;
    window.location = new URL('http://localhost:5173/apply');

    document.body.innerHTML = `
      <div id="root">
        <form id="scholarship-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="field-label" for="applicant-name">Full Name</label>
              <div class="input-container">
                <input id="applicant-name" value="Rohan Sharma" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="applicant-dob">Date of Birth</label>
              <div class="input-container">
                <input id="applicant-dob" type="date" value="2003-08-15" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="cert-number">Certificate Number</label>
              <div class="input-container">
                <input id="cert-number" value="INC-2024-98741" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="document-type">Document Type</label>
              <div class="input-container">
                <select id="document-type">
                  <option value="">Select document type</option>
                  <option value="incomeCertificate" selected>Income Certificate</option>
                  <option value="communityCertificate">Community Certificate</option>
                  <option value="residenceCertificate">Residence Certificate</option>
                </select>
              </div>
            </div>

            <div class="form-group full-width">
              <label class="field-label" for="upload-certificate">Upload Certificate</label>
              <div class="file-dropzone">
                <input id="upload-certificate" type="file" />
              </div>
            </div>
          </div>
          <button id="submit-application" type="submit">Submit Application</button>
        </form>
      </div>
    `;

    formElement = document.getElementById('scholarship-form');
    submitBtn = document.getElementById('submit-application');
    nativeSubmitHandler = vi.fn();
    formElement.addEventListener('submit', nativeSubmitHandler);
  });

  afterEach(() => {
    const guard = getActiveSubmitGuard ? getActiveSubmitGuard() : null;
    if (guard) {
      guard.detach();
    }
    const ui = getActiveInPageUI ? getActiveInPageUI() : null;
    if (ui) {
      ui.cleanup();
    }
    const existingPopup = document.getElementById('guard-error-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
  });

  // =========================================================================
  // =========================================================================
  // 1. BLOCKING VALIDATION -> SUBMIT EVALUATION BLOCKED
  // =========================================================================
  it('1. blocking validation ensures submit evaluation is blocked', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockBlockedStatus = {
      documentType: 'incomeCertificate',
      document: { file: null },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockBlockedStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockBlockedStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('BLOCKED');
    guard.detach();
  });

  // =========================================================================
  // 2. ALL CHECKS PASS -> SUBMIT BUTTON ENABLED
  // =========================================================================
  it('2. all required checks passing ensures submit button is enabled', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockPassStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true, reasons: [] },
        ocr: { status: 'succeeded', confidence: 95, text: 'Rohan Sharma', reasons: [] }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'Rohan Sharma' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockPassStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockPassStatus);
    expect(decision.allowed).toBe(true);
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.classList.contains('guard-submit-enabled')).toBe(true);
    guard.detach();
  });

  // =========================================================================
  // 3. MISSING DOCUMENT -> SUBMIT BLOCKED
  // =========================================================================
  it('3. missing document keeps submit blocked', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockStatus = {
      documentType: 'incomeCertificate',
      document: { file: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    guard.detach();
  });

  // =========================================================================
  // 4. MISMATCH -> SUBMIT BLOCKED + POPUP SHOWN
  // =========================================================================
  it('4. field mismatch keeps submit blocked and renders actionable popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockMismatchStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 95 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Sunil Kumar' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockMismatchStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockMismatchStatus);
    expect(decision.allowed).toBe(false);

    // Block submission / render
    guard.blockSubmission(decision);

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('Submission blocked');
    expect(popup.textContent).toContain('name on the certificate does not match');
    expect(popup.textContent).toContain('correct the name or upload');

    guard.detach();
  });

  // =========================================================================
  // 5. NEEDS_REVIEW -> SUBMIT BLOCKED + POPUP SHOWN
  // =========================================================================
  it('5. NEEDS_REVIEW on required field keeps submit blocked and shows review guidance popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockReviewStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 55 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'NEEDS_REVIEW',
        fields: {
          name: { field: 'name', status: 'NEEDS_REVIEW', formValue: 'Rohan Sharma', documentValue: null, required: true }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockReviewStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockReviewStatus);
    expect(decision.allowed).toBe(false);
    guard.blockSubmission(decision);

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('Submission blocked');
    expect(popup.textContent).toContain('could not reliably read');
    expect(popup.textContent).toContain('clearer document');

    guard.detach();
  });

  // =========================================================================
  // 6. OCR FAILURE -> SUBMIT BLOCKED + POPUP SHOWN
  // =========================================================================
  it('6. OCR extraction failure keeps submit blocked and shows OCR error popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockOcrFailStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'failed', text: '', reasons: ['OCR recognition failed.'] }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockOcrFailStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockOcrFailStatus);
    expect(decision.allowed).toBe(false);
    guard.blockSubmission(decision);

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('could not read the uploaded certificate');

    guard.detach();
  });

  // =========================================================================
  // 7. QUALITY FAILURE -> SUBMIT BLOCKED + POPUP SHOWN
  // =========================================================================
  it('7. quality failure keeps submit blocked and displays visual quality popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockQualityFailStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'blurry.png' },
        fileValidation: { passed: true },
        quality: { status: 'failed', passed: false, reasons: ['Image is severely blurred.'] },
        ocr: { status: 'not_run' }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockQualityFailStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockQualityFailStatus);
    expect(decision.allowed).toBe(false);
    guard.blockSubmission(decision);

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('too blurry, dark, low-resolution, or cropped');

    guard.detach();
  });

  // =========================================================================
  // 8. NO DOCUMENT TYPE -> SUBMIT BLOCKED + POPUP SHOWN
  // =========================================================================
  it('8. missing document type keeps submit blocked and shows document type popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockNoTypeStatus = {
      documentType: null,
      document: { file: { name: 'income.png' } },
      verification: { status: 'idle', overallStatus: 'WAITING_FOR_TYPE' }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockNoTypeStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockNoTypeStatus);
    expect(decision.allowed).toBe(false);
    guard.blockSubmission(decision);

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('Please select the certificate type');

    guard.detach();
  });

  // =========================================================================
  // 9. VALIDATION PROCESSING -> SUBMIT BLOCKED
  // =========================================================================
  it('9. pipeline processing keeps submit blocked', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockProcessingStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'processing' },
        ocr: { status: 'processing' }
      },
      verification: { status: 'processing' }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockProcessingStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockProcessingStatus);
    expect(decision.allowed).toBe(false);
    guard.detach();
  });

  // =========================================================================
  // 10. VALID STATE FOLLOWED BY FORM EDIT -> SUBMIT EVALUATION BLOCKED
  // =========================================================================
  it('10. editing form field after pass updates status and blocks submission until valid', () => {
    initializePortalConnection();
    const guard = getActiveSubmitGuard();
    expect(guard).not.toBeNull();

    // 1. Initially valid
    const status = getCurrentPortalStatus();
    status.documentType = 'incomeCertificate';
    status.document = {
      file: { name: 'income.png' },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'succeeded', passed: true, reasons: [] },
      ocr: {
        status: 'succeeded',
        confidence: 95,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
        reasons: []
      }
    };
    runCrossVerification();
    const initialDecision = guard.evaluate(status);
    expect(initialDecision.allowed).toBe(true);

    // 2. User edits name
    const nameInput = document.getElementById('applicant-name');
    nameInput.value = 'Different Person';
    const formDetector = getActiveFormDetector();
    if (formDetector) {
      formDetector.handleFieldUpdate('name', 'Different Person', 'input');
    }

    revalidateField('name', 'Different Person');
    const updatedDecision = guard.evaluate(getCurrentPortalStatus());
    expect(updatedDecision.allowed).toBe(false);
  });

  // =========================================================================
  // 11. VALID STATE FOLLOWED BY DOCUMENT REPLACEMENT -> SUBMIT BLOCKED
  // =========================================================================
  it('11. replacing document after pass keeps submit blocked until new validation finishes', () => {
    initializePortalConnection();
    const guard = getActiveSubmitGuard();
    expect(guard).not.toBeNull();

    const status = getCurrentPortalStatus();
    status.documentType = 'incomeCertificate';
    status.document = {
      file: { name: 'income.png' },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'succeeded', passed: true, reasons: [] },
      ocr: {
        status: 'succeeded',
        confidence: 95,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
        reasons: []
      }
    };
    runCrossVerification();
    expect(guard.evaluate(status).allowed).toBe(true);

    // User replaces document with new file (which enters processing state)
    status.document = {
      file: { name: 'new_doc.png' },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'processing' },
      ocr: { status: 'processing' }
    };
    status.verification = { status: 'processing' };

    expect(guard.evaluate(status).allowed).toBe(false);
  });

  // =========================================================================
  // 12. NO LARGE VALIDATION DASHBOARD / PANELS RENDERED INSIDE MAIN FORM
  // =========================================================================
  it('12. keeps main form clean without rendering large in-form diagnostic panels', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.renderSubmitBlocked({
      allowed: false,
      reasons: ['Mismatch detected'],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: 'MISMATCH' }]
    });

    // Form inputs must remain clean and unmodified
    expect(document.getElementById('applicant-name')).not.toBeNull();
    expect(document.getElementById('upload-certificate')).not.toBeNull();
    expect(document.getElementById('submit-application')).not.toBeNull();

    // Floating popup is rendered at body level, not occupying permanent form grid space
    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.parentElement).toBe(document.body);

    inPageUI.cleanup();
  });

  // =========================================================================
  // 13. NO FIELD-LEVEL BADGES RENDERED INSIDE FORM
  // =========================================================================
  it('13. does not clutter form labels with field-level badges', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({
      reasons: ['Full Name does not match certificate.']
    });

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('name on the certificate does not match');

    inPageUI.cleanup();
  });

  // =========================================================================
  // 14. REPEATED ERRORS DO NOT CREATE DUPLICATE STACKED POPUPS
  // =========================================================================
  it('14. repeated error triggers update the existing popup rather than creating stacked duplicates', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    // Trigger error 1
    inPageUI.showErrorPopup({ reasons: ['First error occurred.'] });
    expect(document.querySelectorAll('#guard-error-popup').length).toBe(1);

    // Trigger error 2
    inPageUI.showErrorPopup({ reasons: ['Second error occurred.'] });
    expect(document.querySelectorAll('#guard-error-popup').length).toBe(1);

    // Trigger error 3
    inPageUI.showErrorPopup({ reasons: ['Third error occurred.'] });
    expect(document.querySelectorAll('#guard-error-popup').length).toBe(1);

    expect(document.getElementById('guard-error-popup').textContent).toContain('Third error occurred');
    inPageUI.cleanup();
  });

  // =========================================================================
  // 15. CLEARING/FIXING ERROR UPDATES SUBMIT TO ENABLED AFTER PASS
  // =========================================================================
  it('15. correcting the error enables the submit button and dismisses the popup', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    // 1. Blocked state
    const blockedStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 95 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { status: 'MISMATCH', formValue: 'Wrong', documentValue: 'Right' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => blockedStatus
    });
    guard.attach(formElement);
    const blockedDecision = guard.evaluate(blockedStatus);
    expect(blockedDecision.allowed).toBe(false);
    guard.blockSubmission(blockedDecision);

    expect(document.getElementById('guard-error-popup')).not.toBeNull();

    // 2. Error is fixed
    const passStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 95 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { status: 'MATCH', formValue: 'Right', documentValue: 'Right' }
        }
      }
    };

    const passDecision = guard.evaluate(passStatus);
    expect(passDecision.allowed).toBe(true);
    guard.allowSubmission();

    expect(document.getElementById('guard-error-popup')).toBeNull();

    guard.detach();
    inPageUI.cleanup();
  });

  // =========================================================================
  // 16. EXISTING PHASE 12 SUBMIT INTERCEPTION STILL WORKS
  // =========================================================================
  it('16. existing capture phase submit interception blocks unverified form submission', async () => {
    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => ({ document: { file: null } })
    });
    guard.attach(formElement);

    const event = new Event('submit', { bubbles: true, cancelable: true });
    await guard.handleSubmit(event);

    expect(nativeSubmitHandler).not.toHaveBeenCalled();
    expect(guard.lastDecision.allowed).toBe(false);
    guard.detach();
  });

  // =========================================================================
  // 17. MULTIPLE ISSUES SUMMARY RENDERS CONCISE BULLET LIST
  // =========================================================================
  it('17. multiple concurrent issues render a concise bulleted summary without technical jargon', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({
      documentType: 'incomeCertificate',
      document: { file: { name: 'cert.png' } },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MISMATCH', formValue: 'Rohan', documentValue: 'Sunil' },
          dob: { field: 'dob', status: 'MISMATCH', formValue: '2003-08-15', documentValue: '1999-01-01' }
        }
      }
    });

    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.textContent).toContain('2 issues need attention');
    expect(popup.textContent).toContain('Full Name does not match');
    expect(popup.textContent).toContain('Date of Birth does not match');
    // Ensure no technical jargon
    expect(popup.textContent).not.toContain('CrossVerifier');
    expect(popup.textContent).not.toContain('OCR confidence');
    expect(popup.textContent).not.toContain('runId');

    inPageUI.cleanup();
  });
});
