// Pre-Submission Error Guard - File Detector (Phase 4 & Phase 5)
// Observes file upload input and coordinates client-side file validation and visual quality analysis

class FileDetector {
  constructor(portalConfig, fileValidator, qualityAnalyzer) {
    this.portalConfig = portalConfig;
    this.validator =
      fileValidator ||
      (typeof FileValidator === 'function'
        ? new FileValidator()
        : globalThis.FileValidator
        ? new globalThis.FileValidator()
        : null);

    this.qualityAnalyzer =
      qualityAnalyzer ||
      (typeof QualityAnalyzer === 'function'
        ? new QualityAnalyzer()
        : globalThis.QualityAnalyzer
        ? new globalThis.QualityAnalyzer()
        : null);

    this.fileState = {
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
    this.currentFileRef = null;
    this.listeners = [];
    this.callbacks = [];
  }

  setQualityAnalyzer(qa) {
    this.qualityAnalyzer = qa;
  }

  initialize() {
    this.cleanup();
    this.fileState = {
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
    this.currentFileRef = null;

    if (!this.portalConfig || !this.portalConfig.documentUpload) {
      return this.fileState;
    }

    const uploadSelector = this.portalConfig.documentUpload.selector || '#upload-certificate';
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);

    const handleFileSelection = async (event) => {
      const target = event?.target || (doc ? doc.querySelector(uploadSelector) : null);
      const files = target ? target.files : null;
      const file = files && files[0] ? files[0] : null;

      if (!file) {
        this.fileState = {
          file: null,
          fileValidation: {
            passed: false,
            reasons: ['No file selected.']
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
        this.currentFileRef = null;
        console.log('[File Detector] File cleared by user');
        this.notifySubscribers();
        return;
      }

      this.currentFileRef = file;
      console.log(`[File Detector] Detected file selection: "${file.name}" (${file.type}, ${file.size} bytes)`);

      await this.processFile(file);
    };

    // 1. Direct listener on element if present in DOM
    const inputElement = doc ? doc.querySelector(uploadSelector) : null;
    if (inputElement) {
      inputElement.addEventListener('change', handleFileSelection);
      this.listeners.push({ element: inputElement, handler: handleFileSelection, event: 'change' });

      if (inputElement.files && inputElement.files[0]) {
        handleFileSelection({ target: inputElement });
      }
    } else {
      console.warn(
        `[Pre-Submission Error Guard] [WARN] File upload input not found on initial load: ${uploadSelector}`
      );
    }

    // 2. Event Delegation on document in capture phase (immune to React re-mounts / DOM mutations)
    const delegatedChangeHandler = async (event) => {
      if (
        event.target &&
        (event.target.id === 'upload-certificate' ||
          (typeof event.target.matches === 'function' && event.target.matches(uploadSelector)))
      ) {
        await handleFileSelection(event);
      }
    };

    if (doc) {
      doc.addEventListener('change', delegatedChangeHandler, true);
      this.listeners.push({ element: doc, handler: delegatedChangeHandler, event: 'change', capture: true });
    }

    return this.fileState;
  }

  async processFile(file) {
    if (!this.validator) {
      return;
    }

    // 1. File Validator (Phase 4)
    const valResult = await this.validator.validate(file);
    this.fileState.file = valResult.file;
    this.fileState.fileValidation = {
      passed: valResult.passed,
      reasons: valResult.reasons
    };

    if (!valResult.passed) {
      console.warn(`[File Detector] ❌ File validation FAILED for: ${file.name}`, valResult.reasons);
      this.fileState.quality = {
        status: 'not_run',
        blurScore: null,
        resolutionOk: null,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        passed: null,
        reasons: []
      };
      this.notifySubscribers();
      return;
    }

    console.log(`[File Detector] ✓ File validation PASSED for: ${file.name}`);

    // 2. Document Quality Analysis (Phase 5)
    if (this.qualityAnalyzer) {
      this.fileState.quality = {
        status: 'processing',
        blurScore: null,
        resolutionOk: null,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        passed: null,
        reasons: []
      };
      this.notifySubscribers();

      try {
        const qResult = await this.qualityAnalyzer.analyze(file);
        this.fileState.quality = {
          status: 'succeeded',
          blurScore: qResult.blurScore,
          resolutionOk: qResult.resolutionOk,
          brightnessOk: qResult.brightnessOk,
          contrastOk: qResult.contrastOk,
          croppingOk: qResult.croppingOk,
          passed: qResult.passed,
          reasons: qResult.reasons || []
        };
        console.log(`[File Detector] Quality Analysis complete: ${qResult.passed ? 'PASSED' : 'WARNING'}`);
      } catch (qErr) {
        console.error('[File Detector] Unexpected error during quality analysis:', qErr);
        this.fileState.quality = {
          status: 'failed',
          blurScore: null,
          resolutionOk: null,
          brightnessOk: null,
          contrastOk: null,
          croppingOk: null,
          passed: false,
          reasons: [`Could not analyze document quality: ${qErr.message}`]
        };
      }
    } else {
      this.fileState.quality = {
        status: 'not_run',
        blurScore: null,
        resolutionOk: null,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        passed: null,
        reasons: []
      };
    }

    this.notifySubscribers();
  }

  // Synchronizes state with DOM (invoked before answering popup queries)
  async syncWithDom() {
    const uploadSelector = this.portalConfig?.documentUpload?.selector || '#upload-certificate';
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    const inputElement = doc ? doc.querySelector(uploadSelector) : null;
    const file = inputElement?.files?.[0] || null;

    if (!file) {
      if (this.fileState.file !== null) {
        this.fileState = {
          file: null,
          fileValidation: {
            passed: false,
            reasons: ['No file selected.']
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
        this.currentFileRef = null;
        this.notifySubscribers();
      }
      return this.getFileState();
    }

    // If file present in DOM differs from currently validated file
    if (this.currentFileRef !== file || !this.fileState.file) {
      this.currentFileRef = file;
      await this.processFile(file);
    }

    return this.getFileState();
  }

  onFileValidated(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }

  notifySubscribers() {
    const state = this.getFileState();
    this.callbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[File Detector] Error in subscriber callback:', err);
      }
    });
  }

  getFileState() {
    return {
      file: this.fileState.file ? { ...this.fileState.file } : null,
      fileValidation: {
        passed: this.fileState.fileValidation.passed,
        reasons: [...this.fileState.fileValidation.reasons]
      },
      quality: {
        status: this.fileState.quality.status,
        blurScore: this.fileState.quality.blurScore,
        resolutionOk: this.fileState.quality.resolutionOk,
        brightnessOk: this.fileState.quality.brightnessOk,
        contrastOk: this.fileState.quality.contrastOk,
        croppingOk: this.fileState.quality.croppingOk,
        passed: this.fileState.quality.passed,
        reasons: [...this.fileState.quality.reasons]
      }
    };
  }

  cleanup() {
    this.listeners.forEach(({ element, handler, event, capture }) => {
      element.removeEventListener(event, handler, Boolean(capture));
    });
    this.listeners = [];
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FileDetector };
} else if (typeof globalThis !== 'undefined') {
  globalThis.FileDetector = FileDetector;
}
