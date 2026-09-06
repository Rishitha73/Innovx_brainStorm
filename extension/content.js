// Pre-Submission Error Guard - Content Script (Phase 5)
// Connects extension to supported portals, tracks form data and validates uploaded documents (file + visual quality) client-side

console.log('content script loaded');

let activeFormDetector = null;
let activeFileDetector = null;

// Central in-memory state for the active tab (Form State and Document State kept separate)
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
    }
  },
  timestamp: Date.now()
};

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
        currentPortalStatus.timestamp = Date.now();

        try {
          chrome.runtime.sendMessage({
            type: 'FORM_FIELD_CHANGED',
            portalId: matchingPortal.portalId,
            changedField,
            fieldData,
            formFields: fullState
          });
        } catch (e) {
          console.debug('Background message notification deferred:', e);
        }
      });
    }

    // 3. Initialize File Detector for client-side document validation & visual quality analysis
    const FileDetectorClass = (typeof FileDetector === 'function')
      ? FileDetector
      : (globalThis.FileDetector || null);
    const FileValidatorClass = (typeof FileValidator === 'function')
      ? FileValidator
      : (globalThis.FileValidator || null);
    const QualityAnalyzerClass = (typeof QualityAnalyzer === 'function')
      ? QualityAnalyzer
      : (globalThis.QualityAnalyzer || null);

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
      }
    };

    if (FileDetectorClass) {
      if (activeFileDetector) {
        activeFileDetector.cleanup();
      }
      const validatorInstance = FileValidatorClass ? new FileValidatorClass() : null;
      const qualityAnalyzerInstance = QualityAnalyzerClass ? new QualityAnalyzerClass() : null;
      activeFileDetector = new FileDetectorClass(matchingPortal, validatorInstance, qualityAnalyzerInstance);
      initialDocState = activeFileDetector.initialize();

      // Listen for file selections, validation and quality events
      activeFileDetector.onFileValidated((docState) => {
        currentPortalStatus.document = docState;
        currentPortalStatus.timestamp = Date.now();

        try {
          chrome.runtime.sendMessage({
            type: 'FILE_VALIDATED',
            portalId: matchingPortal.portalId,
            document: docState
          });
        } catch (e) {
          console.debug('Background message notification deferred:', e);
        }
      });
    }

    currentPortalStatus = {
      active: true,
      portalId: matchingPortal.portalId,
      portalName: matchingPortal.displayName,
      url: currentUrl,
      selectors: resolutionResults,
      foundCount,
      missingCount,
      formFields: initialFields,
      document: initialDocState,
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
        }
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
        request.type === 'GET_DOCUMENT_STATE')
    ) {
      (async () => {
        if (activeFormDetector) {
          currentPortalStatus.formFields = activeFormDetector.getFormState();
        }
        if (activeFileDetector) {
          // Synchronize with live DOM input before responding
          const latestDocState = await activeFileDetector.syncWithDom();
          currentPortalStatus.document = latestDocState;
        }
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
    getCurrentPortalStatus: () => currentPortalStatus,
    getActiveFileDetector: () => activeFileDetector,
    getActiveFormDetector: () => activeFormDetector
  };
}
