#!/usr/bin/env node
/* Operate Yuque notes through a logged-in Chrome profile, without API tokens. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('node:util');

const { chromium } = require('playwright-core');

function expandPath(value) {
  if (!value) {
    return value;
  }
  let result = value.replace(/^~(?=$|[\\/])/, os.homedir());
  result = result.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
  return path.resolve(result);
}

function normalizeGroupPath(groupPath) {
  return String(groupPath || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('/');
}

function splitGroupPath(groupPath) {
  const normalized = normalizeGroupPath(groupPath);
  return normalized ? normalized.split('/') : [];
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildExcerpt(value, keyword, radius = 80) {
  const text = compactText(value);
  if (!text) {
    return '';
  }
  if (!keyword) {
    return text.slice(0, radius * 2);
  }
  const lowered = text.toLowerCase();
  const index = lowered.indexOf(String(keyword).toLowerCase());
  if (index < 0) {
    return text.slice(0, radius * 2);
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + String(keyword).length + radius);
  let snippet = text.slice(start, end);
  if (start > 0) {
    snippet = `...${snippet}`;
  }
  if (end < text.length) {
    snippet = `${snippet}...`;
  }
  return snippet;
}

function normalizeTocNodes(rawNodes) {
  return rawNodes.map((item) => ({
    uuid: item.uuid,
    parent_uuid: item.parent_uuid || item.parentUuid || null,
    type: item.type,
    title: item.title || item.name || '',
    doc_id: item.doc_id || item.docId || null,
    depth: item.depth !== undefined && item.depth !== null ? item.depth : item.level,
    slug: item.slug || item.url || '',
    raw: item,
    children: [],
  }));
}

function buildTocTree(rawNodes) {
  const nodes = normalizeTocNodes(rawNodes);
  if (!nodes.length) {
    return [];
  }

  const byUuid = new Map(nodes.filter((node) => node.uuid).map((node) => [node.uuid, node]));
  let parentLinkCount = 0;
  const roots = [];

  for (const node of nodes) {
    const parentUuid = node.parent_uuid;
    if (parentUuid && byUuid.has(parentUuid)) {
      byUuid.get(parentUuid).children.push(node);
      parentLinkCount += 1;
    } else {
      roots.push(node);
    }
  }

  if (parentLinkCount) {
    return roots;
  }

  const depthValues = nodes
    .map((node) => node.depth)
    .filter((value) => value !== undefined && value !== null)
    .map((value) => Number(value));

  if (!depthValues.length) {
    return nodes;
  }

  const minDepth = Math.min(...depthValues);
  const stack = [];
  const fallbackRoots = [];

  for (const node of nodes) {
    const rawDepth = node.depth;
    const currentDepth =
      rawDepth !== undefined && rawDepth !== null ? Number(rawDepth) - minDepth + 1 : 1;
    while (stack.length >= currentDepth) {
      stack.pop();
    }
    if (stack.length) {
      const parent = stack[stack.length - 1];
      node.parent_uuid = parent.uuid || null;
      parent.children.push(node);
    } else {
      fallbackRoots.push(node);
    }
    stack.push(node);
  }

  return fallbackRoots;
}

function collectDocPaths(rawNodes) {
  const roots = buildTocTree(rawNodes);
  const mapping = {};

  function walk(node, groupStack) {
    const nextStack = node.type === 'TITLE' ? [...groupStack, node.title] : groupStack;

    if (node.type === 'DOC' && node.doc_id !== null && node.doc_id !== undefined) {
      const docId = String(node.doc_id);
      const groupPath = groupStack.filter(Boolean).join('/');
      if (!mapping[docId]) {
        mapping[docId] = [];
      }
      if (!mapping[docId].includes(groupPath)) {
        mapping[docId].push(groupPath);
      }
    }

    for (const child of node.children || []) {
      walk(child, nextStack);
    }
  }

  for (const root of roots) {
    walk(root, []);
  }

  return mapping;
}

function parseRepoUrl(repoUrl) {
  const parsed = new URL(repoUrl);
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Invalid Yuque repo URL: ${repoUrl}`);
  }
  return {
    repoUrl,
    groupLogin: segments[0],
    bookSlug: segments[1],
  };
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(lowered)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(lowered)) {
    return false;
  }
  return defaultValue;
}

function readValueOrFile(value, filePath) {
  if (filePath) {
    return fs.readFileSync(expandPath(filePath), 'utf8');
  }
  return value || '';
}

function parseKeywordRules(rawValue, filePath) {
  const source = readValueOrFile(rawValue, filePath);
  if (!source) {
    return {};
  }
  const data = JSON.parse(source);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('keyword rules must be a JSON object');
  }
  return data;
}

async function launchContext(options) {
  const userDataDir = expandPath(
    options['chrome-user-data-dir'] || '%LOCALAPPDATA%/Google/Chrome/User Data',
  );
  const profileDirectory = options['chrome-profile-directory'] || 'Default';
  const channelPreference = options.channel || 'chrome';
  const browserChannels = [channelPreference, 'chrome', 'msedge', undefined].filter(
    (value, index, array) => array.indexOf(value) === index,
  );

  let lastError = null;
  for (const channel of browserChannels) {
    try {
      return await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless: false,
        args: [`--profile-directory=${profileDirectory}`],
        locale: 'zh-CN',
        viewport: { width: 1440, height: 900 },
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to launch Chrome profile '${profileDirectory}' from '${userDataDir}'. Close Chrome first and retry. ${lastError ? lastError.message : ''}`.trim(),
  );
}

async function ensureRepoPage(page, repoUrl) {
  await page.goto(repoUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  const title = await page.title();
  if (currentUrl.includes('/login') || title.includes('登录')) {
    throw new Error(
      `The selected Chrome profile is not logged into Yuque for ${repoUrl}. Open the same profile, log into Yuque, close Chrome, and retry.`,
    );
  }
  return { url: currentUrl, title };
}

async function apiRequest(page, apiPath, { method = 'GET', query = null, body = null } = {}) {
  const result = await page.evaluate(
    async ({ apiPath: inApiPath, method: inMethod, query: inQuery, body: inBody }) => {
      let finalPath = inApiPath;
      if (inQuery && Object.keys(inQuery).length) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(inQuery)) {
          if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, String(value));
          }
        }
        const queryString = searchParams.toString();
        if (queryString) {
          finalPath = `${finalPath}?${queryString}`;
        }
      }

      const headers = {};
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      if (csrf) {
        headers['x-csrf-token'] = csrf;
      }
      if (inBody !== null) {
        headers['content-type'] = 'application/json';
      }

      const response = await fetch(finalPath, {
        method: inMethod,
        credentials: 'include',
        headers,
        body: inBody === null ? undefined : JSON.stringify(inBody),
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = text;
      }
      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    },
    { apiPath, method, query, body },
  );

  if (!result.ok) {
    throw new Error(`Yuque browser request failed: ${method} ${apiPath} -> ${result.status}`);
  }

  return result.data;
}

function makeRepoApiBase(repoInfo) {
  return `/api/v2/repos/${repoInfo.groupLogin}/${repoInfo.bookSlug}`;
}

async function getRepoToc(page, repoInfo) {
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/toc`);
  return data.data || [];
}

async function listDocs(page, repoInfo, offset, limit) {
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/docs`, {
    query: {
      offset,
      limit,
      optional_properties: 'hits,tags,latest_version_id,description,updated_at,slug',
    },
  });
  return data.data || [];
}

async function listAllDocs(page, repoInfo, batchSize = 100) {
  const items = [];
  let offset = 0;
  while (true) {
    const batch = await listDocs(page, repoInfo, offset, batchSize);
    if (!batch.length) {
      break;
    }
    items.push(...batch);
    if (batch.length < batchSize) {
      break;
    }
    offset += batchSize;
  }
  return items;
}

async function getDoc(page, repoInfo, docId) {
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/docs/${docId}`);
  return data.data || {};
}

async function createDoc(page, repoInfo, title, body) {
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/docs`, {
    method: 'POST',
    body: {
      title,
      body,
      format: 'markdown',
      public: 0,
    },
  });
  return data.data || {};
}

async function updateDoc(page, repoInfo, docId, title, body) {
  const payload = {};
  if (title) {
    payload.title = title;
  }
  if (body) {
    payload.body = body;
    payload.format = 'markdown';
  }
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/docs/${docId}`, {
    method: 'PUT',
    body: payload,
  });
  return data.data || {};
}

async function createGroup(page, repoInfo, title, parentUuid) {
  const payload = {
    action: 'appendNode',
    action_mode: 'child',
    type: 'TITLE',
    title,
    visible: 1,
  };
  if (parentUuid) {
    payload.target_uuid = parentUuid;
  }
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/toc`, {
    method: 'PUT',
    body: payload,
  });
  if (Array.isArray(data.data)) {
    return data.data[data.data.length - 1] || {};
  }
  return data.data || {};
}

async function appendDocToGroup(page, repoInfo, groupUuid, docId) {
  const data = await apiRequest(page, `${makeRepoApiBase(repoInfo)}/toc`, {
    method: 'PUT',
    body: {
      action: 'appendNode',
      action_mode: 'child',
      target_uuid: groupUuid,
      type: 'DOC',
      doc_ids: [docId],
      visible: 1,
    },
  });
  return data.data || {};
}

async function ensureGroupPath(page, repoInfo, groupPath) {
  const segments = splitGroupPath(groupPath);
  if (!segments.length) {
    return { uuid: null, path: '', created: [] };
  }

  const created = [];
  let parentUuid = null;

  for (let index = 0; index < segments.length; index += 1) {
    const currentSegment = segments[index];
    const toc = await getRepoToc(page, repoInfo);
    const roots = buildTocTree(toc);
    let searchNodes = roots;
    let matchedNode = null;

    for (const segment of segments.slice(0, index + 1)) {
      matchedNode =
        searchNodes.find((node) => node.type === 'TITLE' && node.title === segment) || null;
      if (!matchedNode) {
        break;
      }
      searchNodes = matchedNode.children || [];
    }

    if (matchedNode) {
      parentUuid = matchedNode.uuid || null;
      continue;
    }

    const createdNode = await createGroup(page, repoInfo, currentSegment, parentUuid);
    created.push(segments.slice(0, index + 1).join('/'));
    parentUuid = createdNode.uuid || null;
  }

  return { uuid: parentUuid, path: segments.join('/'), created };
}

function findDocForUpsert(docs, title, groupPath, docPathMap) {
  const wanted = String(title || '').trim().toLowerCase();
  const candidates = docs.filter(
    (item) => String(item.title || '').trim().toLowerCase() === wanted,
  );
  if (!candidates.length) {
    return null;
  }

  const byUpdatedAt = (left, right) =>
    String(right.updated_at || '').localeCompare(String(left.updated_at || ''));

  if (!groupPath) {
    return candidates.sort(byUpdatedAt)[0];
  }

  const normalizedTarget = normalizeGroupPath(groupPath);
  const matching = candidates.filter((item) => {
    const paths = (docPathMap[String(item.id)] || []).map((value) => normalizeGroupPath(value));
    return paths.includes(normalizedTarget);
  });
  if (matching.length) {
    return matching.sort(byUpdatedAt)[0];
  }
  return candidates.sort(byUpdatedAt)[0];
}

async function inspectSession(page, repoInfo) {
  const current = await ensureRepoPage(page, repoInfo.repoUrl);
  return {
    ok: true,
    repo_url: repoInfo.repoUrl,
    current_url: current.url,
    title: current.title,
  };
}

async function getTocAction(page, repoInfo) {
  await ensureRepoPage(page, repoInfo.repoUrl);
  const rawNodes = await getRepoToc(page, repoInfo);
  return {
    repo_url: repoInfo.repoUrl,
    roots: buildTocTree(rawNodes),
    doc_paths: collectDocPaths(rawNodes),
  };
}

async function upsertNoteAction(page, repoInfo, options) {
  await ensureRepoPage(page, repoInfo.repoUrl);
  const groupPath = normalizeGroupPath(options['group-path'] || '');
  const docTitle = options['doc-title'];
  const docBody = readValueOrFile(options['doc-body'], options['doc-body-file']);

  if (!docTitle) {
    throw new Error('Missing --doc-title');
  }

  const targetGroup = groupPath
    ? await ensureGroupPath(page, repoInfo, groupPath)
    : { uuid: null, path: '' };
  const toc = await getRepoToc(page, repoInfo);
  const docs = await listAllDocs(page, repoInfo);
  const docPathMap = collectDocPaths(toc);
  const existing = findDocForUpsert(docs, docTitle, groupPath, docPathMap);

  if (!existing) {
    const created = await createDoc(page, repoInfo, docTitle, docBody);
    let attached = false;
    if (targetGroup.uuid && created.id !== undefined && created.id !== null) {
      await appendDocToGroup(page, repoInfo, targetGroup.uuid, created.id);
      attached = true;
    }
    return {
      action: 'created',
      doc: created,
      group: targetGroup,
      attached_to_group: attached,
    };
  }

  const updated = await updateDoc(page, repoInfo, existing.id, docTitle, docBody);
  let attached = false;
  if (targetGroup.uuid) {
    const latestToc = await getRepoToc(page, repoInfo);
    const latestPaths = collectDocPaths(latestToc);
    const currentPaths = (latestPaths[String(existing.id)] || []).map((value) =>
      normalizeGroupPath(value),
    );
    if (!currentPaths.includes(groupPath)) {
      await appendDocToGroup(page, repoInfo, targetGroup.uuid, existing.id);
      attached = true;
    }
  }
  return {
    action: 'updated',
    doc: updated || existing,
    group: targetGroup,
    attached_to_group: attached,
  };
}

async function appendNoteAction(page, repoInfo, options) {
  await ensureRepoPage(page, repoInfo.repoUrl);
  const groupPath = normalizeGroupPath(options['group-path'] || '');
  const docTitle = options['doc-title'];
  const content = readValueOrFile(options.content, options['content-file']);
  const separator = options.separator || '\n\n';

  if (!docTitle) {
    throw new Error('Missing --doc-title');
  }

  const toc = await getRepoToc(page, repoInfo);
  const docs = await listAllDocs(page, repoInfo);
  const existing = findDocForUpsert(docs, docTitle, groupPath, collectDocPaths(toc));

  if (!existing) {
    return upsertNoteAction(page, repoInfo, {
      'group-path': groupPath,
      'doc-title': docTitle,
      'doc-body': content,
    });
  }

  const detail = await getDoc(page, repoInfo, existing.id);
  const currentBody = detail.body || '';
  const nextBody = currentBody ? `${currentBody}${separator}${content}` : content;
  const updated = await updateDoc(page, repoInfo, existing.id, '', nextBody);
  return {
    action: 'appended',
    doc: updated || existing,
    previous_length: currentBody.length,
    new_length: nextBody.length,
  };
}

async function searchNotesAction(page, repoInfo, options) {
  await ensureRepoPage(page, repoInfo.repoUrl);
  const keyword = options.keyword || '';
  const groupPath = normalizeGroupPath(options['group-path'] || '');
  const searchInTitle = parseBoolean(options['search-in-title'], true);
  const searchInBody = parseBoolean(options['search-in-body'], true);
  const limit = Number(options.limit || 10);

  if (!keyword) {
    throw new Error('Missing --keyword');
  }

  const toc = await getRepoToc(page, repoInfo);
  const pathMap = collectDocPaths(toc);
  const docs = await listAllDocs(page, repoInfo);
  const normalizedGroup = normalizeGroupPath(groupPath);
  const results = [];

  for (const item of docs) {
    const docId = String(item.id);
    const paths = (pathMap[docId] || []).map((value) => normalizeGroupPath(value));
    if (
      normalizedGroup &&
      !paths.some((value) => value === normalizedGroup || value.startsWith(`${normalizedGroup}/`))
    ) {
      continue;
    }

    const title = String(item.title || '');
    const titleMatch = searchInTitle && title.toLowerCase().includes(keyword.toLowerCase());
    let bodyMatch = false;
    let excerpt = '';

    if (!titleMatch && searchInBody) {
      const detail = await getDoc(page, repoInfo, item.id);
      const body = String(detail.body || '');
      bodyMatch = body.toLowerCase().includes(keyword.toLowerCase());
      if (bodyMatch) {
        excerpt = buildExcerpt(body, keyword);
      }
    }

    if (titleMatch || bodyMatch) {
      results.push({
        id: item.id,
        title,
        slug: item.slug,
        updated_at: item.updated_at,
        group_paths: paths,
        matched_in: titleMatch ? 'title' : 'body',
        excerpt,
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

async function organizeNotesAction(page, repoInfo, options) {
  await ensureRepoPage(page, repoInfo.repoUrl);
  const keywordRules = parseKeywordRules(options['keyword-rules'], options['keyword-rules-file']);
  const limit = Number(options.limit || 50);

  const toc = await getRepoToc(page, repoInfo);
  const pathMap = collectDocPaths(toc);
  const docs = await listAllDocs(page, repoInfo);
  const suggestions = [];

  for (const item of docs.slice(0, limit)) {
    const detail = await getDoc(page, repoInfo, item.id);
    const haystack = `${item.title || ''}\n${detail.body || ''}`.toLowerCase();
    const currentPaths = (pathMap[String(item.id)] || []).map((value) => normalizeGroupPath(value));

    let suggestedGroup = '';
    let matchedKeywords = [];
    for (const [groupName, keywords] of Object.entries(keywordRules)) {
      const normalizedKeywords = Array.isArray(keywords)
        ? keywords.map((value) => String(value))
        : [String(keywords)];
      const hits = normalizedKeywords.filter((keyword) =>
        haystack.includes(keyword.toLowerCase()),
      );
      if (hits.length) {
        suggestedGroup = normalizeGroupPath(groupName);
        matchedKeywords = hits;
        break;
      }
    }

    if (!suggestedGroup || currentPaths.includes(suggestedGroup)) {
      continue;
    }

    suggestions.push({
      id: item.id,
      title: item.title,
      current_group_paths: currentPaths,
      suggested_group_path: suggestedGroup,
      matched_keywords: matchedKeywords,
    });
  }

  return suggestions;
}

function printHelp() {
  console.log(`Usage:
  yuque_browser_cli.js inspect-session --repo-url <url> [--chrome-user-data-dir <dir>] [--chrome-profile-directory Default]
  yuque_browser_cli.js get-toc --repo-url <url> [--chrome-user-data-dir <dir>] [--chrome-profile-directory Default]
  yuque_browser_cli.js upsert-note --repo-url <url> --group-path <path> --doc-title <title> (--doc-body <text> | --doc-body-file <file>)
  yuque_browser_cli.js append-note --repo-url <url> --group-path <path> --doc-title <title> (--content <text> | --content-file <file>)
  yuque_browser_cli.js search-notes --repo-url <url> --keyword <text> [--group-path <path>] [--search-in-title true] [--search-in-body true]
  yuque_browser_cli.js organize-notes --repo-url <url> (--keyword-rules <json> | --keyword-rules-file <file>)
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'repo-url': { type: 'string' },
      'chrome-user-data-dir': { type: 'string' },
      'chrome-profile-directory': { type: 'string' },
      channel: { type: 'string' },
      'group-path': { type: 'string' },
      'doc-title': { type: 'string' },
      'doc-body': { type: 'string' },
      'doc-body-file': { type: 'string' },
      content: { type: 'string' },
      'content-file': { type: 'string' },
      keyword: { type: 'string' },
      'search-in-title': { type: 'string' },
      'search-in-body': { type: 'string' },
      'keyword-rules': { type: 'string' },
      'keyword-rules-file': { type: 'string' },
      separator: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean' },
    },
  });

  if (values.help || !positionals.length) {
    printHelp();
    return;
  }

  const action = positionals[0];
  const repoUrl = values['repo-url'];
  if (!repoUrl) {
    throw new Error('Missing --repo-url');
  }

  const repoInfo = parseRepoUrl(repoUrl);
  const context = await launchContext(values);
  const page = context.pages()[0] || (await context.newPage());

  try {
    let result;
    if (action === 'inspect-session') {
      result = await inspectSession(page, repoInfo);
    } else if (action === 'get-toc') {
      result = await getTocAction(page, repoInfo);
    } else if (action === 'upsert-note') {
      result = await upsertNoteAction(page, repoInfo, values);
    } else if (action === 'append-note') {
      result = await appendNoteAction(page, repoInfo, values);
    } else if (action === 'search-notes') {
      result = await searchNotesAction(page, repoInfo, values);
    } else if (action === 'organize-notes') {
      result = await organizeNotesAction(page, repoInfo, values);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
