import { APP_ICON } from './icons.js';

import { META } from './meta-info.js';

export const VERSION = META.version;
export const RELEASE = META.release;
export const NAME = META.name;

export const METADATA = `// ==UserScript==
// @name         ${NAME}
// @namespace    0_V userscripts/Ask X
// @version      ${VERSION}
// @update-log   [${RELEASE}] v${VERSION} - The "reply done" toast only appears while the Grok drawer is minimised, never while it is open (also with the tab in the background). Write/send toasts stay quiet when the result is already in the open drawer; errors and warnings still show.
// @description  Select text on X and ask Grok in the side drawer: opens a new chat by default, can use Private Chat, with a customizable quote template and quick-prompt buttons.
// @updateURL    https://raw.githubusercontent.com/0-V-linuxdo/Ask-X/main/Ask%20X.user.js
// @downloadURL  https://raw.githubusercontent.com/0-V-linuxdo/Ask-X/main/Ask%20X.user.js
// @match        https://x.com/*
// @match        https://www.x.com/*
// @match        https://mobile.x.com/*
// @match        https://m.x.com/*
// @match        https://twitter.com/*
// @match        https://www.twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://m.twitter.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      *
// @icon         data:image/svg+xml,${encodeURIComponent(APP_ICON)}
// ==/UserScript==`;
