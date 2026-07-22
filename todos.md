npx shadcn@latest apply --preset bKsE3ZC6

General Questions:

- What is the difference between a agent mode yes/no conversation?
- Check on model capabilities settings, currently they don't do anything, do they?

Todos:

- Also allow selecting model mappings for regular chat/agents and use the same logic
- For Topkens in / out, also use the 4k, 4m, ... formatter

Next Steps:

- AI Proxy impls based on the plan
- M7 Skills
- M8 Deep research
- M9 PWA, ...
- Other enhancements
- Code review pass
- Security hardening pass
- Rebrand to Chatty
- Keep sidebar expansion in the users preferences and store the current state there (don't make this available in the settings menu)

Ideas for later

- Add paging/infinite scrolling for the conversation history
- Add loggs to see better what is going on (console should be enough)
- Uploading photos to the AI from the phone (i.e. take a photo directly ideally)
- For webfetch mcp, convert the html to .md first ad optional parameter
- CMD + K to search conversations (should jump to the search conversations bar)
- Add version to the page somewhere, and a github link
- Weather MCP, using open-meteo. wttr.in (no API key) we can use the openmeteo npm package for this
- SearXNG MCP, configured using a websearch page
- Add an MCP server to configure an agent
- On the MCP test button dialog, also show a small description of what the individual tools do
- Make the sidebar a bit more organized, Conversations should have their own heading maybe? And also the agents/memory, shouldn't be in between the search and conversation history/results
- On the settings page, make the overflow: overlay, and prevent the scrollbar appearing from shifting the page content
- Add additional default provider types, such as: LM Studio, Openrouter, with prefilled url, maybe even icons in the ui?
- More interesting login screen with https://kokonutui.com/docs/backgrounds/beams-background

- switch all sync fs method calls to their async counterparts

AI Proxy things:

- Build in the AI Proxy into ai-chat:
  - Add openAI Compatible endpoints for /models, /completions, /responses (allow users to invoke the endpoints with their API keys, that they can create). The models endpoint should be publicly available
  - Add request log page for admins, which shows the running/past requests with the used API key, provider, model, status, latency, input/output tokens and price, if available
  - Show a few statistics statictis on the request logs page, which shows total number of requests, total tokens, total costs, number of models, ...
  - Add a model mappings page for admins, where the user can create custom model names, i.e. auto, or code-local, ... that are routed to a specific provider one or multiple fallback options.
  - Add a smaller getting started section detailing how to set this up for claude code, opencode and API with curl as an example
  - Add option of enabling token compression/saving options on a per user level such as:
    - Caveman skill which can be enabled/disabled in the UI: https://github.com/juliusbrussee/caveman
    - Headroom compression using the typescript library: https://www.npmjs.com/package/headroom-ai
    - Add reporting how much each method saves tokenwise
