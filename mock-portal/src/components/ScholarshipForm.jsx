import React, { useState } from 'react';

export default function ScholarshipForm({ formData, setFormData, onReset }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    const fileInput = document.getElementById('upload-certificate');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const submissionId = 'SCH-' + Math.floor(100000 + Math.random() * 900000);
    const submissionRecord = {
      id: submissionId,
      submittedAt: new Date().toLocaleString(),
      name: formData.name,
      dob: formData.dob,
      certificateNumber: formData.certificateNumber,
      documentType: formData.documentType,
      fileName: selectedFile ? selectedFile.name : 'No file attached',
      fileSize: selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : 'N/A'
    };
    setSubmittedData(submissionRecord);
  };

  const handleResetApplication = () => {
    setSubmittedData(null);
    setSelectedFile(null);
    const fileInput = document.getElementById('upload-certificate');
    if (fileInput) {
      fileInput.value = '';
    }
    if (onReset) onReset();
  };

  const formatDocTypeName = (type) => {
    switch (type) {
      case 'incomeCertificate':
        return 'Income Certificate';
      case 'communityCertificate':
        return 'Community Certificate';
      case 'residenceCertificate':
        return 'Residence Certificate';
      default:
        return type;
    }
  };

  if (submittedData) {
    return (
      <div className="submission-success-card" data-testid="submission-success">
        <div className="success-icon-large">✓</div>
        <h2>Application Submitted Successfully!</h2>
        <p>Your mock scholarship application has been registered with the mock portal backend.</p>

        <div className="submission-summary-box">
          <div className="summary-row">
            <span className="summary-label">Application Reference ID:</span>
            <span className="summary-val" style={{ color: 'var(--color-primary)' }}>{submittedData.id}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Submission Timestamp:</span>
            <span className="summary-val">{submittedData.submittedAt}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Applicant Name:</span>
            <span className="summary-val">{submittedData.name || '(Empty)'}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Date of Birth:</span>
            <span className="summary-val">{submittedData.dob || '(Empty)'}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Certificate Number:</span>
            <span className="summary-val">{submittedData.certificateNumber || '(Empty)'}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Document Type:</span>
            <span className="summary-val">{formatDocTypeName(submittedData.documentType)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Attached Document:</span>
            <span className="summary-val">{submittedData.fileName} ({submittedData.fileSize})</span>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={handleResetApplication}
          id="btn-submit-another"
        >
          Submit Another Application
        </button>
      </div>
    );
  }

  return (
    <div className="form-card">
      <div className="form-intro">
        <h2>Post-Matric Merit Scholarship Scheme 2026-27</h2>
        <p>Please enter your personal credentials and attach your official supporting certificate.</p>
      </div>

      <form id="scholarship-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="applicant-name" className="field-label">
              Full Name (as on official certificate)
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <input
                id="applicant-name"
                name="name"
                type="text"
                className="form-input"
                placeholder="e.g. Rohan Sharma"
                value={formData.name}
                onChange={handleInputChange}
                autoComplete="name"
                required
              />
            </div>
            <span className="field-help-text">Enter full legal name without abbreviations</span>
          </div>

          {/* Date of Birth */}
          <div className="form-group">
            <label htmlFor="applicant-dob" className="field-label">
              Date of Birth
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <input
                id="applicant-dob"
                name="dob"
                type="date"
                className="form-input"
                value={formData.dob}
                onChange={handleInputChange}
                required
              />
            </div>
            <span className="field-help-text">Select your date of birth matching certificate records</span>
          </div>

          {/* Certificate Number */}
          <div className="form-group">
            <label htmlFor="cert-number" className="field-label">
              Certificate Number
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <input
                id="cert-number"
                name="certificateNumber"
                type="text"
                className="form-input"
                placeholder="e.g. INC-2024-98741"
                value={formData.certificateNumber}
                onChange={handleInputChange}
                required
              />
            </div>
            <span className="field-help-text">Certificate serial identifier issued by Revenue/Competent Authority</span>
          </div>

          {/* Document Type Dropdown */}
          <div className="form-group">
            <label htmlFor="document-type" className="field-label">
              Document Type
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <select
                id="document-type"
                name="documentType"
                className="form-select"
                value={formData.documentType}
                onChange={handleInputChange}
                required
              >
                <option value="incomeCertificate">Income Certificate</option>
                <option value="communityCertificate">Community Certificate</option>
                <option value="residenceCertificate">Residence Certificate</option>
              </select>
            </div>
            <span className="field-help-text">Choose the supporting certificate category to attach</span>
          </div>

          {/* Upload Certificate File Input */}
          <div className="form-group full-width">
            <label htmlFor="upload-certificate" className="field-label">
              Upload Supporting Certificate (PDF, JPG, PNG &lt; 2MB)
              <span className="required-star">*</span>
            </label>
            
            <div className="upload-dropzone" onClick={() => document.getElementById('upload-certificate')?.click()}>
              <input
                id="upload-certificate"
                name="certificateFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                onChange={handleFileChange}
              />
              <div className="upload-icon-container">
                📄
              </div>
              <div className="upload-main-text">
                <span className="upload-browse-link">Choose a certificate file</span> or drag and drop here
              </div>
              <div className="upload-hint-text">
                Accepted Formats: PDF, JPG, PNG (Max file size: 2.0 MB)
              </div>
            </div>

            {selectedFile && (
              <div className="file-selected-info" data-testid="selected-file-badge">
                <div className="file-info-left">
                  <span className="file-doc-icon">📎</span>
                  <div>
                    <div className="file-meta-name">{selectedFile.name}</div>
                    <div className="file-meta-details">
                      {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'application/octet-stream'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="file-remove-btn"
                  onClick={handleRemoveFile}
                  title="Remove selected file"
                >
                  ✕ Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            id="submit-application"
            className="btn-primary"
          >
            Submit Application ➔
          </button>
        </div>
      </form>
    </div>
  );
}
