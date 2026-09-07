import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const { SubmitGuard } = require('../../../extension/guards/submitGuard.js');
const { InPageUI } = require('../../../extension/ui/inPageUI.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');
const { validateAllFields, validateField } = require('../../../extension/validators/inputValidator.js');
const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

describe('Submission Guard Issues Fix: Mobile Number & Distinct Review Messages', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="scholarship-form">
        <input id="applicant-name" value="Rohan Sharma" />
        <input id="applicant-dob" type="date" value="2003-08-15" />
        <input id="applicant-mobile" name="mobile" type="tel" value="9876543210" />
        <input id="applicant-email" name="email" type="email" value="rohan@example.com" />
        <input id="cert-number" value="INC-2024-98741" />
        <select id="document-type">
          <option value="incomeCertificate" selected>Income Certificate</option>
        </select>
        <input id="upload-certificate" type="file" />
        <button id="submit-application" type="submit">Submit Application</button>
      </form>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('1. FormDetector detects and tracks #applicant-mobile in live DOM', () => {
    const detector = new FormDetector(mockPortalConfig);
    const state = detector.initialize();

    expect(state.mobile).toBeDefined();
    expect(state.mobile.value).toBe('9876543210');
    expect(state.mobile.found).toBe(true);

    detector.cleanup();
  });

  it('2. validateAllFields successfully reads mobile number from live DOM when unprovided in formState', () => {
    // Simulate formState missing mobile field (as occurred before fix)
    const partialFormState = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: 'INC-2024-98741'
    };

    const errors = validateAllFields(partialFormState);
    const mobileError = errors.find((e) => e.field === 'mobile');
    // Because #applicant-mobile in DOM has '9876543210', it should be valid (no MISSING_FIELD error)
    expect(mobileError).toBeUndefined();
  });

  it('3. InPageUI provides field-specific messages and deduplicates bullets for multiple NEEDS_REVIEW fields', () => {
    const inPageUI = new InPageUI(mockPortalConfig);
    inPageUI.initialize();

    const multipleReviewDecision = {
      allowed: false,
      reasons: [
        'Full Name requires manual review before submission.',
        'Date of Birth requires manual review before submission.',
        'Certificate Number requires manual review before submission.'
      ],
      blockingFields: [
        { field: 'name', displayName: 'Full Name', type: 'NEEDS_REVIEW' },
        { field: 'dob', displayName: 'Date of Birth', type: 'NEEDS_REVIEW' },
        { field: 'certificateNumber', displayName: 'Certificate Number', type: 'NEEDS_REVIEW' }
      ]
    };

    inPageUI.showErrorPopup(multipleReviewDecision);
    const popup = document.getElementById('guard-error-popup');
    expect(popup).not.toBeNull();

    const popupText = popup.textContent;
    // Must contain distinct messages identifying the fields
    expect(popupText).toContain('full name');
    expect(popupText).toContain('date of birth');
    expect(popupText).toContain('certificate number');

    // Bullets must be distinct, not repeating the exact same sentence 3 times
    const bullets = popup.querySelectorAll('li');
    expect(bullets.length).toBe(3);
    const bulletTexts = Array.from(bullets).map((b) => b.textContent);
    const uniqueBulletTexts = new Set(bulletTexts);
    expect(uniqueBulletTexts.size).toBe(3);

    inPageUI.cleanup();
  });

  it('4. CrossVerifier extracts fields when formatted with alternative delimiters or across lines', () => {
    const verifier = new CrossVerifier();
    const multilineOcr = `
      GOVERNMENT OF STATE - INCOME CERTIFICATE
      Certificate No | INC-2024-98741
      Applicant Name:
      Rohan Sharma
      Date of Birth: 15-08-2003
    `;

    const result = verifier.verify(
      { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      { status: 'succeeded', confidence: 92, text: multilineOcr },
      'incomeCertificate'
    );

    expect(result.overallStatus).toBe('MATCH');
    expect(result.fields.name.status).toBe('MATCH');
    expect(result.fields.dob.status).toBe('MATCH');
    expect(result.fields.certificateNumber.status).toBe('MATCH');
  });
});
