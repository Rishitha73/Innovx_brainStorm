// Pre-Submission Error Guard - Cross-Verifier (Phase 8)
// Generic, schema-driven verification engine comparing form inputs against OCR-extracted document text

let schemaRegistry = null;
let schemaUtils = null;

if (typeof require !== 'undefined') {
  try {
    schemaRegistry = require('../schemas/index.js');
    schemaUtils = require('../schemas/schemaUtils.js');
  } catch (e) {}
}

if (!schemaRegistry && typeof globalThis !== 'undefined') {
  schemaRegistry = {
    getSchema: globalThis.getSchema,
    registerSchema: globalThis.registerSchema,
    getAllSchemas: globalThis.getAllSchemas
  };
  schemaUtils = {
    normalizeSchema: globalThis.normalizeSchema
  };
}

const DEFAULT_VERIFICATION_RULES = {
  minConfidenceThreshold: 60.0
};

class CrossVerifier {
  constructor(schemaOrRules = null) {
    if (schemaOrRules && schemaOrRules.documentType) {
      this.defaultSchema = this.resolveSchema(schemaOrRules);
      this.rules = { ...DEFAULT_VERIFICATION_RULES };
    } else {
      this.defaultSchema = null;
      this.rules = { ...DEFAULT_VERIFICATION_RULES, ...(schemaOrRules || {}) };
    }
    this.metrics = {
      crossVerificationRuns: 0,
      fieldComparisonRuns: {}
    };
  }

  resetMetrics() {
    this.metrics = {
      crossVerificationRuns: 0,
      fieldComparisonRuns: {}
    };
  }

  getMetrics() {
    return {
      crossVerificationRuns: this.metrics.crossVerificationRuns,
      fieldComparisonRuns: { ...this.metrics.fieldComparisonRuns }
    };
  }

  // Resolves a schema object or string identifier against the Schema Registry
  resolveSchema(schemaInput) {
    if (schemaInput === null || schemaInput === '') {
      return null;
    }

    if (schemaInput === undefined) {
      if (this.defaultSchema) return this.defaultSchema;
      const getter = (schemaRegistry && typeof schemaRegistry.getSchema === 'function')
        ? schemaRegistry.getSchema
        : (typeof globalThis !== 'undefined' ? globalThis.getSchema : null);
      return getter ? getter('incomeCertificate') : null;
    }

    if (typeof schemaInput === 'string') {
      const getter = (schemaRegistry && typeof schemaRegistry.getSchema === 'function')
        ? schemaRegistry.getSchema
        : (typeof globalThis !== 'undefined' ? globalThis.getSchema : null);
      return getter ? getter(schemaInput) : null;
    }

    if (typeof schemaInput === 'object') {
      const normalizer = (schemaUtils && typeof schemaUtils.normalizeSchema === 'function')
        ? schemaUtils.normalizeSchema
        : (typeof globalThis !== 'undefined' ? globalThis.normalizeSchema : null);
      return normalizer ? normalizer(schemaInput) : schemaInput;
    }

    return null;
  }

  // Escapes regular expression special characters
  escapeRegex(string) {
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Schema-driven extraction for a single field definition
  extractField(rawOcrText, fieldDef, formValue = null) {
    if (!rawOcrText || typeof rawOcrText !== 'string' || !fieldDef) {
      return null;
    }

    const text = rawOcrText.trim();
    const labels = Array.isArray(fieldDef.labels) && fieldDef.labels.length > 0
      ? fieldDef.labels
      : [fieldDef.name, fieldDef.logicalName, fieldDef.id].filter(Boolean);

    // Sort labels by length descending so longer phrases match before substrings
    const sortedLabels = [...labels].sort((a, b) => b.length - a.length);
    const labelPattern = sortedLabels.map((l) => this.escapeRegex(l).replace(/\\s\+/g, '\\s*')).join('|');

    if (fieldDef.extraction === 'date' || fieldDef.strategy === 'exactNormalizedDate' || fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') {
      // 1. Date extraction regex anchored to field labels (requires delimiter :, -, ., or |)
      const dateLabelRegex = new RegExp(`(?:${labelPattern})\\s*[:\\-\\.\\|]\\s*(?:\\r?\\n)?\\s*([0-9]{1,4}[\\/\\-\\.\\s][0-9]{1,2}[\\/\\-\\.\\s][0-9]{1,4})`, 'i');
      const dateMatch = text.match(dateLabelRegex);
      if (dateMatch && dateMatch[1]) {
        return dateMatch[1].trim();
      }

      // Fallback 1: block search within 35 chars after label
      const blockRegex = new RegExp(`(?:${labelPattern})[\\s\\S]{1,35}?([0-9]{1,4}[\\/\\-\\.\\s][0-9]{1,2}[\\/\\-\\.\\s][0-9]{1,4})`, 'i');
      const blockMatch = text.match(blockRegex);
      if (blockMatch && blockMatch[1]) {
        return blockMatch[1].trim();
      }

      return null;
    }

    // Aadhaar identifiers are more reliable than broad OCR label matches such as "Aadhaar".
    if (fieldDef.id === 'certificateNumber' || fieldDef.logicalName === 'certificateNumber') {
      const aadhaarPattern = /\b([0-9]{4}[ \t]?[0-9]{4}[ \t]?[0-9]{4})\b/;
      const aadhaarMatch = text.match(aadhaarPattern);
      if (aadhaarMatch && aadhaarMatch[1]) {
        return aadhaarMatch[1].trim();
      }
    }

    // 2. Text / Identifier extraction regex anchored to field labels
    // 2a. Requires a delimiter (:, -, ., |) and captures value on same or next line
    const textLabelRegex = new RegExp(`(?:${labelPattern})\\s*[:\\-\\.\\|]\\s*(?:\\r?\\n)?\\s*([^\\r\\n]+)`, 'i');
    const textMatch = text.match(textLabelRegex);
    if (textMatch && textMatch[1]) {
      let candidate = textMatch[1].trim();
      candidate = candidate.split(/\r?\n(?=\s*(?:Applicant|Candidate|Citizen|Date|DOB|Birth|Certificate|Cert|Address|Residential|Permanent|Current|Residence|Annual|Family|Income|Application|Registration|Issued|Gender|Father|Mother)\b)/i)[0].trim();
      // Remove any subsequent label keywords on the same line
      candidate = candidate.replace(/\s*(?:DOB|Date of Birth|Certificate|Cert No|Annual Income|Income|Address|Permanent Address).*/i, '').trim();
      // Clean leading and trailing punctuation
      candidate = candidate.replace(/^[\s|:;,"'-]+|[\s|:;,"'-]+$/g, '').trim();
      if (candidate.length > 0) {
        return candidate;
      }
    }

    // 2b. Table layout fallback (2 or more spaces separating label and value on same line)
    const tableRegex = new RegExp(`(?:${labelPattern})\\s{2,}([^\\r\\n]+)`, 'i');
    const tableMatch = text.match(tableRegex);
    if (tableMatch && tableMatch[1]) {
      let candidate = tableMatch[1].trim();
      candidate = candidate.split(/\r?\n(?=\s*(?:Applicant|Candidate|Citizen|Date|DOB|Birth|Certificate|Cert|Address|Residential|Permanent|Current|Residence|Annual|Family|Income|Application|Registration|Issued|Gender|Father|Mother)\b)/i)[0].trim();
      candidate = candidate.replace(/\s*(?:DOB|Date of Birth|Certificate|Cert No|Annual Income|Income|Address|Permanent Address).*/i, '').trim();
      candidate = candidate.replace(/^[\s|:;,"'-]+|[\s|:;,"'-]+$/g, '').trim();
      if (candidate.length > 0) {
        return candidate;
      }
    }

    // Noisy Aadhaar scans may omit the Name label. Infer a candidate only when
    // the form already provides a name to compare against.
    if ((fieldDef.id === 'name' || fieldDef.logicalName === 'name') && formValue && typeof formValue === 'string' && formValue.trim()) {
      const excludedNameWords = new Set([
        'aadhaar', 'aadhar', 'applicant', 'birth', 'certificate', 'citizen', 'date',
        'government', 'india', 'identification', 'issued', 'name', 'number', 'resident',
        'unique', 'uid', 'vid', 'year'
      ]);
      const nameCandidates = [...text.matchAll(/\b[A-Za-z]{2,}\s+[A-Za-z]{2,}\b/g)]
        .map((match) => match[0].trim())
        .filter((candidate) => !candidate.toLowerCase().split(/\s+/).some((word) => excludedNameWords.has(word)));
      if (nameCandidates.length > 0) {
        const target = this.normalizeText(formValue);
        return nameCandidates
          .map((candidate) => ({ candidate, score: this.calculateSimilarity(target, this.normalizeText(candidate)) }))
          .sort((left, right) => right.score - left.score)[0].candidate;
      }
    }

    // 2c. Aadhaar / 12-digit identification pattern extraction fallback
    if (fieldDef.id === 'certificateNumber' || fieldDef.logicalName === 'certificateNumber') {
      const aadhaarContinuous = /\b([0-9]{12})\b/;
      const contMatch = text.match(aadhaarContinuous);
      if (contMatch && contMatch[1]) {
        return contMatch[1].trim();
      }
    }

    // 2d. Form-value presence fallback
    if (formValue && typeof formValue === 'string') {
      const trimmedFormVal = formValue.trim();
      if (trimmedFormVal.length >= 2) {
        if (fieldDef.id === 'certificateNumber' || fieldDef.logicalName === 'certificateNumber') {
          const normFormId = this.normalizeExactIdentifier(trimmedFormVal);
          const normTextDigits = text.replace(/[^A-Za-z0-9]/g, '');
          if (normFormId.length >= 4 && normTextDigits.includes(normFormId)) {
            return trimmedFormVal;
          }
        } else if (fieldDef.id === 'name' || fieldDef.logicalName === 'name') {
          const normFormName = this.normalizeText(trimmedFormVal);
          const normText = this.normalizeText(text);
          if (normFormName.length >= 3 && normText.includes(normFormName)) {
            return trimmedFormVal;
          }
        }
      }
    }

    return null;
  }

  // Schema-driven extraction across all fields in the active schema
  extractFields(rawOcrText, schemaParam = undefined, formData = {}) {
    const schema = this.resolveSchema(schemaParam);
    if (!schema || !Array.isArray(schema.fields)) {
      return {};
    }

    const extracted = {};
    schema.fields.forEach((fieldDef) => {
      const fieldId = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      const formKey = fieldDef.formField || fieldDef.id || fieldDef.logicalName || fieldDef.name;
      const rawFormVal = formData ? this.getFieldValue(formData[formKey] !== undefined ? formData[formKey] : (formData[fieldId] !== undefined ? formData[fieldId] : formData[fieldDef.logicalName])) : null;

      const val = this.extractField(rawOcrText, fieldDef, rawFormVal);
      const primaryKey = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      if (primaryKey) extracted[primaryKey] = val;
      if (fieldDef.id) extracted[fieldDef.id] = val;
      if (fieldDef.logicalName) extracted[fieldDef.logicalName] = val;
      if (fieldDef.formField && !extracted[fieldDef.formField]) extracted[fieldDef.formField] = val;
    });

    return extracted;
  }

  // Text normalization: lowercases, collapses whitespace, removes common honorifics and punctuation
  normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    let norm = str.toLowerCase().trim();
    // Strip common honorific titles at the start
    norm = norm.replace(/^(?:mr\.?|mrs\.?|ms\.?|shri\.?|shree\.?|smt\.?|dr\.?|kumari|master)\s+/i, '');
    // Remove punctuation marks
    norm = norm.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
    // Collapse internal whitespace
    norm = norm.replace(/\s+/g, ' ').trim();
    return norm;
  }

  // Exact alphanumeric string normalization: upper-cases, strips non-alphanumerics except hyphen
  normalizeExactIdentifier(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toUpperCase().replace(/[\s_]/g, '').trim();
  }

  // Levenshtein distance implementation
  levenshteinDistance(a, b) {
    const s1 = a || '';
    const s2 = b || '';
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const matrix = [];
    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[m][n];
  }

  // Calculates similarity ratio between 0.0 and 1.0
  calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    const dist = this.levenshteinDistance(s1, s2);
    const score = 1.0 - (dist / maxLen);
    return Math.round(score * 1000) / 1000;
  }

  // Parses supported date formats into canonical YYYY-MM-DD
  parseCanonicalDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = dateStr.trim();

    // 1. Match YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const isoMatch = clean.match(/^([12][0-9]{3})[\/\-\.\s](0?[1-9]|1[0-2])[\/\-\.\s](0?[1-9]|[12][0-9]|3[01])$/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
      const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Match DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = clean.match(/^(0?[1-9]|[12][0-9]|3[01])[\/\-\.\s](0?[1-9]|1[0-2])[\/\-\.\s]([12][0-9]{3})$/);
    if (dmyMatch) {
      const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  getCanonicalDateCandidates(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return [];
    const candidates = new Set();
    const canonical = this.parseCanonicalDate(dateStr);
    if (canonical) candidates.add(canonical);

    const ambiguousMatch = dateStr.trim().match(/^(0?[1-9]|1[0-2])[\/\-.](0?[1-9]|1[0-2])[\/\-.]([12][0-9]{3})$/);
    if (ambiguousMatch) {
      const first = String(parseInt(ambiguousMatch[1], 10)).padStart(2, '0');
      const second = String(parseInt(ambiguousMatch[2], 10)).padStart(2, '0');
      candidates.add(`${ambiguousMatch[3]}-${first}-${second}`);
    }

    return [...candidates];
  }

  // Helper to extract string value from form state input (raw string or { value: '...' })
  getFieldValue(input) {
    if (input === null || input === undefined) return '';
    if (typeof input === 'object' && input.value !== undefined) {
      return String(input.value || '').trim();
    }
    return String(input).trim();
  }

  // Generic schema-driven field comparison
  compareField(rawFormVal, rawDocVal, fieldDef, isOcrComplete, isConfidenceLow, ocrConfidence) {
    const fieldMetricKey = fieldDef.id || fieldDef.logicalName || fieldDef.formField || 'unknown';
    this.metrics.fieldComparisonRuns[fieldMetricKey] = (this.metrics.fieldComparisonRuns[fieldMetricKey] || 0) + 1;

    const strategy = fieldDef.strategy || fieldDef.comparison || 'exactNormalizedString';
    const threshold = typeof fieldDef.threshold === 'number' ? fieldDef.threshold : 0.85;
    const isRequired = fieldDef.required !== false;
    const displayField = fieldDef.name || fieldDef.logicalName || fieldDef.id || 'Field';

    const result = {
      field: fieldDef.id || fieldDef.logicalName || fieldDef.name,
      logicalName: fieldDef.logicalName || fieldDef.id,
      name: fieldDef.name || fieldDef.logicalName,
      strategy,
      formValue: rawFormVal,
      documentValue: rawDocVal,
      status: 'NEEDS_REVIEW',
      score: null,
      required: isRequired,
      reason: null
    };

    if (!isOcrComplete) {
      result.status = 'NEEDS_REVIEW';
      result.reason = 'Document OCR has not completed.';
      return result;
    }

    if (!rawFormVal) {
      if (isRequired) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Form field for ${displayField} is empty.`;
      } else {
        result.status = 'MATCH';
      }
      return result;
    }

    if (!rawDocVal) {
      if (isRequired) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `${displayField} could not be found in document OCR.`;
      } else {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Optional field ${displayField} could not be found in document OCR.`;
      }
      return result;
    }

    if (isConfidenceLow) {
      result.status = 'NEEDS_REVIEW';
      result.reason = `Low OCR confidence (${ocrConfidence}%). Manual review required.`;
      return result;
    }

    // --- Strategy 1: Fuzzy Normalized Matching ---
    if (strategy === 'fuzzyNormalized' || strategy === 'fuzzy') {
      const normForm = this.normalizeText(rawFormVal);
      const normDoc = this.normalizeText(rawDocVal);
      const score = this.calculateSimilarity(normForm, normDoc);
      result.score = score;

      if (score >= threshold) {
        result.status = 'MATCH';
      } else {
        result.status = 'MISMATCH';
        const reasonField = (fieldDef.id === 'name' || fieldDef.logicalName === 'name') ? 'name' : displayField;
        result.reason = `Form ${reasonField} "${rawFormVal}" does not match document ${reasonField} "${rawDocVal}" (similarity: ${score}).`;
      }
      return result;
    }

    // --- Strategy 2: Exact Normalized Date Matching ---
    if (strategy === 'exactNormalizedDate' || strategy === 'exact-date' || fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') {
      const formDateCandidates = this.getCanonicalDateCandidates(rawFormVal);
      const documentDateCandidates = this.getCanonicalDateCandidates(rawDocVal);
      const normFormDate = formDateCandidates[0] || null;
      const matchingDocumentDate = documentDateCandidates.find((candidate) => formDateCandidates.includes(candidate));
      const normDocDate = matchingDocumentDate || documentDateCandidates[0] || null;
      result.normalizedFormValue = normFormDate;
      result.normalizedDocumentValue = normDocDate;

      if (!normDocDate) {
        result.status = 'NEEDS_REVIEW';
        result.reason = `Document date "${rawDocVal}" could not be parsed into a valid date.`;
      } else if (normFormDate && matchingDocumentDate) {
        result.status = 'MATCH';
      } else {
        result.status = 'MISMATCH';
        const reasonField = (fieldDef.id === 'dob' || fieldDef.logicalName === 'dob') ? 'DOB' : displayField;
        result.reason = `Form ${reasonField} (${rawFormVal}) does not match document ${reasonField} (${rawDocVal}).`;
      }
      return result;
    }

    // --- Strategy 3: Exact Normalized String Matching (Default) ---
    const normFormId = this.normalizeExactIdentifier(rawFormVal);
    const normDocId = this.normalizeExactIdentifier(rawDocVal);

    if (normFormId === normDocId) {
      result.status = 'MATCH';
    } else {
      result.status = 'MISMATCH';
      const reasonField = (fieldDef.id === 'certificateNumber' || fieldDef.logicalName === 'certificateNumber') ? 'certificate number' : displayField;
      result.reason = `Form ${reasonField} "${rawFormVal}" does not match document ${reasonField} "${rawDocVal}".`;
    }
    return result;
  }

  detectDocumentType(rawOcrText) {
    const text = String(rawOcrText || '').toLowerCase().replace(/\\[rn]/g, ' ');
    const compact = text.replace(/[^a-z0-9]/g, '');
    if (!text.trim()) return { type: null, status: 'UNKNOWN' };

    // A photographed Aadhaar card may lose its title during OCR, but the
    // 12-digit identifier is still a strong document-type signal. Check it
    // before schema-marker scoring so it cannot be mistaken for a certificate.
    if (/\b\d{12}\b/.test(compact) || /\b\d{4}[\s-]+\d{4}[\s-]+\d{4}\b/.test(text)) {
      return { type: 'aadhar', status: 'DETECTED' };
    }

    const schemas = schemaRegistry && typeof schemaRegistry.getAllSchemas === 'function'
      ? schemaRegistry.getAllSchemas()
      : [];
    const candidates = schemas.map((schema) => {
      const structure = schema.documentStructure || {};
      const anyText = Array.isArray(structure.anyText) ? structure.anyText : [];
      const anyRegex = Array.isArray(structure.anyRegex) ? structure.anyRegex : [];
      const requiredText = Array.isArray(structure.requiredText) ? structure.requiredText : [];
      const textMatches = anyText.filter((marker) => text.includes(String(marker).toLowerCase()));
      const regexMatches = anyRegex.filter((pattern) => {
        try {
          return new RegExp(pattern, 'i').test(text) || new RegExp(pattern, 'i').test(compact);
        } catch (error) {
          return false;
        }
      });
      const requiredMatches = requiredText.filter((marker) => text.includes(String(marker).toLowerCase()));
      const markerCount = textMatches.length + regexMatches.length;
      const hasRequiredStructure = requiredText.length === 0 || requiredMatches.length > 0;
      return {
        type: schema.documentType,
        markerCount,
        hasRequiredStructure,
        score: markerCount + (hasRequiredStructure ? 1 : 0)
      };
    }).filter((candidate) => candidate.markerCount > 0 && candidate.hasRequiredStructure)
      .sort((left, right) => right.score - left.score);

    if (candidates.length === 0 || (candidates.length > 1 && candidates[0].score === candidates[1].score)) {
      return { type: null, status: 'UNKNOWN' };
    }
    return { type: candidates[0].type, status: 'DETECTED' };
  }

  // Main Cross-Verification Entry Point
  // Supports verify({ formData, ocrResult, schema }) and verify(formData, ocrResult, schema)
  verify(formDataOrOptions = {}, ocrResultParam = null, schemaParam = undefined) {
    this.metrics.crossVerificationRuns++;

    let formData = {};
    let ocrResult = null;
    let schemaTarget = undefined;

    if (formDataOrOptions && formDataOrOptions.formData !== undefined) {
      formData = formDataOrOptions.formData || {};
      ocrResult = formDataOrOptions.ocrResult || null;
      schemaTarget = formDataOrOptions.schema !== undefined ? formDataOrOptions.schema : schemaParam;
    } else {
      formData = formDataOrOptions || {};
      ocrResult = ocrResultParam || null;
      schemaTarget = schemaParam;
    }

    // Resolve schema
    const schema = this.resolveSchema(schemaTarget);
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      const hasTarget = schemaTarget !== null && schemaTarget !== undefined && schemaTarget !== '';
      return {
        status: hasTarget ? 'failed' : 'waiting_for_schema',
        documentType: typeof schemaTarget === 'string' ? schemaTarget : (schemaTarget?.documentType || null),
        displayName: schemaTarget?.displayName || null,
        overallStatus: hasTarget ? 'SCHEMA_UNAVAILABLE' : 'WAITING_FOR_TYPE',
        fields: {},
        extractedFields: {},
        reasons: hasTarget
          ? [`No validation schema found for document type: "${typeof schemaTarget === 'string' ? schemaTarget : 'specified document type'}". Validation schema unavailable.`]
          : ['Waiting for document type. Please select a document type to begin cross-verification.']
      };
    }

    const isOcrComplete = Boolean(ocrResult && (ocrResult.status === 'succeeded' || (!ocrResult.status && ocrResult.text)));
    const ocrConfidence = (ocrResult && typeof ocrResult.confidence === 'number')
      ? ocrResult.confidence
      : 0;
    const isConfidenceLow = isOcrComplete && (ocrConfidence < this.rules.minConfidenceThreshold);

    const extractedFields = isOcrComplete
      ? this.extractFields(ocrResult.text, schema, formData)
      : {};

    const detectedDocument = isOcrComplete
      ? this.detectDocumentType(ocrResult.text)
      : { type: null, status: 'PENDING' };
    const expectedDocumentType = schema.documentType;
    const requiredFieldCount = schema.fields.filter((fieldDef) => fieldDef.required !== false).length;
    const extractedRequiredCount = schema.fields.filter((fieldDef) => {
      const fieldId = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      const value = extractedFields[fieldId] || extractedFields[fieldDef.logicalName] || extractedFields[fieldDef.formField];
      return fieldDef.required !== false && value !== null && value !== undefined && String(value).trim() !== '';
    }).length;
    const hasStructuredFieldEvidence = !schema.documentStructure || extractedRequiredCount >= Math.min(2, requiredFieldCount || 1);
    const documentTypeReason = detectedDocument.status === 'DETECTED' && detectedDocument.type !== expectedDocumentType
      ? `Uploaded document appears to be ${detectedDocument.type}, but the form selected ${expectedDocumentType}. Please upload the correct document.`
      : detectedDocument.status === 'UNKNOWN' && !hasStructuredFieldEvidence
        ? `Could not determine the uploaded document type from its readable text. The selected document is ${schema.displayName || expectedDocumentType}. Please upload the correct ${schema.displayName || expectedDocumentType}, or review it manually.`
        : null;
    const documentTypeCheck = {
      status: !isOcrComplete ? 'PENDING' : documentTypeReason ? (detectedDocument.status === 'UNKNOWN' ? 'NEEDS_REVIEW' : 'MISMATCH') : 'MATCH',
      expected: expectedDocumentType,
      detected: detectedDocument.type || (hasStructuredFieldEvidence ? expectedDocumentType : null),
      reason: documentTypeReason
    };

    const fieldResults = {};
    const reasons = [];
    let hasMismatch = false;
    let hasNeedsReview = false;

    if (documentTypeCheck.status === 'MISMATCH') {
      hasMismatch = true;
      reasons.push(documentTypeCheck.reason);
    } else if (documentTypeCheck.status === 'NEEDS_REVIEW') {
      hasNeedsReview = true;
      reasons.push(documentTypeCheck.reason);
    }

    // Never compare fields while OCR is pending. Partial or stale OCR text can
    // produce convincing-looking mismatches before document type is known.
    const canCompareFields = documentTypeCheck.status === 'MATCH' && isOcrComplete;

    schema.fields.forEach((fieldDef) => {
      if (!canCompareFields) return;

      const fieldId = fieldDef.id || fieldDef.logicalName || fieldDef.name || fieldDef.formField;
      const formKey = fieldDef.formField || fieldDef.id || fieldDef.logicalName || fieldDef.name;
      
      const rawFormVal = this.getFieldValue(
        formData[formKey] !== undefined ? formData[formKey] : (formData[fieldId] !== undefined ? formData[fieldId] : (formData[fieldDef.logicalName]))
      );
      const rawDocVal = extractedFields[fieldId] !== undefined
        ? extractedFields[fieldId]
        : (extractedFields[fieldDef.logicalName] !== undefined ? extractedFields[fieldDef.logicalName] : (extractedFields[fieldDef.id] || null));

      const fRes = this.compareField(
        rawFormVal,
        rawDocVal,
        fieldDef,
        isOcrComplete,
        isConfidenceLow,
        ocrConfidence
      );

      // Populate field results keyed by id, logicalName, and formField for convenience
      if (fieldId) fieldResults[fieldId] = fRes;
      if (fieldDef.id) fieldResults[fieldDef.id] = fRes;
      if (fieldDef.logicalName) fieldResults[fieldDef.logicalName] = fRes;
      if (fieldDef.formField && !fieldResults[fieldDef.formField]) fieldResults[fieldDef.formField] = fRes;

      if (fRes.status === 'MISMATCH') {
        hasMismatch = true;
        if (fRes.reason) reasons.push(fRes.reason);
      } else if (fRes.status === 'NEEDS_REVIEW') {
        if (fieldDef.required !== false) {
          hasNeedsReview = true;
          if (fRes.reason) reasons.push(fRes.reason);
        }
      }
    });

    // Compute Overall Status
    let overallStatus = 'MATCH';
    if (!isOcrComplete) {
      overallStatus = 'NEEDS_REVIEW';
    } else if (hasMismatch) {
      overallStatus = 'MISMATCH';
    } else if (hasNeedsReview) {
      overallStatus = 'NEEDS_REVIEW';
    }

    const isOcrProcessing = Boolean(ocrResult && ocrResult.status === 'processing');
    let verifStatus = 'idle';
    if (isOcrComplete) {
      verifStatus = 'completed';
    } else if (isOcrProcessing) {
      verifStatus = 'processing';
    }

    return {
      status: verifStatus,
      documentType: schema.documentType,
      displayName: schema.displayName,
      overallStatus,
      fields: fieldResults,
      extractedFields,
      documentTypeCheck,
      reasons,
      timestamp: Date.now()
    };
  }

  // Phase 10: Single-field verification without re-running other fields or full OCR extraction
  verifyField(fieldId, rawFormVal, ocrResult = null, schemaInput = undefined, existingVerification = null) {
    const schema = this.resolveSchema(schemaInput);
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      if (existingVerification) return existingVerification;
      return this.verify({ [fieldId]: rawFormVal }, ocrResult, schemaInput);
    }

    const fieldDef = schema.fields.find((fd) =>
      fd.id === fieldId ||
      fd.logicalName === fieldId ||
      fd.formField === fieldId ||
      fd.name === fieldId
    );

    if (!fieldDef) {
      return existingVerification || this.verify({ [fieldId]: rawFormVal }, ocrResult, schema);
    }

    if (existingVerification?.documentTypeCheck?.status === 'MISMATCH' || existingVerification?.documentTypeCheck?.status === 'NEEDS_REVIEW') {
      return existingVerification;
    }

    const isOcrComplete = Boolean(ocrResult && ocrResult.status === 'succeeded');
    const ocrConfidence = (ocrResult && typeof ocrResult.confidence === 'number')
      ? ocrResult.confidence
      : 0;
    const isConfidenceLow = isOcrComplete && (ocrConfidence < this.rules.minConfidenceThreshold);

    // Retrieve docValue: preferentially from existingVerification.extractedFields, or extract single field
    let rawDocVal = null;
    if (existingVerification && existingVerification.extractedFields) {
      const ef = existingVerification.extractedFields;
      rawDocVal = ef[fieldDef.id] !== undefined
        ? ef[fieldDef.id]
        : (ef[fieldDef.logicalName] !== undefined ? ef[fieldDef.logicalName] : (ef[fieldDef.formField] || null));
    }
    const formattedFormVal = this.getFieldValue(rawFormVal);
    if (rawDocVal === null && isOcrComplete && ocrResult?.text) {
      rawDocVal = this.extractField(ocrResult.text, fieldDef, formattedFormVal);
    }

    // Run single field comparison (increments fieldComparisonRuns only for this field)
    const fRes = this.compareField(
      formattedFormVal,
      rawDocVal,
      fieldDef,
      isOcrComplete,
      isConfidenceLow,
      ocrConfidence
    );

    if (!existingVerification || !existingVerification.fields) {
      const fullFormData = { [fieldId]: rawFormVal };
      return this.verify(fullFormData, ocrResult, schema);
    }

    // Merge into shallow clone of existing fields
    const updatedFields = { ...existingVerification.fields };
    if (fieldDef.id) updatedFields[fieldDef.id] = fRes;
    if (fieldDef.logicalName) updatedFields[fieldDef.logicalName] = fRes;
    if (fieldDef.formField) updatedFields[fieldDef.formField] = fRes;

    // Recalculate overallStatus and reasons across schema fields
    let hasMismatch = false;
    let hasNeedsReview = false;
    const reasons = [];

    schema.fields.forEach((fd) => {
      const curRes = updatedFields[fd.id] || updatedFields[fd.logicalName] || updatedFields[fd.formField];
      if (!curRes) return;
      if (curRes.status === 'MISMATCH') {
        hasMismatch = true;
        if (curRes.reason) reasons.push(curRes.reason);
      } else if (curRes.status === 'NEEDS_REVIEW') {
        if (fd.required !== false) {
          hasNeedsReview = true;
          if (curRes.reason) reasons.push(curRes.reason);
        }
      }
    });

    let overallStatus = 'MATCH';
    if (!isOcrComplete) {
      overallStatus = 'NEEDS_REVIEW';
    } else if (hasMismatch) {
      overallStatus = 'MISMATCH';
    } else if (hasNeedsReview) {
      overallStatus = 'NEEDS_REVIEW';
    }

    const isOcrProcessing = Boolean(ocrResult && ocrResult.status === 'processing');
    let verifStatus = 'idle';
    if (isOcrComplete) {
      verifStatus = 'completed';
    } else if (isOcrProcessing) {
      verifStatus = 'processing';
    }

    const updatedExtractedFields = { ...(existingVerification.extractedFields || {}) };
    if (rawDocVal !== null) {
      if (fieldDef.id) updatedExtractedFields[fieldDef.id] = rawDocVal;
      if (fieldDef.logicalName) updatedExtractedFields[fieldDef.logicalName] = rawDocVal;
    }

    return {
      status: verifStatus,
      documentType: schema.documentType,
      displayName: schema.displayName,
      overallStatus,
      fields: updatedFields,
      extractedFields: updatedExtractedFields,
      reasons,
      timestamp: Date.now()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CrossVerifier,
    DEFAULT_VERIFICATION_RULES
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CrossVerifier = CrossVerifier;
  globalThis.DEFAULT_VERIFICATION_RULES = DEFAULT_VERIFICATION_RULES;
}
