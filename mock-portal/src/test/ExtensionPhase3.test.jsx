import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import App from '../App';

// Import portal config and FormDetector
const { PORTAL_CONFIGS } = require('../../../extension/config/portalConfig.js');
const { FormDetector } = require('../../../extension/detectors/formDetector.js');

describe('Phase 3: Form Detector & Real-Time Form Data Reading', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');
  const mockPortalConfig = PORTAL_CONFIGS.find((p) => p.portalId === 'demo-scholarship-portal');

  it('reads initial empty form field values on activation', () => {
    render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.name).toBeDefined();
    expect(formState.name.value).toBe('');
    expect(formState.name.type).toBe('text');

    expect(formState.dob).toBeDefined();
    expect(formState.dob.value).toBe('');
    expect(formState.dob.type).toBe('date');

    expect(formState.certificateNumber).toBeDefined();
    expect(formState.certificateNumber.value).toBe('');
    expect(formState.certificateNumber.type).toBe('text');

    detector.cleanup();
  });

  it('reads pre-populated initial values from the DOM correctly on initialization', () => {
    const { container } = render(<App />);

    // Pre-populate input values in DOM
    const nameInput = container.querySelector('#applicant-name');
    const dobInput = container.querySelector('#applicant-dob');
    const certInput = container.querySelector('#cert-number');

    fireEvent.change(nameInput, { target: { value: 'Rohan Sharma' } });
    fireEvent.change(dobInput, { target: { value: '2003-08-15' } });
    fireEvent.change(certInput, { target: { value: 'INC-2024-98741' } });

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(formState.name.value).toBe('Rohan Sharma');
    expect(formState.dob.value).toBe('2003-08-15');
    expect(formState.certificateNumber.value).toBe('INC-2024-98741');

    detector.cleanup();
  });

  it('tracks real-time Name field changes via input events and notifies subscribers', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const changeCallback = vi.fn();
    detector.onFieldChange(changeCallback);

    const nameInput = container.querySelector('#applicant-name');
    await user.type(nameInput, 'Rohan Kumar');

    const latestState = detector.getFormState();
    expect(latestState.name.value).toBe('Rohan Kumar');
    expect(changeCallback).toHaveBeenCalled();

    detector.cleanup();
  });

  it('tracks real-time Date of Birth changes via change events', () => {
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const dobInput = container.querySelector('#applicant-dob');
    fireEvent.change(dobInput, { target: { value: '2004-12-25' } });

    const latestState = detector.getFormState();
    expect(latestState.dob.value).toBe('2004-12-25');

    detector.cleanup();
  });

  it('tracks real-time Certificate Number changes', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    const certInput = container.querySelector('#cert-number');
    await user.type(certInput, 'COMM-2024-55412');

    const latestState = detector.getFormState();
    expect(latestState.certificateNumber.value).toBe('COMM-2024-55412');

    detector.cleanup();
  });

  it('updates state to empty string when a field is cleared without crashing', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const nameInput = container.querySelector('#applicant-name');
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });

    const detector = new FormDetector(mockPortalConfig);
    detector.initialize();

    expect(detector.getFormState().name.value).toBe('John Doe');

    await user.clear(nameInput);
    expect(detector.getFormState().name.value).toBe('');

    detector.cleanup();
  });

  it('handles missing form fields gracefully with a warning and preserves other fields', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<App />);

    // Mutate cert-number id to simulate missing field
    const certInput = container.querySelector('#cert-number');
    certInput.removeAttribute('id');

    const detector = new FormDetector(mockPortalConfig);
    const formState = detector.initialize();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing configured form field: certificateNumber')
    );

    expect(formState.name.found).toBe(true);
    expect(formState.dob.found).toBe(true);
    expect(formState.certificateNumber.found).toBe(false);

    detector.cleanup();
    consoleWarnSpy.mockRestore();
  });

  it('manifest.json includes detectors/formDetector.js in content_scripts', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const contentScripts = manifest.content_scripts[0];
    expect(contentScripts.js).toContain('detectors/formDetector.js');
    expect(contentScripts.js).toContain('content.js');
  });

  it('popup.html contains Live Form State debug container for Phase 3', () => {
    const popupHtml = fs.readFileSync(path.join(extensionDir, 'popup/popup.html'), 'utf8');

    expect(popupHtml).toContain('val-name');
    expect(popupHtml).toContain('val-dob');
    expect(popupHtml).toContain('val-cert');
    expect(popupHtml).toContain('Live Form State');
  });
});
