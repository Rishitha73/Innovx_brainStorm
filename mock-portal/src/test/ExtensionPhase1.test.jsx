import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 1: Basic Browser Extension Structure & Manifest V3 Validation', () => {
  const extensionDir = path.resolve(__dirname, '../../../extension');

  it('contains all required Phase 1 files', () => {
    const requiredFiles = [
      'manifest.json',
      'content.js',
      'background.js',
      'popup/popup.html',
      'popup/popup.js',
      'popup/popup.css'
    ];

    requiredFiles.forEach((file) => {
      const fullPath = path.join(extensionDir, file);
      expect(fs.existsSync(fullPath), `Expected ${file} to exist in extension directory`).toBe(true);
    });
  });

  it('has a valid Manifest V3 configuration', () => {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Pre-Submission Error Guard');
    expect(manifest.version).toBeDefined();
    expect(manifest.description).toBeDefined();

    // Background service worker
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background.js');

    // Content scripts
    expect(manifest.content_scripts).toBeInstanceOf(Array);
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
    expect(manifest.content_scripts[0].js).toContain('content.js');
    expect(manifest.content_scripts[0].matches).toContain('<all_urls>');

    // Popup action
    expect(manifest.action).toBeDefined();
    expect(manifest.action.default_popup).toBe('popup/popup.html');

    // Minimum permissions only
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'offscreen']);
  });

  it('content.js contains required log and message dispatch to background', () => {
    const contentJsPath = path.join(extensionDir, 'content.js');
    const contentJs = fs.readFileSync(contentJsPath, 'utf8');

    expect(contentJs).toContain("console.log('content script loaded')");
    expect(contentJs).toContain('CONTENT_SCRIPT_LOADED');
    expect(contentJs).toContain('chrome.runtime.sendMessage');
  });

  it('background.js sets up message listener for CONTENT_SCRIPT_LOADED', () => {
    const bgJsPath = path.join(extensionDir, 'background.js');
    const bgJs = fs.readFileSync(bgJsPath, 'utf8');

    expect(bgJs).toContain('chrome.runtime.onMessage.addListener');
    expect(bgJs).toContain('CONTENT_SCRIPT_LOADED');
    expect(bgJs).toContain('Background received: CONTENT_SCRIPT_LOADED');
  });

  it('popup.html contains required title and extension loaded status text', () => {
    const popupHtmlPath = path.join(extensionDir, 'popup/popup.html');
    const popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');

    expect(popupHtml).toContain('Pre-Submission Error Guard');
    expect(popupHtml).toContain('Extension loaded');
    expect(popupHtml).toContain('popup.js');
    expect(popupHtml).toContain('popup.css');
  });
});
