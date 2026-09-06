// Pre-Submission Error Guard - Document Quality Analyzer (Phase 5)
// Assesses visual fitness of uploaded documents (sharpness, resolution, brightness, contrast, cropping)
// using OpenCV.js and PDF.js before any downstream OCR is attempted.

const DEFAULT_QUALITY_RULES = {
  minResolutionPx: 800,              // Minimum required dimension (width or height >= 800 px)
  minSharpnessScore: 50.0,           // Laplacian variance threshold for sharpness
  minBrightness: 40.0,               // Grayscale mean lower bound (0-255)
  maxBrightness: 245.0,              // Grayscale mean upper bound (0-255)
  minContrastStdDev: 20.0,           // Grayscale standard deviation lower bound (0-127)
  croppingEdgeDensityThreshold: 0.10 // Max edge pixel density in 2% outer border
};

class QualityAnalyzer {
  constructor(rules = {}, openCvLib = null, pdfLib = null) {
    this.rules = { ...DEFAULT_QUALITY_RULES, ...rules };
    this.cvLib = openCvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    this.pdfLib = pdfLib || (typeof globalThis !== 'undefined' ? globalThis.pdfjsLib : null);
  }

  setOpenCv(cvLib) {
    this.cvLib = cvLib;
  }

  setPdfLib(pdfLib) {
    this.pdfLib = pdfLib;
  }

  // Resolves initialized OpenCV.js instance asynchronously
  async getCv() {
    let cv = this.cvLib || (typeof globalThis !== 'undefined' ? globalThis.cv : null);
    if (!cv && typeof require !== 'undefined') {
      try {
        cv = require('@techstark/opencv-js');
      } catch (e) {
        // Not in Node or opencv-js not in require
      }
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

  // Rasterizes PDF first page to HTML Canvas / ImageData
  async rasterizePdf(file) {
    let pdfjs = this.pdfLib || (typeof globalThis !== 'undefined' ? globalThis.pdfjsLib : null);
    if (!pdfjs && typeof require !== 'undefined') {
      try {
        pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
      } catch (e) {}
    }

    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
      throw new Error('PDF.js is required to rasterize PDF documents for quality analysis.');
    }

    let arrayBuffer;
    if (file instanceof ArrayBuffer) {
      arrayBuffer = file;
    } else if (typeof file.arrayBuffer === 'function') {
      arrayBuffer = await file.arrayBuffer();
    } else if (file instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))) {
      arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    } else {
      throw new Error('Cannot read PDF buffer for rasterization.');
    }

    const uint8 = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false
    });

    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imageData = ctx.getImageData(0, 0, width, height);
      return { width, height, imageData, canvas };
    }

    return { width, height, imageData: null, canvas: null };
  }

  // Rasterizes Image file (JPG/PNG) to ImageData / Canvas
  async rasterizeImage(file) {
    // If synthetic/direct ImageData was attached for testing or pipeline
    if (file.imageData && file.imageData.data && file.imageData.width && file.imageData.height) {
      return {
        width: file.imageData.width,
        height: file.imageData.height,
        imageData: file.imageData,
        canvas: file.canvas || null
      };
    }

    if (file.canvas && file.canvas.width && file.canvas.height) {
      const ctx = file.canvas.getContext('2d');
      const imageData = ctx ? ctx.getImageData(0, 0, file.canvas.width, file.canvas.height) : null;
      return {
        width: file.canvas.width,
        height: file.canvas.height,
        imageData,
        canvas: file.canvas
      };
    }

    // In browser with createImageBitmap
    if (typeof createImageBitmap === 'function' && file instanceof Blob) {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;

      if (typeof document !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const imageData = ctx.getImageData(0, 0, width, height);
        return { width, height, imageData, canvas };
      }

      bitmap.close();
      return { width, height, imageData: null, canvas: null };
    }

    // In browser with HTML Image element fallback
    if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = (err) => reject(new Error('Failed to load image file into DOM Image: ' + err));
          image.src = url;
        });

        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (typeof document !== 'undefined' && document.createElement) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, width, height);
          return { width, height, imageData, canvas };
        }

        return { width, height, imageData: null, canvas: null };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    throw new Error('Image rasterization not supported in current execution environment.');
  }

  // Master analysis method
  async analyze(file, options = {}) {
    console.log(`[QualityAnalyzer] started for: ${file ? file.name : 'null'}`);
    const activeRules = { ...this.rules, ...(options.rules || {}) };
    const reasons = [];

    if (!file) {
      return {
        passed: false,
        blurScore: 0,
        resolutionOk: false,
        brightnessOk: false,
        contrastOk: false,
        croppingOk: false,
        reasons: ['No file provided for document quality analysis.']
      };
    }

    // Determine format
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const isPdf = name.endsWith('.pdf') || type.includes('pdf');

    // 1. Rasterize document to native pixel dimensions and ImageData
    let rasterResult;
    try {
      if (isPdf) {
        rasterResult = await this.rasterizePdf(file);
      } else {
        rasterResult = await this.rasterizeImage(file);
      }
    } catch (rasterErr) {
      console.warn('[QualityAnalyzer] Rasterization failed:', rasterErr);
      return {
        passed: false,
        blurScore: null,
        resolutionOk: null,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        reasons: [`Could not render document for visual quality analysis: ${rasterErr.message}`]
      };
    }

    const { width, height, imageData } = rasterResult;

    // 2. Check Resolution against rule threshold
    const minRequiredDim = activeRules.minResolutionPx || 800;
    const resolutionOk = (width >= minRequiredDim || height >= minRequiredDim);
    if (!resolutionOk) {
      reasons.push(
        `❌ Resolution too low. Minimum required dimension: ${minRequiredDim} px. Actual: ${width} × ${height} px.`
      );
    }
    console.log(`[QualityAnalyzer] resolution: ${width}x${height} px (Ok: ${resolutionOk})`);

    // 3. Obtain OpenCV.js instance
    const cv = await this.getCv();
    if (!cv || typeof cv.Mat !== 'function') {
      console.warn('[QualityAnalyzer] OpenCV.js not initialized. Skipping CV metric calculations.');
      return {
        passed: resolutionOk && reasons.length === 0,
        blurScore: null,
        resolutionOk,
        brightnessOk: null,
        contrastOk: null,
        croppingOk: null,
        reasons: resolutionOk ? [] : reasons
      };
    }

    // References to OpenCV Mats for strict cleanup
    let srcMat = null;
    let grayMat = null;
    let lapMat = null;
    let lapMeanMat = null;
    let lapStdMat = null;
    let grayMeanMat = null;
    let grayStdMat = null;
    let edgesMat = null;
    const roiMats = [];

    let blurScore = 0;
    let blurOk = true;
    let brightnessOk = true;
    let contrastOk = true;
    let croppingOk = true;

    try {
      // Build RGBA Mat
      if (imageData && imageData.data) {
        srcMat = new cv.Mat(height, width, cv.CV_8UC4);
        srcMat.data.set(imageData.data);
      } else if (file.rawMat) {
        srcMat = file.rawMat; // Direct testing fixture
      } else {
        throw new Error('Image pixel data is not accessible for OpenCV processing.');
      }

      // Convert to Grayscale
      grayMat = new cv.Mat();
      cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

      // 4. Sharpness / Blur Detection (Laplacian Variance)
      lapMat = new cv.Mat();
      cv.Laplacian(grayMat, lapMat, cv.CV_64F);

      lapMeanMat = new cv.Mat();
      lapStdMat = new cv.Mat();
      cv.meanStdDev(lapMat, lapMeanMat, lapStdMat);

      const lapStd = lapStdMat.doubleAt(0, 0);
      const variance = lapStd * lapStd;
      blurScore = Math.round(variance * 100) / 100;

      const minSharpness = activeRules.minSharpnessScore !== undefined ? activeRules.minSharpnessScore : 50.0;
      blurOk = blurScore >= minSharpness;
      if (!blurOk) {
        reasons.push(
          `❌ Document appears blurry (Sharpness metric: ${blurScore.toFixed(2)}, required: ${minSharpness}).`
        );
      }
      console.log(`[QualityAnalyzer] blurScore (sharpness): ${blurScore} (Ok: ${blurOk})`);

      // 5. Brightness Check (Grayscale Mean Intensity)
      const meanBrightness = cv.mean(grayMat)[0];
      const minBrightness = activeRules.minBrightness !== undefined ? activeRules.minBrightness : 40.0;
      const maxBrightness = activeRules.maxBrightness !== undefined ? activeRules.maxBrightness : 245.0;

      if (meanBrightness < minBrightness) {
        brightnessOk = false;
        reasons.push(
          `❌ Document is too dark to read reliably (Mean brightness: ${meanBrightness.toFixed(1)} / 255, min: ${minBrightness}).`
        );
      } else if (meanBrightness > maxBrightness) {
        brightnessOk = false;
        reasons.push(
          `❌ Document is too bright or overexposed (Mean brightness: ${meanBrightness.toFixed(1)} / 255, max: ${maxBrightness}).`
        );
      }
      console.log(`[QualityAnalyzer] brightness: ${meanBrightness.toFixed(1)} / 255 (Ok: ${brightnessOk})`);

      // 6. Contrast Check (Grayscale Standard Deviation)
      grayMeanMat = new cv.Mat();
      grayStdMat = new cv.Mat();
      cv.meanStdDev(grayMat, grayMeanMat, grayStdMat);

      const contrastStdDev = grayStdMat.doubleAt(0, 0);
      const minContrast = activeRules.minContrastStdDev !== undefined ? activeRules.minContrastStdDev : 20.0;
      contrastOk = contrastStdDev >= minContrast;
      if (!contrastOk) {
        reasons.push(
          `❌ Document contrast is too low for reliable reading (Contrast std dev: ${contrastStdDev.toFixed(1)}, min: ${minContrast}).`
        );
      }
      console.log(`[QualityAnalyzer] contrast: ${contrastStdDev.toFixed(1)} (Ok: ${contrastOk})`);

      // 7. Likely Page-Edge Cropping Heuristic
      edgesMat = new cv.Mat();
      cv.Canny(grayMat, edgesMat, 50, 150);

      const borderMarginX = Math.max(3, Math.floor(width * 0.02));
      const borderMarginY = Math.max(3, Math.floor(height * 0.02));
      const croppingDensityThreshold =
        activeRules.croppingEdgeDensityThreshold !== undefined
          ? activeRules.croppingEdgeDensityThreshold
          : 0.10;

      // Check 4 boundary strips: top, bottom, left, right
      const topRect = new cv.Rect(0, 0, width, borderMarginY);
      const bottomRect = new cv.Rect(0, height - borderMarginY, width, borderMarginY);
      const leftRect = new cv.Rect(0, 0, borderMarginX, height);
      const rightRect = new cv.Rect(width - borderMarginX, 0, borderMarginX, height);

      const topRoi = edgesMat.roi(topRect);
      roiMats.push(topRoi);
      const bottomRoi = edgesMat.roi(bottomRect);
      roiMats.push(bottomRoi);
      const leftRoi = edgesMat.roi(leftRect);
      roiMats.push(leftRoi);
      const rightRoi = edgesMat.roi(rightRect);
      roiMats.push(rightRoi);

      const topDensity = cv.countNonZero(topRoi) / (width * borderMarginY);
      const bottomDensity = cv.countNonZero(bottomRoi) / (width * borderMarginY);
      const leftDensity = cv.countNonZero(leftRoi) / (borderMarginX * height);
      const rightDensity = cv.countNonZero(rightRoi) / (borderMarginX * height);

      const maxBorderDensity = Math.max(topDensity, bottomDensity, leftDensity, rightDensity);
      if (maxBorderDensity > croppingDensityThreshold) {
        croppingOk = false;
        reasons.push('⚠ Document may be cropped at the page edge.');
      }
      console.log(`[QualityAnalyzer] cropping max border density: ${maxBorderDensity.toFixed(3)} (Ok: ${croppingOk})`);
    } catch (err) {
      console.error('[QualityAnalyzer] Error computing image metrics:', err);
      return {
        passed: false,
        blurScore: null,
        resolutionOk,
        brightnessOk: false,
        contrastOk: false,
        croppingOk: false,
        reasons: [`Could not analyze document image quality: ${err.message}`]
      };
    } finally {
      // Clean up all OpenCV matrices to prevent memory leaks
      roiMats.forEach((roi) => {
        try {
          roi.delete();
        } catch (e) {}
      });
      if (edgesMat) {
        try {
          edgesMat.delete();
        } catch (e) {}
      }
      if (grayMeanMat) {
        try {
          grayMeanMat.delete();
        } catch (e) {}
      }
      if (grayStdMat) {
        try {
          grayStdMat.delete();
        } catch (e) {}
      }
      if (lapMeanMat) {
        try {
          lapMeanMat.delete();
        } catch (e) {}
      }
      if (lapStdMat) {
        try {
          lapStdMat.delete();
        } catch (e) {}
      }
      if (lapMat) {
        try {
          lapMat.delete();
        } catch (e) {}
      }
      if (grayMat) {
        try {
          grayMat.delete();
        } catch (e) {}
      }
      if (srcMat && srcMat !== file.rawMat) {
        try {
          srcMat.delete();
        } catch (e) {}
      }
    }

    const passed = resolutionOk && blurOk && brightnessOk && contrastOk && croppingOk;
    console.log(`[QualityAnalyzer] result: ${passed ? 'PASS' : 'WARNING/FAIL'} (reasons: ${reasons.length})`);

    return {
      passed,
      blurScore,
      resolutionOk,
      brightnessOk,
      contrastOk,
      croppingOk,
      reasons
    };
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QualityAnalyzer,
    DEFAULT_QUALITY_RULES
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.QualityAnalyzer = QualityAnalyzer;
  globalThis.DEFAULT_QUALITY_RULES = DEFAULT_QUALITY_RULES;
}
