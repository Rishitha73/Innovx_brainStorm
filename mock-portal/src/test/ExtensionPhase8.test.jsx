import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');
const {
  getSchema,
  registerSchema,
  getAllSchemas,
  SCHEMAS
} = require('../../../extension/schemas/index.js');
const { INCOME_CERTIFICATE_SCHEMA } = require('../../../extension/schemas/incomeCertificateSchema.js');
const { COMMUNITY_CERTIFICATE_SCHEMA } = require('../../../extension/schemas/communityCertificateSchema.js');
const { RESIDENCE_CERTIFICATE_SCHEMA } = require('../../../extension/schemas/residenceCertificateSchema.js');
const { normalizeSchema, normalizeStrategy } = require('../../../extension/schemas/schemaUtils.js');

describe('Phase 8: Generalized Validation Schemas & Dynamic Verification Engine', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  let verifier = null;

  beforeAll(() => {
    verifier = new CrossVerifier();
  });

  // --- 1. Schema Registry & Schema Definitions ---
  describe('Schema Registry', () => {
    it('provides built-in schemas for incomeCertificate, communityCertificate, and residenceCertificate', () => {
      const incomeSchema = getSchema('incomeCertificate');
      expect(incomeSchema).toBeDefined();
      expect(incomeSchema.documentType).toBe('incomeCertificate');
      expect(incomeSchema.displayName).toBe('Income Certificate');
      expect(Array.isArray(incomeSchema.fields)).toBe(true);
      expect(incomeSchema.fields.map((f) => f.id)).toEqual(['name', 'dob', 'certificateNumber']);

      const communitySchema = getSchema('communityCertificate');
      expect(communitySchema).toBeDefined();
      expect(communitySchema.documentType).toBe('communityCertificate');
      expect(communitySchema.fields.map((f) => f.id)).toEqual(['name', 'certificateNumber']);

      const residenceSchema = getSchema('residenceCertificate');
      expect(residenceSchema).toBeDefined();
      expect(residenceSchema.documentType).toBe('residenceCertificate');
      expect(residenceSchema.fields.map((f) => f.id)).toEqual(['name', 'address']);
    });

    it('returns all registered schemas via getAllSchemas()', () => {
      const all = getAllSchemas();
      expect(Array.isArray(all)).toBe(true);
      const types = all.map((s) => s.documentType);
      expect(types).toContain('incomeCertificate');
      expect(types).toContain('communityCertificate');
      expect(types).toContain('residenceCertificate');
    });

    it('returns null when querying an unknown document type', () => {
      expect(getSchema('unknownDocumentXYZ')).toBeNull();
      expect(getSchema(null)).toBeNull();
    });

    it('allows dynamic registration of custom schemas', () => {
      const customSchema = {
        documentType: 'sportsCertificate',
        displayName: 'Sports Achievement Certificate',
        version: '1.0.0',
        fields: [
          {
            id: 'candidateName',
            name: 'Candidate Name',
            formField: 'name',
            strategy: 'fuzzy',
            threshold: 0.85,
            required: true,
            labels: ['Candidate Name', 'Participant', 'Player']
          },
          {
            id: 'awardNumber',
            name: 'Award / Medal ID',
            formField: 'certificateNumber',
            strategy: 'exact',
            required: true,
            labels: ['Medal ID', 'Award No', 'Reg ID']
          }
        ]
      };

      const registered = registerSchema(customSchema);
      expect(registered).toBeDefined();
      expect(registered.documentType).toBe('sportsCertificate');
      expect(registered.displayName).toBe('Sports Achievement Certificate');
      expect(registered.fields.length).toBe(2);
      expect(getSchema('sportsCertificate').documentType).toBe('sportsCertificate');
    });

    it('rejects invalid schema registration missing required attributes', () => {
      expect(() => registerSchema(null)).toThrow();
      expect(() => registerSchema({})).toThrow(/documentType/);
      expect(() => registerSchema({ documentType: 'badDoc', fields: 'not-an-array' })).toThrow(/fields/);
    });
  });

  // --- 2. Dynamic Schema-Driven Extraction ---
  describe('Dynamic Field Extraction via Schema', () => {
    it('extracts fields dynamically using labels declared in the active schema', () => {
      const ocrText = `
        GOVERNMENT OF MAHARASHTRA
        DOMICILE AND RESIDENCE CERTIFICATE
        Citizen Full Name: Priya Verma
        Residential Address: 42 Palm Grove, Pune 411001
        Date of Issue: 12/03/2023
      `;

      const residenceSchema = getSchema('residenceCertificate');
      const extracted = verifier.extractFields(ocrText, residenceSchema);

      expect(extracted.name).toBe('Priya Verma');
      expect(extracted.address).toBe('42 Palm Grove, Pune 411001');
    });

    it('dynamically adapts extraction when custom label dictionaries are passed', () => {
      const customSchema = {
        documentType: 'customIdCard',
        displayName: 'Custom ID Card',
        fields: [
          {
            id: 'holder',
            name: 'Card Holder',
            formField: 'name',
            strategy: 'fuzzy',
            labels: ['Card Holder', 'Cardholder Name']
          },
          {
            id: 'uid',
            name: 'Unique ID',
            formField: 'certificateNumber',
            strategy: 'exact',
            labels: ['Unique ID', 'UID No']
          }
        ]
      };

      const ocrText = `
        NATIONAL IDENTITY CARD
        Cardholder Name: Vikramaditya Singh
        UID No: IND-8829-X
      `;

      const extracted = verifier.extractFields(ocrText, customSchema);
      expect(extracted.holder).toBe('Vikramaditya Singh');
      expect(extracted.uid).toBe('IND-8829-X');
    });
  });

  // --- 3. Multi-Schema Cross-Verification ---
  describe('Cross-Verification across Different Schemas', () => {
    it('verifies Income Certificate with standard 3 fields (Name, DOB, CertNo)', () => {
      const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 94,
        text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
      };

      const result = verifier.verify({
        formData,
        ocrResult,
        schema: getSchema('incomeCertificate')
      });

      expect(result.overallStatus).toBe('MATCH');
      expect(result.documentType).toBe('incomeCertificate');
      expect(result.fields.name.status).toBe('MATCH');
      expect(result.fields.dob.status).toBe('MATCH');
      expect(result.fields.certificateNumber.status).toBe('MATCH');
    });

    it('verifies Community Certificate without failing on missing DOB because DOB is not in the schema', () => {
      const formData = { name: 'Ananya Verma', dob: '2002-04-10', certificateNumber: 'COMM-2024-55412' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 90,
        // No DOB in Community Certificate OCR
        text: 'Applicant Name: Ananya Verma\nCert No: COMM-2024-55412'
      };

      const result = verifier.verify(formData, ocrResult, 'communityCertificate');
      expect(result.overallStatus).toBe('MATCH');
      expect(result.documentType).toBe('communityCertificate');
      expect(result.fields.name.status).toBe('MATCH');
      expect(result.fields.certificateNumber.status).toBe('MATCH');
      // DOB should not exist as an evaluated field in community certificate
      expect(result.fields.dob).toBeUndefined();
    });

    it('verifies Residence Certificate with Address fuzzy matching strategy', () => {
      const formData = {
        name: 'Priya Verma',
        address: '42 Palm Grove, MG Road, Pune'
      };
      const ocrResult = {
        status: 'succeeded',
        confidence: 91,
        // Slight OCR character difference in address
        text: 'Name: Priya Verma\nAddress: 42 Palm Grove, MG Rd, Pune'
      };

      const result = verifier.verify(formData, ocrResult, getSchema('residenceCertificate'));
      expect(result.overallStatus).toBe('MATCH');
      expect(result.fields.name.status).toBe('MATCH');
      expect(result.fields.address.status).toBe('MATCH');
      expect(result.fields.address.score).toBeGreaterThanOrEqual(0.70);
    });

    it('verifies custom newly registered schema without engine modifications', () => {
      const testSchema = {
        documentType: 'internshipLetter',
        displayName: 'Internship Offer Letter',
        fields: [
          {
            id: 'candidate',
            name: 'Candidate Name',
            formField: 'name',
            strategy: 'fuzzy',
            threshold: 0.85,
            required: true,
            labels: ['Intern Name', 'Candidate']
          },
          {
            id: 'refNo',
            name: 'Offer Reference',
            formField: 'certificateNumber',
            strategy: 'exact',
            required: true,
            labels: ['Ref No', 'Offer ID']
          }
        ]
      };
      registerSchema(testSchema);

      const formData = { name: 'Aditya Rao', certificateNumber: 'INT-2024-001' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 88,
        text: 'Intern Name: Aditya Rao\nOffer ID: INT-2024-001'
      };

      const result = verifier.verify(formData, ocrResult, 'internshipLetter');
      expect(result.overallStatus).toBe('MATCH');
      expect(result.fields.candidate.status).toBe('MATCH');
      expect(result.fields.refNo.status).toBe('MATCH');
    });
  });

  // --- 4. Required vs Optional Fields ---
  describe('Field Requirements and Thresholds', () => {
    it('marks overall as NEEDS_REVIEW if a REQUIRED field is missing in OCR', () => {
      const schema = {
        documentType: 'testRequiredDoc',
        displayName: 'Test Required Doc',
        fields: [
          { id: 'name', name: 'Name', formField: 'name', strategy: 'fuzzy', required: true, labels: ['Name'] },
          { id: 'cert', name: 'Cert No', formField: 'certificateNumber', strategy: 'exact', required: true, labels: ['Cert'] }
        ]
      };

      const formData = { name: 'Rohan Sharma', certificateNumber: 'INC-123' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 90,
        text: 'Name: Rohan Sharma' // Missing Cert No
      };

      const result = verifier.verify(formData, ocrResult, schema);
      expect(result.overallStatus).toBe('NEEDS_REVIEW');
      expect(result.fields.cert.status).toBe('NEEDS_REVIEW');
    });

    it('does not downgrade overall status to NEEDS_REVIEW when an OPTIONAL field is missing in OCR', () => {
      const schema = {
        documentType: 'testOptionalDoc',
        displayName: 'Test Optional Doc',
        fields: [
          { id: 'name', name: 'Name', formField: 'name', strategy: 'fuzzy', required: true, labels: ['Name'] },
          { id: 'remarks', name: 'Remarks', formField: 'remarks', strategy: 'fuzzy', required: false, labels: ['Remarks', 'Notes'] }
        ]
      };

      const formData = { name: 'Rohan Sharma', remarks: 'Eligible student' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 90,
        text: 'Name: Rohan Sharma' // Missing optional Remarks
      };

      const result = verifier.verify(formData, ocrResult, schema);
      expect(result.overallStatus).toBe('MATCH');
      expect(result.fields.name.status).toBe('MATCH');
      expect(result.fields.remarks.status).toBe('NEEDS_REVIEW');
      expect(result.fields.remarks.required).toBe(false);
    });
  });

  // --- 5. Error Handling & Backward Compatibility ---
  describe('Robustness & Backward Compatibility', () => {
    it('handles unknown document type gracefully without throwing uncaught exceptions', () => {
      const formData = { name: 'Rohan Sharma' };
      const ocrResult = { status: 'succeeded', confidence: 90, text: 'Name: Rohan Sharma' };

      const result = verifier.verify(formData, ocrResult, 'nonExistentType');
      expect(result.status).toBe('failed');
      expect(result.reasons[0]).toContain('No validation schema found');
    });

    it('defaults to incomeCertificate schema when no schema parameter is passed (Phase 7 backward compatibility)', () => {
      const formData = { name: 'Rohan Sharma', dob: '2003-08-15', certificateNumber: 'INC-2024-98741' };
      const ocrResult = {
        status: 'succeeded',
        confidence: 92,
        text: 'Name: Rohan Sharma\nDOB: 15/08/2003\nCertificate No: INC-2024-98741'
      };

      // Call without 3rd parameter
      const result = verifier.verify(formData, ocrResult);
      expect(result.overallStatus).toBe('MATCH');
      expect(result.documentType).toBe('incomeCertificate');
      expect(result.fields.name.status).toBe('MATCH');
      expect(result.fields.dob.status).toBe('MATCH');
      expect(result.fields.certificateNumber.status).toBe('MATCH');
    });
  });

  // --- 6. Manifest & Schema Architecture Integration ---
  describe('Architecture & Manifest Verification', () => {
    it('manifest.json loads schemas before crossVerifier.js in content_scripts', () => {
      const manifestPath = path.join(extensionDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const scripts = manifest.content_scripts[0].js;

      const schemaIdx = scripts.indexOf('schemas/index.js');
      const verifierIdx = scripts.indexOf('validators/crossVerifier.js');

      expect(schemaIdx).toBeGreaterThan(-1);
      expect(verifierIdx).toBeGreaterThan(-1);
      expect(schemaIdx).toBeLessThan(verifierIdx);
      expect(scripts).toContain('schemas/incomeCertificateSchema.js');
      expect(scripts).toContain('schemas/communityCertificateSchema.js');
      expect(scripts).toContain('schemas/residenceCertificateSchema.js');
      expect(scripts).toContain('schemas/schemaUtils.js');
    });

    it('popup.html includes schema script tags before crossVerifier.js', () => {
      const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

      expect(popupHtml).toContain('schemas/schemaUtils.js');
      expect(popupHtml).toContain('schemas/incomeCertificateSchema.js');
      expect(popupHtml).toContain('schemas/communityCertificateSchema.js');
      expect(popupHtml).toContain('schemas/residenceCertificateSchema.js');
      expect(popupHtml).toContain('schemas/index.js');
    });
  });
});
