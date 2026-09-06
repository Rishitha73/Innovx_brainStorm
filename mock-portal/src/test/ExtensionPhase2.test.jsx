import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import React from 'react';
import App from '../App';

// Import portal configuration directly
const portalConfigModule = require('../../../extension/config/portalConfig.js');
const { PORTAL_CONFIGS, matchPortal, getAllConfiguredSelectors } = portalConfigModule;

describe('Phase 2: Connect Extension to Mock Portal & Selector Resolution', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');

  it('has valid portal configuration matching Section 14 and Phase 2 PRD requirements', () => {
    expect(PORTAL_CONFIGS).toBeInstanceOf(Array);
    expect(PORTAL_CONFIGS.length).toBeGreaterThan(0);

    const mockPortal = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
    expect(mockPortal).toBeDefined();
    expect(mockPortal.matchUrls).toContain('http://localhost:5173/apply');

    // Field selectors
    const fieldMap = {};
    mockPortal.fields.forEach((f) => {
      fieldMap[f.logicalName] = f.selector;
    });

    expect(fieldMap.name).toBe('#applicant-name');
    expect(fieldMap.dob).toBe('#applicant-dob');
    expect(fieldMap.certificateNumber).toBe('#cert-number');

    // Document & Submit selectors
    expect(mockPortal.documentTypeSelector).toBe('#document-type');
    expect(mockPortal.documentUpload.selector).toBe('#upload-certificate');
    expect(mockPortal.submitSelector).toBe('#submit-application');
    expect(mockPortal.formSelector).toBe('#scholarship-form');
  });

  it('correctly matches supported portal URLs and rejects unsupported URLs', () => {
    // Supported URLs
    expect(matchPortal('http://localhost:5173/apply')).not.toBeNull();
    expect(matchPortal('http://localhost:5173/apply')?.portalId).toBe('demo-scholarship-portal');
    expect(matchPortal('http://localhost:5173/')?.portalId).toBe('demo-scholarship-portal');
    expect(matchPortal('http://localhost:5173/apply?query=test')?.portalId).toBe('demo-scholarship-portal');
    expect(matchPortal('http://127.0.0.1:5173/apply')?.portalId).toBe('demo-scholarship-portal');

    // Unsupported URLs
    expect(matchPortal('https://example.com')).toBeNull();
    expect(matchPortal('https://google.com')).toBeNull();
    expect(matchPortal('http://localhost:3000/')).toBeNull();
    expect(matchPortal('')).toBeNull();
    expect(matchPortal(null)).toBeNull();
  });

  it('resolves all 7 configured selectors against the live Mock Portal DOM', () => {
    render(<App />);

    const mockPortal = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
    const allSelectors = getAllConfiguredSelectors(mockPortal);

    expect(allSelectors.length).toBe(7);

    allSelectors.forEach((item) => {
      const element = document.querySelector(item.selector);
      expect(element, `Expected selector ${item.selector} (${item.name}) to exist in DOM`).not.toBeNull();
    });
  });

  it('handles a missing selector gracefully without throwing errors', () => {
    // Render portal DOM
    const { container } = render(<App />);

    // Temporarily mutate DOM to simulate missing cert-number
    const certInput = container.querySelector('#cert-number');
    expect(certInput).not.toBeNull();
    certInput.removeAttribute('id');
    certInput.setAttribute('id', 'temporarily-broken-id');

    const mockPortal = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');
    const allSelectors = getAllConfiguredSelectors(mockPortal);

    const results = allSelectors.map((item) => ({
      name: item.name,
      selector: item.selector,
      found: Boolean(container.querySelector(item.selector))
    }));

    const missing = results.filter((r) => !r.found);
    const found = results.filter((r) => r.found);

    expect(missing.length).toBe(1);
    expect(missing[0].selector).toBe('#cert-number');
    expect(found.length).toBe(6);
  });

  it('manifest.json includes config/portalConfig.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('config/portalConfig.js');
    expect(contentScripts.js).toContain('content.js');
  });

  it('popup.html contains active and inactive template elements for Phase 2', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('Pre-Submission Error Guard');
    expect(popupHtml).toContain('demo-scholarship-portal');
    expect(popupHtml).toContain('active-state');
    expect(popupHtml).toContain('inactive-state');
    expect(popupHtml).toContain('selectors-list');
  });
});
