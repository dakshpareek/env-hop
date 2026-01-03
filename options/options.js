let projects = {};
let urlMapping = {};
let settings = {};

let editingProjectId = null;
let editingEnvType = null;

// Initialize options page
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  renderProjects();
  loadSettings();
  setupEventListeners();
});

// Load data from storage
async function loadData() {
  const data = await chrome.storage.local.get([
    "projects",
    "urlMapping",
    "settings",
  ]);
  projects = data.projects || {};
  urlMapping = data.urlMapping || {};
  settings = data.settings || {
    showToastNotifications: true,
    preserveQueryParams: true,
    preserveHash: true,
  };
}

// Render projects list
function renderProjects() {
  const container = document.getElementById("projectsList");
  const emptyState = document.getElementById("emptyState");

  const projectArray = Object.values(projects);

  if (projectArray.length === 0) {
    container.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  container.style.display = "block";
  emptyState.style.display = "none";
  container.innerHTML = "";

  projectArray.forEach((project) => {
    const card = createProjectCard(project);
    container.appendChild(card);
  });
}

// Create project card element
function createProjectCard(project) {
  const card = document.createElement("div");
  card.className = "project-card";

  const sortedEnvs = project.environments.sort((a, b) => a.order - b.order);

  card.innerHTML = `
    <div class="project-header">
      <div class="project-info">
        <h3>🏗️ ${project.name}</h3>
        <div class="domain">${project.baseDomain}</div>
      </div>
      <div class="project-actions">
        <button class="delete-btn" data-project-id="${project.id}">Delete Project</button>
      </div>
    </div>
    <div class="environments">
      ${sortedEnvs.map((env) => createEnvironmentItem(env, project.id)).join("")}
    </div>
    <button class="btn-secondary add-env-btn" data-project-id="${project.id}" style="margin-top: 12px; width: 100%;">
      + Add Environment
    </button>
  `;

  // Add event listeners
  card
    .querySelector(".delete-btn")
    .addEventListener("click", () => deleteProject(project.id));
  card
    .querySelector(".add-env-btn")
    .addEventListener("click", () => addEnvironmentToProject(project.id));

  // Add edit/remove listeners for each environment
  sortedEnvs.forEach((env, index) => {
    const envElement = card.querySelectorAll(".environment-item")[index];
    envElement
      .querySelector(".edit-btn")
      ?.addEventListener("click", () => editEnvironment(project.id, env.type));
    envElement
      .querySelector(".remove-btn")
      ?.addEventListener("click", () =>
        removeEnvironment(project.id, env.type),
      );
  });

  return card;
}

// Create environment item HTML
function createEnvironmentItem(env, projectId) {
  return `
    <div class="environment-item ${env.type}">
      <div class="env-info">
        <div class="env-icon">${env.icon}</div>
        <div class="env-details">
          <div class="env-name">${env.name}</div>
          <div class="env-url">${env.url}</div>
        </div>
      </div>
      <div class="env-actions">
        <button class="edit-btn">Edit</button>
        <button class="remove-btn">Remove</button>
      </div>
    </div>
  `;
}

// Delete project
async function deleteProject(projectId) {
  if (
    !confirm(
      "Are you sure you want to delete this project? This cannot be undone.",
    )
  ) {
    return;
  }

  delete projects[projectId];
  await rebuildUrlMapping();
  await saveData();
  renderProjects();
}

// Remove environment from project
async function removeEnvironment(projectId, envType) {
  const project = projects[projectId];

  if (project.environments.length <= 1) {
    alert("Cannot remove the last environment. Delete the project instead.");
    return;
  }

  project.environments = project.environments.filter((e) => e.type !== envType);
  await rebuildUrlMapping();
  await saveData();
  renderProjects();
}

// Load settings into form
function loadSettings() {
  document.getElementById("showNotifications").checked =
    settings.showToastNotifications !== false;
  document.getElementById("preserveQuery").checked =
    settings.preserveQueryParams !== false;
  document.getElementById("preserveHash").checked =
    settings.preserveHash !== false;
}

// Setup event listeners
function setupEventListeners() {
  // Settings checkboxes
  document
    .getElementById("showNotifications")
    .addEventListener("change", saveSettings);
  document
    .getElementById("preserveQuery")
    .addEventListener("change", saveSettings);
  document
    .getElementById("preserveHash")
    .addEventListener("change", saveSettings);

  // Export/Import
  document.getElementById("exportBtn").addEventListener("click", exportConfig);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document
    .getElementById("importFile")
    .addEventListener("change", importConfig);

  // Add Project
  document
    .getElementById("addProjectBtn")
    .addEventListener("click", addProject);

  // Edit modal actions
  document
    .getElementById("cancelEditBtn")
    .addEventListener("click", closeModal);
  document.getElementById("saveEditBtn").addEventListener("click", saveEdit);

  const modal = document.getElementById("editModal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Save settings
async function saveSettings() {
  settings.showToastNotifications =
    document.getElementById("showNotifications").checked;
  settings.preserveQueryParams =
    document.getElementById("preserveQuery").checked;
  settings.preserveHash = document.getElementById("preserveHash").checked;

  await chrome.storage.local.set({ settings });
}

// Save data to storage
async function saveData() {
  await chrome.storage.local.set({
    projects,
    urlMapping,
    settings,
  });
}

// Export configuration
function exportConfig() {
  const config = {
    projects,
    urlMapping,
    settings,
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `environment-switcher-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function addProject() {
  const baseUrlInput = prompt(
    "Enter a URL for the first environment (e.g. https://example.com or http://localhost:3000):",
  );
  if (!baseUrlInput) return;

  const normalized = normalizeUrl(baseUrlInput.trim());
  if (!isValidUrl(normalized)) {
    alert("Please enter a valid URL including http:// or https://");
    return;
  }

  const baseDomain = extractBaseDomain(extractHost(normalized));
  const nameInput = prompt(
    "Project name:",
    capitalizeFirst(baseDomain.split(".")[0] || "Project"),
  );
  if (!nameInput) return;

  const envType = prompt(
    "Environment type for this URL: local / development / staging / production",
    "production",
  );
  const cleanedEnvType = normalizeEnvType(envType);
  if (!cleanedEnvType) {
    alert("Invalid environment type.");
    return;
  }

  const projectId = generateUUID();
  projects[projectId] = {
    id: projectId,
    name: nameInput.trim(),
    baseDomain,
    createdAt: Date.now(),
    environments: [
      {
        type: cleanedEnvType,
        url: normalized,
        name: getEnvTypeName(cleanedEnvType),
        badge: getEnvTypeBadge(cleanedEnvType),
        color: getEnvTypeColor(cleanedEnvType),
        icon: getEnvTypeIcon(cleanedEnvType),
        order: 0,
      },
    ],
  };

  await rebuildUrlMapping();
  await saveData();
  renderProjects();
}

async function addEnvironmentToProject(projectId) {
  const project = projects[projectId];
  if (!project) return;

  const envUrlInput = prompt(
    `Enter environment URL to add for "${project.name}":`,
  );
  if (!envUrlInput) return;

  const normalized = normalizeUrl(envUrlInput.trim());
  if (!isValidUrl(normalized)) {
    alert("Please enter a valid URL including http:// or https://");
    return;
  }

  const envTypeInput = prompt(
    "Environment type: local / development / staging / production",
    "staging",
  );
  const envType = normalizeEnvType(envTypeInput);
  if (!envType) {
    alert("Invalid environment type.");
    return;
  }

  if (project.environments.some((e) => e.type === envType)) {
    alert(`${capitalizeFirst(envType)} already exists for this project.`);
    return;
  }

  project.environments.push({
    type: envType,
    url: normalized,
    name: getEnvTypeName(envType),
    badge: getEnvTypeBadge(envType),
    color: getEnvTypeColor(envType),
    icon: getEnvTypeIcon(envType),
    order: project.environments.length,
  });

  await rebuildUrlMapping();
  await saveData();
  renderProjects();
}

function editEnvironment(projectId, envType) {
  const project = projects[projectId];
  if (!project) return;

  const env = project.environments.find((e) => e.type === envType);
  if (!env) return;

  editingProjectId = projectId;
  editingEnvType = envType;

  document.getElementById("editEnvType").value = env.type;
  document.getElementById("editEnvUrl").value = env.url;

  openModal();
}

async function saveEdit() {
  if (!editingProjectId || !editingEnvType) return;

  const project = projects[editingProjectId];
  if (!project) return;

  const newType = normalizeEnvType(
    document.getElementById("editEnvType").value,
  );
  const newUrl = normalizeUrl(
    document.getElementById("editEnvUrl").value.trim(),
  );

  if (!newType) {
    alert("Invalid environment type.");
    return;
  }

  if (!isValidUrl(newUrl)) {
    alert("Please enter a valid URL including http:// or https://");
    return;
  }

  if (
    newType !== editingEnvType &&
    project.environments.some((e) => e.type === newType)
  ) {
    alert(`${capitalizeFirst(newType)} already exists for this project.`);
    return;
  }

  const env = project.environments.find((e) => e.type === editingEnvType);
  if (!env) return;

  env.type = newType;
  env.url = newUrl;
  env.name = getEnvTypeName(newType);
  env.badge = getEnvTypeBadge(newType);
  env.color = getEnvTypeColor(newType);
  env.icon = getEnvTypeIcon(newType);

  if (newType !== editingEnvType) {
    editingEnvType = newType;
  }

  await rebuildUrlMapping();
  await saveData();
  closeModal();
  renderProjects();
}

function openModal() {
  document.getElementById("editModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("editModal").style.display = "none";
  editingProjectId = null;
  editingEnvType = null;
}

async function importConfig(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    const nextProjects =
      parsed.projects && typeof parsed.projects === "object"
        ? parsed.projects
        : null;
    const nextSettings =
      parsed.settings && typeof parsed.settings === "object"
        ? parsed.settings
        : null;

    if (!nextProjects) {
      alert("Invalid config file: missing projects");
      return;
    }

    projects = nextProjects;
    settings = nextSettings || settings;

    await rebuildUrlMapping();
    await saveData();
    renderProjects();
    loadSettings();

    event.target.value = "";
  } catch (e) {
    alert(
      "Failed to import configuration. Make sure it's a valid JSON export.",
    );
    event.target.value = "";
  }
}

async function rebuildUrlMapping() {
  urlMapping = {};

  for (const projectId of Object.keys(projects)) {
    const project = projects[projectId];
    if (!project?.environments) continue;

    project.environments.forEach((env) => {
      const host = extractHost(env.url);
      if (!host) return;

      urlMapping[host] = projectId;

      // Avoid collisions across projects on localhost-like hosts by NOT mapping hostWithoutPort.
      if (!isLocalhostHost(host)) {
        urlMapping[removePort(host)] = projectId;
      }
    });
  }
}

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

function isLocalhostHost(host) {
  const h = String(host || "").toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:")
  );
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

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeEnvType(type) {
  if (!type) return null;
  const v = String(type).trim().toLowerCase();
  const allowed = ["local", "development", "staging", "production"];
  return allowed.includes(v) ? v : null;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
