// Pre-Submission Error Guard - Schema Registry (Phase 8)
// Central registry for document validation schemas

let incomeCert = null;
let communityCert = null;
let residenceCert = null;
let aadhaarCert = null;
let normUtil = null;

if (typeof require !== 'undefined') {
  try {
    incomeCert = require('./incomeCertificateSchema.js').incomeCertificateSchema;
    communityCert = require('./communityCertificateSchema.js').communityCertificateSchema;
    residenceCert = require('./residenceCertificateSchema.js').residenceCertificateSchema;
    aadhaarCert = require('./aadhaarSchema.js').aadhaarSchema;
    normUtil = require('./schemaUtils.js').normalizeSchema;
  } catch (e) {}
}

if (!incomeCert && typeof globalThis !== 'undefined') {
  incomeCert = globalThis.incomeCertificateSchema || null;
  communityCert = globalThis.communityCertificateSchema || null;
  residenceCert = globalThis.residenceCertificateSchema || null;
  aadhaarCert = globalThis.aadhaarSchema || globalThis.aadharSchema || null;
  normUtil = globalThis.normalizeSchema || null;
}

const SCHEMAS = {};

function registerSchema(rawSchema) {
  if (!rawSchema || typeof rawSchema !== 'object') {
    throw new Error('Schema must be a non-null object');
  }
  if (!rawSchema.documentType && !rawSchema.type) {
    throw new Error('Schema must specify documentType');
  }
  if (rawSchema.fields !== undefined && !Array.isArray(rawSchema.fields)) {
    throw new Error('Schema fields must be an array');
  }

  const normalizer = normUtil || (typeof normalizeSchema === 'function' ? normalizeSchema : (s) => s);
  const normalized = normalizer(rawSchema);
  if (!normalized || !normalized.documentType) {
    throw new Error('Failed to normalize schema');
  }

  SCHEMAS[normalized.documentType] = normalized;

  // Also register aliases if provided
  if (Array.isArray(rawSchema.aliases)) {
    rawSchema.aliases.forEach((alias) => {
      SCHEMAS[alias] = normalized;
      SCHEMAS[alias.toLowerCase()] = normalized;
    });
  }

  // Also register kebab-case or alternate key aliases for developer convenience
  const kebab = normalized.documentType.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (kebab !== normalized.documentType) {
    SCHEMAS[kebab] = normalized;
  }

  return normalized;
}

// Seed default schemas
if (incomeCert) registerSchema(incomeCert);
if (communityCert) registerSchema(communityCert);
if (residenceCert) registerSchema(residenceCert);
if (aadhaarCert) registerSchema(aadhaarCert);

function getSchema(documentType) {
  if (!documentType || typeof documentType !== 'string') {
    return null;
  }

  // Lookup in registry
  if (SCHEMAS[documentType]) {
    return SCHEMAS[documentType];
  }

  // Case-insensitive / normalized lookup fallback
  const directKey = Object.keys(SCHEMAS).find(
    (k) => k.toLowerCase() === documentType.toLowerCase() ||
           k.toLowerCase() === documentType.replace(/[-_]/g, '').toLowerCase()
  );

  if (directKey && SCHEMAS[directKey]) {
    return SCHEMAS[directKey];
  }

  return null;
}

function getAllSchemas() {
  const uniqueTypes = new Set();
  const list = [];
  Object.values(SCHEMAS).forEach((s) => {
    if (!uniqueTypes.has(s.documentType)) {
      uniqueTypes.add(s.documentType);
      list.push(s);
    }
  });
  return list;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCHEMAS,
    getSchema,
    registerSchema,
    getAllSchemas
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.SCHEMAS = SCHEMAS;
  globalThis.getSchema = getSchema;
  globalThis.registerSchema = registerSchema;
  globalThis.getAllSchemas = getAllSchemas;
}
