// Pre-Submission Error Guard - Content Script (Phase 6)
// Connects extension to supported portals, tracks form data, validates documents, analyzes quality, and runs client-side OCR

console.log('content script loaded');

let activeFormDetector = null;
let activeFileDetector = null;
let activeCrossVerifier = null;
let activeInPageUI = null;
let activeSubmitGuard = null;

// Resolvers for Node.js / test environments where scripts aren't loaded in order via manifest
let matchPortalFn = (typeof matchPortal === 'function') ? matchPortal : (typeof globalThis !== 'undefined' ? globalThis.matchPortal : null);
let getAllConfiguredSelectorsFn = (typeof getAllConfiguredSelectors === 'function') ? getAllConfiguredSelectors : (typeof globalThis !== 'undefined' ? globalThis.getAllConfiguredSelectors : null);
let FormDetectorClass = (typeof FormDetector === 'function') ? FormDetector : (typeof globalThis !== 'undefined' ? globalThis.FormDetector : null);
let FileDetectorClass = (typeof FileDetector === 'function') ? FileDetector : (typeof globalThis !== 'undefined' ? globalThis.FileDetector : null);
let FileValidatorClass = (typeof FileValidator === 'function') ? FileValidator : (typeof globalThis !== 'undefined' ? globalThis.FileValidator : null);
let QualityAnalyzerClass = (typeof QualityAnalyzer === 'function') ? QualityAnalyzer : (typeof globalThis !== 'undefined' ? globalThis.QualityAnalyzer : null);
let OcrEngineClass = (typeof OcrEngine === 'function') ? OcrEngine : (typeof globalThis !== 'undefined' ? globalThis.OcrEngine : null);
let CrossVerifierClass = (typeof CrossVerifier === 'function') ? CrossVerifier : (typeof globalThis !== 'undefined' ? globalThis.CrossVerifier : null);
let InPageUIClass = (typeof InPageUI === 'function') ? InPageUI : (typeof globalThis !== 'undefined' ? globalThis.InPageUI : null);
let SubmitGuardClass = (typeof SubmitGuard === 'function') ? SubmitGuard : (typeof globalThis !== 'undefined' ? globalThis.SubmitGuard : null);
let getSchemaFn = (typeof getSchema === 'function') ? getSchema : (typeof globalThis !== 'undefined' ? (globalThis.getSchema || (globalThis.SchemaRegistry && globalThis.SchemaRegistry.getSchema)) : null);
let getAllSchemasFn = (typeof getAllSchemas === 'function') ? getAllSchemas : (typeof globalThis !== 'undefined' ? (globalThis.getAllSchemas || (globalThis.SchemaRegistry && globalThis.SchemaRegistry.getAllSchemas)) : null);
let debounceFn = (typeof debounce === 'function') ? debounce : (typeof globalThis !== 'undefined' ? globalThis.debounce : null);

if (typeof require !== 'undefined') {
  try {
    if (!matchPortalFn) {
      const pc = require('./config/portalConfig.js');
      matchPortalFn = pc.matchPortal || matchPortalFn;
      getAllConfiguredSelectorsFn = pc.getAllConfiguredSelectors || getAllConfiguredSelectorsFn;
    }
  } catch (e) {}
  try {
    if (!FormDetectorClass) {
      const fd = require('./detectors/formDetector.js');
      FormDetectorClass = fd.FormDetector || fd;
    }
  } catch (e) {}
  try {
    if (!FileDetectorClass) {
      const fdet = require('./detectors/fileDetector.js');
      FileDetectorClass = fdet.FileDetector || fdet;
    }
  } catch (e) {}
  try {
    if (!FileValidatorClass) {
      const fv = require('./validators/fileValidator.js');
      FileValidatorClass = fv.FileValidator || fv;
    }
  } catch (e) {}
  try {
    if (!QualityAnalyzerClass) {
      const qa = require('./analyzers/qualityAnalyzer.js');
      QualityAnalyzerClass = qa.QualityAnalyzer || qa;
    }
  } catch (e) {}
  try {
    if (!OcrEngineClass) {
      const oe = require('./ocr/ocrEngine.js');
      OcrEngineClass = oe.OcrEngine || oe;
    }
  } catch (e) {}
  try {
    if (!CrossVerifierClass) {
      const cv = require('./validators/crossVerifier.js');
      CrossVerifierClass = cv.CrossVerifier || cv;
    }
  } catch (e) {}
  try {
    if (!InPageUIClass) {
      const ui = require('./ui/inPageUI.js');
      InPageUIClass = ui.InPageUI || ui;
    }
  } catch (e) {}
  try {
    if (!SubmitGuardClass) {
      const sg = require('./guards/submitGuard.js');
      SubmitGuardClass = sg.SubmitGuard || sg;
    }
  } catch (e) {}
  try {
    if (!getSchemaFn) {
      const sc = require('./schemas/index.js');
      getSchemaFn = sc.getSchema || getSchemaFn;
      getAllSchemasFn = sc.getAllSchemas || getAllSchemasFn;
    }
  } catch (e) {}
  try {
    if (!debounceFn) {
      const db = require('./utils/debounce.js');
      debounceFn = db.debounce || debounceFn;
    }
  } catch (e) {}
}

// Central in-memory state for the active tab (Form State, Document State, and Cross-Verification)
const globalWin = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);

let currentPortalStatus = {
  active: false,
  portalId: null,
  portalName: null,
  documentType: null,
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
    overallStatus: 'WAITING_FOR_TYPE',
    fields: {},
    extractedFields: {},
    reasons: ['Waiting for document type. Please select a document type to begin cross-verification.']
  },
  timestamp: Date.now()
};

function runCrossVerification() {
  if (!activeCrossVerifier && CrossVerifierClass) {
    activeCrossVerifier = new CrossVerifierClass();
  }
  if (!activeCrossVerifier) {
    return currentPortalStatus.verification;
  }
  if (activeFormDetector && typeof activeFormDetector.syncWithDom === 'function') {
    activeFormDetector.syncWithDom();
    currentPortalStatus.formFields = activeFormDetector.getFormState(false);
    currentPortalStatus.form = currentPortalStatus.formFields;
  }
  const formState = activeFormDetector ? activeFormDetector.getFormState(false) : (currentPortalStatus.formFields || currentPortalStatus.form || {});
  const ocrState = currentPortalStatus.document ? currentPortalStatus.document.ocr : null;
  
  // Form is the single source of truth for documentType
  let docType = null;
  if (formState && formState.documentType) {
    const rawVal = typeof formState.documentType === 'object' ? formState.documentType.value : formState.documentType;
    if (rawVal && typeof rawVal === 'string' && rawVal.trim() !== '') {
      docType = rawVal.trim();
    }
  }
  if (!docType) {
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    const docTypeEl = doc ? doc.querySelector('#document-type') : null;
    if (docTypeEl && docTypeEl.value && docTypeEl.value.trim() !== '') {
      docType = docTypeEl.value.trim();
    }
  }
  currentPortalStatus.documentType = docType || null;

  let activeSchema = null;
  if (docType) {
    const schemaGetter = (typeof getSchema === 'function')
      ? getSchema
      : (getSchemaFn || (typeof globalThis !== 'undefined' ? (globalThis.getSchema || (globalThis.SchemaRegistry && globalThis.SchemaRegistry.getSchema)) : null));
    activeSchema = schemaGetter ? schemaGetter(docType) : null;
  }

  // Pass activeSchema, or if docType is specified but not in registry, pass docType; if docType is null, pass null
  const verif = activeCrossVerifier.verify(
    formState,
    ocrState,
    activeSchema || (docType ? docType : null)
  );
  currentPortalStatus.verification = verif;
  currentPortalStatus.timestamp = Date.now();
  if (activeInPageUI && typeof activeInPageUI.render === 'function') {
    activeInPageUI.render(currentPortalStatus);
  }
  if (activeSubmitGuard && typeof activeSubmitGuard.updateSubmitButtonState === 'function') {
    activeSubmitGuard.updateSubmitButtonState(currentPortalStatus);
  }
  return verif;
}

// Phase 10: Debounced field validation map
let debouncedFieldValidators = {};

function getDebouncedValidator(fieldName) {
  if (!debouncedFieldValidators[fieldName]) {
    const fn = debounceFn || (typeof debounce === 'function' ? debounce : (typeof globalThis !== 'undefined' ? globalThis.debounce : null));
    if (typeof fn === 'function') {
      debouncedFieldValidators[fieldName] = fn((fName, fVal) => {
        revalidateField(fName, fVal);
      }, 300);
    }
  }
  return debouncedFieldValidators[fieldName];
}

// Phase 10: Field-level revalidation without re-running OCR or other fields
function revalidateField(changedField, newValue) {
  if (!activeCrossVerifier && CrossVerifierClass) {
    activeCrossVerifier = new CrossVerifierClass();
  }
  if (!activeCrossVerifier) {
    return currentPortalStatus.verification;
  }

  const ocrState = currentPortalStatus.document ? currentPortalStatus.document.ocr : null;
  const docType = currentPortalStatus.documentType;
  let activeSchema = null;
  if (docType) {
    const schemaGetter = (typeof getSchema === 'function')
      ? getSchema
      : (getSchemaFn || (typeof globalThis !== 'undefined' ? (globalThis.getSchema || (globalThis.SchemaRegistry && globalThis.SchemaRegistry.getSchema)) : null));
    activeSchema = schemaGetter ? schemaGetter(docType) : null;
  }

  const updatedVerif = activeCrossVerifier.verifyField(
    changedField,
    newValue,
    ocrState,
    activeSchema || (docType ? docType : null),
    currentPortalStatus.verification
  );

  currentPortalStatus.verification = updatedVerif;
  currentPortalStatus.timestamp = Date.now();

  if (activeInPageUI && typeof activeInPageUI.render === 'function') {
    activeInPageUI.render(currentPortalStatus);
  }
  if (activeSubmitGuard && typeof activeSubmitGuard.updateSubmitButtonState === 'function') {
    activeSubmitGuard.updateSubmitButtonState(currentPortalStatus);
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({
        type: 'FORM_FIELD_CHANGED',
        portalId: currentPortalStatus.portalId,
        changedField,
        documentType: currentPortalStatus.documentType,
        formFields: currentPortalStatus.formFields,
        form: currentPortalStatus.form,
        verification: updatedVerif
      });
    }
  } catch (e) {
    console.debug('Background message notification deferred:', e);
  }

  return updatedVerif;
}

// Phase 10: Non-invasive instrumentation
function getInstrumentation() {
  const fileDetectorMetrics = activeFileDetector && typeof activeFileDetector.getMetrics === 'function'
    ? activeFileDetector.getMetrics()
    : { fileValidationRuns: 0, qualityAnalysisRuns: 0, ocrRuns: 0 };

  const crossVerifierMetrics = activeCrossVerifier && typeof activeCrossVerifier.getMetrics === 'function'
    ? activeCrossVerifier.getMetrics()
    : { crossVerificationRuns: 0, fieldComparisonRuns: {} };

  return {
    fileValidationRuns: fileDetectorMetrics.fileValidationRuns || 0,
    qualityAnalysisRuns: fileDetectorMetrics.qualityAnalysisRuns || 0,
    ocrRuns: fileDetectorMetrics.ocrRuns || 0,
    crossVerificationRuns: crossVerifierMetrics.crossVerificationRuns || 0,
    fieldComparisonRuns: { ...(crossVerifierMetrics.fieldComparisonRuns || {}) }
  };
}

function resetInstrumentation() {
  if (activeFileDetector && typeof activeFileDetector.resetMetrics === 'function') {
    activeFileDetector.resetMetrics();
  }
  if (activeCrossVerifier && typeof activeCrossVerifier.resetMetrics === 'function') {
    activeCrossVerifier.resetMetrics();
  }
}

function initializePortalConnection() {
  const win = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);
  const currentUrl = (win && win.location && win.location.href) ? win.location.href : (typeof location !== 'undefined' ? location.href : '');
  const portalMatcher = (typeof matchPortal === 'function')
    ? matchPortal
    : (matchPortalFn || (typeof globalThis !== 'undefined' ? globalThis.matchPortal : null));

  const matchingPortal = portalMatcher ? portalMatcher(currentUrl) : null;

  if (matchingPortal) {
    console.log(`[Pre-Submission Error Guard] Active on: ${matchingPortal.portalId}`);

    // 1. Resolve selectors against DOM
    const selectorGetter = (typeof getAllConfiguredSelectors === 'function')
      ? getAllConfiguredSelectors
      : (getAllConfiguredSelectorsFn || (typeof globalThis !== 'undefined' ? globalThis.getAllConfiguredSelectors : null));

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
    const resolvedInPageUIClass = (typeof InPageUI === 'function')
      ? InPageUI
      : (InPageUIClass || (typeof globalThis !== 'undefined' ? globalThis.InPageUI : null));

    if (resolvedInPageUIClass) {
      if (activeInPageUI) {
        activeInPageUI.cleanup();
      }
      activeInPageUI = new resolvedInPageUIClass(matchingPortal);
      activeInPageUI.initialize();
    }

    const resolvedFormDetectorClass = (typeof FormDetector === 'function')
      ? FormDetector
      : (FormDetectorClass || (typeof globalThis !== 'undefined' ? globalThis.FormDetector : null));

    let initialFields = {};
    if (resolvedFormDetectorClass) {
      if (activeFormDetector) {
        activeFormDetector.cleanup();
      }
      activeFormDetector = new resolvedFormDetectorClass(matchingPortal);
      initialFields = activeFormDetector.initialize();

      // Listen for form field changes with Phase 10 debounced revalidation
      activeFormDetector.onFieldChange((changedField, fieldData, fullState) => {
        currentPortalStatus.formFields = fullState;
        currentPortalStatus.form = fullState;

        if (changedField === 'documentType') {
          // Document type selection change: immediate schema re-evaluation without typing debounce
          const docTypeVal = typeof fieldData === 'object' ? fieldData.value : fieldData;
          currentPortalStatus.documentType = docTypeVal || null;
          const verifState = runCrossVerification();
          currentPortalStatus.timestamp = Date.now();

          try {
            chrome.runtime.sendMessage({
              type: 'FORM_FIELD_CHANGED',
              portalId: matchingPortal.portalId,
              changedField,
              fieldData,
              documentType: currentPortalStatus.documentType,
              formFields: fullState,
              form: fullState,
              verification: verifState
            });
          } catch (e) {
            console.debug('Background message notification deferred:', e);
          }
          return;
        }

        // Text input fields: debounce revalidation by 300ms
        // Immediately disable submit button while revalidation is in-flight/debounced
        if (activeSubmitGuard && typeof activeSubmitGuard.updateSubmitButtonState === 'function') {
          activeSubmitGuard.updateSubmitButtonState({
            ...currentPortalStatus,
            verification: { ...currentPortalStatus.verification, status: 'processing' }
          });
        }
        const rawVal = typeof fieldData === 'object' ? fieldData.value : fieldData;
        const debouncedValidator = getDebouncedValidator(changedField);
        if (debouncedValidator) {
          debouncedValidator(changedField, rawVal);
        } else {
          revalidateField(changedField, rawVal);
        }
      });
    }

    // 3. Initialize File Detector for client-side document validation, quality analysis & OCR
    const resolvedFileDetectorClass = (typeof FileDetector === 'function')
      ? FileDetector
      : (FileDetectorClass || (typeof globalThis !== 'undefined' ? globalThis.FileDetector : null));
    const resolvedFileValidatorClass = (typeof FileValidator === 'function')
      ? FileValidator
      : (FileValidatorClass || (typeof globalThis !== 'undefined' ? globalThis.FileValidator : null));
    const resolvedQualityAnalyzerClass = (typeof QualityAnalyzer === 'function')
      ? QualityAnalyzer
      : (QualityAnalyzerClass || (typeof globalThis !== 'undefined' ? globalThis.QualityAnalyzer : null));
    const resolvedOcrEngineClass = (typeof OcrEngine === 'function')
      ? OcrEngine
      : (OcrEngineClass || (typeof globalThis !== 'undefined' ? globalThis.OcrEngine : null));

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

    if (resolvedFileDetectorClass) {
      if (activeFileDetector) {
        activeFileDetector.cleanup();
      }
      const validatorInstance = resolvedFileValidatorClass ? new resolvedFileValidatorClass() : null;
      const qualityAnalyzerInstance = resolvedQualityAnalyzerClass ? new resolvedQualityAnalyzerClass() : null;
      const ocrEngineInstance = resolvedOcrEngineClass ? new resolvedOcrEngineClass() : null;
      activeFileDetector = new resolvedFileDetectorClass(
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
        if (docState.quality?.status === 'processing' || docState.ocr?.status === 'processing') {
          if (activeSubmitGuard && typeof activeSubmitGuard.updateSubmitButtonState === 'function') {
            activeSubmitGuard.updateSubmitButtonState({
              ...currentPortalStatus,
              document: docState,
              verification: { ...currentPortalStatus.verification, status: 'processing' }
            });
          }
        }
        const verifState = runCrossVerification();
        currentPortalStatus.timestamp = Date.now();

        try {
          chrome.runtime.sendMessage({
            type: 'FILE_VALIDATED',
            portalId: matchingPortal.portalId,
            document: docState,
            documentType: currentPortalStatus.documentType,
            formFields: currentPortalStatus.formFields,
            form: currentPortalStatus.formFields,
            verification: verifState
          });
        } catch (e) {
          console.debug('Background message notification deferred:', e);
        }
      });
    }

    // 4. Initialize Cross-Verifier (Phase 7 & 8)
    const resolvedCrossVerifierClass = (typeof CrossVerifier === 'function')
      ? CrossVerifier
      : (CrossVerifierClass || (typeof globalThis !== 'undefined' ? globalThis.CrossVerifier : null));
    activeCrossVerifier = resolvedCrossVerifierClass ? new resolvedCrossVerifierClass() : null;

    // 5. Wire portal document-type selector (Phase 9)
    if (matchingPortal.documentTypeSelector) {
      const docTypeSelector = matchingPortal.documentTypeSelector;
      const handlePortalDocTypeChange = (e) => {
        const newType = e.target ? e.target.value : null;
        console.log(`[Pre-Submission Error Guard] Document type changed on portal: ${newType}`);
        currentPortalStatus.documentType = newType || null;
        const verifState = runCrossVerification();
        currentPortalStatus.timestamp = Date.now();
        try {
          chrome.runtime.sendMessage({
            type: 'DOCUMENT_TYPE_CHANGED',
            portalId: matchingPortal.portalId,
            documentType: currentPortalStatus.documentType,
            verification: verifState
          });
        } catch (err) {}
      };

      const docTypeEl = doc ? doc.querySelector(docTypeSelector) : null;
      if (docTypeEl) {
        docTypeEl.addEventListener('change', handlePortalDocTypeChange);
      }
      if (doc) {
        doc.addEventListener('change', (e) => {
          if (e.target && (e.target.id === 'document-type' || (typeof e.target.matches === 'function' && e.target.matches(docTypeSelector)))) {
            handlePortalDocTypeChange(e);
          }
        }, true);
      }
    }

    const initialVerification = runCrossVerification();

    currentPortalStatus = {
      active: true,
      portalId: matchingPortal.portalId,
      portalName: matchingPortal.displayName,
      documentType: currentPortalStatus.documentType,
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

    if (activeInPageUI && typeof activeInPageUI.render === 'function') {
      activeInPageUI.render(currentPortalStatus);
    }

    // 6. Initialize Submit Guard (Phase 12)
    const resolvedSubmitGuardClass = (typeof SubmitGuard === 'function')
      ? SubmitGuard
      : (SubmitGuardClass || (typeof globalThis !== 'undefined' ? globalThis.SubmitGuard : null));

    if (resolvedSubmitGuardClass) {
      if (activeSubmitGuard) {
        activeSubmitGuard.detach();
      }
      activeSubmitGuard = new resolvedSubmitGuardClass({
        portalConfig: matchingPortal,
        formDetector: activeFormDetector,
        fileDetector: activeFileDetector,
        crossVerifier: activeCrossVerifier,
        inPageUI: activeInPageUI,
        getPortalStatus: () => currentPortalStatus,
        syncAndRevalidate: async () => {
          // 1. Flush any pending debounced typing validators
          Object.keys(debouncedFieldValidators).forEach((f) => {
            if (debouncedFieldValidators[f] && typeof debouncedFieldValidators[f].flush === 'function') {
              debouncedFieldValidators[f].flush();
            }
          });
          // 2. Synchronize FormDetector with live DOM
          if (activeFormDetector && typeof activeFormDetector.syncWithDom === 'function') {
            activeFormDetector.syncWithDom();
            currentPortalStatus.formFields = activeFormDetector.getFormState(false);
            currentPortalStatus.form = currentPortalStatus.formFields;
          }
          // 3. Synchronize FileDetector with live DOM
          if (activeFileDetector && typeof activeFileDetector.syncWithDom === 'function') {
            const syncedDoc = await activeFileDetector.syncWithDom();
            currentPortalStatus.document = syncedDoc;
          }
          // 4. Run Cross-Verification on synchronized state
          return runCrossVerification();
        }
      });

      const formSelector = matchingPortal.formSelector || '#scholarship-form';
      const formEl = doc ? doc.querySelector(formSelector) : null;
      if (formEl) {
        activeSubmitGuard.attach(formEl);
      }
    }

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
    if (activeInPageUI) {
      activeInPageUI.cleanup();
      activeInPageUI = null;
    }
    if (activeSubmitGuard) {
      activeSubmitGuard.detach();
      activeSubmitGuard = null;
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

// Listen for status requests and actions from the extension popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.type === 'SET_DOCUMENT_TYPE') {
      const newType = request.documentType || null;
      currentPortalStatus.documentType = newType;
      console.log(`[Pre-Submission Error Guard] SET_DOCUMENT_TYPE received: ${newType}`);

      const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
      const docTypeEl = doc ? doc.querySelector('#document-type') : null;
      if (docTypeEl && newType) {
        docTypeEl.value = newType;
      }

      if (activeFormDetector && typeof activeFormDetector.syncWithDom === 'function') {
        activeFormDetector.syncWithDom();
        currentPortalStatus.formFields = activeFormDetector.getFormState(false);
        currentPortalStatus.form = currentPortalStatus.formFields;
      }

      const verifState = runCrossVerification();
      currentPortalStatus.timestamp = Date.now();

      try {
        chrome.runtime.sendMessage({
          type: 'DOCUMENT_TYPE_CHANGED',
          portalId: currentPortalStatus.portalId,
          documentType: currentPortalStatus.documentType,
          verification: verifState
        });
      } catch (e) {}

      sendResponse(currentPortalStatus);
      return true;
    }

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
      return true;
    }

    if (request && request.type === 'GET_INSTRUMENTATION') {
      sendResponse(getInstrumentation());
      return true;
    }

    if (request && request.type === 'RESET_INSTRUMENTATION') {
      resetInstrumentation();
      sendResponse({ status: 'ok' });
      return true;
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
    revalidateField,
    getDebouncedValidator,
    debouncedFieldValidators,
    getInstrumentation,
    resetInstrumentation,
    setDocumentType: (type) => {
      const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
      const el = doc ? doc.querySelector('#document-type') : null;
      if (el) {
        el.value = type || '';
      }
      if (activeFormDetector) {
        activeFormDetector.handleFieldUpdate('documentType', type || '', 'change');
      }
      currentPortalStatus.documentType = type || null;
      return runCrossVerification();
    },
    getCurrentPortalStatus: () => currentPortalStatus,
    getActiveFileDetector: () => activeFileDetector,
    getActiveFormDetector: () => activeFormDetector,
    getActiveCrossVerifier: () => activeCrossVerifier,
    getActiveInPageUI: () => activeInPageUI,
    getActiveSubmitGuard: () => activeSubmitGuard
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.revalidateField = revalidateField;
  globalThis.getInstrumentation = getInstrumentation;
  globalThis.resetInstrumentation = resetInstrumentation;
  globalThis.getDebouncedValidator = getDebouncedValidator;
  globalThis.getActiveInPageUI = () => activeInPageUI;
  globalThis.getActiveSubmitGuard = () => activeSubmitGuard;
}
