// Registration order is also the order of the plugin list.
import askGrok from './askGrok.js';
import autoRetry from './autoRetry.js';
import betterLinks from './betterLinks.js';
import grokState from './grokState.js';
import completeToast from './completeToast.js';
import composerOpacity from './composerOpacity.js';
import customGreeting from './customGreeting.js';
import drawerHeight from './drawerHeight.js';
import followUp from './followUp.js';
import grokScrollbars from './grokScrollbars.js';
import hideFollowUps from './hideFollowUps.js';
import markdown from './markdown.js';
import inputHistory from './inputHistory.js';
import messageNavigator from './messageNavigator.js';
import modelChips from './modelChips.js';
import responseNotification from './responseNotification.js';
import statusBadge from './statusBadge.js';
import incognito from './incognito.js';
import menuCommands from './menuCommands.js';
import newChat from './newChat.js';
import noGrokComLink from './noGrokComLink.js';
import noLinkAccounts from './noLinkAccounts.js';
import postGrok from './postGrok.js';
import noSideScroll from './noSideScroll.js';
import postTypography from './postTypography.js';
import noVoiceMode from './noVoiceMode.js';
import noSuggestions from './noSuggestions.js';
import quickPrompts from './quickPrompts.js';
import quoteFormat from './quoteFormat.js';
import settings from './settings.js';
import toasts from './toasts.js';
import userQuotes from './userQuotes.js';

// Markdown before UserQuotes: it rebuilds a message first, then UserQuotes
// decorates the quote lines of the result.
export const ALL_PLUGINS = [
  askGrok, newChat, incognito, quoteFormat, quickPrompts, followUp, postGrok,
  markdown, userQuotes, betterLinks, postTypography, customGreeting, drawerHeight, composerOpacity,
  grokScrollbars, noSideScroll, modelChips,
  messageNavigator, inputHistory, responseNotification, completeToast, statusBadge, grokState,
  autoRetry,
  toasts, menuCommands, noSuggestions, hideFollowUps, noVoiceMode, noGrokComLink, noLinkAccounts, settings
];
