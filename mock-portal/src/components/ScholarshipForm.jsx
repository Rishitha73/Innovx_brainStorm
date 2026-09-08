import React, { useEffect, useState } from 'react';
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

export default function ScholarshipForm({ formData, setFormData, onReset, onSubmitted }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);
  const [originalFileName, setOriginalFileName] = useState('');
  const [outputFormat, setOutputFormat] = useState('original');
  const [imageQuality, setImageQuality] = useState(0.82);
  const [maxDimension, setMaxDimension] = useState(2200);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState('');
  const [fileSizeError, setFileSizeError] = useState('');

  const submitApplication = () => {
    const submissionId = 'SCH-' + Math.floor(100000 + Math.random() * 900000);
    const submissionRecord = {
      id: submissionId,
      submittedAt: new Date().toLocaleString(),
      name: formData.name,
      dob: formData.dob,
      gender: formData.gender,
      mobile: formData.mobile,
      email: formData.email,
      certificateNumber: formData.certificateNumber,
      documentType: formData.documentType,
      certIssueDate: formData.certIssueDate,
      fileName: selectedFile ? selectedFile.name : 'No file attached',
      fileSize: selectedFile ? (selectedFile.size / 1024).toFixed(1) + ' KB' : 'N/A',
      originalFileName,
      documentTypeLabel: formatDocTypeName(formData.documentType)
    };
    setSubmittedData(submissionRecord);
    onSubmitted?.(submissionRecord, selectedFile);
  };

  useEffect(() => {
    const handleGuardApproved = (event) => {
      if (event.target?.id !== 'scholarship-form') return;
      event.target.dataset.guardSubmissionHandled = 'true';
      submitApplication();
    };
    document.addEventListener('guard-submission-approved', handleGuardApproved);
    return () => document.removeEventListener('guard-submission-approved', handleGuardApproved);
  });

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
    setOriginalFileName(file?.name || '');
    setPreparationMessage('');
    setFileSizeError(file && file.size > MAX_FILE_SIZE_BYTES
      ? `This file is ${(file.size / (1024 * 1024)).toFixed(2)} MB. The maximum allowed size is 1 MB. Compress or prepare the file before submitting.`
      : '');
    if (file && file.type.startsWith('image/')) setOutputFormat('jpeg');
  };

  const safePart = (value) => String(value || 'document').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'document';

  const requiredFileName = (extension) => {
    const typeLabel = formData.documentType === 'aadhar' ? 'Aadhaar_Card' : formData.documentType || 'Certificate';
    return `${safePart(formData.name || 'Applicant')}_${safePart(typeLabel)}.${extension}`;
  };

  const replaceInputFile = (file) => {
    const input = document.getElementById('upload-certificate');
    if (!input || typeof DataTransfer === 'undefined') return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const prepareImage = (file, type, extension) => new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) {
          reject(new Error('Could not encode the prepared image.'));
          return;
        }
        resolve(new File([blob], requiredFileName(extension), { type }));
      }, type, type === 'image/png' ? undefined : imageQuality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image.'));
    };
    image.src = objectUrl;
  });

  const prepareSelectedFile = async () => {
    if (!selectedFile) return;
    setIsPreparing(true);
    setPreparationMessage('');
    try {
      const isImage = selectedFile.type.startsWith('image/');
      const extension = outputFormat === 'png' ? 'png' : outputFormat === 'jpeg' ? 'jpg' : (selectedFile.name.split('.').pop() || 'bin').toLowerCase();
      const prepared = isImage && outputFormat !== 'original'
        ? await prepareImage(selectedFile, outputFormat === 'png' ? 'image/png' : 'image/jpeg', extension)
        : new File([selectedFile], requiredFileName(extension), { type: selectedFile.type || 'application/octet-stream' });
      setSelectedFile(prepared);
      setFileSizeError(prepared.size > MAX_FILE_SIZE_BYTES
          ? `Prepared file is ${(prepared.size / (1024 * 1024)).toFixed(2)} MB. Reduce image quality or longest edge below 1 MB.`
        : '');
      setPreparationMessage(`Prepared ${prepared.name} (${(prepared.size / 1024).toFixed(1)} KB). Original: ${originalFileName}.`);
      replaceInputFile(prepared);
    } catch (error) {
      setPreparationMessage(error.message || 'Could not prepare this file.');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setFileSizeError('');
    const fileInput = document.getElementById('upload-certificate');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (e.currentTarget.dataset.guardSubmissionHandled === 'true') {
      delete e.currentTarget.dataset.guardSubmissionHandled;
      return;
    }
    if (fileSizeError) {
      setPreparationMessage(`Submission blocked: ${fileSizeError}`);
      document.getElementById('upload-certificate')?.focus();
      return;
    }
    submitApplication();
  };

  const handleResetApplication = () => {
    setSubmittedData(null);
    setSelectedFile(null);
    setOriginalFileName('');
    setPreparationMessage('');
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
      case 'aadhar':
      case 'aadharCard':
      case 'aadhaar':
      case 'aadhaarCard':
        return 'Aadhaar Card';
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
          {submittedData.gender && (
            <div className="summary-row">
              <span className="summary-label">Gender:</span>
              <span className="summary-val">{submittedData.gender}</span>
            </div>
          )}
          {submittedData.mobile && (
            <div className="summary-row">
              <span className="summary-label">Mobile Number:</span>
              <span className="summary-val">{submittedData.mobile}</span>
            </div>
          )}
          {submittedData.email && (
            <div className="summary-row">
              <span className="summary-label">Email Address:</span>
              <span className="summary-val">{submittedData.email}</span>
            </div>
          )}
          <div className="summary-row">
            <span className="summary-label">Certificate Number:</span>
            <span className="summary-val">{submittedData.certificateNumber || '(Empty)'}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Document Type:</span>
            <span className="summary-val">{formatDocTypeName(submittedData.documentType)}</span>
          </div>
          {submittedData.certIssueDate && (
            <div className="summary-row">
              <span className="summary-label">Certificate Issue Date:</span>
              <span className="summary-val">{submittedData.certIssueDate}</span>
            </div>
          )}
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
        <h2>Post-Matric Merit Scholarship Scheme 2026–27</h2>
        <p>Please enter your details and upload the required supporting certificate.</p>
      </div>

      <form id="scholarship-form" onSubmit={handleSubmit} noValidate>

        {/* ── PERSONAL INFORMATION ── */}
        <div className="form-section-header">
          <span className="form-section-label">Personal Information</span>
        </div>
        <div className="form-grid">

          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="applicant-name" className="field-label">
              Full Name
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

          {/* Gender */}
          <div className="form-group">
            <label htmlFor="applicant-gender" className="field-label">
              Gender
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <select
                id="applicant-gender"
                name="gender"
                className="form-select"
                value={formData.gender}
                onChange={handleInputChange}
                required
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <span className="field-help-text">Select as per official identity document</span>
          </div>

          {/* Mobile Number */}
          <div className="form-group">
            <label htmlFor="applicant-mobile" className="field-label">
              Mobile Number
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <input
                id="applicant-mobile"
                name="mobile"
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={formData.mobile}
                onChange={handleInputChange}
                autoComplete="tel"
                maxLength={10}
                required
              />
            </div>
            <span className="field-help-text">10-digit mobile number linked to Aadhaar</span>
          </div>

          {/* Email Address */}
          <div className="form-group">
            <label htmlFor="applicant-email" className="field-label">
              Email Address
            </label>
            <div className="input-container">
              <input
                id="applicant-email"
                name="email"
                type="email"
                className="form-input"
                placeholder="e.g. rohan@example.com"
                value={formData.email}
                onChange={handleInputChange}
                autoComplete="email"
              />
            </div>
            <span className="field-help-text">Correspondence email (optional but recommended)</span>
          </div>

        </div>

        {/* ── CERTIFICATE INFORMATION ── */}
        <div className="form-section-header">
          <span className="form-section-label">Certificate Information</span>
        </div>
        <div className="form-grid">

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
                <option value="">Select Certificate Type</option>
                <option value="incomeCertificate">Income Certificate</option>
                <option value="communityCertificate">Community Certificate</option>
                <option value="residenceCertificate">Residence Certificate</option>
                <option value="aadhar">Aadhaar Card</option>
              </select>
            </div>
            <span className="field-help-text">Choose the supporting certificate category to attach</span>
          </div>

          {/* Certificate Number */}
          <div className="form-group">
            <label htmlFor="cert-number" className="field-label">
              {formData.documentType === 'aadhar' || formData.documentType === 'aadharCard' || formData.documentType === 'aadhaar'
                ? 'Aadhaar / Certificate Number'
                : 'Certificate Number'}
              <span className="required-star">*</span>
            </label>
            <div className="input-container">
              <input
                id="cert-number"
                name="certificateNumber"
                type="text"
                className="form-input"
                placeholder={
                  formData.documentType === 'aadhar' || formData.documentType === 'aadharCard' || formData.documentType === 'aadhaar'
                    ? 'e.g. 9876 5432 1098'
                    : 'e.g. INC-2024-98741'
                }
                value={formData.certificateNumber}
                onChange={handleInputChange}
                required
              />
            </div>
            <span className="field-help-text">
              {formData.documentType === 'aadhar' || formData.documentType === 'aadharCard' || formData.documentType === 'aadhaar'
                ? '12-digit Aadhaar number or certificate serial identifier'
                : 'Certificate serial identifier issued by Revenue / Competent Authority'}
            </span>
          </div>

          {/* Certificate Issue Date */}
          <div className="form-group">
            <label htmlFor="cert-issue-date" className="field-label">
              Certificate Issue Date
            </label>
            <div className="input-container">
              <input
                id="cert-issue-date"
                name="certIssueDate"
                type="date"
                className="form-input"
                value={formData.certIssueDate}
                onChange={handleInputChange}
              />
            </div>
            <span className="field-help-text">Date the certificate was officially issued</span>
          </div>

        </div>

        {/* ── SUPPORTING DOCUMENT ── */}
        <div className="form-section-header">
          <span className="form-section-label">Supporting Document</span>
        </div>
        <div className="form-grid">
          <div className="form-group full-width">
            <label htmlFor="upload-certificate" className="field-label">
              Upload Certificate
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
                Accepted formats: PDF, JPG, PNG &nbsp;•&nbsp; Maximum size: 1 MB
                  Accepted formats: PDF, JPG, PNG &nbsp;•&nbsp; Maximum size: 1 MB
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
            {fileSizeError && (
              <div className="file-size-error" role="alert">
                <strong>File too large</strong>
                <span>{fileSizeError}</span>
              </div>
            )}
            {selectedFile && (
              <div className="document-preparation-panel">
                <div>
                  <strong>Prepare before upload</strong>
                  <p>Keep the original safe while creating a smaller, clearly named copy.</p>
                </div>
                <label htmlFor="output-format">Format</label>
                <select id="output-format" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} disabled={!selectedFile.type.startsWith('image/')}>
                  <option value="original">Keep original format</option>
                  <option value="jpeg">Convert to JPG</option>
                  <option value="png">Convert to PNG</option>
                </select>
                <label htmlFor="image-quality">Image quality: {Math.round(imageQuality * 100)}%</label>
                <input id="image-quality" type="range" min="55" max="95" value={Math.round(imageQuality * 100)} onChange={(e) => setImageQuality(Number(e.target.value) / 100)} disabled={!selectedFile.type.startsWith('image/') || outputFormat === 'png'} />
                <label htmlFor="max-dimension">Longest edge: {maxDimension}px</label>
                <input id="max-dimension" type="range" min="1200" max="3200" step="100" value={maxDimension} onChange={(e) => setMaxDimension(Number(e.target.value))} disabled={!selectedFile.type.startsWith('image/')} />
                <button type="button" className="prepare-file-btn" onClick={prepareSelectedFile} disabled={isPreparing}>
                  {isPreparing ? 'Preparing…' : 'Rename and prepare file'}
                </button>
                {preparationMessage && <span className="preparation-message">{preparationMessage}</span>}
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
