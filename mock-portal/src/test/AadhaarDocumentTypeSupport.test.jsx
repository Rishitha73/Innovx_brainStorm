import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import App from '../App';

const {
  getSchema,
  getAllSchemas
} = require('../../../extension/schemas/index.js');
const { CrossVerifier } = require('../../../extension/validators/crossVerifier.js');
const { SubmitGuard } = require('../../../extension/guards/submitGuard.js');

describe('Aadhaar Document Type Form Field and Verification Support', () => {
  let verifier = null;
  let submitGuard = null;

  beforeEach(() => {
    verifier = new CrossVerifier();
    submitGuard = new SubmitGuard({
      portalId: 'demo-scholarship-portal',
      submitSelector: '#submit-application',
      formSelector: '#scholarship-form',
      fields: [
        { logicalName: 'name', selector: '#applicant-name' },
        { logicalName: 'dob', selector: '#applicant-dob' },
        { logicalName: 'certificateNumber', selector: '#cert-number' },
        { logicalName: 'mobile', selector: '#applicant-mobile' }
      ],
      documentTypeSelector: '#document-type'
    });
  });

  it('1. ScholarshipForm renders aadhar option in the document-type dropdown', () => {
    render(<App />);

    const docTypeSelect = document.getElementById('document-type');
    expect(docTypeSelect).toBeInTheDocument();

    const options = Array.from(docTypeSelect.options).map((opt) => ({
      value: opt.value,
      text: opt.textContent.trim()
    }));

    expect(options).toContainEqual({ value: 'aadhar', text: 'Aadhaar Card' });
  });

  it('2. Selecting aadhar updates documentType and shows Aadhaar specific placeholder', async () => {
    const user = userEvent.setup();
    render(<App />);

    const docTypeSelect = document.getElementById('document-type');
    await user.selectOptions(docTypeSelect, 'aadhar');
    expect(docTypeSelect.value).toBe('aadhar');

    const certInput = document.getElementById('cert-number');
    expect(certInput).toHaveAttribute('placeholder', 'e.g. 9876 5432 1098');
  });

  it('3. Schema registry returns Aadhaar schema for aadhar, aadhaar, aadharCard, and aadhaarCard', () => {
    const schema1 = getSchema('aadhar');
    const schema2 = getSchema('aadhaar');
    const schema3 = getSchema('aadharCard');
    const schema4 = getSchema('aadhaarCard');

    expect(schema1).toBeDefined();
    expect(schema1.documentType).toBe('aadhar');
    expect(schema1.displayName).toBe('Aadhaar Card');
    expect(schema2).toBe(schema1);
    expect(schema3).toBe(schema1);
    expect(schema4).toBe(schema1);

    const fieldIds = schema1.fields.map((f) => f.id);
    expect(fieldIds).toContain('name');
    expect(fieldIds).toContain('dob');
    expect(fieldIds).toContain('certificateNumber');

    const all = getAllSchemas();
    expect(all.map((s) => s.documentType)).toContain('aadhar');
  });

  it('4. CrossVerifier extracts fields and verifies Aadhaar card text', () => {
    const formData = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: '9876 5432 1098',
      documentType: 'aadhar'
    };

    const aadhaarOcrText = `
      UNIQUE IDENTIFICATION AUTHORITY OF INDIA
      GOVERNMENT OF INDIA
      Name: Rohan Sharma
      DOB: 15/08/2003
      Gender: Male
      9876 5432 1098
    `;

    const ocrResult = {
      text: aadhaarOcrText,
      confidence: 94
    };

    const result = verifier.verify(formData, ocrResult, 'aadhar');
    expect(result.overallStatus).toBe('MATCH');
    expect(result.fields.name.status).toBe('MATCH');
    expect(result.fields.dob.status).toBe('MATCH');
    expect(result.fields.certificateNumber.status).toBe('MATCH');
  });

  it('5. CrossVerifier matches continuous 12-digit input with space-separated Aadhaar OCR text', () => {
    const formData = {
      name: 'Rohan Sharma',
      dob: '2003-08-15',
      certificateNumber: '987654321098', // Continuous 12 digits in form
      documentType: 'aadhar'
    };

    const aadhaarOcrText = `
      GOVERNMENT OF INDIA
      To Rohan Sharma
      DOB: 15-08-2003
      Aadhaar No: 9876 5432 1098
    `;

    const result = verifier.verify(formData, { text: aadhaarOcrText, confidence: 92 }, 'aadhar');
    expect(result.overallStatus).toBe('MATCH');
    expect(result.fields.certificateNumber.status).toBe('MATCH');
  });

  it('6. SubmitGuard allows submission with aadhar document type and matching verification', () => {
    document.body.innerHTML = `
      <form id="scholarship-form">
        <input id="applicant-name" value="Rohan Sharma" />
        <input id="applicant-dob" value="2003-08-15" />
        <input id="applicant-mobile" value="9876543210" />
        <input id="cert-number" value="9876 5432 1098" />
        <select id="document-type">
          <option value="aadhar" selected>Aadhaar Card</option>
        </select>
        <input id="upload-certificate" type="file" />
        <button id="submit-application" type="submit">Submit</button>
      </form>
    `;

    const status = {
      portalId: 'demo-scholarship-portal',
      documentType: 'aadhar',
      formFields: {
        name: 'Rohan Sharma',
        dob: '2003-08-15',
        mobile: '9876543210',
        certificateNumber: '9876 5432 1098',
        documentType: 'aadhar'
      },
      document: {
        file: { name: 'aadhaar_card.png', sizeBytes: 150000, mimeType: 'image/png' },
        fileValidation: { passed: true, reasons: [] },
        quality: { passed: true, reasons: [] },
        ocr: { status: 'succeeded', confidence: 95 }
      },
      verification: {
        overallStatus: 'MATCH',
        status: 'completed',
        fields: {
          name: { status: 'MATCH' },
          dob: { status: 'MATCH' },
          certificateNumber: { status: 'MATCH' }
        },
        reasons: []
      }
    };

    const decision = submitGuard.evaluate(status);
    expect(decision.allowed).toBe(true);
  });
});
