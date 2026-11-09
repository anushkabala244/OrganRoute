(() => {
    const suggestedQuestions = [
        "How do I register?",
        "How can I search for an organ?",
        "How do I upload documents?",
        "How can I track my request?",
        "How does hospital delivery work?"
    ];

    function appendMessage(messages, text, kind) {
        const message = document.createElement("p");
        message.className = `mimi-message ${kind}`;
        message.textContent = text;
        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
        return message;
    }

    function initializeMimi() {
        if (document.getElementById("mimi-launcher")) return;

        const launcher = document.createElement("button");
        launcher.type = "button";
        launcher.id = "mimi-launcher";
        launcher.className = "mimi-launcher";
        launcher.setAttribute("aria-label", "Chat with Mimi");
        launcher.setAttribute("aria-controls", "mimi-panel");
        launcher.setAttribute("aria-expanded", "false");
        launcher.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.2A7.5 7.5 0 1 1 20 11.5Z"></path>
                <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"></path>
            </svg>`;

        const panel = document.createElement("aside");
        panel.id = "mimi-panel";
        panel.className = "mimi-panel";
        panel.setAttribute("aria-label", "Chat with Mimi");
        panel.setAttribute("aria-labelledby", "mimi-title");
        panel.hidden = true;
        panel.innerHTML = `
            <header class="mimi-header">
                <span class="mimi-avatar" aria-hidden="true">M</span>
                <span class="mimi-heading">
                    <strong id="mimi-title">Mimi</strong>
                    <small>OrganRoute platform assistant</small>
                </span>
                <button class="mimi-minimize" type="button" aria-label="Minimise Mimi chat">−</button>
            </header>
            <nav class="mimi-suggestions" aria-label="Suggested questions">
                ${suggestedQuestions.map(question => `
                    <button class="mimi-suggestion" type="button" data-question="${question}">${question}</button>
                `).join("")}
            </nav>
            <div class="mimi-messages" id="mimi-messages" role="log" aria-live="polite" aria-relevant="additions">
                <p class="mimi-message assistant">Hi, I’m Mimi. I can help with OrganRoute accounts, requests, document uploads and delivery tracking. I can’t provide medical advice.</p>
            </div>
            <form class="mimi-form" id="mimi-form">
                <label class="sr-only" for="mimi-input">Message Mimi</label>
                <input id="mimi-input" name="message" type="text" maxlength="1000" placeholder="Ask Mimi a question…" autocomplete="off" required>
                <button type="submit">Send</button>
            </form>`;

        document.body.append(panel, launcher);
        const messages = panel.querySelector("#mimi-messages");
        const form = panel.querySelector("#mimi-form");
        const input = panel.querySelector("#mimi-input");
        const sendButton = form.querySelector('button[type="submit"]');
        const conversation = [];

        function open() {
            panel.hidden = false;
            launcher.setAttribute("aria-expanded", "true");
            input.focus();
        }

        function close() {
            panel.hidden = true;
            launcher.setAttribute("aria-expanded", "false");
            launcher.focus();
        }

        launcher.addEventListener("click", open);
        panel.querySelector(".mimi-minimize").addEventListener("click", close);
        document.querySelectorAll("#open-chat, #open-chat-secondary").forEach(button => {
            button.addEventListener("click", open);
        });
        panel.querySelectorAll("[data-question]").forEach(button => {
            button.addEventListener("click", () => {
                input.value = button.dataset.question;
                form.requestSubmit();
            });
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            const message = input.value.trim();
            if (!message || sendButton.disabled) return;

            appendMessage(messages, message, "user");
            input.value = "";
            const typing = appendMessage(messages, "Mimi is typing…", "typing");
            sendButton.disabled = true;
            form.setAttribute("aria-busy", "true");

            try {
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message,
                        history: conversation.slice(-12)
                    })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || typeof result.reply !== "string" || !result.reply.trim()) {
                    throw new Error(result.message || result.detail || `Assistant request failed (${response.status}).`);
                }
                typing.remove();
                appendMessage(messages, result.reply, "assistant");
                conversation.push(
                    { role: "user", content: message },
                    { role: "assistant", content: result.reply }
                );
                conversation.splice(0, Math.max(0, conversation.length - 12));
            } catch (error) {
                typing.remove();
                appendMessage(messages, `I couldn’t reach Mimi. ${error.message}`, "error");
            } finally {
                sendButton.disabled = false;
                form.removeAttribute("aria-busy");
                messages.scrollTop = messages.scrollHeight;
            }
        });

        window.MimiAssistant = { open, close };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeMimi, { once: true });
    } else {
        initializeMimi();
    }
})();
