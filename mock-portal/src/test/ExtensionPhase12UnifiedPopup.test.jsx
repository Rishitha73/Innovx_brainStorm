import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Modules under test
const { SubmitGuard } = require('../../../extension/guards/submitGuard.js');
const { InPageUI } = require('../../../extension/ui/inPageUI.js');
const { validateField, validateAllFields, INPUT_VALIDATION_RULES } = require('../../../extension/validators/inputValidator.js');
const {
  initializePortalConnection,
  runCrossVerification,
  revalidateField,
  getCurrentPortalStatus,
  getActiveSubmitGuard,
  getActiveInPageUI,
  getActiveFormDetector
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Phase 12 UX: Unified Extension Validation Popup & Centered Modal', () => {
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
              <label class="field-label" for="applicant-name">Full Name *</label>
              <div class="input-container">
                <input id="applicant-name" name="name" value="Rohan Sharma" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="applicant-dob">Date of Birth *</label>
              <div class="input-container">
                <input id="applicant-dob" name="dob" type="date" value="2003-08-15" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="applicant-mobile">Mobile Number *</label>
              <div class="input-container">
                <input id="applicant-mobile" name="mobile" type="tel" value="9876543210" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="applicant-email">Email Address</label>
              <div class="input-container">
                <input id="applicant-email" name="email" type="email" value="rohan@example.com" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="cert-number">Certificate Number *</label>
              <div class="input-container">
                <input id="cert-number" name="certificateNumber" value="INC-2024-98741" />
              </div>
            </div>

            <div class="form-group">
              <label class="field-label" for="document-type">Document Type *</label>
              <div class="input-container">
                <select id="document-type" name="documentType">
                  <option value="">Select document type</option>
                  <option value="incomeCertificate" selected>Income Certificate</option>
                  <option value="communityCertificate">Community Certificate</option>
                  <option value="residenceCertificate">Residence Certificate</option>
                </select>
              </div>
            </div>

            <div class="form-group full-width">
              <label class="field-label" for="upload-certificate">Upload Certificate *</label>
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
    nativeSubmitHandler = vi.fn((e) => e.preventDefault());
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
    const popup = document.getElementById('guard-error-popup');
    if (popup) popup.remove();
    const backdrop = document.getElementById('guard-modal-backdrop');
    if (backdrop) backdrop.remove();
  });

  // =========================================================================
  // INPUT VALIDATION TESTS (1–7)
  // =========================================================================

  it('1. invalid name produces unified centered popup state', () => {
    const res = validateField('name', 'John123');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_NAME');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.textContent).toContain('valid name');

    inPageUI.cleanup();
  });

  it('2. invalid DOB produces unified centered popup state', () => {
    const res = validateField('dob', 'invalid-date');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_DOB');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'dob', displayName: 'Date of Birth', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('valid date of birth');

    inPageUI.cleanup();
  });

  it('3. future DOB produces unified centered popup state', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const dateStr = futureDate.toISOString().split('T')[0];

    const res = validateField('dob', dateStr);
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('FUTURE_DOB');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'dob', displayName: 'Date of Birth', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('future');

    inPageUI.cleanup();
  });

  it('4. invalid mobile produces unified centered popup state', () => {
    const res = validateField('mobile', '12345');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_MOBILE');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'mobile', displayName: 'Mobile Number', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('10-digit mobile number');

    inPageUI.cleanup();
  });

  it('5. invalid email produces unified centered popup state', () => {
    const res = validateField('email', 'not-an-email');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_EMAIL');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'email', displayName: 'Email Address', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('valid email address');

    inPageUI.cleanup();
  });

  it('6. missing required field produces unified centered popup state', () => {
    const res = validateField('name', '');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('MISSING_FIELD');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('full name before continuing');

    inPageUI.cleanup();
  });

  it('7. invalid certificate number produces unified centered popup state', () => {
    const res = validateField('certificateNumber', 'AB');
    expect(res.valid).toBe(false);
    expect(res.errorCode).toBe('INVALID_CERT_NUMBER');

    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: [res.errorMessage],
      blockingFields: [{ field: 'certificateNumber', displayName: 'Certificate Number', type: res.errorCode, message: res.errorMessage }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('valid certificate number');

    inPageUI.cleanup();
  });

  // =========================================================================
  // DOCUMENT VALIDATION TESTS (8–13)
  // =========================================================================

  it('8. missing document displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Please upload the required certificate before submitting.'],
      blockingFields: [{ field: 'documentUpload', displayName: 'Certificate Document', type: 'MISSING_DOCUMENT' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('upload the required certificate');

    inPageUI.cleanup();
  });

  it('9. invalid file format displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['The uploaded file could not be accepted.'],
      blockingFields: [{ field: 'documentUpload', displayName: 'Certificate Document', type: 'FILE_INVALID', message: 'Accepted formats: PDF, JPG, PNG' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('uploaded file could not be accepted');

    inPageUI.cleanup();
  });

  it('10. quality failure displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Document quality check failed: Blur score is too low.'],
      blockingFields: [{ field: 'documentUpload', displayName: 'Certificate Document', type: 'QUALITY_FAILED', message: 'Blur score is too low.' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('too blurry, dark, low-resolution, or cropped');

    inPageUI.cleanup();
  });

  it('11. OCR failure displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Document OCR failed: No readable text found.'],
      blockingFields: [{ field: 'documentUpload', displayName: 'Certificate Document', type: 'OCR_FAILED', message: 'No readable text found.' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('could not read the uploaded certificate');

    inPageUI.cleanup();
  });

  it('12. cross-verification mismatch displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Form value does not match the certificate.'],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Priya Sharma' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('name on the certificate does not match');

    inPageUI.cleanup();
  });

  it('13. NEEDS_REVIEW displays the same centered popup structure', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Certificate requires manual review.'],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: 'NEEDS_REVIEW' }]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('could not reliably read some information');

    inPageUI.cleanup();
  });

  // =========================================================================
  // BUTTON STATE TESTS (14–17)
  // =========================================================================

  it('14. any validation error blocks submission evaluation', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const blockedStatus = {
      documentType: 'incomeCertificate',
      inputErrors: {
        mobile: { field: 'mobile', errorCode: 'INVALID_MOBILE', errorMessage: 'Invalid mobile.' }
      },
      document: { file: null },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => blockedStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(blockedStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('BLOCKED');

    guard.detach();
    inPageUI.cleanup();
  });

  it('15. all validations passing enables submit button', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const passStatus = {
      documentType: 'incomeCertificate',
      inputErrors: {},
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
          name: { field: 'name', status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'Rohan Sharma' },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15-08-2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => passStatus
    });
    guard.attach(formElement);

    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.classList.contains('guard-submit-enabled')).toBe(true);

    guard.detach();
    inPageUI.cleanup();
  });

  it('16. fixing one error while another remains keeps submit evaluation blocked', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    // Two errors: invalid mobile AND missing document
    const statusWithTwoErrors = {
      documentType: 'incomeCertificate',
      inputErrors: {
        mobile: { field: 'mobile', errorCode: 'INVALID_MOBILE', errorMessage: 'Invalid mobile.' }
      },
      document: { file: null },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => statusWithTwoErrors
    });
    guard.attach(formElement);

    expect(guard.evaluate(statusWithTwoErrors).allowed).toBe(false);

    // Fix mobile error, but document is still missing!
    statusWithTwoErrors.inputErrors = {};
    expect(guard.evaluate(statusWithTwoErrors).allowed).toBe(false);

    guard.detach();
    inPageUI.cleanup();
  });

  it('17. fixing all errors allows submission and dismisses modal', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const status = {
      documentType: 'incomeCertificate',
      inputErrors: {
        name: { field: 'name', errorCode: 'INVALID_NAME', errorMessage: 'Invalid name.' }
      },
      document: { file: null },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => status
    });
    guard.attach(formElement);

    expect(guard.evaluate(status).allowed).toBe(false);

    // Show popup
    inPageUI.showErrorPopup(status);
    expect(document.getElementById('guard-modal-card')).not.toBeNull();

    // Now fix all errors:
    status.inputErrors = {};
    status.document = {
      file: { name: 'cert.png' },
      fileValidation: { passed: true, reasons: [] },
      quality: { status: 'succeeded', passed: true, reasons: [] },
      ocr: { status: 'succeeded', confidence: 95, text: 'Rohan Sharma', reasons: [] }
    };
    status.verification = {
      status: 'completed',
      overallStatus: 'MATCH',
      fields: {
        name: { field: 'name', status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'Rohan Sharma' },
        dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15-08-2003' },
        certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
      }
    };

    expect(guard.evaluate(status).allowed).toBe(true);
    inPageUI.render(status);

    expect(document.getElementById('guard-modal-card')).toBeNull();

    guard.detach();
    inPageUI.cleanup();
  });

  // =========================================================================
  // POPUP BEHAVIOR TESTS (18–24)
  // =========================================================================

  it('18. exactly one modal exists in the DOM at any given time', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({ reasons: ['Error A'] });
    inPageUI.showErrorPopup({ reasons: ['Error B'] });
    inPageUI.showErrorPopup({ reasons: ['Error C'] });

    const backdrops = document.querySelectorAll('.guard-modal-backdrop');
    expect(backdrops.length).toBe(1);

    const cards = document.querySelectorAll('.guard-modal-card');
    expect(cards.length).toBe(1);

    inPageUI.cleanup();
  });

  it('19. multiple concurrent errors appear as a list in one modal', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Multiple issues.'],
      blockingFields: [
        { field: 'mobile', displayName: 'Mobile Number', type: 'INVALID_MOBILE', message: 'Please enter a valid 10-digit mobile number.' },
        { field: 'name', displayName: 'Full Name', type: 'MISMATCH', message: 'Full Name does not match the certificate.' },
        { field: 'certificateNumber', displayName: 'Certificate Number', type: 'NEEDS_REVIEW', message: 'Certificate number needs review.' }
      ]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    expect(modal).not.toBeNull();
    const listItems = modal.querySelectorAll('.guard-modal-issues-list li');
    expect(listItems.length).toBe(3);
    expect(modal.textContent).toContain('3 issues need attention');

    inPageUI.cleanup();
  });

  it('20. close button dismisses modal', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({ reasons: ['Some problem'] });
    expect(document.getElementById('guard-modal-card')).not.toBeNull();

    const closeBtn = document.getElementById('guard-modal-close-btn');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(document.getElementById('guard-modal-card')).toBeNull();

    inPageUI.cleanup();
  });

  it('21. escape key closes modal', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({ reasons: ['Some problem'] });
    expect(document.getElementById('guard-modal-card')).not.toBeNull();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);

    expect(document.getElementById('guard-modal-card')).toBeNull();

    inPageUI.cleanup();
  });

  it('22. repeated error triggers do not create duplicate modals', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    for (let i = 0; i < 5; i++) {
      inPageUI.showErrorPopup({ reasons: ['Same error repeated'] });
    }

    expect(document.querySelectorAll('.guard-modal-card').length).toBe(1);
    expect(document.querySelectorAll('#guard-error-popup').length).toBe(1);

    inPageUI.cleanup();
  });

  it('23. popup contains user-friendly text without internal technical jargon', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const decision = {
      allowed: false,
      reasons: ['Tesseract worker failed with DOMException inside cv::Mat'],
      blockingFields: [
        { field: 'documentUpload', displayName: 'Certificate Document', type: 'OCR_FAILED' }
      ]
    };

    inPageUI.showErrorPopup(decision);

    const modal = document.getElementById('guard-modal-card');
    const text = modal.textContent.toLowerCase();

    expect(text).not.toContain('tesseract');
    expect(text).not.toContain('opencv');
    expect(text).not.toContain('cv::mat');
    expect(text).not.toContain('domexception');
    expect(text).not.toContain('worker');
    expect(text).toContain('could not read');

    inPageUI.cleanup();
  });

  it('24. main form remains clean with modal attached to body rather than inside form', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const status = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'cert.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 90 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Priya Sharma' }
        }
      }
    };

    inPageUI.renderSubmitBlocked({
      allowed: false,
      reasons: ['Mismatch detected'],
      blockingFields: [{ field: 'name', displayName: 'Full Name', type: 'MISMATCH' }]
    });

    // Form inputs must remain intact and clean
    expect(document.getElementById('applicant-name')).not.toBeNull();
    expect(document.getElementById('applicant-mobile')).not.toBeNull();
    expect(document.getElementById('cert-number')).not.toBeNull();
    expect(document.getElementById('submit-application')).not.toBeNull();

    // Popup is attached at document.body level as a centered modal, not inside the form
    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();
    expect(popup.parentElement).toBe(document.body);

    inPageUI.cleanup();
  });

  // =========================================================================
  // FIELD HIGHLIGHTING & ACCESSIBILITY TESTS (25–27)
  // =========================================================================

  it('25. centered modal backdrop has correct overlay and accessibility attributes', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({ reasons: ['Access check'] });

    const backdrop = document.querySelector('.guard-modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop.parentElement).toBe(document.body);

    const card = document.getElementById('guard-modal-card');
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(card.getAttribute('aria-labelledby')).toBe('guard-modal-title');

    inPageUI.cleanup();
  });

  it('26. input validator validates all fields cleanly from a formState object', () => {
    const invalidFormState = {
      name: '123',
      dob: '2099-01-01',
      mobile: '123',
      email: 'bademail',
      certificateNumber: ''
    };

    const errors = validateAllFields(invalidFormState);
    expect(errors.length).toBe(5);

    // Sorted by priority: name (1), dob (2), mobile (3), email (4), cert (5)
    expect(errors[0].field).toBe('name');
    expect(errors[1].field).toBe('dob');
    expect(errors[2].field).toBe('mobile');
    expect(errors[3].field).toBe('email');
    expect(errors[4].field).toBe('certificateNumber');
  });

  it('27. footer Action button closes the modal cleanly', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.showErrorPopup({ reasons: ['Dismiss test'] });
    expect(document.getElementById('guard-modal-card')).not.toBeNull();

    const actionBtn = document.getElementById('guard-modal-action-btn');
    expect(actionBtn).not.toBeNull();
    actionBtn.click();

    expect(document.getElementById('guard-modal-card')).toBeNull();

    inPageUI.cleanup();
  });
});
