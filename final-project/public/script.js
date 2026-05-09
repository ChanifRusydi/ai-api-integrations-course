const chatEl = document.getElementById("chat");
const sessionListEl = document.getElementById("session-list");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");
const sendBtnEl = document.getElementById("send-btn");
const clearBtnEl = document.getElementById("clear-btn");
const newChatBtnEl = document.getElementById("new-chat-btn");
const deleteChatBtnEl = document.getElementById("delete-chat-btn");

let sessionId = null;
let isBusy = false;

function syncControls() {
  sendBtnEl.disabled = isBusy;
  newChatBtnEl.disabled = isBusy;
  clearBtnEl.disabled = isBusy || !sessionId;
  deleteChatBtnEl.disabled = isBusy || !sessionId;
}

function setBusy(nextBusy) {
  isBusy = nextBusy;
  syncControls();
}

function setCurrentSessionId(nextSessionId) {
  sessionId = nextSessionId;
  syncControls();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function appendMessage(role, text, timestamp) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;

  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = text;
  msg.appendChild(body);

  const formattedTime = formatTimestamp(timestamp);
  if (formattedTime) {
    const time = document.createElement("small");
    time.className = "msg-time";
    time.textContent = formattedTime;
    msg.appendChild(time);
  }

  chatEl.appendChild(msg);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function renderWelcome() {
  chatEl.innerHTML = `
    <div class="welcome">
      <h2>Welcome to QuackBot</h2>
      <p>
        Explain your bug out loud. QuackBot will ask short, pointed questions
        so you can spot the logic issue yourself. Shocking concept, I know. quack
      </p>
      <div class="welcome-grid">
        <div class="welcome-card">
          <strong>Describe the mismatch</strong>
          <span>What did your code do, and what did you expect instead?</span>
        </div>
        <div class="welcome-card">
          <strong>Share the context</strong>
          <span>What input, state, or step causes the bug to show up?</span>
        </div>
        <div class="welcome-card">
          <strong>Follow the clues</strong>
          <span>Open an old chat from the sidebar or start a fresh one below.</span>
        </div>
      </div>
    </div>
  `;
}

function renderStoredMessages(messages) {
  chatEl.innerHTML = "";

  if (!messages.length) {
    appendMessage(
      "bot",
      "Fresh slate. What is your code doing, and what did you expect instead?"
    );
    return;
  }

  messages.forEach(({ role, text, created_at: createdAt }) => {
    appendMessage(role === "model" ? "bot" : "user", text, createdAt);
  });
}

function createSessionButton(session) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `session-item${session.id === sessionId ? " active" : ""}`;
  button.dataset.sessionId = session.id;
  button.innerHTML = `
    <span class="session-title">${escapeHtml(session.title)}</span>
    <span class="session-preview">${escapeHtml(session.preview)}</span>
  `;
  return button;
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = "";

  if (!sessions.length) {
    sessionListEl.innerHTML =
      '<div class="session-empty">No saved chats yet. Start one and it will appear here.</div>';
    return;
  }

  sessions.forEach((session) => {
    sessionListEl.appendChild(createSessionButton(session));
  });
}

async function refreshSessions() {
  const response = await fetch("/api/chat/sessions");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load sessions");
  }

  renderSessionList(data.sessions || []);
}

async function loadHistory(targetSessionId) {
  setBusy(true);

  try {
    const response = await fetch(
      `/api/chat/history?sessionId=${encodeURIComponent(targetSessionId)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load chat history");
    }

    setCurrentSessionId(targetSessionId);
    renderStoredMessages(data.messages || []);
    await refreshSessions();
  } catch (error) {
    setCurrentSessionId(null);
    renderWelcome();
    appendMessage("bot", `Error loading history: ${error.message}`);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

async function showWelcomeScreen() {
  setCurrentSessionId(null);
  inputEl.value = "";
  renderWelcome();

  try {
    await refreshSessions();
  } catch (error) {
    appendMessage("bot", `Error loading sessions: ${error.message}`);
  } finally {
    syncControls();
    inputEl.focus();
  }
}

newChatBtnEl.addEventListener("click", async () => {
  if (sessionId) {
    const confirmed = window.confirm(
      "Start a new chat? Your current conversation will stay saved in the sidebar."
    );

    if (!confirmed) {
      inputEl.focus();
      return;
    }
  }

  await showWelcomeScreen();
});

sessionListEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".session-item");
  if (!button) return;

  const nextSessionId = button.dataset.sessionId;
  if (!nextSessionId || nextSessionId === sessionId) return;

  await loadHistory(nextSessionId);
});

deleteChatBtnEl.addEventListener("click", async () => {
  if (!sessionId) return;

  const sessionIdToDelete = sessionId;
  const confirmed = window.confirm(
    "Delete this chat permanently? This removes the session from the sidebar too."
  );

  if (!confirmed) {
    inputEl.focus();
    return;
  }

  setBusy(true);

  try {
    const response = await fetch(
      `/api/chat/session/${encodeURIComponent(sessionIdToDelete)}`,
      {
        method: "DELETE",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to delete chat");
    }

    setCurrentSessionId(null);
    inputEl.value = "";
    renderWelcome();
    await refreshSessions();
  } catch (error) {
    appendMessage("bot", `Error: ${error.message}`);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
});

clearBtnEl.addEventListener("click", async () => {
  if (!sessionId) return;

  const confirmed = window.confirm(
    "Clear chat history? This keeps the chat entry, but resets QuackBot's memory for it."
  );

  if (!confirmed) {
    inputEl.focus();
    return;
  }

  setBusy(true);

  try {
    const response = await fetch("/api/chat/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to clear chat history");
    }

    renderStoredMessages([]);
    await refreshSessions();
  } catch (error) {
    appendMessage("bot", `Error: ${error.message}`);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = inputEl.value.trim();
  if (!userMessage) return;

  const activeSessionId = sessionId || window.crypto.randomUUID();

  if (!sessionId) {
    setCurrentSessionId(activeSessionId);
    chatEl.innerHTML = "";
  }

  appendMessage("user", userMessage, new Date().toISOString());
  inputEl.value = "";
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage, sessionId: activeSessionId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown server error");
    }

    setCurrentSessionId(activeSessionId);
    appendMessage("bot", data.reply, new Date().toISOString());
    await refreshSessions();
  } catch (error) {
    appendMessage("bot", `Error: ${error.message}`);
  } finally {
    setBusy(false);
    inputEl.focus();
  }
});

showWelcomeScreen();
