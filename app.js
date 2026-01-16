// Simple in-memory stores for this prototype
const state = {
  // Each material: { file, name, size, lastModified }
  materials: [],
  // Index of the currently selected material in materials[], or null
  selectedMaterialIndex: null,
  briefs: [],
  outlines: [],
};

function $(selector) {
  return document.querySelector(selector);
}

function renderMaterials() {
  const list = document.querySelector("#pdfList");
  list.innerHTML = "";

  state.materials.forEach((m, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${m.name}`;
    li.dataset.index = String(index);
    li.className =
      state.selectedMaterialIndex === index ? "material-item selected" : "material-item";
    li.addEventListener("click", () => {
      state.selectedMaterialIndex = index;
      renderMaterials();
    });
    list.appendChild(li);
  });
}

function renderCards(containerSelector, items) {
  const container = document.querySelector(containerSelector);
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h4");
    title.textContent = item.title;

    const meta = document.createElement("small");
    meta.textContent = item.source ? `Linked to: ${item.source}` : "Not yet linked to a PDF";

    const body = document.createElement("p");
    body.textContent = item.content
      ? item.content.slice(0, 280) + (item.content.length > 280 ? "…" : "")
      : "";

    card.appendChild(title);
    card.appendChild(meta);
    if (body.textContent) card.appendChild(body);
    container.appendChild(card);
  });
}

function addMaterialsFromFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (file.type === "application/pdf") {
      state.materials.push({
        file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      });
    }
  });
  // Auto-select the first material if nothing is selected yet
  if (state.selectedMaterialIndex === null && state.materials.length > 0) {
    state.selectedMaterialIndex = 0;
  }
  renderMaterials();
}

function handleImportClick() {
  const input = document.querySelector("#pdfInput");
  if (input.files && input.files.length > 0) {
    addMaterialsFromFiles(input.files);
    // In a future iteration, you can hook in a PDF parsing library here.
  }
}

async function generateFromSelected(kind) {
  if (state.selectedMaterialIndex === null) {
    alert("Please select a PDF under 'Your Materials' first.");
    return;
  }

  const material = state.materials[state.selectedMaterialIndex];
  if (!material || !material.file) {
    alert("Selected material is missing its file.");
    return;
  }

  const formData = new FormData();
  formData.append("file", material.file, material.name);
  formData.append("kind", kind);

  let response;
  try {
    response = await fetch("http://localhost:8001/api/generate", {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    console.error(err);
    alert("Could not reach backend service. Is it running on port 8001?");
    return;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && data.detail ? data.detail : "Error generating content.";
    alert(message);
    return;
  }

  if (kind === "brief") {
    state.briefs.push({
      title: data.title,
      source: material.name,
      content: data.content,
    });
    renderCards("#briefList", state.briefs);
  } else if (kind === "outline") {
    state.outlines.push({
      title: data.title,
      source: material.name,
      content: data.content,
    });
    renderCards("#outlineList", state.outlines);
  }
}

function init() {
  const importButton = document.querySelector("#importButton");
  const generateBriefButton = document.querySelector("#generateBriefButton");
  const generateOutlineButton = document.querySelector("#generateOutlineButton");

  importButton.addEventListener("click", handleImportClick);
  generateBriefButton.addEventListener("click", () => generateFromSelected("brief"));
  generateOutlineButton.addEventListener("click", () => generateFromSelected("outline"));
}

window.addEventListener("DOMContentLoaded", init);
