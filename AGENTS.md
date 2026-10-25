# Ask X — notes for agents

## Releasing a new build

- `@name` stays plain `Ask X`; the version lives only in `@version` (`src/meta-info.js`). A versioned name installs each release as a separate Violentmonkey script.
- Every build carries `@updateURL` and `@downloadURL` pointing to `https://raw.githubusercontent.com/0-V-linuxdo/Ask-X/main/Ask%20X.user.js` (set in `src/meta.js`). Keep them.
- **Never ask TC to click Install.** Update the installed script yourself through the Helium DevTools MCP (skill `helium-update-userscript`). Violentmonkey's extension id is `jinjaccalgkegednnccohejagnlnfdag`; Ask X is script id `1292`.
  1. `npm run verify`, then bump `@version` if it is not already new.
  2. Once the build is pushed to `0-V-linuxdo/Ask-X` (main, `Ask X.user.js`): open `chrome-extension://jinjaccalgkegednnccohejagnlnfdag/options/index.html` with `new_page` (`background: true`) and send `{ cmd: 'CheckUpdate', data: { ids: [1292] } }` (it resolves with the number updated, in about 1.5 s; a bare `data: 1292` is read as "no ids" and checks and updates every installed script), then read the version back with `GetData`. raw.githubusercontent.com caches for about 5 minutes after a push.
  3. Before it is pushed (local testing): serve `dist/` (`python3 -m http.server 8766 --bind 127.0.0.1` inside `dist/`) and, on the same options page, `fetch('http://127.0.0.1:8766/ask-x.user.js')` and send `{ cmd: 'ParseScript', data: { id: 1292, code } }`. This updates script 1292 in place, with no confirm page.
  4. Navigate that same tab to an X page to check the new code runs, then `close_page` it. That tab is the only one to close.
- **After every update, close the pages you opened for it** (the Violentmonkey tab you navigated, any install or blank tabs) and stop the local server. Leave TC's own tabs alone; other agents share this browser, so check `location.href` before acting on a selected tab.

## Testing

- Verify in Helium (debug connection) on both Grok surfaces: the side drawer on the timeline and the full page `x.com/i/grok` (empty chat, Private chat, a conversation, History panel open).
- Grok Private Chat test messages are fine to send; normal chats or posting on X need TC's OK first.
