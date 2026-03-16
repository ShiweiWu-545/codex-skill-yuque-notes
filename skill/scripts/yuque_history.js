#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

function expandPath(value) {
  if (!value) {
    return value;
  }
  let result = String(value).replace(/^~(?=$|[\\/])/, os.homedir());
  result = result.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
  return path.resolve(result);
}

function defaultHistoryPath() {
  return path.join(os.homedir(), '.codex', 'yuque-notes', 'session-history.json');
}

function resolveHistoryPath(rawPath) {
  return expandPath(rawPath || defaultHistoryPath());
}

function createEmptyHistory() {
  return {
    version: 1,
    latest_repo_url: null,
    entries: {},
  };
}

function loadHistory(historyPath) {
  const finalPath = resolveHistoryPath(historyPath);
  if (!fs.existsSync(finalPath)) {
    return {
      path: finalPath,
      data: createEmptyHistory(),
      exists: false,
    };
  }

  const raw = fs.readFileSync(finalPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    path: finalPath,
    data: {
      version: parsed.version || 1,
      latest_repo_url: parsed.latest_repo_url || null,
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    },
    exists: true,
  };
}

function writeHistory(historyPath, historyData) {
  const finalPath = resolveHistoryPath(historyPath);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, `${JSON.stringify(historyData, null, 2)}\n`, 'utf8');
  return finalPath;
}

function getHistoryEntry(historyData, repoUrl) {
  if (!historyData || !historyData.entries) {
    return null;
  }
  const key = String(repoUrl || '').trim();
  if (!key) {
    return null;
  }
  return historyData.entries[key] || null;
}

function getLatestHistoryEntry(historyData) {
  if (!historyData || !historyData.latest_repo_url) {
    return null;
  }
  return getHistoryEntry(historyData, historyData.latest_repo_url);
}

function upsertHistoryEntry(historyPath, entry) {
  const loaded = loadHistory(historyPath);
  const next = {
    ...loaded.data,
    latest_repo_url: entry.repo_url,
    entries: {
      ...loaded.data.entries,
      [entry.repo_url]: entry,
    },
  };
  const savedPath = writeHistory(loaded.path, next);
  return {
    path: savedPath,
    data: next,
  };
}

module.exports = {
  defaultHistoryPath,
  getHistoryEntry,
  getLatestHistoryEntry,
  loadHistory,
  resolveHistoryPath,
  upsertHistoryEntry,
};
