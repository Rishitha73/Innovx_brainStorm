import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Modules under test
const { InPageUI } = require('../../../extension/ui/inPageUI.js');
const {
  initializePortalConnection,
  runCrossVerification,
  revalidateField,
  setDocumentType,
  getCurrentPortalStatus,
  getActiveInPageUI
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Phase 11: Error/Success UI (In-Page Badges, Inline Panels, Status Banner, & Popup Parity)', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  beforeEach(() => {
    delete window.location;
    window.location = new URL('http://localhost:5173/apply');

    document.body.innerHTML = `
      <div id="root">
        <form id="scholarship-form">
          <div class="form-grid">
            <div class="form-group">
              <label class="field-label" for="applicant-name">
                Full Name <span class="required">*</span>
              </label>
              <div class="input-container">
                <input id="applicant-name" value="Rohan Sharma" />
              </div>
              <small class="field-help-text">As printed on your official certificate</small>
            </div>

            <div class="form-group">
              <label class="field-label" for="applicant-dob">
                Date of Birth <span class="required">*</span>
              </label>
              <div class="input-container">
                <input id="applicant-dob" type="date" value="2003-08-15" />
              </div>
              <small class="field-help-text">DD-MM-YYYY format</small>
            </div>

            <div class="form-group">
              <label class="field-label" for="cert-number">
                Certificate Number <span class="required">*</span>
              </label>
              <div class="input-container">
                <input id="cert-number" value="INC-2024-98741" />
              </div>
              <small class="field-help-text">Government-issued document identifier</small>
            </div>

            <div class="form-group">
              <label class="field-label" for="document-type">
                Document Type <span class="required">*</span>
              </label>
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
              <label class="field-label" for="upload-certificate">
                Upload Certificate <span class="required">*</span>
              </label>
              <div class="file-dropzone">
                <input id="upload-certificate" type="file" />
              </div>
            </div>
          </div>
          <button id="submit-application" type="submit">Submit Application</button>
        </form>
      </div>
    `;
  });

  afterEach(() => {
    const activeUI = getActiveInPageUI ? getActiveInPageUI() : null;
    if (activeUI) {
      activeUI.cleanup();
    }
  });

  // =========================================================================
  // 1. IN-PAGE UI DOM INJECTION TESTS
  // =========================================================================
  it('1. InPageUI injects overall banner at top of form', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const banner = document.getElementById('guard-overall-banner');
    expect(banner).not.toBeNull();
    expect(banner.classList.contains('guard-overall-banner')).toBe(true);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(document.getElementById('guard-banner-title')).not.toBeNull();
    expect(document.getElementById('guard-banner-badge')).not.toBeNull();
    ui.cleanup();
  });

  it('2. InPageUI injects field badges into label elements without obscuring inputs', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    const dobBadge = document.querySelector('[data-guard-field="dob"]');
    const certBadge = document.querySelector('[data-guard-field="certificateNumber"]');

    expect(nameBadge).not.toBeNull();
    expect(dobBadge).not.toBeNull();
    expect(certBadge).not.toBeNull();

    // Verify parent is the field-label
    expect(nameBadge.parentElement.classList.contains('field-label')).toBe(true);
    // Verify inputs remain clean and unaltered
    const nameInput = document.getElementById('applicant-name');
    expect(nameInput.value).toBe('Rohan Sharma');
    ui.cleanup();
  });

  it('3. InPageUI injects inline panels below input containers', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const namePanel = document.querySelector('[data-guard-panel="name"]');
    const dobPanel = document.querySelector('[data-guard-panel="dob"]');
    const certPanel = document.querySelector('[data-guard-panel="certificateNumber"]');

    expect(namePanel).not.toBeNull();
    expect(dobPanel).not.toBeNull();
    expect(certPanel).not.toBeNull();

    // Verify initially hidden before validation run
    expect(namePanel.style.display).toBe('none');
    ui.cleanup();
  });

  it('4. InPageUI injects 4-track document status card near file upload dropzone', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const docCard = document.getElementById('guard-doc-status-card');
    expect(docCard).not.toBeNull();
    expect(document.getElementById('guard-pill-file')).not.toBeNull();
    expect(document.getElementById('guard-pill-quality')).not.toBeNull();
    expect(document.getElementById('guard-pill-ocr')).not.toBeNull();
    expect(document.getElementById('guard-pill-verification')).not.toBeNull();
    ui.cleanup();
  });

  // =========================================================================
  // 2. FIELD BADGE STATES & VISIBILITY
  // =========================================================================
  it('5. renders MATCH badge with green styling on verified fields', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
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
          name: { field: 'name', status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'ROHAN SHARMA' },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    });

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    expect(nameBadge.style.display).toBe('inline-flex');
    expect(nameBadge.classList.contains('guard-badge-match')).toBe(true);
    expect(nameBadge.textContent).toContain('MATCH');
    expect(nameBadge.textContent).toContain('✓');

    const namePanel = document.querySelector('[data-guard-panel="name"]');
    expect(namePanel.style.display).toBe('none'); // No large error panel on match!
    ui.cleanup();
  });

  it('6. renders MISMATCH badge with red styling on conflicting fields', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 92 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Amit Kumar' },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    });

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    expect(nameBadge.style.display).toBe('inline-flex');
    expect(nameBadge.classList.contains('guard-badge-mismatch')).toBe(true);
    expect(nameBadge.textContent).toContain('MISMATCH');
    expect(nameBadge.textContent).toContain('✕');
    ui.cleanup();
  });

  it('7. renders NEEDS REVIEW badge with amber styling when OCR confidence is ambiguous', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
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
          name: { field: 'name', status: 'NEEDS_REVIEW', formValue: 'Rohan Sharma', documentValue: null },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    });

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    expect(nameBadge.style.display).toBe('inline-flex');
    expect(nameBadge.classList.contains('guard-badge-review')).toBe(true);
    expect(nameBadge.textContent).toContain('NEEDS REVIEW');
    expect(nameBadge.textContent).toContain('⚠');
    ui.cleanup();
  });

  it('8. renders CHECKING... badge during pipeline processing', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'processing' },
        ocr: { status: 'not_run' }
      },
      verification: {
        status: 'processing',
        overallStatus: null,
        fields: {}
      }
    });

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    expect(nameBadge.style.display).toBe('inline-flex');
    expect(nameBadge.classList.contains('guard-badge-pending')).toBe(true);
    expect(nameBadge.textContent).toContain('CHECKING...');
    ui.cleanup();
  });

  // =========================================================================
  // 3. INLINE COMPARISON & REVIEW PANELS
  // =========================================================================
  it('9. displays inline mismatch panel with form value, document value, and suggested corrective action', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 94 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: {
            field: 'name',
            status: 'MISMATCH',
            formValue: 'Rohan Sharma',
            documentValue: 'Amit Verma',
            reason: 'Name similarity (42%) below required threshold'
          },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    });

    const panel = document.querySelector('[data-guard-panel="name"]');
    expect(panel.style.display).toBe('block');
    expect(panel.classList.contains('guard-panel-mismatch')).toBe(true);

    // Form value & OCR value presence
    expect(panel.textContent).toContain('Form Value:');
    expect(panel.textContent).toContain('Rohan Sharma');
    expect(panel.textContent).toContain('Document (OCR):');
    expect(panel.textContent).toContain('Amit Verma');

    // Suggested corrective action
    expect(panel.textContent).toContain('Check the form name and update it to match your certificate.');
    ui.cleanup();
  });

  it('10. displays helpful review panel for NEEDS_REVIEW without phrasing as a definitive mismatch', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
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
          },
          dob: { field: 'dob', status: 'MATCH', formValue: '2003-08-15', documentValue: '15/08/2003' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH', formValue: 'INC-2024-98741', documentValue: 'INC-2024-98741' }
        }
      }
    });

    const panel = document.querySelector('[data-guard-panel="name"]');
    expect(panel.style.display).toBe('block');
    expect(panel.classList.contains('guard-panel-review')).toBe(true);

    // Verify non-accusatory phrasing
    expect(panel.textContent).toContain('Verification Needs Review');
    expect(panel.textContent).not.toContain('Definite mismatch');
    expect(panel.textContent).toContain('Check that the document is readable and that the Full Name is clearly visible.');
    ui.cleanup();
  });

  // =========================================================================
  // 4. DOCUMENT STATUS CARD (4 TRACKS)
  // =========================================================================
  it('11. document status card accurately reflects all 4 tracks', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png', formattedSize: '45.2 KB' },
        fileValidation: { passed: true, reasons: [] },
        quality: { status: 'succeeded', passed: true, blurScore: 65.4, reasons: [] },
        ocr: { status: 'succeeded', confidence: 91, text: 'CERTIFICATE 2024' }
      },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { status: 'MATCH' },
          dob: { status: 'MATCH' },
          certificateNumber: { status: 'MATCH' }
        }
      }
    });

    const pillFile = document.getElementById('guard-pill-file');
    const pillQuality = document.getElementById('guard-pill-quality');
    const pillOcr = document.getElementById('guard-pill-ocr');
    const pillVerif = document.getElementById('guard-pill-verification');

    expect(pillFile.textContent).toContain('VALID');
    expect(pillFile.className).toContain('valid');

    expect(pillQuality.textContent).toContain('PASS');
    expect(pillQuality.className).toContain('pass');

    expect(pillOcr.textContent).toContain('SUCCESS');
    expect(pillOcr.className).toContain('succeeded');

    expect(pillVerif.textContent).toContain('MATCH');
    expect(pillVerif.className).toContain('match');
    ui.cleanup();
  });

  it('12. document status card displays file rejection reason on invalid file', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'doc.exe', formattedSize: '1.2 MB' },
        fileValidation: { passed: false, reasons: ['File type not allowed. Must be PDF, PNG, or JPEG.'] },
        quality: { status: 'not_run' },
        ocr: { status: 'not_run' }
      },
      verification: {
        status: 'idle',
        overallStatus: null
      }
    });

    const pillFile = document.getElementById('guard-pill-file');
    const descFile = document.getElementById('guard-desc-file');

    expect(pillFile.textContent).toContain('INVALID');
    expect(pillFile.className).toContain('invalid');
    expect(descFile.textContent).toContain('File type not allowed');
    ui.cleanup();
  });

  // =========================================================================
  // 5. OVERALL STATUS BANNER
  // =========================================================================
  it('13. renders "✓ ALL CHECKS PASS" (neutral, NOT "READY TO SUBMIT") when all checks pass', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 90 }
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
    });

    const banner = document.getElementById('guard-overall-banner');
    const title = document.getElementById('guard-banner-title');
    const badge = document.getElementById('guard-banner-badge');

    expect(banner.classList.contains('pass')).toBe(true);
    expect(title.textContent).toBe('✓ ALL CHECKS PASS');
    expect(title.textContent).not.toContain('READY TO SUBMIT'); // Stop rule constraint!
    expect(badge.textContent).toBe('ALL PASS');
    ui.cleanup();
  });

  it('14. renders "✕ ACTION REQUIRED" when any field mismatches', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
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
          name: { status: 'MISMATCH', formValue: 'Rohan Sharma', documentValue: 'Different Name' }
        }
      }
    });

    const banner = document.getElementById('guard-overall-banner');
    const title = document.getElementById('guard-banner-title');
    const badge = document.getElementById('guard-banner-badge');

    expect(banner.classList.contains('mismatch')).toBe(true);
    expect(title.textContent).toBe('✕ ACTION REQUIRED');
    expect(badge.textContent).toBe('ACTION REQUIRED');
    ui.cleanup();
  });

  it('15. renders "⚠ NEEDS REVIEW" when OCR or verification flags review', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: { name: 'income.png' },
        fileValidation: { passed: true },
        quality: { status: 'succeeded', passed: true },
        ocr: { status: 'succeeded', confidence: 50 }
      },
      verification: {
        status: 'completed',
        overallStatus: 'NEEDS_REVIEW',
        fields: {}
      }
    });

    const banner = document.getElementById('guard-overall-banner');
    const title = document.getElementById('guard-banner-title');
    const badge = document.getElementById('guard-banner-badge');

    expect(banner.classList.contains('review')).toBe(true);
    expect(title.textContent).toBe('⚠ NEEDS REVIEW');
    expect(badge.textContent).toBe('NEEDS REVIEW');
    ui.cleanup();
  });

  it('16. renders "DOCUMENT REQUIRED" when certificate has not been uploaded yet', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: {
        file: null,
        fileValidation: { passed: false }
      },
      verification: {
        status: 'idle',
        overallStatus: null
      }
    });

    const banner = document.getElementById('guard-overall-banner');
    const title = document.getElementById('guard-banner-title');
    const badge = document.getElementById('guard-banner-badge');

    expect(banner.classList.contains('waiting-type')).toBe(true);
    expect(title.textContent).toBe('Document Required');
    expect(badge.textContent).toBe('NO CERTIFICATE');
    ui.cleanup();
  });

  // =========================================================================
  // 6. DYNAMIC SCHEMA SWITCHING TESTS
  // =========================================================================
  it('17. dynamically hides dob badge and panel when switched to communityCertificate', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    // First: Income Certificate (includes dob)
    ui.render({
      documentType: 'incomeCertificate',
      document: { file: { name: 'income.png' }, fileValidation: { passed: true }, quality: { status: 'succeeded', passed: true }, ocr: { status: 'succeeded' } },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { field: 'name', status: 'MATCH' },
          dob: { field: 'dob', status: 'MATCH' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH' }
        }
      }
    });

    const dobBadge = document.querySelector('[data-guard-field="dob"]');
    expect(dobBadge.style.display).toBe('inline-flex');

    // Second: Switch to Community Certificate (schema omits dob)
    ui.render({
      documentType: 'communityCertificate',
      document: { file: { name: 'comm.png' }, fileValidation: { passed: true }, quality: { status: 'succeeded', passed: true }, ocr: { status: 'succeeded' } },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { field: 'name', status: 'MATCH' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH' }
        }
      }
    });

    expect(dobBadge.style.display).toBe('none'); // Hidden!
    const nameBadge = document.querySelector('[data-guard-field="name"]');
    const certBadge = document.querySelector('[data-guard-field="certificateNumber"]');
    expect(nameBadge.style.display).toBe('inline-flex');
    expect(certBadge.style.display).toBe('inline-flex');
    ui.cleanup();
  });

  it('18. dynamically restores dob badge when switched back to incomeCertificate', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    // Community Certificate (omits dob)
    ui.render({
      documentType: 'communityCertificate',
      document: { file: { name: 'comm.png' }, fileValidation: { passed: true }, quality: { status: 'succeeded', passed: true }, ocr: { status: 'succeeded' } },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { field: 'name', status: 'MATCH' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH' }
        }
      }
    });

    const dobBadge = document.querySelector('[data-guard-field="dob"]');
    expect(dobBadge.style.display).toBe('none');

    // Switch back to Income Certificate
    ui.render({
      documentType: 'incomeCertificate',
      document: { file: { name: 'income.png' }, fileValidation: { passed: true }, quality: { status: 'succeeded', passed: true }, ocr: { status: 'succeeded' } },
      verification: {
        status: 'completed',
        overallStatus: 'MATCH',
        fields: {
          name: { field: 'name', status: 'MATCH' },
          dob: { field: 'dob', status: 'MATCH' },
          certificateNumber: { field: 'certificateNumber', status: 'MATCH' }
        }
      }
    });

    expect(dobBadge.style.display).toBe('inline-flex');
    ui.cleanup();
  });

  // =========================================================================
  // 7. CONTENT SCRIPT INTEGRATION & FULL LIFECYCLE
  // =========================================================================
  it('19. content script automatically initializes InPageUI on portal connect', () => {
    initializePortalConnection();
    const activeUI = getActiveInPageUI();
    expect(activeUI).not.toBeNull();
    expect(activeUI.injected).toBe(true);

    const banner = document.getElementById('guard-overall-banner');
    expect(banner).not.toBeNull();
  });

  it('20. content script revalidateField triggers InPageUI.render reactively', () => {
    initializePortalConnection();
    const activeUI = getActiveInPageUI();
    expect(activeUI).not.toBeNull();

    // Simulate verified document with schema-matching labels
    const status = getCurrentPortalStatus();
    status.document = {
      file: { name: 'income.png' },
      fileValidation: { passed: true },
      quality: { status: 'succeeded', passed: true },
      ocr: {
        status: 'succeeded',
        confidence: 92,
        text: 'Applicant Name: Rohan Sharma\nDate of Birth: 15-08-2003\nCertificate Number: INC-2024-98741'
      }
    };
    runCrossVerification();

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    expect(nameBadge.textContent).toContain('MATCH');

    // Change field to a mismatched value
    revalidateField('name', 'Wrong Name');

    const updatedNameBadge = document.querySelector('[data-guard-field="name"]');
    expect(updatedNameBadge.textContent).toContain('MISMATCH');

    const namePanel = document.querySelector('[data-guard-panel="name"]');
    expect(namePanel.style.display).toBe('block');
  });

  // =========================================================================
  // 8. CLEANUP & HOST FORM PRESERVATION
  // =========================================================================
  it('21. cleanup cleanly removes all injected guard elements without leaving orphans', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    expect(document.querySelectorAll('.guard-overall-banner, .guard-field-badge, .guard-inline-panel, .guard-doc-status-card').length).toBeGreaterThan(0);

    ui.cleanup();

    expect(document.getElementById('guard-overall-banner')).toBeNull();
    expect(document.getElementById('guard-doc-status-card')).toBeNull();
    expect(document.querySelectorAll('.guard-overall-banner, .guard-field-badge, .guard-inline-panel, .guard-doc-status-card').length).toBe(0);
  });

  it('22. host form inputs, datepicker, and submit button remain completely functional', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const nameInput = document.getElementById('applicant-name');
    const dobInput = document.getElementById('applicant-dob');
    const submitBtn = document.getElementById('submit-application');

    // Host elements are accessible and interactive
    nameInput.value = 'New Applicant';
    expect(nameInput.value).toBe('New Applicant');

    dobInput.value = '2004-01-01';
    expect(dobInput.value).toBe('2004-01-01');

    expect(submitBtn.disabled).toBe(false);
    ui.cleanup();
  });

  // =========================================================================
  // 9. ACCESSIBILITY & DESIGN CONSTRAINTS
  // =========================================================================
  it('23. status badges use both distinct icons and text labels (not color alone)', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    ui.render({
      documentType: 'incomeCertificate',
      document: { file: { name: 'income.png' }, fileValidation: { passed: true }, quality: { status: 'succeeded', passed: true }, ocr: { status: 'succeeded' } },
      verification: {
        status: 'completed',
        overallStatus: 'MISMATCH',
        fields: {
          name: { field: 'name', status: 'MATCH', formValue: 'Rohan Sharma', documentValue: 'Rohan Sharma' },
          dob: { field: 'dob', status: 'MISMATCH', formValue: '2003-08-15', documentValue: '01/01/2000' },
          certificateNumber: { field: 'certificateNumber', status: 'NEEDS_REVIEW', formValue: 'INC', documentValue: null }
        }
      }
    });

    const nameBadge = document.querySelector('[data-guard-field="name"]');
    const dobBadge = document.querySelector('[data-guard-field="dob"]');
    const certBadge = document.querySelector('[data-guard-field="certificateNumber"]');

    // Match has checkmark icon and text
    expect(nameBadge.querySelector('.guard-badge-icon').textContent).toBe('✓');
    expect(nameBadge.querySelector('.guard-badge-text').textContent).toBe('MATCH');

    // Mismatch has cross icon and text
    expect(dobBadge.querySelector('.guard-badge-icon').textContent).toBe('✕');
    expect(dobBadge.querySelector('.guard-badge-text').textContent).toBe('MISMATCH');

    // Review has warning icon and text
    expect(certBadge.querySelector('.guard-badge-icon').textContent).toBe('⚠');
    expect(certBadge.querySelector('.guard-badge-text').textContent).toBe('NEEDS REVIEW');
    ui.cleanup();
  });

  it('24. banner and inline panels have aria attributes for screen reader accessibility', () => {
    const ui = new InPageUI(mockPortalConfig);
    ui.initialize();

    const banner = document.getElementById('guard-overall-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');

    const panel = document.querySelector('[data-guard-panel="name"]');
    expect(panel.getAttribute('role')).toBe('alert');
    expect(panel.getAttribute('aria-live')).toBe('polite');
    ui.cleanup();
  });

  // =========================================================================
  // 10. POPUP DASHBOARD PARITY
  // =========================================================================
  it('25. popup HTML includes #popup-overall-banner with correct structure', () => {
    const fs = require('fs');
    const path = require('path');
    const popupHtml = fs.readFileSync(path.resolve(__dirname, '../../../extension/popup/popup.html'), 'utf-8');

    expect(popupHtml).toContain('id="popup-overall-banner"');
    expect(popupHtml).toContain('id="popup-banner-icon"');
    expect(popupHtml).toContain('id="popup-banner-title"');
    expect(popupHtml).toContain('id="popup-banner-subtitle"');
    expect(popupHtml).toContain('id="popup-banner-badge"');
  });

  it('26. popup CSS defines rules for .popup-overall-banner across all validation states', () => {
    const fs = require('fs');
    const path = require('path');
    const popupCss = fs.readFileSync(path.resolve(__dirname, '../../../extension/popup/popup.css'), 'utf-8');

    expect(popupCss).toContain('.popup-overall-banner');
    expect(popupCss).toContain('.popup-overall-banner.pass');
    expect(popupCss).toContain('.popup-overall-banner.mismatch');
    expect(popupCss).toContain('.popup-overall-banner.review');
    expect(popupCss).toContain('.popup-overall-banner.processing');
    expect(popupCss).toContain('.popup-overall-banner.waiting-type');
  });

  it('27. inPageUI CSS is scoped with .guard-* prefix to prevent collision with portal styles', () => {
    const fs = require('fs');
    const path = require('path');
    const inPageCss = fs.readFileSync(path.resolve(__dirname, '../../../extension/ui/inPageUI.css'), 'utf-8');

    expect(inPageCss).toContain('.guard-overall-banner');
    expect(inPageCss).toContain('.guard-field-badge');
    expect(inPageCss).toContain('.guard-inline-panel');
    expect(inPageCss).toContain('.guard-doc-status-card');
  });
});
