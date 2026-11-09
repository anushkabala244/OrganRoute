# OrganRoute assistant service

The assistant is a separate FastAPI service proxied by the Node API at
`POST /api/chat`.

The shared Mimi widget is shown on the OrganRoute landing page and dashboard.
It sends questions and up to 12 recent chat messages through the existing Node
proxy, displays a typing state and surfaces service errors. Suggested prompts
cover registration, organ search, document uploads, request tracking and
hospital delivery.

From this directory, install dependencies and start the service:

```sh
python3 -m pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Without `OPENAI_API_KEY`, the service answers supported questions using its
built-in OrganRoute FAQ. To enable OpenAI responses, set `OPENAI_API_KEY` in
the environment before starting the service; `OPENAI_MODEL` optionally selects
the model. The assistant is restricted to platform usage questions and does
not provide medical advice. Without an OpenAI key, the built-in FAQ supports
registration, organ search, document uploads, request tracking and delivery.

The Node service can use a different local assistant URL through
`CHATBOT_SERVICE_URL` (defaults to `http://127.0.0.1:8000/chat`).
