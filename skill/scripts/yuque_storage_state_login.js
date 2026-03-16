#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('node:util');

const { chromium } = require('playwright-core');

const LOGIN_URL = 'https://www.yuque.com/login';

function expandPath(value) {
  if (!value) {
    return value;
  }
  let result = String(value).replace(/^~(?=$|[\\/])/, os.homedir());
  result = result.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
  return path.resolve(result);
}

function sanitizePathPart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'default';
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

function defaultStorageStatePath(repoInfo) {
  const filename = `${sanitizePathPart(repoInfo.groupLogin)}__${sanitizePathPart(repoInfo.bookSlug)}.json`;
  return path.join(os.homedir(), '.codex', 'yuque-notes', 'storage-state', filename);
}

function parseTimeoutSeconds(value, fallbackSeconds = 300) {
  if (value === undefined || value === null || value === '') {
    return fallbackSeconds;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout seconds: ${value}`);
  }
  return Math.floor(parsed);
}

function uniqueValues(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function buildBrowserChannels(channelPreference) {
  return uniqueValues([channelPreference || 'chrome', 'chrome', 'msedge', undefined]);
}

function formatBrowserLaunchError(lastError) {
  const message = lastError && lastError.message ? lastError.message : String(lastError || '');
  if (/Executable doesn't exist/i.test(message) || /browserType\.launch/i.test(message)) {
    return 'Unable to launch a browser for manual Yuque login. Ensure Chrome or Edge is installed and playable by Playwright.';
  }
  return `Unable to launch a browser for manual Yuque login. ${message}`.trim();
}

async function launchInteractiveBrowser(channelPreference) {
  const browserChannels = buildBrowserChannels(channelPreference);
  let lastError = null;

  for (const channel of browserChannels) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: false,
      });
      return { browser, channel: channel || 'chromium' };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(formatBrowserLaunchError(lastError));
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) {
      continue;
    }
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.click({ timeout: 3000 }).catch(() => {});
    return selector;
  }
  return null;
}

async function fillFirstVisible(page, selectors, value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) {
      continue;
    }
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.fill(String(value)).catch(() => {});
    return true;
  }
  return false;
}

async function trySwitchToPasswordLogin(page) {
  return clickFirstVisible(page, [
    'text=\u5bc6\u7801\u767b\u5f55',
    'text=\u8d26\u53f7\u5bc6\u7801\u767b\u5f55',
    'div.switch-login-warp',
    'button:has-text("\u5bc6\u7801\u767b\u5f55")',
  ]);
}

async function tryFillCredentials(page, username, password) {
  const usernameFilled = await fillFirstVisible(
    page,
    [
      'input[type="tel"]',
      'input[autocomplete="username"]',
      'input[placeholder*="\u624b\u673a\u53f7"]',
      'input[placeholder*="\u624b\u673a"]',
      'input[placeholder*="\u90ae\u7bb1"]',
      'input[placeholder*="\u8d26\u53f7"]',
      'input[name="account"]',
      'input[type="text"]',
    ],
    username,
  );
  const passwordFilled = await fillFirstVisible(
    page,
    [
      'input[type="password"]',
      'input[autocomplete="current-password"]',
      'input[name="password"]',
    ],
    password,
  );
  return { usernameFilled, passwordFilled };
}

async function tryAcceptTerms(page) {
  const locator = page.locator('input[type="checkbox"]').first();
  const count = await locator.count().catch(() => 0);
  if (!count) {
    return false;
  }
  const checked = await locator.isChecked().catch(() => false);
  if (!checked) {
    await locator.check({ force: true }).catch(() => {});
  }
  return true;
}

async function clickLoginButton(page) {
  return clickFirstVisible(page, [
    'button.btn-login',
    'button:has-text("\u767b\u5f55")',
    'button:has-text("\u767b \u5f55")',
    '.btn-login',
  ]);
}

function isLoginUrl(currentUrl) {
  return String(currentUrl || '').includes('/login');
}

async function waitForManualLogin(page, timeoutSeconds, didFillCredentials) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastSubmitAt = 0;

  while (Date.now() < deadline) {
    const currentUrl = page.url();
    if (!isLoginUrl(currentUrl)) {
      return;
    }

    if (didFillCredentials && Date.now() - lastSubmitAt >= 5000) {
      await clickLoginButton(page);
      lastSubmitAt = Date.now();
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Timed out waiting for manual Yuque login after ${timeoutSeconds} seconds.`);
}

async function verifyRepoAccess(page, repoUrl) {
  await page.goto(repoUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (isLoginUrl(currentUrl)) {
    throw new Error(`Yuque login completed, but repo access still redirected to /login: ${repoUrl}`);
  }

  return {
    current_url: currentUrl,
    title: await page.title(),
  };
}

async function loginWithManualAssist(options) {
  const repoInfo = options.repoUrl ? parseRepoUrl(options.repoUrl) : null;
  const stateOutput = expandPath(options.stateOutput || (repoInfo ? defaultStorageStatePath(repoInfo) : ''));
  if (!stateOutput) {
    throw new Error('Missing storage state output path.');
  }

  const timeoutSeconds = parseTimeoutSeconds(options.timeoutSeconds, 300);
  const log = typeof options.log === 'function' ? options.log : console.error;

  let browser;
  let context;
  try {
    const launched = await launchInteractiveBrowser(options.channel);
    browser = launched.browser;
    context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await trySwitchToPasswordLogin(page);
    const fillResult = await tryFillCredentials(page, options.username, options.password);
    await tryAcceptTerms(page);

    log('Complete the Yuque login in the opened browser window. The script will save storageState after login succeeds.');

    await waitForManualLogin(
      page,
      timeoutSeconds,
      Boolean(fillResult.usernameFilled || fillResult.passwordFilled),
    );

    fs.mkdirSync(path.dirname(stateOutput), { recursive: true });
    await context.storageState({ path: stateOutput });

    let repoCheck = {
      current_url: page.url(),
      title: await page.title(),
    };
    if (options.repoUrl) {
      repoCheck = await verifyRepoAccess(page, options.repoUrl);
    }

    return {
      ok: true,
      state_path: stateOutput,
      repo_url: options.repoUrl || null,
      current_url: repoCheck.current_url,
      title: repoCheck.title,
      channel: launched.channel,
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function printHelp() {
  console.log(`Usage:
  yuque_storage_state_login.js --state-output <file> [--repo-url <url>] [--username <value>] [--password <value>] [--timeout-seconds <n>] [--channel chrome]
`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'state-output': { type: 'string' },
      'repo-url': { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      'timeout-seconds': { type: 'string' },
      channel: { type: 'string' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (!values['state-output']) {
    throw new Error('Missing --state-output');
  }

  const result = await loginWithManualAssist({
    stateOutput: values['state-output'],
    repoUrl: values['repo-url'],
    username: values.username,
    password: values.password,
    timeoutSeconds: values['timeout-seconds'],
    channel: values.channel,
  });

  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  defaultStorageStatePath,
  expandPath,
  loginWithManualAssist,
  parseRepoUrl,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
