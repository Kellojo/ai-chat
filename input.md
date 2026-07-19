I want to create a local self hosted AI Chat Interface as a webapp, working on both desktop and mobile devices.

Tech Stack:

- SvelteKit with the latest runes syntax
- sqlite db for data storage
- docker to bundle everything into a single docker container

Design:

- The design should be minimal in appearance and focus on clarity/transparency about what is happening.

Authentication:

- Use better-auth to implement login/sign up functionality
- Add env vars to disable sign up, and username/password login
- Add the option to configure OIDC as the only login provider

Features:

- Chat interface, that allows me to ask the AI questions
  - Include basic features such as:
    - uploading images
    - speech to text (use on the native device features)
    - add option to pick the used model directly in the chat ui
    - add option to not include the long term memory in the prompt
    - basic md rendering, to allow agents to print out things like code, headings, ...
    - chat/agent mode to allow the AI to perform longer tasks
- Build up long term memory based of the conversations with the AI agent
  - The memory area, should use googles OKF spec to manage the internal knowledgebase: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
  - It should be mounted to a dedicated volume
- Conversation history as a toggleable bar on the left, which can be expanded
- A deep research area, which thoughoughly researches a topic and presents you with a final report. Created in multiple rounds (markdown, rendered in the ui)
- A agent area, where agents can be created and run based on a trigger:
  - Either a schedule
  - HTTP call with an API key
- Add a file area, separate from the memory area, which can be used by agents to store files temporarily and perform file operations from the mcp servers. This doesn't need to be visible in the ui as of now. But would be cool if each conversation get's it's own folder, that it can work in. The folder could then in the future be made available to the end user at some point.

- A settings area, where:
  - the models for memory creation, default chat model, ... can be managed
  - multiple providers can be connected, initially I want anthropic, openai compatible, LM Studio
  - API key area, where API keys for this app can be created/managed
  - MCP area, where mcp servers can be connected/managed
    - By default the ai should have access to basic tools, such as:
      - webfetch
      - getting the current time/date
      - searching/creating memory (from above)
      - searching previous chats
      - creating/reading/updating/deleting/searching documents in a dedicated documents volume mounted to the container
      - bash commands, such as ls, grep, glob in the documents area
      - settings mcp server to manage the settings of this ai-chat app
