import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import App from '../App';

describe('Phase 0: Mock Scholarship Application Portal', () => {
  it('renders all required elements with exact stable IDs specified in PRD', () => {
    render(<App />);

    // Check stable IDs
    const nameInput = document.getElementById('applicant-name');
    const dobInput = document.getElementById('applicant-dob');
    const certNumberInput = document.getElementById('cert-number');
    const docTypeSelect = document.getElementById('document-type');
    const uploadInput = document.getElementById('upload-certificate');
    const submitButton = document.getElementById('submit-application');
    const formElement = document.getElementById('scholarship-form');

    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveAttribute('type', 'text');

    expect(dobInput).toBeInTheDocument();
    expect(dobInput).toHaveAttribute('type', 'date');

    expect(certNumberInput).toBeInTheDocument();
    expect(certNumberInput).toHaveAttribute('type', 'text');

    expect(docTypeSelect).toBeInTheDocument();
    expect(docTypeSelect.tagName.toLowerCase()).toBe('select');

    expect(uploadInput).toBeInTheDocument();
    expect(uploadInput).toHaveAttribute('type', 'file');

    expect(submitButton).toBeInTheDocument();
    expect(submitButton).toHaveAttribute('type', 'submit');

    expect(formElement).toBeInTheDocument();
  });

  it('contains the three required document-type options with Income Certificate as default', () => {
    render(<App />);

    const docTypeSelect = document.getElementById('document-type');
    expect(docTypeSelect.value).toBe('incomeCertificate');

    const options = Array.from(docTypeSelect.options).map((opt) => ({
      value: opt.value,
      text: opt.textContent
    }));

    expect(options).toEqual([
      { value: 'incomeCertificate', text: 'Income Certificate' },
      { value: 'communityCertificate', text: 'Community Certificate' },
      { value: 'residenceCertificate', text: 'Residence Certificate' }
    ]);
  });

  it('accepts text input in Full Name, DOB, and Certificate Number fields', async () => {
    const user = userEvent.setup();
    render(<App />);

    const nameInput = document.getElementById('applicant-name');
    const dobInput = document.getElementById('applicant-dob');
    const certNumberInput = document.getElementById('cert-number');

    await user.type(nameInput, 'Vikram Singh');
    expect(nameInput.value).toBe('Vikram Singh');

    fireEvent.change(dobInput, { target: { value: '2001-07-20' } });
    expect(dobInput.value).toBe('2001-07-20');

    await user.type(certNumberInput, 'INC-2026-77889');
    expect(certNumberInput.value).toBe('INC-2026-77889');
  });

  it('allows changing the document type dropdown', async () => {
    const user = userEvent.setup();
    render(<App />);

    const docTypeSelect = document.getElementById('document-type');
    await user.selectOptions(docTypeSelect, 'communityCertificate');
    expect(docTypeSelect.value).toBe('communityCertificate');

    await user.selectOptions(docTypeSelect, 'residenceCertificate');
    expect(docTypeSelect.value).toBe('residenceCertificate');
  });

  it('displays selected file information when a certificate is attached', () => {
    render(<App />);

    const uploadInput = document.getElementById('upload-certificate');
    const testFile = new File(['mock content'], 'income_certificate_2024.pdf', {
      type: 'application/pdf'
    });

    fireEvent.change(uploadInput, { target: { files: [testFile] } });

    const selectedFileBadge = screen.getByTestId('selected-file-badge');
    expect(selectedFileBadge).toBeInTheDocument();
    expect(screen.getByText('income_certificate_2024.pdf')).toBeInTheDocument();
  });

  it('submits successfully and displays confirmation details without errors', async () => {
    const user = userEvent.setup();
    render(<App />);

    const nameInput = document.getElementById('applicant-name');
    const dobInput = document.getElementById('applicant-dob');
    const certNumberInput = document.getElementById('cert-number');
    const uploadInput = document.getElementById('upload-certificate');
    const submitBtn = document.getElementById('submit-application');

    await user.type(nameInput, 'Rohan Sharma');
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    await user.type(certNumberInput, 'INC-2024-98741');

    const testFile = new File(['mock pdf bytes'], 'income_cert.pdf', {
      type: 'application/pdf'
    });
    fireEvent.change(uploadInput, { target: { files: [testFile] } });

    await user.click(submitBtn);

    // Confirmation view should be displayed
    const successCard = screen.getByTestId('submission-success');
    expect(successCard).toBeInTheDocument();
    expect(screen.getByText(/Application Submitted Successfully!/i)).toBeInTheDocument();
    expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
    expect(screen.getByText('2003-08-15')).toBeInTheDocument();
    expect(screen.getByText('INC-2024-98741')).toBeInTheDocument();
    expect(screen.getByText('Income Certificate')).toBeInTheDocument();
    expect(screen.getByText(/income_cert.pdf/i)).toBeInTheDocument();
  });

  it('applies quick test presets when preset button is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    const presetBtn = screen.getByRole('button', { name: /Standard Valid Income Cert/i });
    await user.click(presetBtn);

    const nameInput = document.getElementById('applicant-name');
    const dobInput = document.getElementById('applicant-dob');
    const certNumberInput = document.getElementById('cert-number');
    const docTypeSelect = document.getElementById('document-type');

    expect(nameInput.value).toBe('Rohan Sharma');
    expect(dobInput.value).toBe('2003-08-15');
    expect(certNumberInput.value).toBe('INC-2024-98741');
    expect(docTypeSelect.value).toBe('incomeCertificate');
  });
});
