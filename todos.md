npx shadcn@latest apply --preset bKsE3ZC6

General Questions:

- What is the difference between a agent mode yes/no conversation?
- Check on model capabilities settings, currently they don't do anything, do they?

Todos:

- When switching model mid chat, ensure this model is actually used

Next Steps:

- M7 Skills
- M9 PWA, ...
- Other enhancements
- Code review pass
- Security hardening pass
- M8 Deep research

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