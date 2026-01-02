let currentUrl = "";
let currentTabId = null;
let selectedEnvType = null;
let relatedProjectData = null;

// Initialize setup window
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  currentUrl = params.get("url") || "";

  const tabIdParam = params.get("tabId");
  currentTabId = tabIdParam ? Number(tabIdParam) : null;

  if (
    !currentUrl ||
    currentUrl.startsWith("chrome://") ||
    currentUrl.startsWith("edge://")
  ) {
    showConfigured();
    return;
  }

  const data = await chrome.storage.local.get(["projects", "urlMapping"]);
  const project = await findProjectForUrl(currentUrl, data);

  if (project && !project.isNewEnvironment) {
    showConfigured();
  } else if (project && project.isNewEnvironment) {
    showRelatedProject(project, currentUrl);
  } else {
    showAddNew(currentUrl);
  }
});

// Show add new environment form
function showAddNew(url) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("addNew").style.display = "block";
  document.getElementById("currentUrl").textContent = url;

  // Setup environment buttons
  setupEnvButtons("envButtons", async (type) => {
    selectedEnvType = type;
    document.getElementById("saveBtn").disabled = false;
  });

  // Save button handler
  document.getElementById("saveBtn").addEventListener("click", async () => {
    await saveNewEnvironment(url, selectedEnvType);
  });
}

// Show related project detection
function showRelatedProject(projectData, url) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("relatedProject").style.display = "block";
  document.getElementById("relatedUrl").textContent = url;
  document.getElementById("relatedProjectName").textContent =
    `🏗️ ${projectData.project.name} (${capitalizeFirst(findCurrentEnvironmentType(projectData.project))})`;

  // Update suggestion text
  const suggestedType = projectData.suggestedType;
  document.getElementById("suggestionText").textContent =
    `Is this the ${capitalizeFirst(suggestedType)} environment?`;

  relatedProjectData = projectData;

  // Setup environment buttons with pre-selection
  setupEnvButtons(
    "relatedEnvButtons",
    async (type) => {
      selectedEnvType = type;
      document.getElementById("addToProjectBtn").disabled = false;
    },
    suggestedType,
  );

  // Add to project button
  document
    .getElementById("addToProjectBtn")
    .addEventListener("click", async () => {
      await addToExistingProject(url, selectedEnvType, projectData.project);
    });

  // Not related button
  document.getElementById("notRelatedBtn").addEventListener("click", () => {
    document.getElementById("relatedProject").style.display = "none";
    showAddNew(url);
  });
}

// Show configured message
function showConfigured() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("configured").style.display = "block";
}

// Setup environment button selection
function setupEnvButtons(containerId, callback, preselect = null) {
  const container = document.getElementById(containerId);
  const buttons = container.querySelectorAll(".env-btn");

  // Pre-select if specified
  if (preselect) {
    const btn = container.querySelector(`[data-type="${preselect}"]`);
    if (btn) {
      btn.classList.add("selected");
      callback(preselect);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      callback(btn.dataset.type);
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
  window.close();
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
  window.close();
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
  if (!tabId || Number.isNaN(tabId)) return;

  const badge = getEnvTypeBadge(envType);
  const color = getEnvTypeColor(envType);

  await chrome.action.setBadgeText({ text: badge, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}
