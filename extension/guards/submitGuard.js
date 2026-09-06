// Pre-Submission Error Guard - Submit Guard (Phase 12)
// Intercepts official form submission, performs pre-submit revalidation against live DOM,
// evaluates blocking conditions, prevents duplicate submits, and manages allow/block UI.

class SubmitGuard {
  constructor(options = {}) {
    this.portalConfig = options.portalConfig || null;
    this.formDetector = options.formDetector || null;
    this.fileDetector = options.fileDetector || null;
    this.crossVerifier = options.crossVerifier || null;
    this.inPageUI = options.inPageUI || null;
    this.getPortalStatus = options.getPortalStatus || null;
    this.syncAndRevalidate = options.syncAndRevalidate || null;

    this.formElement = null;
    this.allowNextSubmit = false;
    this.isEvaluating = false;
    this.lastDecision = null;
    this.boundSubmitHandler = this.handleSubmit.bind(this);
  }

  // Escapes HTML for safety
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
      case 'documentUpload':
        return 'Certificate Document';
      default:
        return logicalName;
    }
  }

  // Updates the host Submit Button disabled/enabled state based on current validation decision
  updateSubmitButtonState(status) {
    const selector = this.portalConfig?.submitSelector || '#submit-application';
    const doc = (typeof document !== 'undefined') ? document : (typeof globalThis !== 'undefined' ? globalThis.document : null);
    const btn = (this.formElement ? this.formElement.querySelector(selector) : null) || (doc ? doc.querySelector(selector) : null) || (this.formElement ? this.formElement.querySelector('button[type="submit"]') : null);

    if (!btn) return null;

    const currentStatus = status || (typeof this.getPortalStatus === 'function' ? this.getPortalStatus() : null);
    const decision = this.evaluate(currentStatus);

    if (decision.allowed) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.classList.remove('guard-submit-disabled');
      btn.classList.add('guard-submit-enabled');
      btn.setAttribute('aria-disabled', 'false');
      btn.title = 'All checks pass. Click to submit application.';
      if (this.inPageUI && typeof this.inPageUI.hideErrorPopup === 'function') {
        this.inPageUI.hideErrorPopup();
      }
    } else {
      btn.disabled = true;
      btn.setAttribute('disabled', 'true');
      btn.classList.add('guard-submit-disabled');
      btn.classList.remove('guard-submit-enabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.title = decision.reasons?.[0] || 'Submission disabled due to unresolved issues.';
    }

    return decision;
  }

  // Attaches submit listener to the form element in capture phase (preventing duplicate listeners)
  attach(formElement) {
    if (!formElement) return;
    this.detach();

    this.formElement = formElement;
    this.allowNextSubmit = false;
    this.isEvaluating = false;

    // Use capture phase so we intercept before host form / React submit handlers
    this.formElement.addEventListener('submit', this.boundSubmitHandler, true);

    // Attach click handler on submit button to capture clicks when disabled
    const selector = this.portalConfig?.submitSelector || '#submit-application';
    const submitBtn = this.formElement.querySelector(selector) || this.formElement.querySelector('button[type="submit"]');
    if (submitBtn) {
      this.submitButton = submitBtn;
      this.boundButtonClickHandler = (e) => {
        if (this.submitButton && this.submitButton.disabled) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const status = typeof this.getPortalStatus === 'function' ? this.getPortalStatus() : null;
          const decision = this.evaluate(status);
          this.blockSubmission(decision);
        }
      };
      this.submitButton.addEventListener('click', this.boundButtonClickHandler, true);
    }

    // Initialize submit button state
    this.updateSubmitButtonState();
  }

  // Detaches submit listener
  detach() {
    if (this.formElement && this.boundSubmitHandler) {
      this.formElement.removeEventListener('submit', this.boundSubmitHandler, true);
    }
    if (this.submitButton && this.boundButtonClickHandler) {
      this.submitButton.removeEventListener('click', this.boundButtonClickHandler, true);
    }
    this.submitButton = null;
    this.formElement = null;
    this.allowNextSubmit = false;
    this.isEvaluating = false;
  }

  // Destroys and cleans up
  destroy() {
    this.detach();
    if (this.inPageUI && typeof this.inPageUI.hideSubmitBlocked === 'function') {
      this.inPageUI.hideSubmitBlocked();
    }
  }

  // Main submission interception handler
  async handleSubmit(event) {
    // 1. If bypass flag is active, allow this single native submit through
    if (this.allowNextSubmit) {
      this.allowNextSubmit = false;
      return;
    }

    // 2. Immediately prevent default submission and stop propagation
    if (event) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
    }

    // 3. Mutex: prevent duplicate concurrent evaluations from rapid clicks
    if (this.isEvaluating) {
      console.log('[Submit Guard] Evaluation already in progress; ignoring duplicate submit click.');
      return;
    }

    this.isEvaluating = true;

    try {
      // 4. Perform fresh pre-submit synchronization and revalidation against live DOM
      let status = null;
      if (typeof this.syncAndRevalidate === 'function') {
        await this.syncAndRevalidate();
      }

      if (typeof this.getPortalStatus === 'function') {
        status = this.getPortalStatus();
      }

      // 5. Evaluate all 11 blocking conditions
      const decision = this.evaluate(status);
      this.lastDecision = decision;

      if (decision.allowed) {
        // ALLOW PATH: All required checks passed
        this.allowSubmission();
      } else {
        // BLOCK PATH: One or more critical conditions unresolved/failed
        this.blockSubmission(decision);
      }
    } catch (err) {
      console.error('[Submit Guard] Unexpected error during submit evaluation:', err.stack || err);
      const errDecision = {
        allowed: false,
        reasons: [`Submission verification encountered an unexpected error: ${err.message}`],
        blockingFields: [],
        status: 'ERROR'
      };
      this.lastDecision = errDecision;
      this.blockSubmission(errDecision);
    } finally {
      this.isEvaluating = false;
    }
  }

  // Evaluates application status against the 11 strict blocking conditions
  evaluate(status) {
    const reasons = [];
    const blockingFields = [];

    if (!status) {
      return {
        allowed: false,
        reasons: ['Form state is not initialized or unavailable.'],
        blockingFields: [],
        status: 'UNAVAILABLE'
      };
    }

    const docType = status.documentType || status.formFields?.documentType?.value || status.form?.documentType?.value || null;
    const doc = status.document || {};
    const file = doc.file || null;
    const fileVal = doc.fileValidation || {};
    const quality = doc.quality || {};
    const ocr = doc.ocr || {};
    const verif = status.verification || {};
    const fields = verif.fields || {};

    // Condition 1: Document Type must be selected
    if (!docType || String(docType).trim() === '' || verif.overallStatus === 'WAITING_FOR_TYPE' || verif.status === 'waiting_for_schema') {
      reasons.push('Document type has not been selected. Please choose a document type.');
      blockingFields.push({
        field: 'documentType',
        displayName: 'Document Type',
        type: 'MISSING_TYPE',
        message: 'Please select a document type to proceed.'
      });
    }

    // Condition 2: Schema must be available for selected type
    if (verif.overallStatus === 'SCHEMA_UNAVAILABLE') {
      reasons.push(verif.reasons?.[0] || 'Validation schema unavailable for selected document type.');
      blockingFields.push({
        field: 'documentType',
        displayName: 'Document Type',
        type: 'SCHEMA_UNAVAILABLE',
        message: 'No validation schema found for selected document type.'
      });
    }

    // Condition 3: Required document must be uploaded
    if (!file) {
      reasons.push('A supporting certificate document is required. Please upload your document.');
      blockingFields.push({
        field: 'documentUpload',
        displayName: 'Certificate Document',
        type: 'MISSING_DOCUMENT',
        message: 'Attach your official supporting certificate.'
      });
    } else {
      // Condition 4: File validation must pass
      if (fileVal.passed === false) {
        const fileErr = (fileVal.reasons && fileVal.reasons.length > 0)
          ? fileVal.reasons.join(', ')
          : 'Uploaded file failed technical validation.';
        reasons.push(`Uploaded file failed validation: ${fileErr}`);
        blockingFields.push({
          field: 'documentUpload',
          displayName: 'Certificate Document',
          type: 'FILE_INVALID',
          message: fileErr
        });
      }

      // Condition 5: Document visual quality check must not be failed
      if (quality.status === 'failed' || quality.passed === false) {
        const qErr = (quality.reasons && quality.reasons.length > 0)
          ? quality.reasons.join(', ')
          : 'Document quality is too low or unreadable.';
        reasons.push(`Document quality check failed: ${qErr}`);
        blockingFields.push({
          field: 'documentUpload',
          displayName: 'Certificate Document',
          type: 'QUALITY_FAILED',
          message: qErr
        });
      }

      // Condition 6: OCR extraction must not have failed or timed out
      if (ocr.status === 'failed') {
        const ocrErr = (ocr.reasons && ocr.reasons.length > 0)
          ? ocr.reasons.join(', ')
          : 'Document OCR could not extract text.';
        reasons.push(`Document OCR failed: ${ocrErr}`);
        blockingFields.push({
          field: 'documentUpload',
          displayName: 'Certificate Document',
          type: 'OCR_FAILED',
          message: ocrErr
        });
      }

      // Condition 7: Required processing must not be in-flight
      const isProcessing = (
        quality.status === 'processing' ||
        ocr.status === 'processing' ||
        verif.status === 'processing'
      );
      if (isProcessing) {
        reasons.push('Document verification is still in progress. Please wait for checks to complete.');
        blockingFields.push({
          field: 'documentUpload',
          displayName: 'Certificate Document',
          type: 'PROCESSING',
          message: 'Analysis in progress.'
        });
      }
    }

    // Condition 8 & 9: Cross-Verification Field Checks (MISMATCH and NEEDS_REVIEW on required fields)
    let activeSchemaFields = ['name', 'dob', 'certificateNumber'];
    if (docType === 'communityCertificate') {
      activeSchemaFields = ['name', 'certificateNumber'];
    } else if (docType === 'residenceCertificate') {
      activeSchemaFields = ['name', 'address'];
    } else if (fields && Object.keys(fields).length > 0) {
      activeSchemaFields = Object.keys(fields);
    }

    activeSchemaFields.forEach((fieldName) => {
      const fData = fields[fieldName];
      const displayName = this.getFieldDisplayName(fieldName);

      if (fData) {
        if (fData.status === 'MISMATCH') {
          const formVal = fData.formValue || '(empty)';
          const docVal = fData.documentValue || 'Not found';
          reasons.push(`${displayName} does not match the certificate.`);
          blockingFields.push({
            field: fieldName,
            displayName,
            type: 'MISMATCH',
            formValue: formVal,
            documentValue: docVal,
            suggestedAction: fData.reason || `Check the ${displayName} entered and update it to match your certificate.`
          });
        } else if (fData.status === 'NEEDS_REVIEW') {
          const formVal = fData.formValue || '(empty)';
          const docVal = fData.documentValue || 'Not confidently extracted';
          reasons.push(`${displayName} requires manual review before submission.`);
          blockingFields.push({
            field: fieldName,
            displayName,
            type: 'NEEDS_REVIEW',
            formValue: formVal,
            documentValue: docVal,
            suggestedAction: fData.reason || `Check that the document is clearly readable and that ${displayName} is visible.`
          });
        }
      }
    });

    // Condition 10: Overall status must be MATCH or ALL_PASS
    if (reasons.length === 0) {
      if (verif.overallStatus !== 'MATCH' && verif.overallStatus !== 'ALL_PASS') {
        reasons.push('Cross-verification is incomplete or could not verify credentials.');
      }
    }

    const allowed = reasons.length === 0;

    return {
      allowed,
      reasons,
      blockingFields,
      status: allowed ? 'ALLOWED' : 'BLOCKED'
    };
  }

  // Executes the allowed submission path cleanly without recursion
  allowSubmission() {
    console.log('[Submit Guard] ✓ All pre-submission checks passed. Allowing submission.');

    this.updateSubmitButtonState();

    // Hide any previous blocked UI
    if (this.inPageUI && typeof this.inPageUI.hideSubmitBlocked === 'function') {
      this.inPageUI.hideSubmitBlocked();
    }

    // Set single-use bypass flag
    this.allowNextSubmit = true;

    // Trigger programmatic form submission
    if (this.formElement) {
      try {
        let submitted = false;
        if (typeof this.formElement.requestSubmit === 'function') {
          try {
            this.formElement.requestSubmit();
            submitted = true;
          } catch (reqErr) {
            // e.g. JSDOM where requestSubmit is not implemented
          }
        }
        if (!submitted) {
          const submitEvt = new Event('submit', { bubbles: true, cancelable: true });
          this.formElement.dispatchEvent(submitEvt);
        }
      } catch (e) {
        console.error('[Submit Guard] Error dispatching allowed form submission:', e);
      } finally {
        // Always reset allowNextSubmit flag
        this.allowNextSubmit = false;
      }
    }
  }

  // Displays the blocked submission UI with actionable issue summary
  blockSubmission(decision) {
    console.warn('[Submit Guard] ✕ Submission blocked:', decision.reasons);

    this.updateSubmitButtonState();

    if (this.inPageUI && typeof this.inPageUI.renderSubmitBlocked === 'function') {
      this.inPageUI.renderSubmitBlocked(decision);
    }
  }
}

// Support Node.js / Vitest environment and Browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SubmitGuard };
} else if (typeof globalThis !== 'undefined') {
  globalThis.SubmitGuard = SubmitGuard;
}
