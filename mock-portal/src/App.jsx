import React, { useState } from 'react';
import ScholarshipForm from './components/ScholarshipForm';
import TestDataHelper from './components/TestDataHelper';

const INITIAL_FORM_STATE = {
  name: '',
  dob: '',
  gender: '',
  mobile: '',
  email: '',
  certificateNumber: '',
  documentType: '',
  certIssueDate: ''
};

export default function App() {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [submittedApplications, setSubmittedApplications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('innovx-submitted-applications') || '[]');
    } catch {
      return [];
    }
  });
  const [exportMessage, setExportMessage] = useState('');
  const [submittedDocuments, setSubmittedDocuments] = useState({});

  const handleApplyPreset = (presetData) => {
    setFormData(presetData);
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM_STATE);
  };

  const handleSubmitted = (application, documentFile) => {
    if (documentFile) {
      setSubmittedDocuments((previous) => ({ ...previous, [application.id]: documentFile }));
    }
    setSubmittedApplications((previous) => {
      const next = [application, ...previous].slice(0, 25);
      localStorage.setItem('innovx-submitted-applications', JSON.stringify(next));
      return next;
    });
  };

  const clearSubmittedApplications = () => {
    localStorage.removeItem('innovx-submitted-applications');
    setSubmittedApplications([]);
  };

  const exportApplicationToFolder = async (application) => {
    if (typeof window.showDirectoryPicker !== 'function') {
      setExportMessage('Folder export requires Chrome or Edge. Use the browser download fallback instead.');
      return;
    }
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      const applicationFolder = await root.getDirectoryHandle('National-State-Merit-Scholarship-Portal', { create: true });
      const recordFolder = await applicationFolder.getDirectoryHandle(application.id, { create: true });
      const dataText = [
        `Application ID: ${application.id}`,
        `Submitted At: ${application.submittedAt}`,
        `Applicant Name: ${application.name || '(Empty)'}`,
        `Date of Birth: ${application.dob || '(Empty)'}`,
        `Gender: ${application.gender || '(Empty)'}`,
        `Mobile: ${application.mobile || '(Empty)'}`,
        `Email: ${application.email || '(Empty)'}`,
        `Certificate Number: ${application.certificateNumber || '(Empty)'}`,
        `Document Type: ${application.documentTypeLabel || application.documentType || '(Not selected)'}`,
        `Certificate Issue Date: ${application.certIssueDate || '(Empty)'}`,
        `Uploaded Document: ${application.fileName || 'No file attached'}`,
        `Document Size: ${application.fileSize || 'N/A'}`
      ].join('\n');
      const fileHandle = await recordFolder.getFileHandle('data.txt', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(dataText);
      await writable.close();
      const documentFile = submittedDocuments[application.id];
      if (documentFile) {
        const documentHandle = await recordFolder.getFileHandle(documentFile.name, { create: true });
        const documentWritable = await documentHandle.createWritable();
        await documentWritable.write(documentFile);
        await documentWritable.close();
        setExportMessage(`Saved ${application.id}/data.txt and ${documentFile.name}.`);
      } else {
        setExportMessage(`Saved ${application.id}/data.txt. The document is no longer available in this browser session.`);
      }
    } catch (error) {
      if (error.name !== 'AbortError') setExportMessage(`Could not save application: ${error.message}`);
    }
  };

  return (
    <div className="portal-root">
      {/* Top Official Bar */}
      <header className="gov-topbar">
        <div className="gov-topbar-left">
          <span className="emblem-pill">GOVT OF INDIA</span>
          <span>Ministry of Higher Education &amp; Skill Development</span>
        </div>
        <div>
          <span>Academic Year 2026-2027 • Application Window Open</span>
        </div>
      </header>

      {/* Main Portal Header */}
      <div className="portal-header">
        <div className="portal-header-content">
          <div className="portal-title-area">
            <div className="portal-logo-icon">🏛️</div>
            <div>
              <h1>National &amp; State Merit Scholarship Portal</h1>
              <p>Direct Benefit Transfer (DBT) Pre-Matric &amp; Post-Matric Scheme</p>
            </div>
          </div>
          <div className="portal-badge">
            <span className="dot"></span>
            <span>Mock Portal Active (Port 5173)</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="app-container">
        {/* Helper Presets Toolbar for Phase 0 Verification */}
        <TestDataHelper onApplyPreset={handleApplyPreset} onReset={handleReset} />

        {/* Primary Scholarship Application Form */}
        <ScholarshipForm
          formData={formData}
          setFormData={setFormData}
          onReset={handleReset}
          onSubmitted={handleSubmitted}
        />

        <section className="applications-review" aria-labelledby="applications-review-title">
          <div className="review-section-heading">
            <div>
              <span className="form-section-label">Application Register</span>
              <h2 id="applications-review-title">Submitted applications</h2>
            </div>
            {submittedApplications.length > 0 && (
              <button type="button" className="review-clear-btn" onClick={clearSubmittedApplications}>
                Clear register
              </button>
            )}
          </div>
          {exportMessage && <p className="review-export-message" role="status">{exportMessage}</p>}
          {submittedApplications.length === 0 ? (
            <p className="review-empty">No applications have been submitted in this browser yet.</p>
          ) : (
            <div className="applications-table-wrap">
              <table className="applications-table">
                <thead>
                  <tr><th>Reference</th><th>Applicant</th><th>Document</th><th>Submitted</th><th>File</th><th>Disk copy</th></tr>
                </thead>
                <tbody>
                  {submittedApplications.map((application) => (
                    <tr key={application.id}>
                      <td><strong>{application.id}</strong></td>
                      <td>{application.name ? `${application.name} · record` : '(Empty)'}</td>
                      <td>{application.documentTypeLabel || application.documentType ? `${application.documentTypeLabel || application.documentType} · record` : '(Not selected)'}</td>
                      <td>{application.submittedAt}</td>
                      <td>{application.fileName ? `${application.fileName.replace(/\.[^.]+$/, '')} · record` : 'No file attached'}</td>
                      <td><button type="button" className="review-export-btn" onClick={() => exportApplicationToFolder(application)}>Save ID folder</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="portal-footer">
        <p>© 2026 State Merit Scholarship Portal (SIH Prototype Development Environment).</p>
        <p style={{ marginTop: '4px', color: '#94a3b8' }}>
          Configured for Pre-Submission Error Guard Extension Testing.
        </p>
      </footer>
    </div>
  );
}
