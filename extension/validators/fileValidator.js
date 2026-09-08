// Pre-Submission Error Guard - File Validator (Phase 4)
// Validates file format, size, signature (magic bytes), and basic readability client-side

const DEFAULT_FILE_RULES = {
  allowedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
  maxSizeBytes: 1 * 1024 * 1024 // 1 MB
};

// Known binary file signatures (magic bytes)
const SIGNATURES = {
  PDF: [0x25, 0x50, 0x44, 0x46, 0x2D], // %PDF-
  JPEG: [0xFF, 0xD8, 0xFF],
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  GIF: [0x47, 0x49, 0x46, 0x38] // GIF8
};

function matchesSignature(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function detectBinaryType(bytes) {
  if (matchesSignature(bytes, SIGNATURES.PDF)) return 'pdf';
  if (matchesSignature(bytes, SIGNATURES.JPEG)) return 'jpg';
  if (matchesSignature(bytes, SIGNATURES.PNG)) return 'png';
  if (matchesSignature(bytes, SIGNATURES.GIF)) return 'gif';
  return 'unknown';
}

function getExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

function normalizeFormat(extOrMime) {
  if (!extOrMime) return '';
  const lower = extOrMime.toLowerCase();
  if (lower === 'jpeg' || lower === 'jpg' || lower.includes('image/jpeg')) return 'jpg';
  if (lower === 'png' || lower.includes('image/png')) return 'png';
  if (lower === 'pdf' || lower.includes('application/pdf')) return 'pdf';
  if (lower === 'gif' || lower.includes('image/gif')) return 'gif';
  return lower;
}

class FileValidator {
  constructor(rules = DEFAULT_FILE_RULES, pdfLib = null) {
    this.rules = { ...DEFAULT_FILE_RULES, ...rules };
    this.pdfLib = pdfLib || (typeof globalThis !== 'undefined' ? globalThis.pdfjsLib : null);
  }

  setPdfLib(pdfLib) {
    this.pdfLib = pdfLib;
  }

  // Reads first N bytes of a File / Blob / Buffer / Uint8Array
  async readFirstBytes(file, numBytes = 16) {
    if (!file) return new Uint8Array(0);

    // If it's already a Node Buffer or Uint8Array
    if (file instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))) {
      return new Uint8Array(file.slice(0, numBytes));
    }

    // Standard Browser File / Blob API
    if (typeof file.slice === 'function') {
      const sliceBlob = file.slice(0, numBytes);
      if (typeof sliceBlob.arrayBuffer === 'function') {
        const buffer = await sliceBlob.arrayBuffer();
        return new Uint8Array(buffer);
      }
    }

    // FileReader fallback
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(new Uint8Array(reader.result));
        };
        reader.onerror = () => resolve(new Uint8Array(0));
        reader.readAsArrayBuffer(file.slice(0, numBytes));
      });
    }

    return new Uint8Array(0);
  }

  // Reads full ArrayBuffer of a File
  async readFullArrayBuffer(file) {
    if (file instanceof ArrayBuffer) return file;
    if (file instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))) {
      return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    }
    if (typeof file.arrayBuffer === 'function') {
      return await file.arrayBuffer();
    }
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    }
    throw new Error('Unsupported file buffer read mechanism');
  }

  // Validates basic readability / corruption for PDF
  async validatePdfReadability(file) {
    try {
      let pdfjs = this.pdfLib;
      if (!pdfjs && typeof require !== 'undefined') {
        try {
          pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
        } catch (e) {
          // pdfjs not available in standard require
        }
      }

      if (!pdfjs && typeof globalThis !== 'undefined' && globalThis.pdfjsLib) {
        pdfjs = globalThis.pdfjsLib;
      }

      const arrayBuffer = await this.readFullArrayBuffer(file);
      const uint8 = new Uint8Array(arrayBuffer);

      // Verify minimum PDF structure (%PDF- header and %%EOF trailer or valid length)
      if (uint8.length < 32) {
        return { readable: false, reason: 'PDF could not be opened. The file is truncated or corrupted.' };
      }

      if (pdfjs && typeof pdfjs.getDocument === 'function') {
        const loadingTask = pdfjs.getDocument({
          data: uint8,
          useSystemFonts: true,
          disableFontFace: true,
          isEvalSupported: false
        });
        const doc = await loadingTask.promise;
        const numPages = doc.numPages;
        if (numPages >= 1) {
          return { readable: true, numPages };
        } else {
          return { readable: false, reason: 'PDF does not contain any readable pages.' };
        }
      }

      // If PDF.js is not initialized yet in runtime environment, check basic PDF byte structure
      const headerStr = String.fromCharCode(...uint8.slice(0, 8));
      if (headerStr.startsWith('%PDF-')) {
        return { readable: true, numPages: 1 };
      }

      return { readable: false, reason: 'PDF could not be opened. The file may be corrupted.' };
    } catch (err) {
      return {
        readable: false,
        reason: 'PDF could not be opened. The file may be corrupted.'
      };
    }
  }

  // Validates basic readability / corruption for Image
  async validateImageReadability(file, detectedType) {
    try {
      // In Browser environment with createImageBitmap
      if (typeof createImageBitmap === 'function' && file instanceof Blob) {
        try {
          const bitmap = await createImageBitmap(file);
          const valid = bitmap.width > 0 && bitmap.height > 0;
          bitmap.close();
          if (valid) return { readable: true };
        } catch (err) {
          return { readable: false, reason: 'Image could not be decoded. The file may be corrupted.' };
        }
      }

      // Check byte length and header
      const arrayBuffer = await this.readFullArrayBuffer(file);
      const uint8 = new Uint8Array(arrayBuffer);
      if (uint8.length < 16) {
        return { readable: false, reason: 'Image could not be decoded. File is empty or truncated.' };
      }

      return { readable: true };
    } catch (err) {
      return { readable: false, reason: 'Image could not be decoded. The file may be corrupted.' };
    }
  }

  // Master validation method
  async validate(file) {
    console.log('[DEBUG] FileValidator started', file ? file.name : 'null');
    const reasons = [];

    if (!file) {
      console.log('[DEBUG] FileValidator result: INVALID (No file provided)');
      return {
        passed: false,
        reasons: ['No file provided for validation.'],
        file: null
      };
    }

    try {
      const name = file.name || 'unnamed';
      const sizeBytes = file.size !== undefined ? file.size : (file.length || 0);
      const mimeType = file.type || '';
      const ext = getExtension(name);
      const claimedFormat = normalizeFormat(ext) || normalizeFormat(mimeType);

      const fileMeta = {
        name,
        mimeType: mimeType || `application/${claimedFormat}`,
        sizeBytes,
        formattedSize: (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB',
        lastModified: file.lastModified || Date.now()
      };

      // 1. Format Check (Extension / Claimed MIME)
      const allowed = this.rules.allowedFormats.map((f) => normalizeFormat(f));
      if (!claimedFormat || !allowed.includes(claimedFormat)) {
        reasons.push('❌ Invalid file format. Expected PDF, JPG, or PNG.');
        console.log('[DEBUG] File validation result: INVALID', reasons);
        return {
          passed: false,
          reasons,
          file: fileMeta
        };
      }

      // 2. Size Check
      if (sizeBytes > this.rules.maxSizeBytes) {
        const formatSize = (bytes) => bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        reasons.push(`❌ File too large. Maximum size is ${formatSize(this.rules.maxSizeBytes)}. Selected file is ${formatSize(sizeBytes)}.`);
      }

      // 3. Signature / Magic Bytes Check
      try {
        const initialBytes = await this.readFirstBytes(file, 16);
        const detectedType = detectBinaryType(initialBytes);

        if (detectedType === 'unknown' && initialBytes.length > 0) {
          reasons.push('❌ File content does not match any accepted signature.');
        } else if (detectedType !== 'unknown') {
          const normalizedDetected = normalizeFormat(detectedType);
          if (normalizedDetected !== claimedFormat) {
            reasons.push('❌ File content does not match its reported file type.');
          }
        }
      } catch (sigErr) {
        console.warn('[FileValidator] Error checking magic bytes:', sigErr);
      }

      // If already failed format, size, or signature, stop before readability checks
      if (reasons.length > 0) {
        console.log('[DEBUG] File validation result: INVALID', reasons);
        return {
          passed: false,
          reasons,
          file: fileMeta
        };
      }

      // 4. Basic Readability / Corruption Check
      if (claimedFormat === 'pdf') {
        const pdfCheck = await this.validatePdfReadability(file);
        if (!pdfCheck.readable) {
          reasons.push(`❌ ${pdfCheck.reason || 'PDF could not be opened. The file may be corrupted.'}`);
        }
      } else if (claimedFormat === 'jpg' || claimedFormat === 'png') {
        const imgCheck = await this.validateImageReadability(file, claimedFormat);
        if (!imgCheck.readable) {
          reasons.push(`❌ ${imgCheck.reason || 'Image could not be decoded.'}`);
        }
      }

      const passed = reasons.length === 0;
      console.log(`[DEBUG] File validation result: ${passed ? 'VALID' : 'INVALID'}`, reasons);

      return {
        passed,
        reasons,
        file: fileMeta
      };
    } catch (err) {
      console.error('[FileValidator] Unexpected error during validation:', err);
      reasons.push(`❌ Validation error: ${err.message}`);
      console.log('[DEBUG] File validation result: INVALID', reasons);
      return {
        passed: false,
        reasons,
        file: {
          name: file.name || 'unknown',
          mimeType: file.type || 'unknown',
          sizeBytes: file.size || 0,
          formattedSize: '0.00 MB'
        }
      };
    }
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FileValidator,
    DEFAULT_FILE_RULES,
    SIGNATURES,
    detectBinaryType,
    matchesSignature
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.FileValidator = FileValidator;
}
