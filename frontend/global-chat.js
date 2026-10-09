
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const featureCards = [...document.querySelectorAll(".feature-card")];

    const chatCard = featureCards.find((card) =>
        card.querySelector("h3")?.textContent.trim().toLowerCase() === "global chat"
    );

    if (!chatCard) {
        console.error("Global Chat card tidak dijumpai.");
        return;
    }

    chatCard.style.cursor = "pointer";
    chatCard.setAttribute("role", "button");
    chatCard.setAttribute("tabindex", "0");

    let lastMessageId = 0;
    let polling = false;
    let pollTimer = null;

    const modal = document.createElement("div");
    modal.id = "globalChatModal";

    modal.innerHTML = `
        <div class="gc-panel" role="dialog" aria-modal="true"
             aria-labelledby="gcTitle">
            <header class="gc-header">
                <div>
                    <h2 id="gcTitle">Global Chat</h2>
                    <p>Chat with the Anime Platform community</p>
                </div>
                <button type="button" id="gcClose" aria-label="Close chat">×</button>
            </header>

            <div id="gcStatus" role="status">Connecting to chat...</div>
            <div id="gcMessages" aria-live="polite"></div>

            <form id="gcForm">
                <textarea id="gcInput" maxlength="500"
                    placeholder="Type a message..." rows="2"
                    aria-label="Chat message" required></textarea>
                <button type="submit" id="gcSend">Send</button>
            </form>
            <p class="gc-hint">Maximum 500 characters per message.</p>
        </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
        #globalChatModal {
            display:none; position:fixed; inset:0; z-index:10000;
            background:rgba(0,0,0,.75); padding:16px;
            align-items:center; justify-content:center;
        }
        #globalChatModal.gc-open { display:flex; }
        .gc-panel {
            width:min(620px,100%); height:min(720px,90vh);
            display:flex; flex-direction:column; overflow:hidden;
            color:var(--text-color,#fff); background:var(--card-bg,#171717);
            border:1px solid var(--viz-border,#383838);
            border-radius:16px; box-shadow:0 20px 70px #0008;
        }
        .gc-header {
            display:flex; justify-content:space-between; align-items:center;
            gap:12px; padding:18px; border-bottom:1px solid #ffffff18;
        }
        .gc-header h2 { margin:0 0 5px; }
        .gc-header p { margin:0; opacity:.65; font-size:13px; }
        #gcClose {
            border:0; background:transparent; color:inherit;
            font-size:28px; cursor:pointer;
        }
        #gcStatus { padding:8px 16px; font-size:13px; opacity:.75; }
        #gcMessages {
            flex:1; overflow-y:auto; padding:12px 16px;
            display:flex; flex-direction:column; gap:14px;
        }
        .gc-message { display:flex; align-items:flex-start; gap:10px; }
        .gc-avatar {
            width:36px; height:36px; border-radius:50%;
            object-fit:cover; flex-shrink:0;
        }
        .gc-message-body { min-width:0; flex:1; }
        .gc-message-meta {
            display:flex; flex-wrap:wrap; align-items:center;
            gap:8px; margin-bottom:4px;
        }
        .gc-message-name { font-size:13px; font-weight:700; }
        .gc-message-time { font-size:11px; opacity:.55; }
        .gc-message-text {
            white-space:pre-wrap; overflow-wrap:anywhere;
            font-size:14px; line-height:1.5;
        }
        #gcForm {
            display:flex; gap:8px; padding:12px 16px;
            border-top:1px solid #ffffff18;
        }
        #gcInput {
            flex:1; min-width:0; resize:vertical; max-height:120px;
            padding:11px; border-radius:10px;
            border:1px solid var(--viz-border,#444);
            background:var(--input-bg,#222); color:inherit;
            font:inherit; box-sizing:border-box;
        }
        #gcSend {
            border:0; border-radius:10px; padding:0 18px;
            background:var(--primary-color,#6d5dfc);
            color:white; cursor:pointer; font-weight:600;
        }
        #gcSend:disabled { opacity:.5; cursor:wait; }
        .gc-hint { margin:0; padding:0 16px 12px; font-size:11px; opacity:.55; }
        .gc-empty { margin:auto; text-align:center; opacity:.65; padding:20px; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    const messagesBox = modal.querySelector("#gcMessages");
    const status = modal.querySelector("#gcStatus");
    const form = modal.querySelector("#gcForm");
    const input = modal.querySelector("#gcInput");
    const sendButton = modal.querySelector("#gcSend");

    function setStatus(message) {
        status.textContent = message;
    }

    function openChat() {
        modal.classList.add("gc-open");
        input.focus();

        if (!pollTimer) {
            loadMessages();
            pollTimer = setInterval(loadMessages, 3000);
        }
    }

    function closeChat() {
        modal.classList.remove("gc-open");

        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    chatCard.addEventListener("click", openChat);
    chatCard.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openChat();
        }
    });

    modal.querySelector("#gcClose").addEventListener("click", closeChat);

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeChat();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeChat();
    });

    function formatTime(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function renderMessage(message) {
        const row = document.createElement("div");
        row.className = "gc-message";
        row.dataset.messageId = String(message.id);

        const avatar = document.createElement("img");
        avatar.className = "gc-avatar";
        avatar.alt = "";
        avatar.src = message.avatar_url ||
            message.avatar ||
            "https://cdn.discordapp.com/embed/avatars/0.png";

        avatar.addEventListener("error", () => {
            avatar.src = "https://cdn.discordapp.com/embed/avatars/0.png";
        }, { once: true });

        const body = document.createElement("div");
        body.className = "gc-message-body";

        const meta = document.createElement("div");
        meta.className = "gc-message-meta";

        const name = document.createElement("span");
        name.className = "gc-message-name";
        name.textContent =
            message.display_name || message.username || "User";

        const time = document.createElement("span");
        time.className = "gc-message-time";
        time.textContent = formatTime(message.created_at);

        const text = document.createElement("div");
        text.className = "gc-message-text";
        text.textContent = message.message || "";

        meta.append(name, time);
        body.append(meta, text);
        row.append(avatar, body);

        messagesBox.appendChild(row);
    }

    async function loadMessages() {
        if (polling || !modal.classList.contains("gc-open")) return;

        polling = true;

        try {
            const response = await fetch(
                `/api/global-chat/messages?after=${lastMessageId}`,
                { credentials: "include" }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message ||
                    `Chat request failed (${response.status}).`);
            }

            const messages = Array.isArray(data.messages)
                ? data.messages
                : [];

            messages.forEach((message) => {
                const id = Number(message.id);

                if (!Number.isFinite(id) || id <= lastMessageId) return;

                renderMessage(message);
                lastMessageId = id;
            });

            if (messagesBox.children.length === 0) {
                messagesBox.innerHTML =
                    '<div class="gc-empty">No messages yet. Start the conversation.</div>';
            } else {
                messagesBox.querySelector(".gc-empty")?.remove();
                messagesBox.scrollTop = messagesBox.scrollHeight;
            }

            setStatus("Connected");
        } catch (error) {
            console.error("Global Chat load error:", error);
            setStatus("Unable to load chat: " + error.message);
        } finally {
            polling = false;
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const message = input.value.trim();

        if (!message) {
            setStatus("Please enter a message.");
            return;
        }

        if (message.length > 500) {
            setStatus("Message must not exceed 500 characters.");
            return;
        }

        sendButton.disabled = true;
        sendButton.textContent = "Sending...";

        try {
            const response = await fetch("/api/global-chat/messages", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message ||
                    `Could not send message (${response.status}).`);
            }

            input.value = "";
            setStatus("Message sent.");
            await loadMessages();
            input.focus();
        } catch (error) {
            console.error("Global Chat send error:", error);
            setStatus("Message not sent: " + error.message);
        } finally {
            sendButton.disabled = false;
            sendButton.textContent = "Send";
        }
    });
});