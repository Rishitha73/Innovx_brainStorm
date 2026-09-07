// Pre-Submission Error Guard - In-Page UI Controller (Phase 11)
// Injects and reactively manages field badges, inline error/warning panels, document status cards, and overall status banners

class InPageUI {
  constructor(portalConfig) {
    this.portalConfig = portalConfig;
    this.injected = false;
    this.elements = {
      overallBanner: null,
      fieldBadges: {},
      inlinePanels: {},
      documentCard: null,
      submitBlockedCard: null
    };
  }

  // Escapes HTML special characters for safe string rendering
  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Returns field display names
  getFieldDisplayName(logicalName) {
    switch (logicalName) {
      case 'name':
        return 'Full Name';
      case 'dob':
        return 'Date of Birth';
      case 'certificateNumber':
        return 'Certificate Number';
      case 'address':
        return 'Address';
      case 'documentType':
        return 'Document Type';
      default:
        return logicalName;
    }
  }

  // Returns suggested corrective action text for a field
  getSuggestedAction(logicalName, status) {
    if (status === 'MISMATCH') {
      switch (logicalName) {
        case 'name':
          return 'Check the form name and update it to match your certificate.';
        case 'dob':
          return 'Check the date entered above and update it to match your certificate.';
        case 'certificateNumber':
          return 'Check the certificate number entered above and update it to match your certificate.';
        case 'address':
          return 'Check the address entered above and update it to match your certificate.';
        default:
          return 'Check the entered form value and update it to match your certificate.';
      }
    } else {
      const display = this.getFieldDisplayName(logicalName);
      return `Check that the document is readable and that the ${display} is clearly visible.`;
    }
  }

  // Initializes and injects UI elements into the host portal DOM
  initialize() {
    if (typeof document === 'undefined') return;
    this.cleanup();

    const formSelector = this.portalConfig?.formSelector || '#scholarship-form';
    const formElement = document.querySelector(formSelector);
    if (!formElement) return;

    // 1. Inject Top Overall Status Banner
    const banner = document.createElement('div');
    banner.className = 'guard-overall-banner waiting-type';
    banner.id = 'guard-overall-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <div class="guard-banner-icon" id="guard-banner-icon">🛡️</div>
      <div class="guard-banner-content">
        <div class="guard-banner-title" id="guard-banner-title">Error Guard Active</div>
        <div class="guard-banner-subtitle" id="guard-banner-subtitle">Select a document type and attach your certificate for real-time verification.</div>
      </div>
      <span class="guard-banner-badge" id="guard-banner-badge">FORM DETECTED</span>
    `;

    const formGrid = formElement.querySelector('.form-grid');
    if (formGrid) {
      formElement.insertBefore(banner, formGrid);
    } else {
      formElement.prepend(banner);
    }
    banner.style.visibility = 'hidden';
    banner.style.position = 'absolute';
    banner.style.left = '-9999px';
    banner.style.width = '1px';
    banner.style.height = '1px';
    banner.style.overflow = 'hidden';
    this.elements.overallBanner = banner;

    // 2. Inject Field Badges & Inline Panels for each configured field
    const fieldConfigs = this.portalConfig?.fields || [
      { logicalName: 'name', selector: '#applicant-name' },
      { logicalName: 'dob', selector: '#applicant-dob' },
      { logicalName: 'certificateNumber', selector: '#cert-number' }
    ];

    fieldConfigs.forEach((fConfig) => {
      const inputEl = document.querySelector(fConfig.selector);
      if (!inputEl) return;

      const formGroup = inputEl.closest('.form-group') || inputEl.parentElement;
      const labelEl = formGroup ? formGroup.querySelector('label') : null;

      const badge = document.createElement('span');
      badge.className = 'guard-field-badge';
      badge.dataset.guardField = fConfig.logicalName;
      badge.setAttribute('aria-live', 'polite');
      badge.style.display = 'none';
      badge.style.visibility = 'hidden';

      if (labelEl) {
        labelEl.appendChild(badge);
      } else if (formGroup) {
        formGroup.insertBefore(badge, inputEl);
      }
      this.elements.fieldBadges[fConfig.logicalName] = badge;

      const panel = document.createElement('div');
      panel.className = 'guard-inline-panel';
      panel.dataset.guardPanel = fConfig.logicalName;
      panel.setAttribute('role', 'alert');
      panel.setAttribute('aria-live', 'polite');
      panel.style.display = 'none';
      panel.style.visibility = 'hidden';

      const inputContainer = inputEl.closest('.input-container') || inputEl;
      if (inputContainer.nextSibling) {
        inputContainer.parentNode.insertBefore(panel, inputContainer.nextSibling);
      } else {
        inputContainer.parentNode.appendChild(panel);
      }
      this.elements.inlinePanels[fConfig.logicalName] = panel;
    });

    // 3. Inject Document Status Card near file upload
    const uploadSelector = this.portalConfig?.documentUpload?.selector || '#upload-certificate';
    const uploadInput = document.querySelector(uploadSelector);
    if (uploadInput) {
      const uploadGroup = uploadInput.closest('.form-group') || uploadInput.parentElement;
      if (uploadGroup) {
        const docCard = document.createElement('div');
        docCard.className = 'guard-doc-status-card';
        docCard.id = 'guard-doc-status-card';
        docCard.style.visibility = 'hidden';
        docCard.style.position = 'absolute';
        docCard.style.left = '-9999px';
        docCard.style.width = '1px';
        docCard.style.height = '1px';
        docCard.style.overflow = 'hidden';
        docCard.innerHTML = `
          <div class="guard-doc-card-header">
            <div class="guard-doc-card-title"><span>🛡️ Document Integrity &amp; Verification</span></div>
            <span class="guard-doc-overall-badge" id="guard-doc-summary-badge">NO FILE</span>
          </div>
          <div class="guard-doc-grid">
            <div class="guard-doc-item">
              <span class="guard-pill" id="guard-pill-file">NO FILE</span>
              <span class="guard-desc" id="guard-desc-file">No certificate attached yet.</span>
            </div>
            <div class="guard-doc-item">
              <span class="guard-pill" id="guard-pill-quality">NOT RUN</span>
              <span class="guard-desc" id="guard-desc-quality">Waiting for valid certificate file.</span>
            </div>
            <div class="guard-doc-item">
              <span class="guard-pill" id="guard-pill-ocr">NOT RUN</span>
              <span class="guard-desc" id="guard-desc-ocr">Waiting for quality check completion.</span>
            </div>
            <div class="guard-doc-item">
              <span class="guard-pill" id="guard-pill-verification">IDLE</span>
              <span class="guard-desc" id="guard-desc-verification">Waiting for document verification.</span>
            </div>
          </div>
        `;
        uploadGroup.appendChild(docCard);
        this.elements.documentCard = docCard;
      }
    }

    this.injected = true;
  }

  // Reactively renders UI components according to the latest portal validation state
  render(status) {
    if (typeof document === 'undefined') return;
    if (!this.injected) {
      this.initialize();
    }
    if (!status) return;

    const docType = status.documentType || status.formFields?.documentType?.value || status.form?.documentType?.value || null;
    const documentState = status.document || {};
    const verif = status.verification || {};
    const fields = verif.fields || {};

    const isWaitingForType = !docType || verif.overallStatus === 'WAITING_FOR_TYPE' || verif.status === 'waiting_for_schema';
    const isSchemaUnavailable = verif.overallStatus === 'SCHEMA_UNAVAILABLE';
    const hasFile = Boolean(documentState.file);
    const isQualityProcessing = documentState.quality?.status === 'processing';
    const isOcrProcessing = documentState.ocr?.status === 'processing';
    const isVerifProcessing = verif.status === 'processing' || isQualityProcessing || isOcrProcessing;

    // =========================================================================
    // 1. RENDER OVERALL STATUS BANNER
    // =========================================================================
    const banner = this.elements.overallBanner || document.getElementById('guard-overall-banner');
    if (banner) {
      const bannerIcon = banner.querySelector('#guard-banner-icon');
      const bannerTitle = banner.querySelector('#guard-banner-title');
      const bannerSubtitle = banner.querySelector('#guard-banner-subtitle');
      const bannerBadge = banner.querySelector('#guard-banner-badge');

      if (isWaitingForType) {
        banner.className = 'guard-overall-banner waiting-type';
        if (bannerIcon) bannerIcon.textContent = '🏷️';
        if (bannerTitle) bannerTitle.textContent = 'Waiting for Document Type';
        if (bannerSubtitle) bannerSubtitle.textContent = 'Please select a Document Type in the form to activate schema cross-verification.';
        if (bannerBadge) bannerBadge.textContent = 'WAITING FOR TYPE';
      } else if (isSchemaUnavailable) {
        banner.className = 'guard-overall-banner action-required mismatch';
        if (bannerIcon) bannerIcon.textContent = '❌';
        if (bannerTitle) bannerTitle.textContent = 'Validation Schema Unavailable';
        if (bannerSubtitle) bannerSubtitle.textContent = verif.reasons?.[0] || 'No validation schema found for selected document type.';
        if (bannerBadge) bannerBadge.textContent = 'SCHEMA UNAVAILABLE';
      } else if (!hasFile) {
        banner.className = 'guard-overall-banner waiting-type waiting-doc';
        if (bannerIcon) bannerIcon.textContent = '📄';
        if (bannerTitle) bannerTitle.textContent = 'Document Required';
        if (bannerSubtitle) bannerSubtitle.textContent = 'Please attach your official certificate to verify your credentials against document records.';
        if (bannerBadge) bannerBadge.textContent = 'NO CERTIFICATE';
      } else if (isVerifProcessing) {
        banner.className = 'guard-overall-banner processing';
        if (bannerIcon) bannerIcon.textContent = '⏳';
        if (bannerTitle) bannerTitle.textContent = '⏳ PROCESSING...';
        if (bannerSubtitle) bannerSubtitle.textContent = isQualityProcessing ? 'Performing OpenCV visual quality analysis...' : 'Extracting document text using Tesseract.js OCR...';
        if (bannerBadge) bannerBadge.textContent = 'CHECKING';
      } else if (verif.overallStatus === 'MATCH' || verif.overallStatus === 'ALL_PASS') {
        banner.className = 'guard-overall-banner pass';
        if (bannerIcon) bannerIcon.textContent = '✓';
        if (bannerTitle) bannerTitle.textContent = '✓ ALL CHECKS PASS';
        if (bannerSubtitle) bannerSubtitle.textContent = 'All credentials match the uploaded certificate. You may review your application.';
        if (bannerBadge) bannerBadge.textContent = 'ALL PASS';
      } else if (verif.overallStatus === 'MISMATCH') {
        banner.className = 'guard-overall-banner action-required mismatch';
        if (bannerIcon) bannerIcon.textContent = '✕';
        if (bannerTitle) bannerTitle.textContent = '✕ ACTION REQUIRED';
        if (bannerSubtitle) bannerSubtitle.textContent = 'One or more form fields do not match the uploaded certificate. Please review the highlighted fields below.';
        if (bannerBadge) bannerBadge.textContent = 'ACTION REQUIRED';
      } else {
        banner.className = 'guard-overall-banner needs-review review';
        if (bannerIcon) bannerIcon.textContent = '⚠';
        if (bannerTitle) bannerTitle.textContent = '⚠ NEEDS REVIEW';
        if (bannerSubtitle) bannerSubtitle.textContent = 'One or more fields require manual review due to low OCR confidence or unreadable text.';
        if (bannerBadge) bannerBadge.textContent = 'NEEDS REVIEW';
      }
      banner.style.visibility = 'hidden';
      banner.style.position = 'absolute';
      banner.style.left = '-9999px';
      banner.style.width = '1px';
      banner.style.height = '1px';
      banner.style.overflow = 'hidden';
    }

    // =========================================================================
    // 1b. ERROR POPUP DISMISSAL ON PASS
    // =========================================================================
    if (verif.overallStatus === 'MATCH' || verif.overallStatus === 'ALL_PASS') {
      if (!status.inputErrors || Object.keys(status.inputErrors).length === 0) {
        this.hideErrorPopup();
        this.hideSubmitBlocked();
      }
    }

    // =========================================================================
    // 2. RENDER SCHEMA-AWARE FIELD BADGES & INLINE PANELS
    // =========================================================================
    let activeSchemaFields = [];
    if (!isWaitingForType && !isSchemaUnavailable && docType) {
      if (docType === 'incomeCertificate') {
        activeSchemaFields = ['name', 'dob', 'certificateNumber'];
      } else if (docType === 'communityCertificate') {
        activeSchemaFields = ['name', 'certificateNumber'];
      } else if (docType === 'residenceCertificate') {
        activeSchemaFields = ['name', 'address'];
      } else {
        activeSchemaFields = Object.keys(fields);
      }
    }

    const allFieldNames = ['name', 'dob', 'certificateNumber', 'address'];
    allFieldNames.forEach((fName) => {
      const badge = this.elements.fieldBadges[fName] || document.querySelector(`[data-guard-field="${fName}"]`);
      const panel = this.elements.inlinePanels[fName] || document.querySelector(`[data-guard-panel="${fName}"]`);

      if (!activeSchemaFields.includes(fName) || isWaitingForType || isSchemaUnavailable) {
        if (badge) {
          badge.style.display = 'none';
          badge.style.visibility = 'hidden';
        }
        if (panel) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
        return;
      }

      if (!badge) return;
      const fRes = fields[fName];

      if (isVerifProcessing) {
        badge.style.display = 'inline-flex';
        badge.className = 'guard-field-badge guard-badge-pending';
        badge.innerHTML = '<span class="guard-badge-icon">⏳</span><span class="guard-badge-text">CHECKING...</span>';
        badge.style.visibility = 'hidden';
        if (panel) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
        return;
      }

      if (!hasFile) {
        badge.style.display = 'none';
        badge.style.visibility = 'hidden';
        if (panel) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
        return;
      }

      if (!fRes) {
        badge.style.display = 'none';
        badge.style.visibility = 'hidden';
        if (panel) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
        return;
      }

      const fStatus = fRes.status || 'NEEDS_REVIEW';

      if (fStatus === 'MATCH') {
        badge.style.display = 'inline-flex';
        badge.className = 'guard-field-badge guard-badge-match';
        badge.innerHTML = '<span class="guard-badge-icon">✓</span><span class="guard-badge-text">MATCH</span>';
        badge.style.visibility = 'hidden';
        if (panel) {
          panel.style.display = 'none';
          panel.style.visibility = 'hidden';
        }
      } else if (fStatus === 'MISMATCH') {
        badge.style.display = 'inline-flex';
        badge.className = 'guard-field-badge guard-badge-mismatch';
        badge.innerHTML = '<span class="guard-badge-icon">✕</span><span class="guard-badge-text">MISMATCH</span>';
        badge.style.visibility = 'hidden';

        if (panel) {
          panel.style.display = 'block';
          panel.className = 'guard-inline-panel guard-panel-mismatch';
          panel.style.visibility = 'hidden';
          const displayName = this.getFieldDisplayName(fName);
          const formVal = this.escapeHtml(fRes.formValue || '(empty)');
          const docVal = this.escapeHtml(fRes.documentValue || 'Not found');
          const suggestion = this.escapeHtml(this.getSuggestedAction(fName, 'MISMATCH'));

          panel.innerHTML = `
            <div class="guard-panel-header"><span class="guard-panel-icon">✕</span><span class="guard-panel-title">Mismatch detected — ${displayName}</span></div>
            <div class="guard-panel-body">
              <p class="guard-panel-desc">Your form value does not match the uploaded document.</p>
              <div class="guard-panel-comparison">
                <div class="guard-panel-compare-item"><span class="guard-compare-label">Form Value:</span><span class="guard-compare-val form-val">${formVal}</span></div>
                <div class="guard-panel-compare-item"><span class="guard-compare-label">Document (OCR):</span><span class="guard-compare-val doc-val">${docVal}</span></div>
              </div>
              <div class="guard-panel-action"><strong>Suggested action:</strong> ${suggestion}</div>
            </div>
          `;
        }
      } else if (fStatus === 'NEEDS_REVIEW') {
        badge.style.display = 'inline-flex';
        badge.className = 'guard-field-badge guard-badge-review';
        badge.innerHTML = '<span class="guard-badge-icon">⚠</span><span class="guard-badge-text">NEEDS REVIEW</span>';
        badge.style.visibility = 'hidden';

        if (panel) {
          panel.style.display = 'block';
          panel.className = 'guard-inline-panel guard-panel-review';
          panel.style.visibility = 'hidden';
          const displayName = this.getFieldDisplayName(fName);
          const formVal = this.escapeHtml(fRes.formValue || '(empty)');
          const docVal = this.escapeHtml(fRes.documentValue || 'Not confidently extracted');
          const suggestion = this.escapeHtml(this.getSuggestedAction(fName, 'NEEDS_REVIEW'));

          panel.innerHTML = `
            <div class="guard-panel-header"><span class="guard-panel-icon">⚠</span><span class="guard-panel-title">Verification Needs Review — ${displayName}</span></div>
            <div class="guard-panel-body">
              <div class="guard-panel-comparison">
                <div class="guard-panel-compare-item"><span class="guard-compare-label">Form Value:</span><span class="guard-compare-val form-val">${formVal}</span></div>
                <div class="guard-panel-compare-item"><span class="guard-compare-label">Document (OCR):</span><span class="guard-compare-val doc-val">${docVal}</span></div>
              </div>
              <div class="guard-panel-action"><strong>Suggested action:</strong> ${suggestion}</div>
            </div>
          `;
        }
      }
    });

    const docCard = this.elements.documentCard || document.getElementById('guard-doc-status-card');
    if (docCard) {
      const summaryBadge = docCard.querySelector('#guard-doc-summary-badge');
      const pillFile = docCard.querySelector('#guard-pill-file');
      const descFile = docCard.querySelector('#guard-desc-file');
      const pillQuality = docCard.querySelector('#guard-pill-quality');
      const descQuality = docCard.querySelector('#guard-desc-quality');
      const pillOcr = docCard.querySelector('#guard-pill-ocr');
      const descOcr = docCard.querySelector('#guard-desc-ocr');
      const pillVerif = docCard.querySelector('#guard-pill-verification');
      const descVerif = docCard.querySelector('#guard-desc-verification');

      const fileVal = documentState.fileValidation;
      if (!hasFile) {
        if (pillFile) { pillFile.textContent = 'NO FILE'; pillFile.className = 'guard-pill'; }
        if (descFile) descFile.textContent = 'No certificate attached yet.';
      } else if (fileVal?.passed) {
        if (pillFile) { pillFile.textContent = '✓ VALID'; pillFile.className = 'guard-pill pass valid'; }
        const sizeKb = (documentState.file.size / 1024).toFixed(1);
        if (descFile) descFile.textContent = `✓ Format accepted: ${documentState.file.name} (${sizeKb} KB)`;
      } else {
        if (pillFile) { pillFile.textContent = '✕ INVALID'; pillFile.className = 'guard-pill error invalid'; }
        if (descFile) descFile.textContent = fileVal?.reasons?.[0] || 'Invalid file format or size exceeds limit.';
      }

      const quality = documentState.quality || {};
      if (!hasFile || quality.status === 'not_run') {
        if (pillQuality) { pillQuality.textContent = 'NOT RUN'; pillQuality.className = 'guard-pill'; }
        if (descQuality) descQuality.textContent = 'Waiting for valid certificate file.';
      } else if (quality.status === 'processing') {
        if (pillQuality) { pillQuality.textContent = '⏳ ANALYZING'; pillQuality.className = 'guard-pill processing'; }
        if (descQuality) descQuality.textContent = 'OpenCV evaluating sharpness, contrast, and brightness...';
      } else if (quality.status === 'succeeded') {
        if (quality.passed) {
          if (pillQuality) { pillQuality.textContent = '✓ PASS'; pillQuality.className = 'guard-pill pass'; }
          const sharpness = typeof quality.blurScore === 'number' ? Math.round(quality.blurScore) : 'OK';
          if (descQuality) descQuality.textContent = `✓ Sharpness: ${sharpness} • Contrast: OK • Resolution: OK`;
        } else {
          if (pillQuality) { pillQuality.textContent = '⚠ WARNING'; pillQuality.className = 'guard-pill warning'; }
          if (descQuality) descQuality.textContent = quality.reasons?.[0] || 'Document may be blurry or low contrast.';
        }
      } else if (quality.status === 'failed') {
        if (pillQuality) { pillQuality.textContent = '⚠ WARNING'; pillQuality.className = 'guard-pill warning'; }
        if (descQuality) descQuality.textContent = quality.reasons?.[0] || 'Could not analyze visual quality.';
      }

      const ocr = documentState.ocr || {};
      if (!hasFile || ocr.status === 'not_run') {
        if (pillOcr) { pillOcr.textContent = 'NOT RUN'; pillOcr.className = 'guard-pill'; }
        if (descOcr) descOcr.textContent = 'Waiting for quality check completion.';
      } else if (ocr.status === 'processing') {
        if (pillOcr) { pillOcr.textContent = '⏳ READING'; pillOcr.className = 'guard-pill processing'; }
        if (descOcr) descOcr.textContent = 'Tesseract.js extracting text from certificate...';
      } else if (ocr.status === 'succeeded') {
        const conf = typeof ocr.confidence === 'number' ? ocr.confidence : 0;
        if (conf >= 60) {
          if (pillOcr) { pillOcr.textContent = '✓ SUCCESS'; pillOcr.className = 'guard-pill pass succeeded'; }
          if (descOcr) descOcr.textContent = `✓ Text extracted (${conf}% confidence).`;
        } else {
          if (pillOcr) { pillOcr.textContent = '⚠ LOW CONF'; pillOcr.className = 'guard-pill warning'; }
          if (descOcr) descOcr.textContent = `Low confidence (${conf}%). Manual review advised.`;
        }
      } else if (ocr.status === 'failed') {
        if (pillOcr) { pillOcr.textContent = '✕ FAILED'; pillOcr.className = 'guard-pill error'; }
        if (descOcr) descOcr.textContent = ocr.reasons?.[0] || 'Could not extract text from document.';
      }

      if (isWaitingForType) {
        if (pillVerif) { pillVerif.textContent = 'WAITING'; pillVerif.className = 'guard-pill'; }
        if (descVerif) descVerif.textContent = 'Waiting for document type selection.';
      } else if (!hasFile || ocr.status !== 'succeeded') {
        if (pillVerif) { pillVerif.textContent = 'IDLE'; pillVerif.className = 'guard-pill'; }
        if (descVerif) descVerif.textContent = 'Waiting for document OCR completion.';
      } else if (isVerifProcessing) {
        if (pillVerif) { pillVerif.textContent = '⏳ VERIFYING'; pillVerif.className = 'guard-pill processing'; }
        if (descVerif) descVerif.textContent = 'Comparing form values with document OCR...';
      } else if (verif.overallStatus === 'MATCH' || verif.overallStatus === 'ALL_PASS') {
        if (pillVerif) { pillVerif.textContent = '✓ MATCH'; pillVerif.className = 'guard-pill pass match'; }
        if (descVerif) descVerif.textContent = '✓ All required credentials match document.';
      } else if (verif.overallStatus === 'MISMATCH') {
        if (pillVerif) { pillVerif.textContent = '✕ MISMATCH'; pillVerif.className = 'guard-pill error mismatch'; }
        if (descVerif) descVerif.textContent = `✕ Discrepancy detected in ${Object.values(fields).filter((f) => f.status === 'MISMATCH').length || 1} field(s).`;
      } else if (verif.overallStatus === 'NEEDS_REVIEW') {
        if (pillVerif) { pillVerif.textContent = '⚠ REVIEW'; pillVerif.className = 'guard-pill warning review'; }
        if (descVerif) descVerif.textContent = `⚠ ${Object.values(fields).filter((f) => f.status === 'NEEDS_REVIEW').length || 1} field(s) require manual review.`;
      }

      if (summaryBadge) {
        if (!hasFile) {
          summaryBadge.textContent = 'NO FILE';
          summaryBadge.className = 'guard-doc-overall-badge';
        } else if (isVerifProcessing) {
          summaryBadge.textContent = '⏳ PROCESSING';
          summaryBadge.className = 'guard-doc-overall-badge processing';
        } else if (verif.overallStatus === 'MATCH') {
          summaryBadge.textContent = '✓ VERIFIED';
          summaryBadge.className = 'guard-doc-overall-badge pass';
        } else if (verif.overallStatus === 'MISMATCH') {
          summaryBadge.textContent = '✕ MISMATCH';
          summaryBadge.className = 'guard-doc-overall-badge error';
        } else if (verif.overallStatus === 'NEEDS_REVIEW' || quality.passed === false) {
          summaryBadge.textContent = '⚠ NEEDS REVIEW';
          summaryBadge.className = 'guard-doc-overall-badge warning';
        } else if (fileVal?.passed) {
          summaryBadge.textContent = '✓ FILE VALID';
          summaryBadge.className = 'guard-doc-overall-badge pass';
        }
      }

      docCard.style.visibility = 'hidden';
      docCard.style.position = 'absolute';
      docCard.style.left = '-9999px';
      docCard.style.width = '1px';
      docCard.style.height = '1px';
      docCard.style.overflow = 'hidden';
    }
  }

    // =========================================================================
    // USER-FRIENDLY ERROR PRESENTATION (Phase 12 UX Refinement)
    // Maps raw technical blocking states to concise, actionable human messages
    // =========================================================================
  getUserFriendlyError(decisionOrStatus) {
    if (!decisionOrStatus) {
      return {
        title: 'Validation Error',
        message: 'Please complete all required information before continuing.',
        action: 'Review the form and try again.'
      };
    }

    function mapInputErrorType(f) {
      const t = f.type || '';
      const field = f.field || '';
      if (t === 'MISSING_FIELD') {
        const labels = {
          name: { title: 'Missing Information', message: 'Please enter your full name before continuing.' },
          dob: { title: 'Missing Information', message: 'Please enter your date of birth before continuing.' },
          mobile: { title: 'Missing Information', message: 'Please enter your mobile number before continuing.' },
          email: { title: 'Missing Information', message: 'Please enter your email address before continuing.' },
          certificateNumber: { title: 'Missing Information', message: 'Please enter the certificate number before continuing.' }
        };
        const mapped = labels[field] || { title: 'Missing Information', message: 'Please complete the required information before continuing.' };
        return { title: mapped.title, message: mapped.message, action: 'Please fill in the missing information.' };
      }
      if (t === 'INVALID_NAME') {
        return { title: 'Invalid Name', message: 'Please enter a valid name using the required format.', action: 'Please correct your name.' };
      }
      if (t === 'INVALID_DOB' || t === 'INVALID_DATE') {
        return { title: 'Invalid Date of Birth', message: 'Please enter a valid date of birth.', action: 'Please enter a valid date.' };
      }
      if (t === 'FUTURE_DOB') {
        return { title: 'Invalid Date of Birth', message: 'Date of birth cannot be in the future.', action: 'Please select a past date.' };
      }
      if (t === 'INVALID_MOBILE') {
        return { title: 'Invalid Mobile Number', message: 'Please enter a valid 10-digit mobile number.', action: 'Please enter a valid 10-digit mobile number.' };
      }
      if (t === 'INVALID_EMAIL') {
        return { title: 'Invalid Email Address', message: 'Please enter a valid email address.', action: 'Please enter a valid email address.' };
      }
      if (t === 'INVALID_CERT_NUMBER' || t === 'INVALID_CERTIFICATE_NUMBER') {
        return { title: 'Invalid Certificate Number', message: 'Please enter a valid certificate number.', action: 'Please correct the certificate number.' };
      }
      return null;
    }

    // 1. If passed a Decision object from SubmitGuard (has blockingFields or reasons)
    if (Array.isArray(decisionOrStatus.blockingFields) && decisionOrStatus.blockingFields.length > 0) {
      const bfs = decisionOrStatus.blockingFields;

      // Multiple issues — build prioritised bullet list
      if (bfs.length > 1) {
        const bullets = [];
        bfs.forEach((f) => {
          const inputMapped = mapInputErrorType(f);
          if (inputMapped) {
            bullets.push(inputMapped.message);
            return;
          }
          if (f.type === 'MISSING_TYPE') {
            bullets.push('Please select the certificate type.');
          } else if (f.type === 'MISSING_DOCUMENT') {
            bullets.push('Please upload the required certificate.');
          } else if (f.type === 'QUALITY_FAILED') {
            bullets.push('The uploaded document is too blurry, dark, low-resolution, or cropped.');
          } else if (f.type === 'OCR_FAILED') {
            bullets.push('We could not read the uploaded certificate. Please upload a clearer copy.');
          } else if (f.type === 'FILE_INVALID') {
            bullets.push('The uploaded file could not be accepted.');
          } else if (f.type === 'MISMATCH') {
            if (f.field === 'name') bullets.push('The name on the certificate does not match the name entered in the form.');
            else if (f.field === 'dob') bullets.push('The date of birth on the certificate does not match the date entered in the form.');
            else if (f.field === 'certificateNumber') bullets.push('The certificate number does not match the certificate.');
            else bullets.push(`${f.displayName || f.field} does not match the certificate.`);
          } else if (f.type === 'NEEDS_REVIEW') {
            if (f.field === 'name') {
              bullets.push('We could not reliably read the full name from the uploaded certificate. Please upload a clearer document.');
            } else if (f.field === 'dob') {
              bullets.push('We could not reliably read the date of birth from the uploaded certificate. Please upload a clearer document.');
            } else if (f.field === 'certificateNumber') {
              bullets.push('We could not reliably read the certificate number from the uploaded certificate. Please upload a clearer document.');
            } else {
              bullets.push('We could not reliably read some information from the uploaded certificate. Please upload a clearer document.');
            }
          } else {
            bullets.push(f.message || 'Please review the information before continuing.');
          }
        });

        // Deduplicate bullets so users never see identical duplicate error messages
        const uniqueBullets = [];
        bullets.forEach((b) => {
          if (!uniqueBullets.includes(b)) {
            uniqueBullets.push(b);
          }
        });

        return {
          title: 'Submission blocked',
          message: `${uniqueBullets.length} ${uniqueBullets.length === 1 ? 'issue needs' : 'issues need'} attention:`,
          bullets: uniqueBullets,
          action: 'Please address these items before continuing.'
        };
      }

      // Single blocking issue from blockingFields
      const single = bfs[0];
      const inputMapped = mapInputErrorType(single);
      if (inputMapped) return inputMapped;

      if (single.type === 'MISSING_TYPE') {
        return {
          title: 'Submission blocked',
          message: 'Please select the certificate type.',
          action: 'Choose a certificate type from the dropdown to continue.'
        };
      }
      if (single.type === 'SCHEMA_UNAVAILABLE') {
        return {
          title: 'Validation Error',
          message: 'This document type is not supported yet.',
          action: 'Please select a supported certificate type.'
        };
      }
      if (single.type === 'MISSING_DOCUMENT') {
        return {
          title: 'Document Required',
          message: 'Please upload the required certificate before submitting.',
          action: 'Attach your supporting certificate in the upload area.'
        };
      }
      if (single.type === 'FILE_INVALID') {
        return {
          title: 'Invalid Document',
          message: `The uploaded file could not be accepted. ${single.message || 'Accepted formats: PDF, JPG, PNG'}`,
          action: single.message || 'Please upload a valid PDF or image file.'
        };
      }
      if (single.type === 'QUALITY_FAILED') {
        return {
          title: 'Document Quality Problem',
          message: 'The uploaded document is too blurry, dark, low-resolution, or cropped. Please upload a clearer copy.',
          action: 'Please upload a clearer copy.'
        };
      }
      if (single.type === 'OCR_FAILED') {
        return {
          title: 'Document Reading Failed',
          message: 'We could not read the uploaded certificate. Please upload a clearer document.',
          action: 'Please upload a clearer document.'
        };
      }
      if (single.type === 'PROCESSING') {
        return {
          title: 'Validation Error',
          message: 'Document verification is still in progress.',
          action: 'Please wait for the check to complete.'
        };
      }
      if (single.type === 'MISMATCH') {
        if (single.field === 'name') {
          return {
            title: 'Submission blocked',
            message: 'The name on the certificate does not match the name entered in the form. The name entered in the form does not match the uploaded certificate.',
            action: 'Please correct the name or upload the correct certificate.'
          };
        }
        if (single.field === 'dob') {
          return {
            title: 'Submission blocked',
            message: 'The date of birth on the certificate does not match the date entered in the form. The date of birth entered in the form does not match the uploaded certificate.',
            action: 'Please correct the date of birth or upload the correct certificate.'
          };
        }
        if (single.field === 'certificateNumber') {
          return {
            title: 'Submission blocked',
            message: 'The certificate number does not match the certificate. The certificate number does not match the uploaded certificate.',
            action: 'Please correct the certificate number or upload the correct certificate.'
          };
        }
        return {
          title: 'Submission blocked',
          message: `The ${single.displayName || single.field} does not match the certificate. ${single.displayName || single.field} does not match the uploaded certificate.`,
          action: 'Please correct the form value or upload the correct certificate.'
        };
      }
      if (single.type === 'NEEDS_REVIEW') {
        return {
          title: 'Submission blocked',
          message: 'We could not reliably read some information from the uploaded certificate. Please upload a clearer document.',
          action: 'Please upload a clearer document.'
        };
      }
      return {
        title: 'Validation Error',
        message: single.message || 'Please review the information before continuing.',
        action: 'Please review the form and your uploaded document.'
      };
    }

    // 2. Fallback to reasons array if present on decision
    if (Array.isArray(decisionOrStatus.reasons) && decisionOrStatus.reasons.length > 0) {
      const rawReason = decisionOrStatus.reasons[0];
      const rLower = rawReason.toLowerCase();
      if (rLower.includes('document is required') || rLower.includes('upload your document')) {
        return {
          title: 'Submission blocked',
          message: 'Please upload the required certificate before submitting.',
          action: 'Attach your supporting certificate in the upload area.'
        };
      }
      if (rLower.includes('document type') && (rLower.includes('not been selected') || rLower.includes('please choose'))) {
        return {
          title: 'Submission blocked',
          message: 'Please select the certificate type.',
          action: 'Choose a certificate type from the dropdown to continue.'
        };
      }
      if (rLower.includes('quality check failed') || rLower.includes('blurry') || rLower.includes('low-resolution')) {
        return {
          title: 'Submission blocked',
          message: 'The uploaded document is too blurry, dark, low-resolution, or cropped.',
          action: 'Please upload a clearer copy.'
        };
      }
      if (rLower.includes('ocr failed') || rLower.includes('could not extract text')) {
        return {
          title: 'Submission blocked',
          message: 'We could not read the uploaded certificate.',
          action: 'Please upload a clearer document.'
        };
      }
      if (rLower.includes('name does not match')) {
        return {
          title: 'Submission blocked',
          message: 'The name on the certificate does not match the name entered in the form.',
          action: 'Please correct the name or upload the correct certificate.'
        };
      }
      if (rLower.includes('review')) {
        return {
          title: 'Submission blocked',
          message: 'We could not reliably read some information from the uploaded certificate.',
          action: 'Please upload a clearer document.'
        };
      }
      return {
        title: 'Submission blocked',
        message: rawReason,
        action: 'Please review the form and your uploaded document.'
      };
    }

    // 3. Otherwise treat as a status object
    const status = decisionOrStatus;

    // Check status-level inputErrors first
    const inputErrors = Object.values(status.inputErrors || {});
    if (inputErrors.length > 1) {
      return {
        title: 'Validation Error',
        message: `${inputErrors.length} issues need attention:`,
        bullets: inputErrors.map((e) => e.errorMessage),
        action: 'Please correct the highlighted fields before submitting.'
      };
    }
    if (inputErrors.length === 1) {
      const singleInput = inputErrors[0];
      const mapped = mapInputErrorType({ type: singleInput.errorCode, field: singleInput.field, message: singleInput.errorMessage });
      if (mapped) return mapped;
      return {
        title: 'Validation Error',
        message: singleInput.errorMessage,
        action: 'Please correct the highlighted field before submitting.'
      };
    }

    const docType = status.documentType || status.formFields?.documentType?.value || status.form?.documentType?.value;
    const doc = status.document || {};
    const fileVal = doc.fileValidation || {};
    const quality = doc.quality || {};
    const ocr = doc.ocr || {};
    const verif = status.verification || {};
    const fields = verif.fields || {};

    if (!docType || verif.overallStatus === 'WAITING_FOR_TYPE' || verif.status === 'waiting_for_schema') {
      return {
        title: 'Submission blocked',
        message: 'Please select the certificate type.',
        action: 'Choose a certificate type from the dropdown to continue.'
      };
    }

    if (verif.overallStatus === 'SCHEMA_UNAVAILABLE') {
      return {
        title: 'Submission blocked',
        message: 'Validation is not available for the selected certificate type.',
        action: 'Please select a supported certificate type.'
      };
    }

    if (!doc.file) {
      return {
        title: 'Submission blocked',
        message: 'Please upload the required certificate before submitting.',
        action: 'Attach your supporting certificate in the upload area.'
      };
    }

    if (fileVal.passed === false) {
      return {
        title: 'Submission blocked',
        message: 'The uploaded file could not be accepted.',
        action: (fileVal.reasons && fileVal.reasons[0]) || 'Please upload a valid PDF or image file under 5 MB.'
      };
    }

    if (quality.status === 'failed' || quality.passed === false) {
      return {
        title: 'Submission blocked',
        message: 'The uploaded document is too blurry, dark, low-resolution, or cropped.',
        action: 'Please upload a clearer copy.'
      };
    }

    if (ocr.status === 'failed') {
      return {
        title: 'Submission blocked',
        message: 'We could not read the uploaded certificate.',
        action: 'Please upload a clearer document.'
      };
    }

    if (quality.status === 'processing' || ocr.status === 'processing' || verif.status === 'processing') {
      return {
        title: 'Submission blocked',
        message: 'Document verification is currently in progress.',
        action: 'Please wait a moment for the check to complete.'
      };
    }

    // Field Mismatches & Reviews
    const mismatches = [];
    const reviews = [];
    Object.keys(fields).forEach((key) => {
      const f = fields[key];
      if (!f) return;
      const display = this.getFieldDisplayName(f.name || f.field || key);
      if (f.status === 'MISMATCH') {
        mismatches.push({ field: key, display, formValue: f.formValue, documentValue: f.documentValue });
      } else if (f.status === 'NEEDS_REVIEW') {
        reviews.push({ field: key, display });
      }
    });

    if (mismatches.length === 1 && reviews.length === 0) {
      const m = mismatches[0];
      if (m.field === 'name') {
        return {
          title: 'Submission blocked',
          message: 'The name on the certificate does not match the name entered in the form.',
          action: 'Please correct the name or upload the correct certificate.'
        };
      }
      if (m.field === 'dob') {
        return {
          title: 'Submission blocked',
          message: 'The date of birth on the certificate does not match the date entered in the form.',
          action: 'Please correct the date of birth or upload the correct certificate.'
        };
      }
      if (m.field === 'certificateNumber') {
        return {
          title: 'Submission blocked',
          message: 'The certificate number does not match the certificate.',
          action: 'Please correct the certificate number or upload the correct certificate.'
        };
      }
      return {
        title: 'Submission blocked',
        message: `The ${m.display} does not match the certificate.`,
        action: 'Please correct the form value or upload the correct certificate.'
      };
    }

    if (reviews.length > 0 && mismatches.length === 0) {
      return {
        title: 'Submission blocked',
        message: 'We could not reliably read some information from the uploaded certificate.',
        action: 'Please upload a clearer document.'
      };
    }

    const totalIssues = mismatches.length + reviews.length;
    if (totalIssues > 1) {
      const bullets = [];
      mismatches.forEach((m) => bullets.push(`${m.display} does not match the certificate.`));
      reviews.forEach((r) => bullets.push(`${r.display} needs review.`));
      return {
        title: 'Submission blocked',
        message: `${totalIssues} issues need attention:`,
        bullets,
        action: 'Please address these items before submitting your application.'
      };
    }

    return {
      title: 'Submission blocked',
      message: 'Unresolved issues remain on your application.',
      action: 'Please review the form and your uploaded document.'
    };
  }

  // Shows the CENTERED error modal overlay.
  // Uses role="dialog" aria-modal="true" per ARIA spec.
  // Only one modal can be open at a time — re-uses existing if already present.
  showErrorPopup(decisionOrStatus) {
    if (typeof document === 'undefined') return;

    const info = this.getUserFriendlyError(decisionOrStatus);

    // Remove existing modal if present (update in place, no duplicate modals)
    const existing = document.getElementById('guard-error-popup') || document.getElementById('guard-modal-backdrop');
    if (existing) {
      existing.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'guard-error-popup';
    backdrop.className = 'guard-error-popup guard-modal-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.setAttribute('data-guard-modal-backdrop', 'true');

    // Build body HTML
    let bodyHtml = `<p class="guard-modal-message">${this.escapeHtml(info.message || '')}</p>`;
    if (Array.isArray(info.bullets) && info.bullets.length > 0) {
      bodyHtml += `<ul class="guard-modal-issues-list">${info.bullets.map((b) => `<li>${this.escapeHtml(b)}</li>`).join('')}</ul>`;
    }
    if (info.action) {
      bodyHtml += `<div class="guard-popup-action-hint">${this.escapeHtml(info.action)}</div>`;
    }

    backdrop.innerHTML = `
      <div
        class="guard-modal-card"
        id="guard-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guard-modal-title"
        tabindex="-1"
      >
        <div class="guard-modal-header">
          <div class="guard-modal-icon-title">
            <span class="guard-modal-icon" aria-hidden="true">⚠️</span>
            <h2 class="guard-modal-title" id="guard-modal-title">${this.escapeHtml(info.title || 'Submission blocked')}</h2>
          </div>
          <button type="button" class="guard-modal-close-btn" id="guard-modal-close-btn" aria-label="Close error message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="guard-modal-body" id="guard-modal-body">
          ${bodyHtml}
        </div>
        <div class="guard-modal-footer">
          <button type="button" class="guard-modal-action-btn" id="guard-modal-action-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Focus the modal card for accessibility
    const card = backdrop.querySelector('#guard-modal-card');
    if (card) {
      try { card.focus(); } catch (e) {}
    }

    // Close button
    const closeBtn = backdrop.querySelector('#guard-modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideErrorPopup());
    }
    const actionBtn = backdrop.querySelector('#guard-modal-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => this.hideErrorPopup());
    }

    // Backdrop click closes modal
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.hideErrorPopup();
    });

    // Escape key closes modal
    if (this._escKeyHandler) {
      document.removeEventListener('keydown', this._escKeyHandler);
    }
    this._escKeyHandler = (e) => {
      if (e.key === 'Escape') this.hideErrorPopup();
    };
    document.addEventListener('keydown', this._escKeyHandler);

    this.elements.errorPopup = backdrop;
  }

  // Hides the centered error modal overlay
  hideErrorPopup() {
    if (typeof document === 'undefined') return;
    if (this._escKeyHandler) {
      document.removeEventListener('keydown', this._escKeyHandler);
      this._escKeyHandler = null;
    }
    const popup = document.getElementById('guard-error-popup');
    if (popup) {
      popup.remove();
    }
    const backdrop = document.getElementById('guard-modal-backdrop');
    if (backdrop) {
      backdrop.remove();
    }
    this.elements.errorPopup = null;
  }

  // Renders the blocked submission summary modal / card (Phase 12)
  renderSubmitBlocked(decision) {
    if (typeof document === 'undefined') return;

    if (this.elements.submitBlockedCard) {
      this.elements.submitBlockedCard.remove();
    }

    const blockingList = decision?.blockingFields || [];
    const safeSummary = decision?.reasons?.[0] || 'Submission blocked';
    const card = document.createElement('div');
    card.id = 'guard-submit-blocked-card';
    card.className = 'guard-submit-blocked-card';
    card.setAttribute('role', 'alert');

    const listHtml = blockingList.length > 0
      ? `<ul>${blockingList.map((item) => {
          const label = item.displayName || item.field || 'Issue';
          const formVal = item.formValue ? `: ${this.escapeHtml(String(item.formValue))}` : '';
          const docVal = item.documentValue ? ` / ${this.escapeHtml(String(item.documentValue))}` : '';
          const message = item.message || item.displayName || 'Issue requires attention';
          const action = item.suggestedAction ? ` — ${this.escapeHtml(String(item.suggestedAction))}` : '';
          const detail = item.formValue || item.documentValue
            ? ` <span class="guard-block-detail">${this.escapeHtml(label)}${formVal}${docVal}</span>`
            : '';
          return `<li>${this.escapeHtml(message)}${detail}${this.escapeHtml(action)}</li>`;
        }).join('')}</ul>`
      : `<p>${this.escapeHtml(safeSummary)}</p>`;

    card.innerHTML = `
      <div class="guard-submit-blocked-header">Submission blocked</div>
      <div class="guard-submit-blocked-body">
        ${listHtml}
      </div>
    `;

    const form = document.getElementById('scholarship-form') || document.querySelector('form');
    if (form) {
      form.appendChild(card);
    } else {
      document.body.appendChild(card);
    }

    this.elements.submitBlockedCard = card;

    this.showErrorPopup(decision);
  }

  // Hides the blocked submission summary
  hideSubmitBlocked() {
    if (typeof document === 'undefined') return;

    if (this.elements.submitBlockedCard) {
      this.elements.submitBlockedCard.remove();
      this.elements.submitBlockedCard = null;
    }

    const legacyCard = document.getElementById('guard-submit-blocked-card');
    if (legacyCard) {
      legacyCard.remove();
    }

    this.hideErrorPopup();
  }

  // Cleans up all injected elements from the DOM
  cleanup() {
    if (typeof document === 'undefined') return;

    this.hideSubmitBlocked();
    this.hideErrorPopup();
    if (typeof document === 'undefined') return;

    if (this.elements.overallBanner) {
      this.elements.overallBanner.remove();
      this.elements.overallBanner = null;
    }

    Object.keys(this.elements.fieldBadges || {}).forEach((k) => {
      const el = this.elements.fieldBadges[k];
      if (el) el.remove();
    });
    this.elements.fieldBadges = {};

    Object.keys(this.elements.inlinePanels || {}).forEach((k) => {
      const el = this.elements.inlinePanels[k];
      if (el) el.remove();
    });
    this.elements.inlinePanels = {};

    if (this.elements.documentCard) {
      this.elements.documentCard.remove();
      this.elements.documentCard = null;
    }

    document.querySelectorAll('.guard-overall-banner, .guard-field-badge, .guard-inline-panel, .guard-doc-status-card, .guard-submit-blocked-card').forEach((node) => {
      node.remove();
    });

    this.injected = false;
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InPageUI };
} else if (typeof globalThis !== 'undefined') {
  globalThis.InPageUI = InPageUI;
}
