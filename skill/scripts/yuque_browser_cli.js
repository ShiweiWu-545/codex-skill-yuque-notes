#!/usr/bin/env node
/* Operate Yuque notes through storageState or a logged-in Chrome profile. */

const fs = require('fs');
const { parseArgs } = require('node:util');

const { chromium } = require('playwright-core');

const {
  defaultStorageStatePath,
  expandPath,
  loginWithManualAssist,
  parseRepoUrl,
} = require('./yuque_storage_state_login.js');

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

function findGroupNodeByPath(rawNodes, groupPath) {
  const segments = splitGroupPath(groupPath);
  if (!segments.length) {
    return null;
  }

  let searchNodes = buildTocTree(rawNodes);
  let matchedNode = null;
  for (const segment of segments) {
    matchedNode =
      searchNodes.find((node) => node.type === 'TITLE' && node.title === segment) || null;
    if (!matchedNode) {
      return null;
    }
    searchNodes = matchedNode.children || [];
  }
  return matchedNode;
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

function parsePositiveInteger(value, fallbackValue) {
  if (value === undefined || value === null || value === '') {
    return fallbackValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return Math.floor(parsed);
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

function uniqueValues(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function isLoginUrl(currentUrl) {
  return String(currentUrl || '').includes('/login');
}

function shouldUseStorageState(values) {
  return Boolean(values['storage-state-path'] || parseBoolean(values['ensure-login-if-missing'], false));
}

function resolveStorageStatePath(values, repoInfo) {
  if (values['storage-state-path']) {
    return expandPath(values['storage-state-path']);
  }
  if (parseBoolean(values['ensure-login-if-missing'], false)) {
    return defaultStorageStatePath(repoInfo);
  }
  return null;
}

async function launchPersistentProfileContext(options) {
  const userDataDir = expandPath(
    options['chrome-user-data-dir'] || '%LOCALAPPDATA%/Google/Chrome/User Data',
  );
  const profileDirectory = options['chrome-profile-directory'] || 'Default';
  const browserChannels = uniqueValues([options.channel || 'chrome', 'chrome', 'msedge', undefined]);

  let lastError = null;
  for (const channel of browserChannels) {
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless: false,
        args: [`--profile-directory=${profileDirectory}`],
        locale: 'zh-CN',
        viewport: { width: 1440, height: 900 },
      });
      const page = context.pages()[0] || (await context.newPage());
      return {
        workflow: 'chrome-profile',
        context,
        page,
        browser: null,
        browser_channel: channel || 'chromium',
        chrome_user_data_dir: userDataDir,
        chrome_profile_directory: profileDirectory,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to launch Chrome profile '${profileDirectory}' from '${userDataDir}'. Close Chrome first and retry. ${lastError ? lastError.message : ''}`.trim(),
  );
}

async function launchStorageStateContext(options, storageStatePath) {
  const browserChannels = uniqueValues([options.channel || 'chrome', 'chrome', 'msedge', undefined]);
  let lastError = null;

  for (const channel of browserChannels) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: false,
      });
      const context = await browser.newContext({
        storageState: storageStatePath,
        locale: 'zh-CN',
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      return {
        workflow: 'storage-state',
        browser,
        context,
        page,
        browser_channel: channel || 'chromium',
        storage_state_path: storageStatePath,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to launch a browser with storageState '${storageStatePath}'. ${lastError ? lastError.message : ''}`.trim(),
  );
}

async function closeSession(session) {
  if (!session) {
    return;
  }
  if (session.context) {
    await session.context.close().catch(() => {});
  }
  if (session.browser) {
    await session.browser.close().catch(() => {});
  }
}

async function readRepoState(page, repoInfo) {
  await page.goto(repoInfo.repoUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const currentUrl = page.url();
  const title = await page.title();
  if (isLoginUrl(currentUrl)) {
    const error = new Error(`Repo access redirected to /login: ${repoInfo.repoUrl}`);
    error.code = 'YUQUE_LOGIN_REQUIRED';
    error.current_url = currentUrl;
    error.title = title;
    throw error;
  }

  await page
    .waitForFunction(() => {
      const appData = window.appData || {};
      const book = appData.book || appData.repo || {};
      return Boolean(book.id || book.book_id || book.bookId);
    }, { timeout: 15000 })
    .catch(() => {});

  const appState = await page.evaluate(() => {
    const appData = window.appData || {};
    const book = appData.book || appData.repo || {};
    return {
      login: appData.me?.login || appData.user?.login || book.user?.login || null,
      book_id: book.id ?? book.book_id ?? book.bookId ?? null,
      book_name: book.name || book.title || '',
      book_slug: book.slug || '',
      toc: Array.isArray(book.toc) ? book.toc : Array.isArray(appData.toc) ? appData.toc : [],
    };
  });

  if (!appState.book_id) {
    throw new Error(`Unable to read book_id from window.appData.book for ${repoInfo.repoUrl}.`);
  }

  return {
    repo_url: repoInfo.repoUrl,
    current_url: currentUrl,
    title,
    login: appState.login,
    book_id: appState.book_id,
    book_name: appState.book_name,
    book_slug: appState.book_slug,
    toc: appState.toc,
  };
}

async function buildRequestHeaders(page, repoState) {
  const cookies = await page.context().cookies('https://www.yuque.com');
  const csrfToken = cookies.find((item) => item.name === 'yuque_ctoken')?.value || '';
  const headers = {
    accept: 'application/json',
    'x-requested-with': 'XMLHttpRequest',
  };
  if (repoState.login) {
    headers['x-login'] = repoState.login;
  }
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }
  return headers;
}

async function frontendRequest(page, repoState, apiPath, { method = 'GET', query = null, body = null } = {}) {
  const headers = await buildRequestHeaders(page, repoState);
  if (body !== null) {
    headers['content-type'] = 'application/json';
  }

  const result = await page.evaluate(
    async ({ apiPath: rawPath, method: rawMethod, query: rawQuery, body: rawBody, headers: rawHeaders }) => {
      const finalUrl = new URL(rawPath, window.location.origin);
      if (rawQuery && typeof rawQuery === 'object') {
        for (const [key, value] of Object.entries(rawQuery)) {
          if (value !== undefined && value !== null && value !== '') {
            finalUrl.searchParams.set(key, String(value));
          }
        }
      }

      const response = await fetch(finalUrl.toString(), {
        method: rawMethod,
        credentials: 'include',
        headers: rawHeaders,
        body: rawBody === null ? undefined : JSON.stringify(rawBody),
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
        text,
      };
    },
    { apiPath, method, query, body, headers },
  );

  if (!result.ok) {
    const bodyText = typeof result.text === 'string' ? result.text.slice(0, 300) : '';
    const error = new Error(
      `Yuque frontend request failed: ${method} ${apiPath} -> ${result.status}${bodyText ? ` ${bodyText}` : ''}`,
    );
    error.code = result.status === 401 ? 'YUQUE_UNAUTHORIZED' : 'YUQUE_REQUEST_FAILED';
    error.status = result.status;
    throw error;
  }

  return result.data;
}

async function listDocs(page, repoState, offset, limit) {
  const data = await frontendRequest(page, repoState, '/api/docs', {
    query: {
      book_id: repoState.book_id,
      offset,
      limit,
    },
  });
  return data.data || [];
}

async function listAllDocs(page, repoState, batchSize = 100) {
  const items = [];
  let offset = 0;
  while (true) {
    const batch = await listDocs(page, repoState, offset, batchSize);
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

function resolveDocRef(docRef) {
  if (docRef && typeof docRef === 'object') {
    return {
      id: docRef.id,
      slug: docRef.slug || null,
    };
  }
  return {
    id: docRef,
    slug: null,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripHtml(value) {
  return compactText(
    decodeHtmlEntities(
      String(value || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/pre|\/h[1-6])\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function buildLakeTextNode(text) {
  return `<span class="ne-text">${escapeHtml(text)}</span>`;
}

function buildLakeFragment(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  const blocks = normalized.split(/\n{2,}/).filter(Boolean);
  const htmlBlocks = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) {
      continue;
    }

    if (lines[0].startsWith('```') && lines[lines.length - 1].startsWith('```')) {
      const code = lines.slice(1, -1).join('\n');
      htmlBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      continue;
    }

    if (lines.every((line) => /^#{1,6}\s+/.test(line))) {
      for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        const level = match ? match[1].length : 1;
        const text = match ? match[2] : line;
        htmlBlocks.push(`<h${level}>${buildLakeTextNode(text)}</h${level}>`);
      }
      continue;
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines
        .map((line) => line.replace(/^[-*]\s+/, ''))
        .map((line) => `<li>${buildLakeTextNode(line)}</li>`)
        .join('');
      htmlBlocks.push(`<ul class="ne-ul">${items}</ul>`);
      continue;
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      const items = lines
        .map((line) => line.replace(/^\d+\.\s+/, ''))
        .map((line) => `<li>${buildLakeTextNode(line)}</li>`)
        .join('');
      htmlBlocks.push(`<ol class="ne-ol">${items}</ol>`);
      continue;
    }

    htmlBlocks.push(
      `<p>${lines.map((line) => buildLakeTextNode(line)).join('<br />')}</p>`,
    );
  }

  return htmlBlocks.join('');
}

function appendLakeBody(existingBody, markdown) {
  const fragment = buildLakeFragment(markdown);
  if (!fragment) {
    return existingBody;
  }

  const current = String(existingBody || '');
  if (!current) {
    return `<!doctype html><div class="lake-content" typography="classic">${fragment}</div>`;
  }

  const closingIndex = current.lastIndexOf('</div>');
  if (closingIndex >= 0) {
    return `${current.slice(0, closingIndex)}${fragment}${current.slice(closingIndex)}`;
  }
  return `${current}${fragment}`;
}

function extractSearchableBody(detail) {
  const candidates = [
    detail.body,
    detail.body_draft,
    detail.content,
    detail.body_asl,
    detail.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }
    if (/<[^>]+>/.test(candidate) || candidate.startsWith('<!doctype')) {
      return stripHtml(candidate);
    }
    return compactText(candidate);
  }

  return '';
}

async function getDoc(page, repoState, docRef, options = {}) {
  const { id, slug } = resolveDocRef(docRef);
  const lookup = slug || id;
  const query = options.editable
    ? {
        book_id: repoState.book_id,
        mode: 'edit',
        include_contributors: true,
        include_like: true,
        include_hits: true,
        merge_dynamic_data: false,
        forceLocal: false,
      }
    : {
        book_id: repoState.book_id,
      };

  const data = await frontendRequest(page, repoState, `/api/docs/${lookup}`, {
    query,
  });
  return data.data || {};
}

async function createDoc(page, repoState, title, body, targetUuid) {
  const payload = {
    book_id: repoState.book_id,
    title,
    body,
    format: 'markdown',
    public: 0,
  };
  if (targetUuid) {
    payload.insert_to_catalog = true;
    payload.action = 'appendChild';
    payload.target_uuid = targetUuid;
  }
  const data = await frontendRequest(page, repoState, '/api/docs', {
    method: 'POST',
    body: payload,
  });
  return data.data || {};
}

async function updateDoc(page, repoState, docId, { title, body, format }) {
  const payload = {};
  if (title !== undefined && title !== null && title !== '') {
    payload.title = title;
  }
  if (body !== undefined && body !== null) {
    payload.body = body;
    payload.format = format || 'markdown';
  }
  const data = await frontendRequest(page, repoState, `/api/docs/${docId}`, {
    method: 'PUT',
    body: payload,
  });
  return data.data || {};
}

function findDocForUpsert(docs, title, groupPath, docPathMap) {
  const wanted = String(title || '').trim().toLowerCase();
  const normalizedTarget = normalizeGroupPath(groupPath);
  const candidates = docs.filter(
    (item) => String(item.title || '').trim().toLowerCase() === wanted,
  );
  if (!candidates.length) {
    return null;
  }

  const byUpdatedAt = (left, right) =>
    String(right.updated_at || '').localeCompare(String(left.updated_at || ''));

  const matching = candidates.filter((item) => {
    const paths = (docPathMap[String(item.id)] || []).map((value) => normalizeGroupPath(value));
    return paths.includes(normalizedTarget);
  });

  if (!matching.length) {
    return null;
  }

  return matching.sort(byUpdatedAt)[0];
}

function resolveTargetGroup(rawToc, groupPath) {
  const normalized = normalizeGroupPath(groupPath);
  if (!normalized) {
    return { uuid: null, path: '' };
  }
  const groupNode = findGroupNodeByPath(rawToc, normalized);
  if (!groupNode || !groupNode.uuid) {
    throw new Error(
      `Target group path '${normalized}' was not found in the current TOC. Run get-toc first and create the catalog manually if needed.`,
    );
  }
  return {
    uuid: groupNode.uuid,
    path: normalized,
    title: groupNode.title,
  };
}

function buildSessionMetadata(session, repoState) {
  const data = {
    workflow: session.workflow,
    repo_url: repoState.repo_url,
    current_url: repoState.current_url,
    title: repoState.title,
    book_id: repoState.book_id,
    book_name: repoState.book_name,
    book_slug: repoState.book_slug,
  };
  if (session.storage_state_path) {
    data.storage_state_path = session.storage_state_path;
  }
  if (session.chrome_user_data_dir) {
    data.chrome_user_data_dir = session.chrome_user_data_dir;
  }
  if (session.chrome_profile_directory) {
    data.chrome_profile_directory = session.chrome_profile_directory;
  }
  data.browser_channel = session.browser_channel;
  return data;
}

async function prepareStorageStateSession(values, repoInfo) {
  const storageStatePath = resolveStorageStatePath(values, repoInfo);
  const ensureLoginIfMissing = parseBoolean(values['ensure-login-if-missing'], false);
  const loginTimeoutSeconds = parsePositiveInteger(values['login-timeout-seconds'], 300);

  if (!storageStatePath) {
    throw new Error('Missing storage state path.');
  }

  if (!fs.existsSync(storageStatePath)) {
    if (!ensureLoginIfMissing) {
      throw new Error(
        `Storage state file not found: ${storageStatePath}. Pass --ensure-login-if-missing true to create one interactively.`,
      );
    }
    await loginWithManualAssist({
      stateOutput: storageStatePath,
      repoUrl: repoInfo.repoUrl,
      username: values.username,
      password: values.password,
      timeoutSeconds: loginTimeoutSeconds,
      channel: values.channel,
      log: console.error,
    });
  }

  let session = await launchStorageStateContext(values, storageStatePath);
  try {
    const repoState = await readRepoState(session.page, repoInfo);
    return { ...session, repoState };
  } catch (error) {
    await closeSession(session);
    if (error.code !== 'YUQUE_LOGIN_REQUIRED' || !ensureLoginIfMissing) {
      throw error;
    }

    await loginWithManualAssist({
      stateOutput: storageStatePath,
      repoUrl: repoInfo.repoUrl,
      username: values.username,
      password: values.password,
      timeoutSeconds: loginTimeoutSeconds,
      channel: values.channel,
      log: console.error,
    });

    session = await launchStorageStateContext(values, storageStatePath);
    try {
      const repoState = await readRepoState(session.page, repoInfo);
      return { ...session, repoState };
    } catch (refreshError) {
      await closeSession(session);
      throw refreshError;
    }
  }
}

async function prepareProfileSession(values, repoInfo) {
  const session = await launchPersistentProfileContext(values);
  try {
    const repoState = await readRepoState(session.page, repoInfo);
    return { ...session, repoState };
  } catch (error) {
    await closeSession(session);
    if (error.code === 'YUQUE_LOGIN_REQUIRED') {
      throw new Error(
        `The selected Chrome profile is not logged into Yuque for ${repoInfo.repoUrl}. Log into Yuque in that profile, close Chrome, and retry.`,
      );
    }
    throw error;
  }
}

async function prepareSession(values, repoInfo) {
  if (shouldUseStorageState(values)) {
    return prepareStorageStateSession(values, repoInfo);
  }
  return prepareProfileSession(values, repoInfo);
}

async function inspectSessionAction(session) {
  return {
    ok: true,
    ...buildSessionMetadata(session, session.repoState),
  };
}

async function getTocAction(session) {
  return {
    ...buildSessionMetadata(session, session.repoState),
    roots: buildTocTree(session.repoState.toc),
    doc_paths: collectDocPaths(session.repoState.toc),
  };
}

async function upsertNoteAction(session, values) {
  const repoState = session.repoState;
  const groupPath = normalizeGroupPath(values['group-path'] || '');
  const docTitle = values['doc-title'];
  const docBody = readValueOrFile(values['doc-body'], values['doc-body-file']);

  if (!docTitle) {
    throw new Error('Missing --doc-title');
  }

  const targetGroup = resolveTargetGroup(repoState.toc, groupPath);
  const docs = await listAllDocs(session.page, repoState);
  const docPathMap = collectDocPaths(repoState.toc);
  const existing = findDocForUpsert(docs, docTitle, groupPath, docPathMap);

  if (!existing) {
    const created = await createDoc(session.page, repoState, docTitle, docBody, targetGroup.uuid);
    return {
      ...buildSessionMetadata(session, repoState),
      action: 'created',
      group: targetGroup,
      doc: created,
    };
  }

  const updated = await updateDoc(session.page, repoState, existing.id, {
    title: docTitle,
    body: docBody,
  });
  return {
    ...buildSessionMetadata(session, repoState),
    action: 'updated',
    group: targetGroup,
    doc: updated || existing,
  };
}

async function appendNoteAction(session, values) {
  const repoState = session.repoState;
  const groupPath = normalizeGroupPath(values['group-path'] || '');
  const docTitle = values['doc-title'];
  const content = readValueOrFile(values.content, values['content-file']);
  const separator = values.separator || '\n\n';

  if (!docTitle) {
    throw new Error('Missing --doc-title');
  }

  const targetGroup = resolveTargetGroup(repoState.toc, groupPath);
  const docs = await listAllDocs(session.page, repoState);
  const existing = findDocForUpsert(docs, docTitle, groupPath, collectDocPaths(repoState.toc));

  if (!existing) {
    const created = await createDoc(session.page, repoState, docTitle, content, targetGroup.uuid);
    return {
      ...buildSessionMetadata(session, repoState),
      action: 'created',
      group: targetGroup,
      doc: created,
    };
  }

  const detail = await getDoc(session.page, repoState, existing, { editable: true });
  const currentBody = detail.body || '';
  const usesLakeFormat =
    detail.format === 'lake' || detail.origin_format === 'lake' || /<[^>]+>/.test(currentBody);
  const nextBody = usesLakeFormat
    ? appendLakeBody(currentBody, content)
    : currentBody
      ? `${currentBody}${separator}${content}`
      : content;
  const updated = await updateDoc(session.page, repoState, existing.id, {
    body: nextBody,
    format: usesLakeFormat ? 'lake' : 'markdown',
  });

  return {
    ...buildSessionMetadata(session, repoState),
    action: 'appended',
    group: targetGroup,
    doc: updated || existing,
    previous_length: currentBody.length,
    new_length: nextBody.length,
  };
}

async function searchNotesAction(session, values) {
  const repoState = session.repoState;
  const keyword = values.keyword || '';
  const groupPath = normalizeGroupPath(values['group-path'] || '');
  const searchInTitle = parseBoolean(values['search-in-title'], true);
  const searchInBody = parseBoolean(values['search-in-body'], true);
  const limit = parsePositiveInteger(values.limit, 10);

  if (!keyword) {
    throw new Error('Missing --keyword');
  }

  const pathMap = collectDocPaths(repoState.toc);
  const docs = await listAllDocs(session.page, repoState);
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
      const detail = await getDoc(session.page, repoState, item, { editable: true });
      const body = extractSearchableBody(detail);
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

async function organizeNotesAction(session, values) {
  const repoState = session.repoState;
  const keywordRules = parseKeywordRules(values['keyword-rules'], values['keyword-rules-file']);
  const limit = parsePositiveInteger(values.limit, 50);
  const pathMap = collectDocPaths(repoState.toc);
  const docs = await listAllDocs(session.page, repoState);
  const suggestions = [];

  for (const item of docs.slice(0, limit)) {
    const detail = await getDoc(session.page, repoState, item, { editable: true });
    const haystack = `${item.title || ''}\n${extractSearchableBody(detail)}`.toLowerCase();
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
  yuque_browser_cli.js inspect-session --repo-url <url> [--storage-state-path <file>] [--ensure-login-if-missing true]
  yuque_browser_cli.js get-toc --repo-url <url> [--storage-state-path <file>] [--ensure-login-if-missing true]
  yuque_browser_cli.js upsert-note --repo-url <url> --group-path <path> --doc-title <title> (--doc-body <text> | --doc-body-file <file>) [--storage-state-path <file>]
  yuque_browser_cli.js append-note --repo-url <url> --group-path <path> --doc-title <title> (--content <text> | --content-file <file>) [--storage-state-path <file>]
  yuque_browser_cli.js search-notes --repo-url <url> --keyword <text> [--group-path <path>] [--storage-state-path <file>]
  yuque_browser_cli.js organize-notes --repo-url <url> (--keyword-rules <json> | --keyword-rules-file <file>) [--storage-state-path <file>]

StorageState-first options:
  --storage-state-path <file>
  --ensure-login-if-missing true|false
  --login-timeout-seconds <n>
  --username <value>
  --password <value>

Fallback real-profile options:
  --chrome-user-data-dir <dir>
  --chrome-profile-directory <name>
  --channel <chrome|msedge>
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'repo-url': { type: 'string' },
      'storage-state-path': { type: 'string' },
      'ensure-login-if-missing': { type: 'string' },
      'login-timeout-seconds': { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
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
  const session = await prepareSession(values, repoInfo);

  try {
    let result;
    if (action === 'inspect-session') {
      result = await inspectSessionAction(session);
    } else if (action === 'get-toc') {
      result = await getTocAction(session);
    } else if (action === 'upsert-note') {
      result = await upsertNoteAction(session, values);
    } else if (action === 'append-note') {
      result = await appendNoteAction(session, values);
    } else if (action === 'search-notes') {
      result = await searchNotesAction(session, values);
    } else if (action === 'organize-notes') {
      result = await organizeNotesAction(session, values);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeSession(session);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
