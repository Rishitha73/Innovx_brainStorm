// Pre-Submission Error Guard - OCR Engine (Phase 6)
// Performs client-side Optical Character Recognition using OpenCV.js preprocessing and Tesseract.js

const DEFAULT_OCR_OPTIONS = {
  lang: 'eng',
  language: 'eng',
  enablePreprocessing: true,
  usePreprocessing: true,
  minConfidenceThreshold: 60.0,
  minConfidence: 60.0
};

class OcrEngine {
  constructor(options = {}, openCvLib = null, tesseractLib = null) {
    const lang = options.language || options.lang || DEFAULT_OCR_OPTIONS.lang;
    const enablePreprocessing = (options.usePreprocessing !== undefined)
      ? options.usePreprocessing
      : (options.enablePreprocessing !== undefined ? options.enablePreprocessing : DEFAULT_OCR_OPTIONS.enablePreprocessing);
    const minConfidenceThreshold = (options.minConfidence !== undefined)
      ? options.minConfidence
      : (options.minConfidenceThreshold !== undefined ? options.minConfidenceThreshold : DEFAULT_OCR_OPTIONS.minConfidenceThreshold);

    this.options = {
      ...DEFAULT_OCR_OPTIONS,
      ...options,
      lang,
      language: lang,
      enablePreprocessing,
      usePreprocessing: enablePreprocessing,
      minConfidenceThreshold,
      minConfidence: minConfidenceThreshold
    };
    this.cvLib = openCvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    this.tesseractLib = tesseractLib || (typeof globalThis !== 'undefined' ? globalThis.Tesseract : null);
  }

  setOpenCv(cvLib) {
    this.cvLib = cvLib;
  }

  setTesseract(tesseractLib) {
    this.tesseractLib = tesseractLib;
  }

  // Resolves initialized OpenCV instance asynchronously
  async getCv() {
    let cv = this.cvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    if (!cv && typeof require !== 'undefined') {
      try {
        cv = require('@techstark/opencv-js');
      } catch (e) {}
    }

    if (cv && typeof cv.then === 'function') {
      cv = await cv;
      this.cvLib = cv;
    } else if (cv && typeof cv.onRuntimeInitialized === 'function' && !cv.Mat) {
      await new Promise((resolve) => {
        const oldInit = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          if (oldInit) oldInit();
          resolve();
        };
      });
    }

    return cv;
  }

  // Resolves Tesseract.js instance asynchronously
  async getTesseract() {
    let tesseract = this.tesseractLib || (typeof globalThis !== 'undefined' ? globalThis.Tesseract : null);
    if (!tesseract && typeof require !== 'undefined') {
      try {
        tesseract = require('tesseract.js');
      } catch (e) {}
    }

    if (!tesseract) {
      throw new Error('Tesseract.js library is not available in the current environment.');
    }

    this.tesseractLib = tesseract;
    return tesseract;
  }

  // OpenCV.js Preprocessing Pipeline: Grayscale -> Blur / Denoise -> Otsu Thresholding
  preprocess(canvasOrImageData) {
    const cv = this.cvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    if (!cv || typeof cv.Mat !== 'function') {
      console.warn('[OcrEngine] OpenCV.js not initialized. Skipping image preprocessing.');
      return { canvas: canvasOrImageData, imageData: null, preprocessed: false };
    }

    let srcMat = null;
    let grayMat = null;
    let blurMat = null;
    let threshMat = null;
    let binarizedRgbaMat = null;
    let outCanvas = null;

    try {
      // 1. Create source Mat (CV_8UC4) from ImageData, Canvas, or Mat
      if (canvasOrImageData && canvasOrImageData.data && canvasOrImageData.width && canvasOrImageData.height) {
        srcMat = new cv.Mat(canvasOrImageData.height, canvasOrImageData.width, cv.CV_8UC4);
        srcMat.data.set(canvasOrImageData.data);
      } else if (canvasOrImageData && canvasOrImageData.getContext) {
        const ctx = canvasOrImageData.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvasOrImageData.width, canvasOrImageData.height);
        srcMat = new cv.Mat(canvasOrImageData.height, canvasOrImageData.width, cv.CV_8UC4);
        srcMat.data.set(imgData.data);
      } else if (canvasOrImageData && typeof canvasOrImageData.clone === 'function') {
        srcMat = canvasOrImageData.clone();
      } else {
        throw new Error('Unsupported image input format for OpenCV preprocessing.');
      }

      const width = srcMat.cols;
      const height = srcMat.rows;

      // 2. Grayscale conversion
      grayMat = new cv.Mat();
      cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

      // 3. Gaussian Blur / Noise reduction
      blurMat = new cv.Mat();
      const ksize = new cv.Size(3, 3);
      cv.GaussianBlur(grayMat, blurMat, ksize, 0, 0, cv.BORDER_DEFAULT);

      // 4. Otsu's Thresholding / Binarization
      threshMat = new cv.Mat();
      cv.threshold(blurMat, threshMat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

      // 5. Convert binarized 1-channel Mat back to RGBA for canvas rendering
      binarizedRgbaMat = new cv.Mat();
      cv.cvtColor(threshMat, binarizedRgbaMat, cv.COLOR_GRAY2RGBA);

      const uint8Clamped = new Uint8ClampedArray(binarizedRgbaMat.data);

      if (typeof document !== 'undefined' && document.createElement) {
        outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const ctx = outCanvas.getContext('2d');
        const outImageData = new ImageData(uint8Clamped, width, height);
        ctx.putImageData(outImageData, 0, 0);
      }

      return {
        canvas: outCanvas,
        width,
        height,
        imageData: { width, height, data: uint8Clamped },
        preprocessed: true
      };
    } finally {
      // Strictly dispose of all intermediate OpenCV matrices to prevent WebAssembly memory leaks
      if (binarizedRgbaMat) {
        try { binarizedRgbaMat.delete(); } catch (e) {}
      }
      if (threshMat) {
        try { threshMat.delete(); } catch (e) {}
      }
      if (blurMat) {
        try { blurMat.delete(); } catch (e) {}
      }
      if (grayMat) {
        try { grayMat.delete(); } catch (e) {}
      }
      if (srcMat && srcMat !== canvasOrImageData) {
        try { srcMat.delete(); } catch (e) {}
      }
    }
  }

  // Master OCR Recognition Method
  async recognize(imageInput, options = {}) {
    // If running in an extension content script (web page context),
    // delegate OCR execution to the extension-owned offscreen context via messaging
    // to satisfy Chrome MV3 Worker origin security rules.
    const isExtensionContentScript =
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      typeof window !== 'undefined' &&
      !window.isOffscreenContext;

    if (isExtensionContentScript) {
      return this.recognizeViaExtensionMessage(imageInput, options);
    }

    return this.recognizeDirect(imageInput, options);
  }

  // Serializes image input to a base64 data URL for cross-context message transfer
  async imageInputToDataUrl(imageInput) {
    if (typeof imageInput === 'string') {
      return imageInput;
    }
    if (imageInput && typeof imageInput.toDataURL === 'function') {
      return imageInput.toDataURL('image/png');
    }
    if (imageInput && imageInput.data && imageInput.width && imageInput.height) {
      if (typeof document !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = imageInput.width;
        canvas.height = imageInput.height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(
          new Uint8ClampedArray(imageInput.data),
          imageInput.width,
          imageInput.height
        );
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
      }
    }
    if (typeof Blob !== 'undefined' && imageInput instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(new Error('Failed to read image Blob: ' + err));
        reader.readAsDataURL(imageInput);
      });
    }
    if (imageInput && imageInput.imageData) {
      return this.imageInputToDataUrl(imageInput.imageData);
    }
    throw new Error('Unsupported image input format for OCR transmission.');
  }

  // Delegates recognition to background service worker via chrome.runtime messaging
  async recognizeViaExtensionMessage(imageInput, options = {}) {
    console.log('[OCR TRACE] content: sending PERFORM_OCR');
    try {
      const dataUrl = await this.imageInputToDataUrl(imageInput);
      return new Promise((resolve) => {
        let timedOut = false;
        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          console.error('[OCR TRACE] content: OCR request timed out');
          resolve({
            status: 'failed',
            text: '',
            confidence: 0,
            reasons: ['OCR timed out.']
          });
        }, 35000);

        chrome.runtime.sendMessage(
          {
            type: 'PERFORM_OCR',
            target: 'background',
            payload: {
              imageSource: dataUrl,
              options: {
                lang: options.lang || this.options.language || 'eng',
                minConfidenceThreshold: options.minConfidenceThreshold || this.options.minConfidence || 60.0
              }
            }
          },
          (response) => {
            if (timedOut) return;
            clearTimeout(timeoutHandle);
            console.log('[OCR TRACE] content: received OCR response', response);
            if (chrome.runtime.lastError) {
              console.error('[OcrEngine Client] Message passing error:', chrome.runtime.lastError);
              resolve({
                status: 'failed',
                text: '',
                confidence: 0,
                reasons: [`OCR communication error: ${chrome.runtime.lastError.message}`]
              });
            } else if (response) {
              resolve(response);
            } else {
              resolve({
                status: 'failed',
                text: '',
                confidence: 0,
                reasons: ['No response received from extension OCR engine.']
              });
            }
          }
        );
      });
    } catch (transErr) {
      console.error('[OcrEngine Client] Failed to serialize image for OCR:', transErr);
      return {
        status: 'failed',
        text: '',
        confidence: 0,
        reasons: [`Could not prepare document for OCR: ${transErr.message}`]
      };
    }
  }

  // Direct recognition implementation (runs inside Offscreen Context, Extension Pages, or Vitest/Node)
  async recognizeDirect(imageInput, options = {}) {
    console.log('[OcrEngine] started direct OCR recognition');
    const activeOpts = { ...this.options, ...options };
    const reasons = [];

    if (!imageInput) {
      return {
        status: 'failed',
        text: '',
        confidence: 0,
        reasons: ['No image input provided for OCR recognition.']
      };
    }

    try {
      // If imageInput is a data URL string and DOM is available, convert to Image/Canvas for OpenCV preprocessing
      let targetSource = imageInput;
      if (typeof imageInput === 'string' && typeof Image !== 'undefined' && typeof document !== 'undefined') {
        try {
          const imgEl = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error('Failed to load image data URL into Image: ' + e));
            img.src = imageInput;
          });
          const cvs = document.createElement('canvas');
          cvs.width = imgEl.naturalWidth || imgEl.width;
          cvs.height = imgEl.naturalHeight || imgEl.height;
          const ctx = cvs.getContext('2d');
          ctx.drawImage(imgEl, 0, 0);
          targetSource = cvs;
        } catch (imgErr) {
          console.warn('[OcrEngine] Could not convert data URL to canvas for preprocessing, using raw string:', imgErr);
        }
      }

      // 1. Resolve OpenCV and preprocess image if enabled
      const cv = await this.getCv();
      if (activeOpts.enablePreprocessing && cv && targetSource !== imageInput) {
        try {
          const prepResult = this.preprocess(targetSource);
          if (prepResult && (prepResult.canvas || prepResult.imageData)) {
            targetSource = prepResult.canvas || prepResult.imageData;
            console.log('[OcrEngine] OpenCV preprocessing completed successfully');
          }
        } catch (prepErr) {
          console.warn('[OcrEngine] OpenCV preprocessing failed, falling back to raw input:', prepErr);
        }
      }

      // 2. Resolve Tesseract engine
      const tesseract = await this.getTesseract();
      const lang = activeOpts.lang || 'eng';

      // 3. Execute OCR
      console.log(`[OcrEngine] Running Tesseract.js (language: ${lang})...`);
      const isChromeExt = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';
      const tesseractOptions = {
        logger: activeOpts.logger || (() => {}),
        ...(activeOpts.tesseractOptions || {})
      };

      if (isChromeExt) {
        tesseractOptions.workerPath = chrome.runtime.getURL('lib/worker.min.js');
        tesseractOptions.corePath = chrome.runtime.getURL('lib/tesseract-core.wasm.js');
        tesseractOptions.langPath = chrome.runtime.getURL('lib/tessdata');
        tesseractOptions.workerBlobURL = false;
      }

      let directTimeoutHandle = null;
      const directTimeoutPromise = new Promise((_, reject) => {
        directTimeoutHandle = setTimeout(() => {
          reject(new Error('OCR timed out.'));
        }, 30000);
      });

      const ocrResult = await Promise.race([
        tesseract.recognize(targetSource, lang, tesseractOptions),
        directTimeoutPromise
      ]);
      clearTimeout(directTimeoutHandle);

      const rawText = ocrResult?.data?.text ? ocrResult.data.text.trim() : '';
      const rawConfidence = (ocrResult?.data?.confidence !== undefined)
        ? ocrResult.data.confidence
        : 0;

      const confidence = Math.round(rawConfidence * 100) / 100;

      if (!rawText) {
        console.warn('[OcrEngine] OCR returned empty text');
        reasons.push('No readable text could be recognized from the document.');
      } else if (confidence < (activeOpts.minConfidenceThreshold || 60.0)) {
        console.warn(`[OcrEngine] Low OCR confidence (${confidence}%)`);
        reasons.push(`Low OCR confidence (${confidence}%). Some characters may require manual review.`);
      }

      console.log(`[OcrEngine] OCR succeeded. Extracted ${rawText.length} characters (Confidence: ${confidence}%)`);

      return {
        status: 'succeeded',
        text: rawText,
        confidence,
        reasons
      };
    } catch (err) {
      console.error('[OcrEngine] OCR execution failed:', err);
      return {
        status: 'failed',
        text: '',
        confidence: 0,
        reasons: [`OCR recognition error: ${err.message || 'Unknown recognition error'}`]
      };
    }
  }

  // Alias for recognize method
  async process(imageInput, options = {}) {
    return this.recognize(imageInput, options);
  }

  // Pure Mat preprocessing helper
  preprocessMat(srcMat) {
    const cv = this.cvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    if (!cv || typeof cv.Mat !== 'function') {
      throw new Error('OpenCV is not initialized.');
    }
    let grayMat = null;
    let blurMat = null;
    let threshMat = null;
    let binarizedRgbaMat = null;
    try {
      grayMat = new cv.Mat();
      cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

      blurMat = new cv.Mat();
      const ksize = new cv.Size(3, 3);
      cv.GaussianBlur(grayMat, blurMat, ksize, 0, 0, cv.BORDER_DEFAULT);

      threshMat = new cv.Mat();
      cv.threshold(blurMat, threshMat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

      binarizedRgbaMat = new cv.Mat();
      cv.cvtColor(threshMat, binarizedRgbaMat, cv.COLOR_GRAY2RGBA);

      return binarizedRgbaMat;
    } catch (err) {
      if (binarizedRgbaMat) {
        try { binarizedRgbaMat.delete(); } catch (e) {}
      }
      throw err;
    } finally {
      if (threshMat) {
        try { threshMat.delete(); } catch (e) {}
      }
      if (blurMat) {
        try { blurMat.delete(); } catch (e) {}
      }
      if (grayMat) {
        try { grayMat.delete(); } catch (e) {}
      }
    }
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OcrEngine,
    DEFAULT_OCR_OPTIONS
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.OcrEngine = OcrEngine;
  globalThis.DEFAULT_OCR_OPTIONS = DEFAULT_OCR_OPTIONS;
}
