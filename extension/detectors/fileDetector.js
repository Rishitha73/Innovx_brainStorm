// Pre-Submission Error Guard - File Detector (Phase 4, Phase 5 & Phase 6)
// Observes file upload input and coordinates client-side file validation, quality analysis, and OCR

class FileDetector {
  constructor(portalConfig, fileValidator, qualityAnalyzer, ocrEngine) {
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

    this.ocrEngine =
      ocrEngine ||
      (typeof OcrEngine === 'function'
        ? new OcrEngine()
        : globalThis.OcrEngine
        ? new globalThis.OcrEngine()
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
      },
      ocr: {
        status: 'not_run',
        text: '',
        confidence: 0,
        reasons: []
      }
    };
    this.currentFileRef = null;
    this.listeners = [];
    this.callbacks = [];
    this.currentRunId = 0;
    this.metrics = {
      fileValidationRuns: 0,
      qualityAnalysisRuns: 0,
      ocrRuns: 0
    };
  }

  resetMetrics() {
    this.metrics = {
      fileValidationRuns: 0,
      qualityAnalysisRuns: 0,
      ocrRuns: 0
    };
  }

  getMetrics() {
    return { ...this.metrics };
  }

  setQualityAnalyzer(qa) {
    this.qualityAnalyzer = qa;
  }

  setOcrEngine(ocr) {
    this.ocrEngine = ocr;
  }

  getUploadInputs(doc) {
    if (!doc) return [];

    const scope = this.portalConfig?.formSelector
      ? (doc.querySelector(this.portalConfig.formSelector) || doc)
      : doc;
    const inputs = new Set();
    const configuredSelector = this.portalConfig?.documentUpload?.selector;

    if (configuredSelector) {
      const configuredInput = doc.querySelector(configuredSelector);
      if (configuredInput && configuredInput.matches?.('input[type="file"]')) {
        inputs.add(configuredInput);
      }
    }

    scope.querySelectorAll('input[type="file"]').forEach((input) => inputs.add(input));
    return [...inputs];
  }

  getSelectedFile(doc) {
    return this.getUploadInputs(doc).map((input) => input.files?.[0]).find(Boolean) || null;
  }

  getDetectedFormat(file) {
    const name = String(file?.name || '').toLowerCase();
    const mime = String(file?.type || '').toLowerCase();
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    if (mime.includes('jpeg') || mime.includes('jpg') || /\.jpe?g$/.test(name)) return 'jpg';
    if (mime.includes('png') || name.endsWith('.png')) return 'png';
    if (mime.includes('gif') || name.endsWith('.gif')) return 'gif';
    return '';
  }

  async extractPdfText(file) {
    const pdfjs = this.qualityAnalyzer?.pdfLib || (typeof globalThis !== 'undefined' ? globalThis.pdfjsLib : null);
    if (!pdfjs || typeof pdfjs.getDocument !== 'function' || !file || typeof file.arrayBuffer !== 'function') {
      return '';
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items || [])
        .map((item) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) pageTexts.push(pageText);
    }

    return pageTexts.join('\n').trim();
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
      },
      ocr: {
        status: 'not_run',
        text: '',
        confidence: 0,
        reasons: []
      }
    };
    this.currentFileRef = null;

    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    const uploadInputs = this.getUploadInputs(doc);
    const uploadSelector = this.portalConfig?.documentUpload?.selector || 'input[type="file"]';

    const handleFileSelection = async (event) => {
      if (event && event._guardHandled) {
        return;
      }
      if (event) {
        event._guardHandled = true;
      }

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
          },
          ocr: {
            status: 'not_run',
            text: '',
            confidence: 0,
            reasons: []
          }
        };
        this.currentFileRef = null;
        console.log('[File Detector] File cleared by user');
        this.notifySubscribers();
        return;
      }

      if (this.currentFileRef === file) {
        return;
      }

      this.currentFileRef = file;
      console.log(`[File Detector] Detected file selection: "${file.name}" (${file.type}, ${file.size} bytes)`);

      await this.processFile(file);
    };

    // 1. Direct listeners for configured and discovered file inputs
    if (uploadInputs.length > 0) {
      uploadInputs.forEach((inputElement) => {
        inputElement.addEventListener('change', handleFileSelection);
        this.listeners.push({ element: inputElement, handler: handleFileSelection, event: 'change' });

        if (inputElement.files && inputElement.files[0]) {
          handleFileSelection({ target: inputElement });
        }
      });
    } else {
      console.warn(
        `[Pre-Submission Error Guard] [WARN] File upload input not found initially: ${uploadSelector}`
      );
    }

    // 2. Event Delegation on document in capture phase (supports dynamic forms)
    const delegatedChangeHandler = async (event) => {
      const target = event.target;
      if (target && typeof target.matches === 'function' && target.matches('input[type="file"]')) {
        await handleFileSelection(event);
      }
    };

    if (doc) {
      doc.addEventListener('change', delegatedChangeHandler, true);
      this.listeners.push({ element: doc, handler: delegatedChangeHandler, event: 'change', capture: true });

      // Track clicks (e.g. Remove file button or preset triggers)
      const delegatedClickHandler = () => {
        setTimeout(() => {
          this.syncWithDom().catch(() => {});
        }, 25);
      };
      doc.addEventListener('click', delegatedClickHandler, true);
      this.listeners.push({ element: doc, handler: delegatedClickHandler, event: 'click', capture: true });
    }

    return this.fileState;
  }

  async processFile(file) {
    if (!this.validator) {
      return;
    }

    this.currentRunId = (this.currentRunId || 0) + 1;
    const runId = this.currentRunId;
    this.activeOcrJobId = runId;
    const currentJobId = runId;

    // Reset OCR and quality state on every new file processing
    this.fileState.ocr = {
      status: 'not_run',
      text: '',
      confidence: 0,
      reasons: []
    };

    // 1. File Validator (Phase 4)
    this.metrics.fileValidationRuns++;
    const valResult = await this.validator.validate(file);
    if (this.currentRunId !== runId) {
      console.log(`[File Detector] Superseded run ${runId} during file validation (current: ${this.currentRunId})`);
      return;
    }

    this.fileState.file = valResult.file
      ? { ...valResult.file, format: this.getDetectedFormat(file) }
      : null;
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
      this.fileState.ocr = {
        status: 'not_run',
        text: '',
        confidence: 0,
        reasons: []
      };
      this.notifySubscribers();
      return;
    }

    console.log(`[File Detector] ✓ File validation PASSED for: ${file.name}`);
    this.notifySubscribers();

    // 2. Document Quality Analysis (Phase 5)
    let rasterizedData = null;
    if (this.qualityAnalyzer) {
      if (this.currentRunId !== runId) return;
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
        this.metrics.qualityAnalysisRuns++;
        const qResult = await this.qualityAnalyzer.analyze(file);
        if (this.currentRunId !== runId) {
          console.log(`[File Detector] Superseded run ${runId} during quality analysis (current: ${this.currentRunId})`);
          return;
        }

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
        if (this.currentRunId !== runId) return;
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
      if (this.currentRunId !== runId) return;
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
    if (this.currentRunId !== runId) return;
    this.notifySubscribers();

    // Prefer the PDF text layer for digitally generated documents.
    const isPdf = this.getDetectedFormat(file) === 'pdf';
    if (isPdf) {
      try {
        const pdfText = await this.extractPdfText(file);
        if (this.currentRunId !== runId) return;
        if (pdfText) {
          this.fileState.ocr = {
            status: 'succeeded',
            text: pdfText,
            confidence: 100,
            reasons: []
          };
          console.log('[File Detector] PDF text layer extracted; image OCR skipped.');
          this.notifySubscribers();
          return;
        }
      } catch (pdfTextError) {
        console.warn('[File Detector] PDF text-layer extraction unavailable; falling back to image OCR:', pdfTextError);
      }
    }

    // 3. OCR Pipeline (Phase 6)
    if (this.ocrEngine) {
      if (this.currentRunId !== runId) return;
      this.fileState.ocr = {
        status: 'processing',
        text: '',
        confidence: 0,
        reasons: []
      };
      this.notifySubscribers();

      try {
        // Rasterize document page to Canvas / ImageData for OCR
        let ocrInput = file;
        if (this.qualityAnalyzer) {
          const name = (file.name || '').toLowerCase();
          const isPdf = name.endsWith('.pdf') || (file.type || '').includes('pdf');
          try {
            const raster = isPdf
              ? await this.qualityAnalyzer.rasterizePdf(file)
              : await this.qualityAnalyzer.rasterizeImage(file);
            if (this.currentRunId !== runId) return;
            if (raster && (raster.canvas || raster.imageData)) {
              ocrInput = raster.canvas || raster.imageData;
            } else if (isPdf) {
              throw new Error('PDF could not be rendered into an image for OCR.');
            }
          } catch (rErr) {
            if (this.currentRunId !== runId) return;
            console.warn('[File Detector] Document rasterization error before OCR:', rErr);
            if (isPdf) {
              this.fileState.ocr = {
                status: 'failed',
                text: '',
                confidence: 0,
                reasons: [`Could not prepare PDF for OCR: ${rErr.message}`]
              };
              this.notifySubscribers();
              return;
            }
          }
        }

        if (this.currentRunId !== runId) return;
        this.metrics.ocrRuns++;
        const ocrResult = await this.ocrEngine.recognize(ocrInput);
        if (this.currentRunId !== runId || this.activeOcrJobId !== currentJobId) {
          console.log(`[File Detector] Discarding stale OCR result from job ${currentJobId} (current: ${this.currentRunId})`);
          return;
        }

        this.fileState.ocr = {
          status: ocrResult.status || 'succeeded',
          text: ocrResult.text || '',
          confidence: ocrResult.confidence || 0,
          reasons: ocrResult.reasons || []
        };
        console.log(`[File Detector] OCR complete: ${ocrResult.status} (confidence: ${ocrResult.confidence}%)`);
      } catch (ocrErr) {
        if (this.currentRunId !== runId || this.activeOcrJobId !== currentJobId) return;
        console.error('[File Detector] Unexpected error during OCR:', ocrErr);
        this.fileState.ocr = {
          status: 'failed',
          text: '',
          confidence: 0,
          reasons: [`OCR recognition error: ${ocrErr.message}`]
        };
      }
      if (this.currentRunId !== runId) return;
      this.notifySubscribers();
    } else {
      if (this.currentRunId !== runId) return;
      this.fileState.ocr = {
        status: 'not_run',
        text: '',
        confidence: 0,
        reasons: []
      };
      this.notifySubscribers();
    }
  }

  // Synchronizes state with DOM (invoked before answering popup queries)
  async syncWithDom() {
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    const file = this.getSelectedFile(doc);

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
          },
          ocr: {
            status: 'not_run',
            text: '',
            confidence: 0,
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
        reasons: Array.isArray(this.fileState.fileValidation?.reasons) ? [...this.fileState.fileValidation.reasons] : []
      },
      quality: {
        status: this.fileState.quality.status,
        blurScore: this.fileState.quality.blurScore,
        resolutionOk: this.fileState.quality.resolutionOk,
        brightnessOk: this.fileState.quality.brightnessOk,
        contrastOk: this.fileState.quality.contrastOk,
        croppingOk: this.fileState.quality.croppingOk,
        passed: this.fileState.quality.passed,
        reasons: Array.isArray(this.fileState.quality?.reasons) ? [...this.fileState.quality.reasons] : []
      },
      ocr: {
        status: this.fileState.ocr.status,
        text: this.fileState.ocr.text,
        confidence: this.fileState.ocr.confidence,
        reasons: Array.isArray(this.fileState.ocr?.reasons) ? [...this.fileState.ocr.reasons] : []
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
