import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Modules under test
const { debounce } = require('../../../extension/utils/debounce.js');
const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');
const { FileDetector } = require('../../../extension/detectors/fileDetector.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');
const {
  initializePortalConnection,
  runCrossVerification,
  revalidateField,
  getDebouncedValidator,
  debouncedFieldValidators,
  getInstrumentation,
  resetInstrumentation,
  setDocumentType,
  getCurrentPortalStatus
} = require('../../../extension/content.js');
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');

function createMockDocFile(name = 'income_certificate.png', size = 50000, type = 'image/png') {
  const buffer = new Uint8Array(size);
  // PNG Magic bytes
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  return new File([buffer], name, { type });
}

describe('Phase 10: Real-Time Validation, Dependency-Aware Pipelines & Race Prevention', () => {
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  beforeEach(() => {
    vi.useFakeTimers();
    resetInstrumentation();

    delete window.location;
    window.location = new URL('http://localhost:5173/apply');

    document.body.innerHTML = `
      <form id="scholarship-form">
        <input id="applicant-name" value="Rohan Sharma" />
        <input id="applicant-dob" value="2003-08-15" />
        <input id="cert-number" value="INC-2024-98741" />
        <select id="document-type">
          <option value="">Select document type</option>
          <option value="incomeCertificate" selected>Income Certificate</option>
          <option value="communityCertificate">Community Certificate</option>
          <option value="residenceCertificate">Residence Certificate</option>
        </select>
        <input id="upload-certificate" type="file" />
        <button id="submit-application" type="submit">Submit</button>
      </form>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. DEBOUNCE UTILITY CORE TESTS
  // =========================================================================
  it('1. debounce utility delays function execution until timer expires', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced('a');
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('a');
  });

  it('2. debounce coalesces multiple rapid calls into a single invocation', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced('R');
    vi.advanceTimersByTime(50);
    debounced('Ro');
    vi.advanceTimersByTime(50);
    debounced('Roh');
    vi.advanceTimersByTime(50);
    debounced('Rohan');

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('Rohan');
  });

  it('3. debounce cancel() discards pending execution', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    debounced('cancelled');
    expect(debounced.isPending()).toBe(true);

    debounced.cancel();
    expect(debounced.isPending()).toBe(false);

    vi.advanceTimersByTime(400);
    expect(callback).not.toHaveBeenCalled();
  });

  it('4. debounce flush() executes pending call immediately', () => {
    const callback = vi.fn((x) => x.toUpperCase());
    const debounced = debounce(callback, 300);

    debounced('immediate');
    expect(callback).not.toHaveBeenCalled();

    const result = debounced.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('immediate');
    expect(result).toBe('IMMEDIATE');

    // Timer expiration after flush does not re-invoke
    vi.advanceTimersByTime(400);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // 2. CROSS-VERIFIER SINGLE-FIELD VERIFICATION & FIELD COMPARISON ISOLATION
  // =========================================================================
  it('5. CrossVerifier.verifyField evaluates only the target field and increments only that field counter', () => {
    const verifier = new CrossVerifier();
    verifier.resetMetrics();

    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    // Initial full verification
    const initialVerif = verifier.verify(
      { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      ocrResult,
      'incomeCertificate'
    );

    expect(initialVerif.overallStatus).toBe('MATCH');
    const initialMetrics = verifier.getMetrics();
    expect(initialMetrics.crossVerificationRuns).toBe(1);

    // Reset metrics to test verifyField isolation
    verifier.resetMetrics();

    // Re-verify ONLY name with a changed value
    const updatedVerif = verifier.verifyField(
      'name',
      'Rahul Sharma',
      ocrResult,
      'incomeCertificate',
      initialVerif
    );

    expect(updatedVerif.fields.name.status).toBe('MISMATCH');
    expect(updatedVerif.fields.dob.status).toBe('MATCH'); // unchanged
    expect(updatedVerif.fields.certificateNumber.status).toBe('MATCH'); // unchanged
    expect(updatedVerif.overallStatus).toBe('MISMATCH');

    const fieldMetrics = verifier.getMetrics();
    expect(fieldMetrics.crossVerificationRuns).toBe(0); // full verify was NOT run
    expect(fieldMetrics.fieldComparisonRuns.name).toBe(1);
    expect(fieldMetrics.fieldComparisonRuns.dob || 0).toBe(0); // dob comparison was NOT run
    expect(fieldMetrics.fieldComparisonRuns.certificateNumber || 0).toBe(0); // cert comparison was NOT run
  });

  it('6. CrossVerifier.verifyField dynamically recovers overallStatus to MATCH when mismatched field is corrected', () => {
    const verifier = new CrossVerifier();
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    // Initial state with name mismatch
    const initialVerif = verifier.verify(
      { name: 'Wrong Name', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      ocrResult,
      'incomeCertificate'
    );
    expect(initialVerif.overallStatus).toBe('MISMATCH');

    // Correct the name field
    const correctedVerif = verifier.verifyField(
      'name',
      'Rohan Sharma',
      ocrResult,
      'incomeCertificate',
      initialVerif
    );

    expect(correctedVerif.fields.name.status).toBe('MATCH');
    expect(correctedVerif.overallStatus).toBe('MATCH');
    expect(correctedVerif.reasons.length).toBe(0);
  });

  // =========================================================================
  // 3. REACTIVE FORM TYPING & DEBOUNCE INTEGRATION
  // =========================================================================
  it('7. Typing in form field does NOT re-run file validation, quality analysis, or OCR', async () => {
    initializePortalConnection();
    resetInstrumentation();

    // Set initial document OCR result in portal status
    const status = getCurrentPortalStatus();
    status.document.ocr = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };
    runCrossVerification();

    resetInstrumentation();

    // Simulate typing in the name input
    const nameInput = document.getElementById('applicant-name');
    nameInput.value = 'Rohan';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    nameInput.value = 'Rohan S';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    nameInput.value = 'Rohan Sharma';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Before timer expires, debounced validation has not fired
    const preTimerMetrics = getInstrumentation();
    expect(preTimerMetrics.fieldComparisonRuns.name || 0).toBe(0);

    // Fast-forward debounce delay
    vi.advanceTimersByTime(300);

    const postTimerMetrics = getInstrumentation();
    expect(postTimerMetrics.fieldComparisonRuns.name).toBe(1);
    expect(postTimerMetrics.fieldComparisonRuns.dob || 0).toBe(0);
    expect(postTimerMetrics.fieldComparisonRuns.certificateNumber || 0).toBe(0);

    // Strict non-rerun guarantee for heavy pipeline phases
    expect(postTimerMetrics.fileValidationRuns).toBe(0);
    expect(postTimerMetrics.qualityAnalysisRuns).toBe(0);
    expect(postTimerMetrics.ocrRuns).toBe(0);
  });

  it('8. Document type change executes immediately without typing debounce delay', () => {
    initializePortalConnection();
    resetInstrumentation();

    const status = getCurrentPortalStatus();
    status.document.ocr = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741\nAnnual Income: 120000'
    };
    runCrossVerification();

    const docTypeSelect = document.getElementById('document-type');
    docTypeSelect.value = 'communityCertificate';
    docTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    // Document type change runs synchronously / immediately
    const updatedStatus = getCurrentPortalStatus();
    expect(updatedStatus.documentType).toBe('communityCertificate');
    expect(updatedStatus.verification.documentType).toBe('communityCertificate');
  });

  // =========================================================================
  // 4. DOCUMENT CHANGE & RUN GENERATION RACE PREVENTION
  // =========================================================================
  it('9. FileDetector assigns an incrementing currentRunId on each processFile call', async () => {
    const mockValidator = { validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'f1.png' } }) };
    const detector = new FileDetector(mockPortalConfig, mockValidator);

    expect(detector.currentRunId).toBe(0);

    const f1 = createMockDocFile('f1.png');
    await detector.processFile(f1);
    expect(detector.currentRunId).toBe(1);

    const f2 = createMockDocFile('f2.png');
    await detector.processFile(f2);
    expect(detector.currentRunId).toBe(2);
  });

  it('10. Stale OCR results from a superseded runId are discarded and never overwrite newer state', async () => {
    let slowResolveOcr = null;
    let fastResolveOcr = null;

    const mockValidator = {
      validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'doc.png' } })
    };

    const mockOcr = {
      recognize: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { slowResolveOcr = resolve; }))
        .mockImplementationOnce(() => new Promise((resolve) => { fastResolveOcr = resolve; }))
    };

    const detector = new FileDetector(mockPortalConfig, mockValidator, null, mockOcr);
    detector.initialize();

    const fileA = createMockDocFile('doc_slow.png');
    const fileB = createMockDocFile('doc_fast.png');

    // 1. Start file A (run 1) and advance microtasks to reach in-flight OCR
    const promiseA = detector.processFile(fileA);
    await Promise.resolve();
    await Promise.resolve();
    expect(typeof slowResolveOcr).toBe('function');

    // 2. While file A OCR is in-flight, user replaces with file B (run 2)
    const promiseB = detector.processFile(fileB);
    await Promise.resolve();
    await Promise.resolve();
    expect(typeof fastResolveOcr).toBe('function');

    expect(detector.currentRunId).toBe(2);

    // 3. Fast file B finishes first
    fastResolveOcr({
      status: 'succeeded',
      confidence: 95,
      text: 'FAST FILE OCR - WINNER'
    });
    await promiseB;

    expect(detector.getFileState().ocr.text).toBe('FAST FILE OCR - WINNER');
    expect(detector.getFileState().ocr.confidence).toBe(95);

    // 4. Stale slow file A finishes later
    slowResolveOcr({
      status: 'succeeded',
      confidence: 40,
      text: 'SLOW OBSOLETE OCR - MUST BE DISCARDED'
    });
    await promiseA;

    // Must still reflect file B!
    expect(detector.getFileState().ocr.text).toBe('FAST FILE OCR - WINNER');
    expect(detector.getFileState().ocr.confidence).toBe(95);
  });

  it('11. Superseded runs during quality analysis are aborted before modifying quality state', async () => {
    let slowQualityResolve = null;
    let fastQualityResolve = null;

    const mockValidator = {
      validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'doc.png' } })
    };

    const mockQA = {
      analyze: vi.fn()
        .mockImplementationOnce(() => new Promise((res) => { slowQualityResolve = res; }))
        .mockImplementationOnce(() => new Promise((res) => { fastQualityResolve = res; }))
    };

    const detector = new FileDetector(mockPortalConfig, mockValidator, mockQA, null);
    detector.initialize();

    const file1 = createMockDocFile('first.png');
    const file2 = createMockDocFile('second.png');

    // 1. Start file 1 and advance microtasks to enter in-flight quality analysis
    const p1 = detector.processFile(file1);
    await Promise.resolve();
    await Promise.resolve();
    expect(typeof slowQualityResolve).toBe('function');

    // 2. While quality analysis for file 1 is in-flight, user selects file 2
    const p2 = detector.processFile(file2);
    await Promise.resolve();
    await Promise.resolve();
    expect(typeof fastQualityResolve).toBe('function');

    // Fast second file resolves quality
    fastQualityResolve({
      passed: true,
      blurScore: 3000,
      resolutionOk: true,
      brightnessOk: true,
      contrastOk: true,
      croppingOk: true
    });
    await p2;

    expect(detector.getFileState().quality.passed).toBe(true);
    expect(detector.getFileState().quality.blurScore).toBe(3000);

    // Slow first file resolves with failed quality
    slowQualityResolve({
      passed: false,
      blurScore: 10,
      reasons: ['Old blurry file']
    });
    await p1;

    // Stale slow quality analysis must NOT overwrite newer state
    expect(detector.getFileState().quality.passed).toBe(true);
    expect(detector.getFileState().quality.blurScore).toBe(3000);
  });

  // =========================================================================
  // 5. SCHEMA SWITCHING WITHOUT OCR RE-RUN
  // =========================================================================
  it('12. Changing document type re-runs comparisons with existing OCR without re-running OCR', async () => {
    const verifier = new CrossVerifier();
    verifier.resetMetrics();

    const ocrResult = {
      status: 'succeeded',
      confidence: 92,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const formData = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: 'INC-2024-98741',
      documentType: 'incomeCertificate'
    };

    // 1. Initial verification on incomeCertificate
    const verif1 = verifier.verify(formData, ocrResult, 'incomeCertificate');
    expect(verif1.overallStatus).toBe('MATCH');
    expect(verif1.documentType).toBe('incomeCertificate');

    // 2. Change document type to communityCertificate
    const verif2 = verifier.verify(formData, ocrResult, 'communityCertificate');
    expect(verif2.documentType).toBe('communityCertificate');
    expect(verif2.fields.certificateNumber).toBeDefined();

    // Existing OCR was reused directly; verify metrics
    expect(verifier.getMetrics().crossVerificationRuns).toBe(2);
  });

  // =========================================================================
  // 6. INSTRUMENTATION COUNTERS & EXTENSION API
  // =========================================================================
  it('13. getInstrumentation and resetInstrumentation accurately report and reset execution counts', async () => {
    initializePortalConnection();
    resetInstrumentation();

    const initialCounts = getInstrumentation();
    expect(initialCounts.fileValidationRuns).toBe(0);
    expect(initialCounts.qualityAnalysisRuns).toBe(0);
    expect(initialCounts.ocrRuns).toBe(0);
    expect(initialCounts.crossVerificationRuns).toBe(0);

    // Trigger field revalidation
    revalidateField('name', 'Rohan Sharma');
    const updatedCounts = getInstrumentation();
    expect(updatedCounts.fieldComparisonRuns.name).toBe(1);

    // Reset instrumentation
    resetInstrumentation();
    const resetCounts = getInstrumentation();
    expect(resetCounts.fieldComparisonRuns.name || 0).toBe(0);
  });

  // =========================================================================
  // 7. FORM INTEGRITY DURING PIPELINE PROCESSING
  // =========================================================================
  it('14. Form state values remain strictly preserved when new documents are selected', async () => {
    const formDetector = new FormDetector(mockPortalConfig);
    formDetector.initialize();

    const mockVal = { validate: vi.fn().mockResolvedValue({ passed: true, reasons: [], file: { name: 'cert.png' } }) };
    const mockOcr = { recognize: vi.fn().mockResolvedValue({ status: 'succeeded', confidence: 90, text: 'Name: Rohan Sharma' }) };
    const fileDetector = new FileDetector(mockPortalConfig, mockVal, null, mockOcr);
    fileDetector.initialize();

    const file = createMockDocFile('cert.png');
    await fileDetector.processFile(file);

    const formState = formDetector.getFormState();
    expect(formState.name.value).toBe('Rohan Sharma');
    expect(formState.dob.value).toBe('2003-08-15');
    expect(formState.certificateNumber.value).toBe('INC-2024-98741');

    formDetector.cleanup();
    fileDetector.cleanup();
  });

  // =========================================================================
  // 8. ADDITIONAL TARGETED ISOLATION & RESILIENCE TESTS
  // =========================================================================
  it('15. dob field re-validation isolates to dob without re-evaluating other fields', () => {
    const verifier = new CrossVerifier();
    verifier.resetMetrics();

    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const initial = verifier.verify(
      { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      ocrResult,
      'incomeCertificate'
    );
    expect(initial.overallStatus).toBe('MATCH');

    verifier.resetMetrics();
    const updated = verifier.verifyField('dob', '1999-01-01', ocrResult, 'incomeCertificate', initial);

    expect(updated.fields.dob.status).toBe('MISMATCH');
    expect(updated.fields.name.status).toBe('MATCH');
    expect(updated.overallStatus).toBe('MISMATCH');

    const metrics = verifier.getMetrics();
    expect(metrics.fieldComparisonRuns.dob).toBe(1);
    expect(metrics.fieldComparisonRuns.name || 0).toBe(0);
    expect(metrics.fieldComparisonRuns.certificateNumber || 0).toBe(0);
  });

  it('16. certificateNumber re-validation isolates to certificateNumber without re-evaluating other fields', () => {
    const verifier = new CrossVerifier();
    verifier.resetMetrics();

    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const initial = verifier.verify(
      { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      ocrResult,
      'incomeCertificate'
    );
    expect(initial.overallStatus).toBe('MATCH');

    verifier.resetMetrics();
    const updated = verifier.verifyField('certificateNumber', 'INC-9999-00000', ocrResult, 'incomeCertificate', initial);

    expect(updated.fields.certificateNumber.status).toBe('MISMATCH');
    expect(updated.fields.name.status).toBe('MATCH');
    expect(updated.fields.dob.status).toBe('MATCH');
    expect(updated.overallStatus).toBe('MISMATCH');

    const metrics = verifier.getMetrics();
    expect(metrics.fieldComparisonRuns.certificateNumber).toBe(1);
    expect(metrics.fieldComparisonRuns.name || 0).toBe(0);
    expect(metrics.fieldComparisonRuns.dob || 0).toBe(0);
  });

  it('17. Invalid file upload stops at Phase 4 and does NOT run quality analysis or OCR', async () => {
    const mockValidator = {
      validate: vi.fn().mockResolvedValue({
        passed: false,
        reasons: ['Invalid file format.'],
        file: { name: 'virus.exe' }
      })
    };
    const mockQuality = { analyze: vi.fn() };
    const mockOcr = { recognize: vi.fn() };

    const detector = new FileDetector(mockPortalConfig, mockValidator, mockQuality, mockOcr);
    detector.initialize();

    const invalidFile = new File([new Uint8Array([0x00, 0x01])], 'virus.exe', { type: 'application/x-msdownload' });
    await detector.processFile(invalidFile);

    expect(mockValidator.validate).toHaveBeenCalledTimes(1);
    expect(mockQuality.analyze).not.toHaveBeenCalled();
    expect(mockOcr.recognize).not.toHaveBeenCalled();

    const metrics = detector.getMetrics();
    expect(metrics.fileValidationRuns).toBe(1);
    expect(metrics.qualityAnalysisRuns).toBe(0);
    expect(metrics.ocrRuns).toBe(0);

    const state = detector.getFileState();
    expect(state.fileValidation.passed).toBe(false);
    expect(state.quality.status).toBe('not_run');
    expect(state.ocr.status).toBe('not_run');
  });

  it('18. Rapid typing resets debounce timer at each keystroke', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    // Keystroke 1 at t=0
    debounced('a');
    vi.advanceTimersByTime(200); // t=200

    // Keystroke 2 at t=200 (resets timer for another 300ms, until t=500)
    debounced('ab');
    vi.advanceTimersByTime(200); // t=400
    expect(callback).not.toHaveBeenCalled();

    // Keystroke 3 at t=400 (resets timer for another 300ms, until t=700)
    debounced('abc');
    vi.advanceTimersByTime(200); // t=600
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100); // t=700
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('abc');
  });

  it('19. Clearing required field transitions status to NEEDS_REVIEW and restoring it recovers to MATCH', () => {
    const verifier = new CrossVerifier();
    const ocrResult = {
      status: 'succeeded',
      confidence: 90,
      text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
    };

    const initial = verifier.verify(
      { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' },
      ocrResult,
      'incomeCertificate'
    );
    expect(initial.overallStatus).toBe('MATCH');

    // Clear name
    const cleared = verifier.verifyField('name', '', ocrResult, 'incomeCertificate', initial);
    expect(cleared.fields.name.status).toBe('NEEDS_REVIEW');
    expect(cleared.overallStatus).toBe('NEEDS_REVIEW');

    // Re-fill name
    const restored = verifier.verifyField('name', 'Rohan Sharma', ocrResult, 'incomeCertificate', cleared);
    expect(restored.fields.name.status).toBe('MATCH');
    expect(restored.overallStatus).toBe('MATCH');
  });

  it('20. WAITING_FOR_TYPE and SCHEMA_UNAVAILABLE states are reported accurately', () => {
    const verifier = new CrossVerifier();

    // No document type specified
    const waiting = verifier.verify({ name: 'Rohan Sharma' }, null, null);
    expect(waiting.overallStatus).toBe('WAITING_FOR_TYPE');
    expect(waiting.status).toBe('waiting_for_schema');

    // Unknown/unsupported schema type
    const unsupported = verifier.verify({ name: 'Rohan Sharma' }, null, 'nonExistentCertType');
    expect(unsupported.overallStatus).toBe('SCHEMA_UNAVAILABLE');
    expect(unsupported.status).toBe('failed');
  });

  it('21. Rapid replacement where second file is invalid aborts run 1 and leaves state cleanly failed', async () => {
    let slowQualityResolve = null;
    const mockValidator = {
      validate: vi.fn()
        .mockResolvedValueOnce({ passed: true, reasons: [], file: { name: 'f1.png' } })
        .mockResolvedValueOnce({ passed: false, reasons: ['Corrupted file header'], file: { name: 'f2_corrupt.png' } })
    };
    const mockQuality = {
      analyze: vi.fn().mockImplementationOnce(() => new Promise((res) => { slowQualityResolve = res; }))
    };

    const detector = new FileDetector(mockPortalConfig, mockValidator, mockQuality, null);
    detector.initialize();

    const file1 = createMockDocFile('f1.png');
    const file2 = createMockDocFile('f2_corrupt.png');

    const p1 = detector.processFile(file1);
    await Promise.resolve();
    await Promise.resolve();

    const p2 = detector.processFile(file2);
    await p2;

    expect(detector.currentRunId).toBe(2);
    expect(detector.getFileState().fileValidation.passed).toBe(false);
    expect(detector.getFileState().fileValidation.reasons[0]).toBe('Corrupted file header');

    // When slow file 1 quality resolves, it must not overwrite the failed state
    slowQualityResolve({ passed: true, blurScore: 3500 });
    await p1;

    expect(detector.getFileState().fileValidation.passed).toBe(false);
    expect(detector.getFileState().quality.status).toBe('not_run');
  });
});

