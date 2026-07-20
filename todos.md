npx shadcn@latest apply --preset bKsE3ZC6

General Questions:

- What is the difference between a agent mode yes/no conversation?

Todos:
- Think about using websockets or so for showing, when agents are running/conversation status updates, currently the polling based approach kind of does not work :D

Ideas for later

- Add paging/infinite scrolling for the conversation history
- Add loggs to see better what is going on (console should be enough)
- Uploading photos to the AI from the phone (i.e. take a photo directly ideally)
- For webfetch mcp, convert the html to .md first ad optional parameter
- CMD + K to search conversations
- Add version to the page somewhere, and a github link
- Weather MCP, using open-meteo (no API key) we can use the openmeteo npm package for this
- SearXNG MCP, configured using a websearch page
- Add an MCP server to configure an agent
- On the MCP test button dialog, also show a small description of what the individual tools do
- Make the sidebar a bit more organized, Conversations should have their own heading maybe?
- On the settings page, make the overflow overlay, and prevent the scrollbar appearing from shifting the page content
- Add additional default provider types, such as: LM Studio, Openrouter, with prefilled url, maybe even icons in the ui?

AI Proxy things:

- Build in API Proxy into ai-chat:
  - Add openAI Compatible endpoints for /models, /completions, /responses
  - Add request log page, which shows the running requests with the used API key, provider, model, status, latency, input/output tokens and price, if available
  - Add a smaller statictis page on the request logs page, which shows total number of requests, total tokens, total costs, number of models, ...
  - Add a model mappings page, where the user can create custom model names, i.e. auto, or code-local, ... that are routed to a specific provider or a fallback one.
  - Add a smaller getting started section detailing how to set this up for claude code, opencode and API with curl as an example
  - Add option of enabling token compression/saving options such as:
    - Caveman skill which can be enabled/disabled in the UI: https://github.com/juliusbrussee/caveman
    - Headroom compression using the typescript library: https://www.npmjs.com/package/headroom-ai
    - Add reporting how much each method saves tokenwise

- Add option to process images
