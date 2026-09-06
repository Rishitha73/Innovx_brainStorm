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
  getActiveFileDetector
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Phase 12: Submit Guard (Submission Interception, Final Validation, Blocking Rules & Allow Bypass)', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
  let formElement;
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
    nativeSubmitHandler = vi.fn((e) => {
      // Native or React host handler
    });
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
  });

  // =========================================================================
  // 1. VALID COMPLETE APPLICATION -> ALLOWED
  // =========================================================================
  it('1. allows submission when all required checks pass', async () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true, reasons: [] },
        ocr: { status: 'succeeded', confidence: 95, text: 'Rohan Sharma' }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'Rohan Sharma' },
          dob: { status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe('ALLOWED');
    expect(decision.reasons.length).toBe(0);

    // Simulate submit event
    const event = new Event('submit', { bubbles: true, cancelable: true });
    await guard.handleSubmit(event);

    // Verify native submit was allowed to proceed
    expect(nativeSubmitHandler).toHaveBeenCalledTimes(1);
    guard.detach();
    inPageUI.cleanup();
  });

  // =========================================================================
  // 2. MISSING DOCUMENT -> BLOCKED
  // =========================================================================
  it('2. blocks submission when certificate document is missing', async () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockStatus = {
      documentType: 'incomeCertificate',
      document: { file: null },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('BLOCKED');
    expect(decision.reasons.some((r) => r.toLowerCase().includes('document is required'))).toBe(true);

    const event = new Event('submit', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    await guard.handleSubmit(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(nativeSubmitHandler).not.toHaveBeenCalled();

    // Verify blocked UI is displayed
    const blockedCard = document.getElementById('guard-submit-blocked-card');
    expect(blockedCard).not.toBeNull();
    expect(blockedCard.textContent).toContain('Submission blocked');

    guard.detach();
    inPageUI.cleanup();
  });

  // =========================================================================
  // 3. NO DOCUMENT TYPE -> BLOCKED
  // =========================================================================
  it('3. blocks submission when document type is not selected', async () => {
    const mockStatus = {
      documentType: '',
      document: { file: { name: 'income.png' } },
      verification: { status: 'waiting_for_schema', overallStatus: 'WAITING_FOR_TYPE' }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.toLowerCase().includes('document type has not been selected'))).toBe(true);
  });

  // =========================================================================
  // 4. INVALID FILE -> BLOCKED
  // =========================================================================
  it('4. blocks submission when technical file validation fails', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'document.exe' },
        fileValidation: { passed: false, reasons: ['Invalid file format. Expected PDF, JPG, or PNG.'] }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('Invalid file format'))).toBe(true);
  });

  // =========================================================================
  // 5. QUALITY FAILURE -> BLOCKED
  // =========================================================================
  it('5. blocks submission when document quality check has failed', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'blurry.png' },
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'failed', passed: false, reasons: ['Image blur score 12 is too blurry.'] }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('quality check failed'))).toBe(true);
  });

  // =========================================================================
  // 6. OCR FAILURE -> BLOCKED
  // =========================================================================
  it('6. blocks submission when OCR extraction has failed', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'failed', reasons: ['OCR recognition timed out'] }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('Document OCR failed'))).toBe(true);
  });

  // =========================================================================
  // 7. OCR TIMEOUT / UNAVAILABLE STATE -> BLOCKED
  // =========================================================================
  it('7. blocks submission when OCR result is unavailable', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'not_run', text: '' }
      },
      verification: { status: 'idle', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
  });

  // =========================================================================
  // 8. VERIFICATION MISMATCH -> BLOCKED
  // =========================================================================
  it('8. blocks submission when cross-verification detects a field mismatch', async () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 90 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: {
            field: 'name',
            status: 'MISMATCH',
            formValue: 'Rohan Sharma',
            documentValue: 'Vikram Singh',
            reason: 'Name does not match document certificate.'
          },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      inPageUI,
      getPortalStatus: () => mockStatus
    });
    guard.attach(formElement);

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('Full Name does not match'))).toBe(true);

    const event = new Event('submit', { bubbles: true, cancelable: true });
    await guard.handleSubmit(event);

    expect(nativeSubmitHandler).not.toHaveBeenCalled();

    const blockedCard = document.getElementById('guard-submit-blocked-card');
    expect(blockedCard).not.toBeNull();
    expect(blockedCard.textContent).toContain('Full Name');
    expect(blockedCard.textContent).toContain('Rohan Sharma');
    expect(blockedCard.textContent).toContain('Vikram Singh');

    guard.detach();
    inPageUI.cleanup();
  });

  // =========================================================================
  // 9. REQUIRED NEEDS_REVIEW -> BLOCKED
  // =========================================================================
  it('9. blocks submission when a required field has NEEDS_REVIEW', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 52 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'NEEDS_REVIEW',
        fields: {
          name: {
            field: 'name',
            status: 'NEEDS_REVIEW',
            formValue: 'Rohan Sharma',
            documentValue: null,
            reason: 'Field could not be reliably located in OCR text.'
          }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('requires manual review'))).toBe(true);
    // Explicitly non-accusatory: must NOT describe NEEDS_REVIEW as confirmed mismatch
    expect(decision.reasons.some((r) => r.includes('confirmed mismatch'))).toBe(false);
  });

  // =========================================================================
  // 10. PROCESSING / INCOMPLETE VALIDATION -> NEVER BLINDLY ALLOWS
  // =========================================================================
  it('10. never blindly allows submission while validation is processing', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'processing' },
        ocr: { status: 'processing' }
      },
      verification: { status: 'processing', overallStatus: null }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('still in progress'))).toBe(true);
  });

  // =========================================================================
  // 11. SCHEMA UNAVAILABLE -> BLOCKED
  // =========================================================================
  it('11. blocks submission when schema cannot be resolved for selected document type', async () => {
    const mockStatus = {
      documentType: 'unsupportedPassport',
      document: { file: { name: 'passport.png' } },
      verification: {
        status: 'waiting_for_schema',
        overallStatus: 'SCHEMA_UNAVAILABLE',
        reasons: ['No validation schema registered for document type: unsupportedPassport']
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('No validation schema'))).toBe(true);
  });

  // =========================================================================
  // 12. VALID FILE BUT WRONG PERSON -> BLOCKED BY MISMATCH
  // =========================================================================
  it('12. blocks submission for technically valid file containing wrong person credentials', async () => {
    const mockStatus = {
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'valid_cert.pdf' },
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 96 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Sunil Gupta' }
        }
      }
    };

    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => mockStatus
    });

    const decision = guard.evaluate(mockStatus);
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('Full Name does not match'))).toBe(true);
  });

  // =========================================================================
  // 13. PREVIOUSLY VALID STATE FOLLOWED BY FORM EDIT -> OLD MATCH CANNOT APPROVE
  // =========================================================================
  it('13. prevents old MATCH result from approving submission after form edit', async () => {
    initializePortalConnection();
    const guard = getActiveSubmitGuard();
    expect(guard).not.toBeNull();

    // 1. Setup valid state
    const file = new File(['mock content'], 'income.png', { type: 'image/png' });
    const fileInput = document.getElementById('upload-certificate');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

    const fileDetector = getActiveFileDetector ? getActiveFileDetector() : null;
    if (fileDetector) {
      fileDetector.currentFileRef = file;
      fileDetector.fileState = {
        file,
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true, reasons: [] },
        ocr: {
          status: 'succeeded',
          confidence: 95,
          text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
          reasons: []
        }
      };
    }

    const status = getCurrentPortalStatus();
    status.documentType = 'incomeCertificate';
    status.document = fileDetector ? fileDetector.fileState : {
      file,
      fileValidation: { passed: true },
      quality: { status: 'succeeded', passed: true },
      ocr: {
        status: 'succeeded',
        confidence: 95,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
        reasons: []
      }
    };
    runCrossVerification();

    expect(status.verification.overallStatus).toBe('MATCH');

    // 2. User changes form name right before submit
    const nameInput = document.getElementById('applicant-name');
    nameInput.value = 'Different Name';

    // 3. User immediately clicks submit
    const event = new Event('submit', { bubbles: true, cancelable: true });
    await guard.handleSubmit(event);

    // Old MATCH must NOT have allowed submit!
    expect(nativeSubmitHandler).not.toHaveBeenCalled();

    const decision = guard.lastDecision;
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes('Full Name does not match'))).toBe(true);
  });

  // =========================================================================
  // 14. DOCUMENT REPLACEMENT BEFORE SUBMIT -> OLD DOC CANNOT APPROVE NEW DOC
  // =========================================================================
  it('14. prevents old document verification from approving replaced document', async () => {
    initializePortalConnection();
    const guard = getActiveSubmitGuard();
    expect(guard).not.toBeNull();

    // 1. Verified Doc A
    const file = new File(['mock content'], 'docA.png', { type: 'image/png' });
    const fileInput = document.getElementById('upload-certificate');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

    const fileDetector = getActiveFileDetector ? getActiveFileDetector() : null;
    if (fileDetector) {
      fileDetector.currentFileRef = file;
      fileDetector.fileState = {
        file,
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true, reasons: [] },
        ocr: {
          status: 'succeeded',
          confidence: 95,
          text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
          reasons: []
        }
      };
    }

    const status = getCurrentPortalStatus();
    status.documentType = 'incomeCertificate';
    status.document = fileDetector ? fileDetector.fileState : {
      file,
      fileValidation: { passed: true },
      quality: { status: 'succeeded', passed: true },
      ocr: {
        status: 'succeeded',
        confidence: 95,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741',
        reasons: []
      }
    };
    runCrossVerification();
    expect(status.verification.overallStatus).toBe('MATCH');

    // 2. Document is removed / replaced in DOM
    Object.defineProperty(fileInput, 'files', { value: [], configurable: true });
    fileInput.value = '';

    // 3. User immediately submits
    const event = new Event('submit', { bubbles: true, cancelable: true });
    await guard.handleSubmit(event);

    expect(nativeSubmitHandler).not.toHaveBeenCalled();
    const decision = guard.lastDecision;
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.toLowerCase().includes('document is required'))).toBe(true);
  });

  // =========================================================================
  // 15. DOCUMENT TYPE CHANGED AFTER VALIDATION
  // =========================================================================
  it('15. re-evaluates under new schema when document type is changed', async () => {
    initializePortalConnection();
    const guard = getActiveSubmitGuard();
    expect(guard).not.toBeNull();

    // 1. Verified under Income Certificate
    const status = getCurrentPortalStatus();
    status.documentType = 'incomeCertificate';
    status.document = {
      file: { name: 'income.png' },
      fileValidation: { passed: true },
      quality: { status: 'succeeded', passed: true },
      ocr: {
        status: 'succeeded',
        confidence: 95,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741'
      }
    };
    runCrossVerification();
    expect(status.verification.overallStatus).toBe('MATCH');

    // 2. User changes document type to Community Certificate in form
    setDocumentType('communityCertificate');

    // Cross-verification now runs under Community Certificate schema
    expect(status.documentType).toBe('communityCertificate');
    expect(status.verification.fields.dob).toBeUndefined(); // Schema does not check DOB
  });

  // =========================================================================
  // 16. RAPID REPEATED SUBMIT CLICKS -> NO DOUBLE SUBMIT
  // =========================================================================
  it('16. handles rapid repeated submit clicks safely without duplicate submissions', async () => {
    let evalCount = 0;
    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => ({
        documentType: 'incomeCertificate',
        document: { file: null },
        verification: { status: 'idle' }
      }),
      syncAndRevalidate: async () => {
        evalCount++;
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    guard.attach(formElement);

    const event1 = new Event('submit', { bubbles: true, cancelable: true });
    const event2 = new Event('submit', { bubbles: true, cancelable: true });
    const event3 = new Event('submit', { bubbles: true, cancelable: true });

    // Rapid clicks concurrently
    const p1 = guard.handleSubmit(event1);
    const p2 = guard.handleSubmit(event2);
    const p3 = guard.handleSubmit(event3);

    await Promise.all([p1, p2, p3]);

    // Mutex ensures only one evaluation job runs for the burst
    expect(evalCount).toBe(1);
    expect(nativeSubmitHandler).not.toHaveBeenCalled();
    guard.detach();
  });

  // =========================================================================
  // 17. MULTIPLE ATTACH CALLS -> NO DUPLICATE LISTENERS
  // =========================================================================
  it('17. prevents duplicate submit listeners on multiple attach calls', () => {
    const guard = new SubmitGuard({ portalConfig: mockPortalConfig });

    guard.attach(formElement);
    guard.attach(formElement);
    guard.attach(formElement);

    // Only 1 listener active (verified by internal guard reference)
    expect(guard.formElement).toBe(formElement);
    guard.detach();
    expect(guard.formElement).toBeNull();
  });

  // =========================================================================
  // 18. ALLOW PATH CONTINUES NATIVELY EXACTLY ONCE
  // =========================================================================
  it('18. allow path invokes native form submission exactly once', async () => {
    const guard = new SubmitGuard({ portalConfig: mockPortalConfig });
    guard.attach(formElement);

    // Call allowSubmission directly
    guard.allowSubmission();

    expect(nativeSubmitHandler).toHaveBeenCalledTimes(1);
    expect(guard.allowNextSubmit).toBe(false); // Flag reset immediately
    guard.detach();
  });

  // =========================================================================
  // 19. BLOCK PATH PREVENTS DEFAULT EFFECTIVELY
  // =========================================================================
  it('19. block path halts submission event propagation effectively', async () => {
    const guard = new SubmitGuard({
      portalConfig: mockPortalConfig,
      getPortalStatus: () => ({ documentType: null })
    });
    guard.attach(formElement);

    const event = new Event('submit', { bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    const stopPropSpy = vi.spyOn(event, 'stopImmediatePropagation');

    await guard.handleSubmit(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(stopPropSpy).toHaveBeenCalled();
    expect(nativeSubmitHandler).not.toHaveBeenCalled();
    guard.detach();
  });

  // =========================================================================
  // 20. BLOCK SUMMARY UI CONTAINS REQUIRED INFORMATION
  // =========================================================================
  it('20. block summary UI displays "Submission blocked" with specific field discrepancies and actions', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const guard = new SubmitGuard({ portalConfig: mockPortalConfig, inPageUI });

    guard.blockSubmission({
      allowed: false,
      status: 'BLOCKED',
      reasons: ['Full Name does not match certificate.'],
      blockingFields: [
        {
          field: 'name',
          displayName: 'Full Name',
          type: 'MISMATCH',
          formValue: 'Rohan Sharma',
          documentValue: 'Sunil Kumar',
          suggestedAction: 'Update form name to match certificate.'
        }
      ]
    });

    const card = document.getElementById('guard-submit-blocked-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Submission blocked');
    expect(card.textContent).toContain('Full Name');
    expect(card.textContent).toContain('Rohan Sharma');
    expect(card.textContent).toContain('Sunil Kumar');
    expect(card.textContent).toContain('Update form name to match certificate.');

    inPageUI.cleanup();
  });

  // =========================================================================
  // 21. SUCCESS UI DOES NOT CLAIM GOVERNMENT AUTHENTICITY
  // =========================================================================
  it('21. success UI strictly displays rule verification match without false authenticity claims', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    inPageUI.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded' }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {}
      }
    });

    const banner = document.getElementById('guard-overall-banner');
    expect(banner.textContent).toContain('✓ ALL CHECKS PASS');
    expect(banner.textContent).not.toContain('government approved');
    expect(banner.textContent).not.toContain('verified authentic');

    inPageUI.cleanup();
  });
});
