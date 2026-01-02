let currentUrl = "";
let currentTabId = null;

let addNewInitialized = false;
let relatedInitialized = false;

let isSaving = false;

function closeOverlay() {
  window.parent.postMessage({ type: "ENV_SWITCHER_OVERLAY_CLOSE" }, "*");
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase();
}

function clickChipByType(containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  const chip = container.querySelector(`.env-chip[data-type="${type}"]`);
  if (!chip) return false;

  chip.click();
  return true;
}

function handleOverlayKeydown(e) {
  if (isSaving) return;

  const key = normalizeKey(e.key);
  const isModifier = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;

  // Always allow Esc to close
  if (key === "escape") {
    e.preventDefault();
    animateAndClose();
    return;
  }

  // Don't steal common browser/system shortcuts (Cmd/Ctrl+*)
  if (isModifier) {
    // Keep it simple: ignore all modified keys.
    return;
  }

  const isAddNewVisible =
    document.getElementById("addNew")?.style.display === "block";
  const isRelatedVisible =
    document.getElementById("relatedProject")?.style.display === "block";

  const targetContainerId = isRelatedVisible
    ? "relatedEnvButtons"
    : isAddNewVisible
      ? "envButtons"
      : null;

  if (!targetContainerId) return;

  const map = {
    1: "local",
    2: "development",
    3: "staging",
    4: "production",
  };

  if (map[key]) {
    e.preventDefault();
    clickChipByType(targetContainerId, map[key]);
    return;
  }

  // N = New project (only in related flow)
  if (key === "n" && isRelatedVisible) {
    e.preventDefault();
    const btn = document.getElementById("notRelatedBtn");
    btn?.click();
    return;
  }

  // Optional: allow Enter to re-trigger currently active chip
  if (key === "enter") {
    const container = document.getElementById(targetContainerId);
    const active = container?.querySelector(".env-chip.active");
    if (active) {
      e.preventDefault();
      active.click();
    }
  }
}

function requestResize() {
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );

  window.parent.postMessage(
    { type: "ENV_SWITCHER_OVERLAY_RESIZE", height },
    "*",
  );
}

function requestResizeSoon() {
  requestAnimationFrame(() => {
    requestResize();
  });
}

function getContextFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url") || "";
  const tabIdRaw = params.get("tabId");
  const tabId = tabIdRaw ? Number(tabIdRaw) : null;

  return { url, tabId: Number.isNaN(tabId) ? null : tabId };
}

function animateAndClose() {
  const container = document.querySelector(".env-switcher-container");
  if (!container) {
    closeOverlay();
    return;
  }

  container.style.transition = "opacity 0.15s ease, transform 0.15s ease";
  container.style.opacity = "0";
  container.style.transform = "scale(0.95)";

  setTimeout(() => {
    closeOverlay();
  }, 150);
}

function disableAllChips(disabled) {
  document.querySelectorAll(".env-chip").forEach((chip) => {
    chip.disabled = disabled;
  });
}

async function handleEnvSelection(chipElement, envType, action) {
  if (isSaving) return;

  isSaving = true;
  disableAllChips(true);

  // Mark which chip was picked (active/selected) and show immediate success color
  document.querySelectorAll(".env-chip").forEach((chip) => {
    chip.classList.remove("active");
  });
  chipElement.classList.add("active");

  try {
    await action();

    chipElement.classList.add("success");
    const labelEl = chipElement.querySelector(".env-chip__label");
    if (labelEl) {
      labelEl.textContent = `✓ ${labelEl.textContent}`;
    } else {
      chipElement.textContent = `✓ ${envType}`;
    }

    // Hold the success state so it feels trustworthy
    setTimeout(() => {
      animateAndClose();
    }, 450);
  } catch (e) {
    // Restore interaction on failure
    isSaving = false;
    disableAllChips(false);
    chipElement.classList.remove("success");
    throw e;
  }
}

function wireDismissButtons() {
  document.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
    btn.addEventListener("click", animateAndClose);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  wireDismissButtons();

  const closeConfiguredBtn = document.getElementById("closeConfiguredBtn");
  closeConfiguredBtn?.addEventListener("click", animateAndClose);

  document.addEventListener("keydown", handleOverlayKeydown);

  const { url, tabId } = getContextFromQueryParams();
  currentUrl = url;
  currentTabId = tabId;

  await initWithContext(currentUrl);

  requestResizeSoon();
  setTimeout(() => {
    requestResizeSoon();
  }, 80);
});

async function initWithContext(url) {
  if (!url || url.startsWith("chrome://") || url.startsWith("edge://")) {
    showConfigured();
    return;
  }

  const data = await chrome.storage.local.get(["projects", "urlMapping"]);
  const project = await findProjectForUrl(url, data);

  if (project && !project.isNewEnvironment) {
    showConfigured();
  } else if (project && project.isNewEnvironment) {
    showRelatedProject(project, url);
  } else {
    showAddNew(url);
  }

  requestResizeSoon();
}

function showAddNew(url) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("addNew").style.display = "block";

  if (!addNewInitialized) {
    addNewInitialized = true;

    setupEnvButtons("envButtons", async (type, chip) => {
      await handleEnvSelection(chip, type, async () => {
        await saveNewEnvironment(currentUrl, type);
      });
    });
  }

  requestResizeSoon();
}

function showRelatedProject(projectData) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("relatedProject").style.display = "block";

  const title = document.getElementById("relatedProjectName");
  title.textContent = projectData.project.name;

  const suggestedType = projectData.suggestedType;

  if (!relatedInitialized) {
    relatedInitialized = true;

    setupEnvButtons(
      "relatedEnvButtons",
      async (type, chip) => {
        await handleEnvSelection(chip, type, async () => {
          await addToExistingProject(currentUrl, type, projectData.project);
        });
      },
      suggestedType,
    );

    document.getElementById("notRelatedBtn").addEventListener("click", () => {
      document.getElementById("relatedProject").style.display = "none";
      showAddNew(currentUrl);
      requestResizeSoon();
    });
  } else {
    const container = document.getElementById("relatedEnvButtons");
    const buttons = container.querySelectorAll(".env-chip");
    buttons.forEach((b) => b.classList.remove("active"));
    const btn = container.querySelector(`[data-type="${suggestedType}"]`);
    if (btn) {
      btn.classList.add("active");
    }
  }

  requestResizeSoon();
}

function showConfigured() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("configured").style.display = "block";
}

function setupEnvButtons(containerId, callback, preselect = null) {
  const container = document.getElementById(containerId);
  const buttons = container.querySelectorAll(".env-chip");

  if (preselect) {
    const btn = container.querySelector(`[data-type="${preselect}"]`);
    if (btn) {
      btn.classList.add("active");
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (isSaving) return;

      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const type = btn.dataset.type;
      if (!type) return;

      await callback(type, btn);
    });
  });
}

// Save new environment (creates new project)
async function saveNewEnvironment(url, envType) {
  const data = await chrome.storage.local.get(["projects", "urlMapping"]);

  const projectId = generateUUID();
  const host = extractHost(url);
  const baseDomain = extractBaseDomain(host);

  const project = {
    id: projectId,
    name: capitalizeFirst(baseDomain.split(".")[0]),
    baseDomain: baseDomain,
    createdAt: Date.now(),
    environments: [
      {
        type: envType,
        url: normalizeUrl(url),
        name: getEnvTypeName(envType),
        badge: getEnvTypeBadge(envType),
        color: getEnvTypeColor(envType),
        icon: getEnvTypeIcon(envType),
        order: 0,
      },
    ],
  };

  data.projects[projectId] = project;
  data.urlMapping[host] = projectId;
  data.urlMapping[removePort(host)] = projectId;

  await chrome.storage.local.set(data);

  await updateBadge(currentTabId, envType);
}

// Add to existing project
async function addToExistingProject(url, envType, project) {
  const data = await chrome.storage.local.get(["projects", "urlMapping"]);

  const host = extractHost(url);
  const existingProject = data.projects[project.id];

  // Check if environment type already exists
  const existingEnv = existingProject.environments.find(
    (e) => e.type === envType,
  );
  if (existingEnv) {
    alert(
      `${capitalizeFirst(envType)} environment already exists for this project`,
    );
    isSaving = false;
    disableAllChips(false);
    return;
  }

  const newEnv = {
    type: envType,
    url: normalizeUrl(url),
    name: getEnvTypeName(envType),
    badge: getEnvTypeBadge(envType),
    color: getEnvTypeColor(envType),
    icon: getEnvTypeIcon(envType),
    order: existingProject.environments.length,
  };

  existingProject.environments.push(newEnv);
  data.projects[project.id] = existingProject;
  data.urlMapping[host] = project.id;
  data.urlMapping[removePort(host)] = project.id;

  await chrome.storage.local.set(data);

  await updateBadge(currentTabId, envType);
}

// Utility functions
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

  if (withoutPort === "localhost" || withoutPort === "127.0.0.1") {
    return "localhost";
  }

  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  return withoutPort;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function findCurrentEnvironmentType(project) {
  // Return the type of the first environment (usually production)
  return project.environments[0]?.type || "production";
}

async function findProjectForUrl(url, data) {
  const host = extractHost(url);
  const { projects, urlMapping } = data;

  if (urlMapping[host]) {
    return projects[urlMapping[host]];
  }

  const hostWithoutPort = removePort(host);
  if (urlMapping[hostWithoutPort]) {
    return projects[urlMapping[hostWithoutPort]];
  }

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

function detectEnvironmentType(url) {
  const host = extractHost(url).toLowerCase();

  if (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("192.168")
  ) {
    return "local";
  }

  if (/^(local\.|dev\.)/.test(host)) return "local";
  if (/^(develop\.)/.test(host)) return "development";
  if (/^(staging\.|stage\.|stg\.|qa\.|uat\.|test\.)/.test(host))
    return "staging";

  if (/-staging|-stage|-stg|-qa|-uat|-test/.test(host)) return "staging";
  if (/-dev|-develop/.test(host)) return "development";

  return "production";
}

function getEnvTypeName(type) {
  const types = {
    local: "Local",
    development: "Development",
    staging: "Staging",
    production: "Production",
  };
  return types[type] || "Production";
}

function getEnvTypeBadge(type) {
  const badges = {
    local: "L",
    development: "D",
    staging: "S",
    production: "P",
  };
  return badges[type] || "P";
}

function getEnvTypeColor(type) {
  const colors = {
    local: "#2196F3",
    development: "#9C27B0",
    staging: "#FF9800",
    production: "#4CAF50",
  };
  return colors[type] || "#4CAF50";
}

function getEnvTypeIcon(type) {
  const icons = {
    local: "📍",
    development: "🔧",
    staging: "🔧",
    production: "🚀",
  };
  return icons[type] || "🚀";
}

async function updateBadge(tabId, envType) {
  if (!tabId || Number.isNaN(Number(tabId))) return;

  const badge = getEnvTypeBadge(envType);
  const color = getEnvTypeColor(envType);

  await chrome.action.setBadgeText({ text: badge, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}
