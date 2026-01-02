// Constants
const ENV_TYPES = {
  local: { badge: "L", color: "#2196F3", icon: "📍", name: "Local" },
  development: {
    badge: "D",
    color: "#9C27B0",
    icon: "🔧",
    name: "Development",
  },
  staging: { badge: "S", color: "#FF9800", icon: "🔧", name: "Staging" },
  production: { badge: "P", color: "#4CAF50", icon: "🚀", name: "Production" },
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  initializeStorage();
  createContextMenu();
});

// Initialize storage with default structure
async function initializeStorage() {
  const data = await chrome.storage.local.get([
    "projects",
    "urlMapping",
    "settings",
  ]);

  if (!data.projects) {
    await chrome.storage.local.set({
      projects: {},
      urlMapping: {},
      settings: {
        showToastNotifications: true,
        preserveQueryParams: true,
        preserveHash: true,
      },
    });
  }
}

// Create context menu
function createContextMenu() {
  chrome.contextMenus.create({
    id: "manage-environments",
    title: "Manage Environments",
    contexts: ["action"],
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "manage-environments") {
    chrome.runtime.openOptionsPage();
  }
});

// Main icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  const currentUrl = tab.url;

  // Skip for special URLs
  if (
    !currentUrl ||
    currentUrl.startsWith("chrome://") ||
    currentUrl.startsWith("edge://")
  ) {
    return;
  }

  const data = await chrome.storage.local.get(["projects", "urlMapping"]);
  const project = await findProjectForUrl(currentUrl, data);

  if (project && !project.isNewEnvironment) {
    // Site is configured - cycle to next environment
    await cycleToNextEnvironment(tab, project, currentUrl, data);
    return;
  }

  // Not configured: try in-page overlay; fallback to options on restricted pages
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/overlay-host.js"],
    });

    await chrome.tabs.sendMessage(tab.id, {
      type: "ENV_SWITCHER_OVERLAY_OPEN",
      tabId: tab.id,
      url: currentUrl,
    });
  } catch {
    chrome.runtime.openOptionsPage();
  }
});

// Update badge when tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  await updateBadgeForTab(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    await updateBadgeForTab(tab);
  }
});

// Update badge based on current URL
async function updateBadgeForTab(tab) {
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("edge://")
  ) {
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
    return;
  }

  const data = await chrome.storage.local.get(["projects", "urlMapping"]);
  const project = await findProjectForUrl(tab.url, data);

  if (project && !project.isNewEnvironment) {
    const currentEnv = findCurrentEnvironment(project, tab.url);
    if (currentEnv) {
      const envType = ENV_TYPES[currentEnv.type] || ENV_TYPES.production;
      chrome.action.setBadgeText({ text: envType.badge, tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({
        color: envType.color,
        tabId: tab.id,
      });
    }
  } else {
    chrome.action.setBadgeText({ text: "+", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#757575", tabId: tab.id });
  }
}

// Find project for given URL
async function findProjectForUrl(url, data) {
  const host = extractHost(url);
  const { projects, urlMapping } = data;

  // Direct match
  if (urlMapping[host]) {
    return projects[urlMapping[host]];
  }

  // Check without port
  const hostWithoutPort = removePort(host);
  if (urlMapping[hostWithoutPort]) {
    return projects[urlMapping[hostWithoutPort]];
  }

  // Check base domain match
  const baseDomain = extractBaseDomain(host);
  for (let projectId in projects) {
    if (projects[projectId].baseDomain === baseDomain) {
      return {
        project: projects[projectId],
        isNewEnvironment: true,
        suggestedType: detectEnvironmentType(url),
      };
    }
  }

  return null;
}

// Cycle to next environment
async function cycleToNextEnvironment(tab, project, currentUrl, data) {
  const currentEnv = findCurrentEnvironment(project, currentUrl);
  if (!currentEnv) return;

  const envs = project.environments.sort((a, b) => a.order - b.order);
  const currentIndex = envs.indexOf(currentEnv);
  const nextIndex = (currentIndex + 1) % envs.length;
  const nextEnv = envs[nextIndex];

  // Build target URL with preservation
  const settings = data.settings || {};
  const targetUrl = buildUrlWithPreservation(
    nextEnv.url,
    currentUrl,
    settings.preserveQueryParams !== false,
    settings.preserveHash !== false,
  );

  // Navigate to new URL
  await chrome.tabs.update(tab.id, { url: targetUrl });

  // Update badge
  const envType = ENV_TYPES[nextEnv.type] || ENV_TYPES.production;
  chrome.action.setBadgeText({ text: envType.badge, tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({
    color: envType.color,
    tabId: tab.id,
  });
}

// Find current environment in project
function findCurrentEnvironment(project, url) {
  const host = extractHost(url);
  return project.environments.find((env) => {
    const envHost = extractHost(env.url);
    return host === envHost || removePort(host) === removePort(envHost);
  });
}

// Build URL with path/query/hash preservation
function buildUrlWithPreservation(
  baseUrl,
  currentUrl,
  preserveQuery,
  preserveHash,
) {
  const base = new URL(baseUrl);
  const current = new URL(currentUrl);

  // Preserve path
  base.pathname = current.pathname;

  // Preserve query params
  if (preserveQuery && current.search) {
    base.search = current.search;
  }

  // Preserve hash
  if (preserveHash && current.hash) {
    base.hash = current.hash;
  }

  return base.toString();
}

// URL utility functions
function extractHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function removePort(host) {
  return host.split(":")[0];
}

function extractBaseDomain(host) {
  const withoutPort = removePort(host);
  const parts = withoutPort.split(".");

  // Handle localhost
  if (withoutPort === "localhost" || withoutPort === "127.0.0.1") {
    return "localhost";
  }

  // Get last two parts (domain.tld)
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  return withoutPort;
}

// Detect environment type from URL
function detectEnvironmentType(url) {
  const host = extractHost(url).toLowerCase();

  // Localhost detection
  if (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("192.168")
  ) {
    return "local";
  }

  // Subdomain patterns
  if (/^(local\.|dev\.)/.test(host)) return "local";
  if (/^(develop\.)/.test(host)) return "development";
  if (/^(staging\.|stage\.|stg\.|qa\.|uat\.|test\.)/.test(host))
    return "staging";

  // Domain prefix patterns
  if (/-staging|-stage|-stg|-qa|-uat|-test/.test(host)) return "staging";
  if (/-dev|-develop/.test(host)) return "development";

  // Default to production
  return "production";
}
