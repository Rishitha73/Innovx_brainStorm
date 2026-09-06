// Pre-Submission Error Guard - Content Script (Phase 6)
// Connects extension to supported portals, tracks form data, validates documents, analyzes quality, and runs client-side OCR

console.log('content script loaded');

let activeFormDetector = null;
let activeFileDetector = null;
let activeCrossVerifier = null;

// Central in-memory state for the active tab (Form State, Document State, and Cross-Verification)
const globalWin = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);

let currentPortalStatus = {
  active: false,
  portalId: null,
  portalName: null,
  url: globalWin && globalWin.location ? globalWin.location.href : '',
  selectors: [],
  foundCount: 0,
  missingCount: 0,
  formFields: {},
  form: {},
  document: {
    file: null,
    fileValidation: {
      passed: false,
      reasons: []
    },
    quality: {
      status: 'not_run',
      blurScore: null,
      resolutionOk: null,
      brightnessOk: null,
      contrastOk: null,
      croppingOk: null,
      passed: null,
      reasons: []
    },
    ocr: {
      status: 'not_run',
      text: '',
      confidence: 0,
      reasons: []
    }
  },
  verification: {
    status: 'idle',
    overallStatus: null,
    fields: {
      name: { field: 'name', strategy: 'fuzzyNormalized', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', score: null, reason: 'Document OCR has not completed.' },
      dob: { field: 'dob', strategy: 'exactNormalizedDate', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'Document OCR has not completed.' },
      certificateNumber: { field: 'certificateNumber', strategy: 'exactNormalizedString', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'Document OCR has not completed.' }
    },
    extractedFields: { name: null, dob: null, certificateNumber: null },
    reasons: []
  },
  timestamp: Date.now()
};

function runCrossVerification() {
  if (!activeCrossVerifier) {
    return currentPortalStatus.verification;
  }
  if (activeFormDetector && typeof activeFormDetector.syncWithDom === 'function') {
    activeFormDetector.syncWithDom();
    currentPortalStatus.formFields = activeFormDetector.getFormState(false);
    currentPortalStatus.form = currentPortalStatus.formFields;
  }
  const formState = activeFormDetector ? activeFormDetector.getFormState() : (currentPortalStatus.formFields || currentPortalStatus.form || {});
  const ocrState = currentPortalStatus.document ? currentPortalStatus.document.ocr : null;
  
  const schemaGetter = (typeof getSchema === 'function')
    ? getSchema
    : (globalThis.getSchema || (globalThis.SchemaRegistry && globalThis.SchemaRegistry.getSchema) || null);
  const activeSchema = schemaGetter ? schemaGetter('incomeCertificate') : (globalThis.INCOME_CERTIFICATE_SCHEMA || null);

  const verif = activeCrossVerifier.verify(formState, ocrState, activeSchema);
  currentPortalStatus.verification = verif;
  currentPortalStatus.timestamp = Date.now();
  return verif;
}

function initializePortalConnection() {
  const win = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);
  const currentUrl = win && win.location ? win.location.href : '';
  const portalMatcher = (typeof matchPortal === 'function')
    ? matchPortal
    : (globalThis.matchPortal || null);

  const matchingPortal = portalMatcher ? portalMatcher(currentUrl) : null;

  if (matchingPortal) {
    console.log(`[Pre-Submission Error Guard] Active on: ${matchingPortal.portalId}`);

    // 1. Resolve selectors against DOM
    const selectorGetter = (typeof getAllConfiguredSelectors === 'function')
      ? getAllConfiguredSelectors
      : (globalThis.getAllConfiguredSelectors || null);

    const configuredSelectors = selectorGetter ? selectorGetter(matchingPortal) : [];
    const resolutionResults = [];
    let foundCount = 0;
    let missingCount = 0;

    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    configuredSelectors.forEach((item) => {
      try {
        const element = doc ? doc.querySelector(item.selector) : null;
        const isFound = Boolean(element);

        if (isFound) {
          console.log(`[Pre-Submission Error Guard] Selector resolved: ${item.selector} -> FOUND`);
          foundCount++;
        } else {
          console.warn(`[Pre-Submission Error Guard] Missing configured selector: ${item.selector}`);
          missingCount++;
        }

        resolutionResults.push({
          name: item.name,
          selector: item.selector,
          found: isFound
        });
      } catch (err) {
        console.warn(`[Pre-Submission Error Guard] Error querying selector ${item.selector}:`, err);
        missingCount++;
        resolutionResults.push({
          name: item.name,
          selector: item.selector,
          found: false,
          error: err.message
        });
      }
    });

    // 2. Initialize Form Detector for real-time field tracking
    const FormDetectorClass = (typeof FormDetector === 'function')
      ? FormDetector
      : (globalThis.FormDetector || null);

    let initialFields = {};
    if (FormDetectorClass) {
      if (activeFormDetector) {
        activeFormDetector.cleanup();
      }
      activeFormDetector = new FormDetectorClass(matchingPortal);
      initialFields = activeFormDetector.initialize();

      // Listen for form field changes
      activeFormDetector.onFieldChange((changedField, fieldData, fullState) => {
        currentPortalStatus.formFields = fullState;
        currentPortalStatus.form = fullState;
        const verifState = runCrossVerification();
        currentPortalStatus.timestamp = Date.now();

        try {
          chrome.runtime.sendMessage({
            type: 'FORM_FIELD_CHANGED',
            portalId: matchingPortal.portalId,
            changedField,
            fieldData,
            formFields: fullState,
            form: fullState,
            verification: verifState
          });
        } catch (e) {
          console.debug('Background message notification deferred:', e);
        }
      });
    }

    // 3. Initialize File Detector for client-side document validation, quality analysis & OCR
    const FileDetectorClass = (typeof FileDetector === 'function')
      ? FileDetector
      : (globalThis.FileDetector || null);
    const FileValidatorClass = (typeof FileValidator === 'function')
      ? FileValidator
      : (globalThis.FileValidator || null);
    const QualityAnalyzerClass = (typeof QualityAnalyzer === 'function')
      ? QualityAnalyzer
      : (globalThis.QualityAnalyzer || null);
    const OcrEngineClass = (typeof OcrEngine === 'function')
      ? OcrEngine
      : (globalThis.OcrEngine || null);

    let initialDocState = {
      file: null,
      fileValidation: {
        passed: false,
        reasons: []
      },
      quality: {
        status: 'not_run',
        blurScore: null,
        resolutionOk: null,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        passed: null,
        reasons: []
      },
      ocr: {
        status: 'not_run',
        text: '',
        confidence: 0,
        reasons: []
      }
    };

    if (FileDetectorClass) {
      if (activeFileDetector) {
        activeFileDetector.cleanup();
      }
      const validatorInstance = FileValidatorClass ? new FileValidatorClass() : null;
      const qualityAnalyzerInstance = QualityAnalyzerClass ? new QualityAnalyzerClass() : null;
      const ocrEngineInstance = OcrEngineClass ? new OcrEngineClass() : null;
      activeFileDetector = new FileDetectorClass(
        matchingPortal,
        validatorInstance,
        qualityAnalyzerInstance,
        ocrEngineInstance
      );
      initialDocState = activeFileDetector.initialize();

      // Listen for file selections, validation, quality, and OCR events
      activeFileDetector.onFileValidated((docState) => {
        if (activeFormDetector && typeof activeFormDetector.syncWithDom === 'function') {
          activeFormDetector.syncWithDom();
          currentPortalStatus.formFields = activeFormDetector.getFormState(false);
          currentPortalStatus.form = currentPortalStatus.formFields;
        }
        currentPortalStatus.document = docState;
        const verifState = runCrossVerification();
        currentPortalStatus.timestamp = Date.now();

        try {
          chrome.runtime.sendMessage({
            type: 'FILE_VALIDATED',
            portalId: matchingPortal.portalId,
            document: docState,
            formFields: currentPortalStatus.formFields,
            form: currentPortalStatus.formFields,
            verification: verifState
          });
        } catch (e) {
          console.debug('Background message notification deferred:', e);
        }
      });
    }

    // 4. Initialize Cross-Verifier (Phase 7)
    const CrossVerifierClass = (typeof CrossVerifier === 'function')
      ? CrossVerifier
      : (globalThis.CrossVerifier || null);
    activeCrossVerifier = CrossVerifierClass ? new CrossVerifierClass() : null;

    const initialVerification = runCrossVerification();

    currentPortalStatus = {
      active: true,
      portalId: matchingPortal.portalId,
      portalName: matchingPortal.displayName,
      url: currentUrl,
      selectors: resolutionResults,
      foundCount,
      missingCount,
      formFields: initialFields,
      form: initialFields,
      document: initialDocState,
      verification: initialVerification,
      timestamp: Date.now()
    };

    // Notify background worker of active status
    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_LOADED',
        portalType: 'PORTAL_ACTIVATED',
        status: currentPortalStatus
      });
    } catch (e) {
      console.debug('Background notification deferred:', e);
    }
  } else {
    console.log(`[Pre-Submission Error Guard] Inactive (Unsupported page: ${currentUrl})`);

    if (activeFormDetector) {
      activeFormDetector.cleanup();
      activeFormDetector = null;
    }
    if (activeFileDetector) {
      activeFileDetector.cleanup();
      activeFileDetector = null;
    }
    activeCrossVerifier = null;

    currentPortalStatus = {
      active: false,
      portalId: null,
      portalName: null,
      url: currentUrl,
      selectors: [],
      foundCount: 0,
      missingCount: 0,
      formFields: {},
      document: {
        file: null,
        fileValidation: { passed: false, reasons: [] },
        quality: {
          status: 'not_run',
          blurScore: null,
          resolutionOk: null,
          brightnessOk: null,
          contrastOk: null,
          croppingOk: null,
          passed: null,
          reasons: []
        },
        ocr: {
          status: 'not_run',
          text: '',
          confidence: 0,
          reasons: []
        }
      },
      verification: {
        status: 'idle',
        overallStatus: null,
        fields: {
          name: { field: 'name', strategy: 'fuzzyNormalized', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', score: null, reason: 'Unsupported portal' },
          dob: { field: 'dob', strategy: 'exactNormalizedDate', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'Unsupported portal' },
          certificateNumber: { field: 'certificateNumber', strategy: 'exactNormalizedString', formValue: '', documentValue: null, status: 'NEEDS_REVIEW', reason: 'Unsupported portal' }
        },
        extractedFields: { name: null, dob: null, certificateNumber: null },
        reasons: []
      },
      timestamp: Date.now()
    };

    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_LOADED',
        portalType: 'PORTAL_INACTIVE',
        status: currentPortalStatus
      });
    } catch (e) {
      console.debug('Background notification deferred:', e);
    }
  }
}

// Listen for status requests from the extension popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
      request &&
      (request.type === 'GET_PORTAL_STATUS' ||
        request.type === 'GET_FORM_STATE' ||
        request.type === 'GET_DOCUMENT_STATE' ||
        request.type === 'GET_VERIFICATION_STATE')
    ) {
      (async () => {
        if (activeFormDetector) {
          if (typeof activeFormDetector.syncWithDom === 'function') {
            activeFormDetector.syncWithDom();
          }
          currentPortalStatus.formFields = activeFormDetector.getFormState(false);
          currentPortalStatus.form = currentPortalStatus.formFields;
        }
        if (activeFileDetector) {
          // Synchronize with live DOM input before responding
          const latestDocState = await activeFileDetector.syncWithDom();
          currentPortalStatus.document = latestDocState;
        }
        runCrossVerification();
        sendResponse(currentPortalStatus);
      })();
      return true; // Keep message channel open for asynchronous response
    }
    return true;
  });
}

// Run resolution on page load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePortalConnection);
  } else {
    initializePortalConnection();
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializePortalConnection,
    runCrossVerification,
    getCurrentPortalStatus: () => currentPortalStatus,
    getActiveFileDetector: () => activeFileDetector,
    getActiveFormDetector: () => activeFormDetector,
    getActiveCrossVerifier: () => activeCrossVerifier
  };
}
