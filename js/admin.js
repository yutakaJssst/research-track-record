"use strict";

const OWNER = "yutakaJssst";
const REPO = "research-track-record";
const PATH = "data.json";
const API_BASE = "https://api.github.com";

const TYPE_LABEL = {
  conference: "国際会議",
  workshop: "ワークショップ",
  journal: "論文誌",
  grant: "予算",
};
const STATUS_LABEL = { accepted: "採択", rejected: "不採択", pending: "結果待ち" };

const state = {
  pat: "",
  data: null,       // full JSON { meta, items }
  sha: "",          // blob sha for PUT
  items: [],        // working copy (each may have _state)
  editingIndex: -1, // index in items[] being edited, -1 for new
};

window.addEventListener("DOMContentLoaded", () => {
  const savedPat = sessionStorage.getItem("gh-pat") || "";
  if (savedPat) document.getElementById("pat-input").value = savedPat;

  document.getElementById("btn-load").addEventListener("click", handleLoad);
  document.getElementById("btn-reload").addEventListener("click", handleLoad);
  document.getElementById("btn-add").addEventListener("click", openAddDialog);
  document.getElementById("btn-cancel").addEventListener("click", closeDialog);
  document.getElementById("btn-commit").addEventListener("click", handleCommit);
  document.getElementById("edit-form").addEventListener("submit", handleFormSubmit);
});

// ========== Base64 (UTF-8 safe) ==========
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ========== API ==========
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.pat}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PUT ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ========== Load ==========
async function handleLoad() {
  const patInput = document.getElementById("pat-input");
  const pat = patInput.value.trim();
  if (!pat) {
    setAuthStatus("PAT を入力してください", "err");
    return;
  }
  state.pat = pat;
  sessionStorage.setItem("gh-pat", pat);

  setAuthStatus("読込中…", "");
  try {
    const resp = await apiGet(`/repos/${OWNER}/${REPO}/contents/${PATH}`);
    const raw = decodeBase64(resp.content);
    state.data = JSON.parse(raw);
    state.sha = resp.sha;
    state.items = state.data.items.map((it) => ({ ...it }));

    document.getElementById("editor-section").hidden = false;
    document.getElementById("commit-section").hidden = false;
    setAuthStatus(`OK (sha: ${state.sha.slice(0, 7)})`, "ok");
    renderList();
    updateDirty();
  } catch (err) {
    console.error(err);
    setAuthStatus(`失敗: ${err.message}`, "err");
  }
}

// ========== Render list ==========
function renderList() {
  const list = document.getElementById("editor-list");
  const sorted = state.items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.year || 0) - (a.it.year || 0));

  list.innerHTML = sorted
    .map(({ it, i }) => {
      const stateClass = it._state ? ` ${it._state}` : "";
      const stateBadge = it._state
        ? ` <span class="type-pill" style="background:var(--pending-soft);color:var(--pending)">${it._state === "new" ? "新規" : it._state === "edited" ? "編集" : "削除予定"}</span>`
        : "";
      const typePill = `<span class="type-pill">${TYPE_LABEL[it.type] || it.type}</span>`;
      const statusBadge = `<span class="badge badge--${it.status}">${STATUS_LABEL[it.status] || it.status}</span>`;
      const deleteLabel = it._state === "deleted" ? "取消" : "削除";
      return `<div class="editor-row${stateClass}">
        <span class="year">${it.year}</span>
        <div class="meta">
          <span class="title">${escapeHtml(it.title)}</span>
          ${typePill}
          ${statusBadge}
          ${stateBadge}
        </div>
        <div class="row-btns">
          <button type="button" class="btn-secondary" data-action="edit" data-index="${i}">編集</button>
          <button type="button" class="btn-danger" data-action="toggle-delete" data-index="${i}">${deleteLabel}</button>
        </div>
      </div>`;
    })
    .join("");

  document.getElementById("editor-count").textContent = state.items.filter((i) => i._state !== "deleted").length;

  list.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      const action = btn.dataset.action;
      if (action === "edit") openEditDialog(idx);
      else if (action === "toggle-delete") toggleDelete(idx);
    });
  });
}

// ========== Dialog ==========
function openAddDialog() {
  state.editingIndex = -1;
  document.getElementById("edit-title").textContent = "新規エントリ";
  const form = document.getElementById("edit-form");
  form.reset();
  form.elements.year.value = new Date().getFullYear();
  form.elements.kind.value = "paper";
  form.elements.type.value = "conference";
  form.elements.category.value = "international";
  form.elements.status.value = "pending";
  form.elements.role.value = "unknown";
  document.getElementById("edit-dialog").showModal();
}

function openEditDialog(index) {
  state.editingIndex = index;
  const it = state.items[index];
  document.getElementById("edit-title").textContent = "編集";
  const form = document.getElementById("edit-form");
  form.reset();
  form.elements.id.value = it.id || "";
  form.elements.year.value = it.year || "";
  form.elements.title.value = it.title || "";
  form.elements.venue.value = it.venue || "";
  form.elements.venueFull.value = it.venueFull || "";
  form.elements.kind.value = it.kind || "paper";
  form.elements.type.value = it.type || "conference";
  form.elements.category.value = it.category || "international";
  form.elements.status.value = it.status || "pending";
  form.elements.paperType.value = it.paperType || "";
  form.elements.role.value = it.role || "unknown";
  form.elements.coauthors.value = (it.coauthors || []).join(", ");
  form.elements.notes.value = it.notes || "";
  document.getElementById("edit-dialog").showModal();
}

function closeDialog() {
  document.getElementById("edit-dialog").close();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);

  const coauthorsStr = (fd.get("coauthors") || "").toString().trim();
  const coauthors = coauthorsStr
    ? coauthorsStr.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const paperType = (fd.get("paperType") || "").toString();
  const item = {
    id: (fd.get("id") || "").toString().trim(),
    year: Number(fd.get("year")),
    title: (fd.get("title") || "").toString().trim(),
    venue: (fd.get("venue") || "").toString().trim(),
    venueFull: (fd.get("venueFull") || "").toString().trim(),
    kind: fd.get("kind").toString(),
    type: fd.get("type").toString(),
    category: fd.get("category").toString(),
    status: fd.get("status").toString(),
    paperType: paperType || null,
    role: fd.get("role").toString(),
    coauthors,
    notes: (fd.get("notes") || "").toString().trim(),
  };

  if (!item.id) item.id = generateId(item.title, item.year);

  if (state.editingIndex < 0) {
    if (state.items.some((i) => i.id === item.id)) {
      alert(`ID "${item.id}" は既に存在します。別のIDを指定してください。`);
      return;
    }
    item._state = "new";
    state.items.push(item);
  } else {
    const prev = state.items[state.editingIndex];
    const newState = prev._state === "new" ? "new" : "edited";
    state.items[state.editingIndex] = { ...item, _state: newState };
  }

  closeDialog();
  renderList();
  updateDirty();
}

function toggleDelete(index) {
  const item = state.items[index];
  if (item._state === "new") {
    if (!confirm("新規追加したエントリを破棄しますか？")) return;
    state.items.splice(index, 1);
  } else if (item._state === "deleted") {
    delete item._state;
  } else {
    if (!confirm(`"${item.title}" を削除対象にマークしますか？（コミットまで確定しません）`)) return;
    item._state = "deleted";
  }
  renderList();
  updateDirty();
}

function generateId(title, year) {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = base ? `${base}-${year}` : `entry-${year}-${Date.now()}`;
  let id = suffix;
  let n = 2;
  while (state.items.some((i) => i.id === id)) {
    id = `${suffix}-${n++}`;
  }
  return id;
}

// ========== Commit ==========
function cleanItem(it) {
  const { _state, ...rest } = it;
  return rest;
}

async function handleCommit() {
  const dirtyCount = state.items.filter((i) => i._state).length;
  if (dirtyCount === 0) {
    setCommitStatus("変更なし", "");
    return;
  }

  const msg = document.getElementById("commit-message").value.trim() || "Update data.json";
  const btn = document.getElementById("btn-commit");

  btn.disabled = true;
  setCommitStatus("コミット中…", "");

  try {
    const items = state.items.filter((i) => i._state !== "deleted").map(cleanItem);
    const newData = {
      ...state.data,
      meta: {
        ...(state.data.meta || {}),
        lastUpdated: new Date().toISOString().slice(0, 10),
      },
      items,
    };
    const newRaw = JSON.stringify(newData, null, 2) + "\n";

    const resp = await apiPut(`/repos/${OWNER}/${REPO}/contents/${PATH}`, {
      message: msg,
      content: encodeBase64(newRaw),
      sha: state.sha,
      branch: "main",
    });

    state.data = newData;
    state.sha = resp.content.sha;
    state.items = items.map((it) => ({ ...it }));

    setCommitStatus(`OK (${resp.commit.sha.slice(0, 7)}): GitHub Pages 再ビルドまで 30-60 秒`, "ok");
    renderList();
    updateDirty();
  } catch (err) {
    console.error(err);
    setCommitStatus(`失敗: ${err.message}`, "err");
  } finally {
    btn.disabled = false;
  }
}

// ========== Helpers ==========
function setAuthStatus(text, cls) {
  const el = document.getElementById("auth-status");
  el.textContent = text;
  el.className = `auth-status ${cls || ""}`;
}

function setCommitStatus(text, cls) {
  const el = document.getElementById("commit-status");
  el.textContent = text;
  el.className = `commit-status ${cls || ""}`;
}

function updateDirty() {
  const n = state.items.filter((i) => i._state).length;
  const ind = document.getElementById("dirty-indicator");
  if (n === 0) {
    ind.hidden = true;
  } else {
    ind.hidden = false;
    document.getElementById("dirty-text").textContent = `未保存の変更 ${n} 件`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
