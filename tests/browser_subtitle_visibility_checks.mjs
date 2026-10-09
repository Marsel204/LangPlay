// Real DOM/CSS and trusted keyboard/fullscreen checks, called by browser_custom_ai.mjs.
// Uses the production bundle in a YouTube-shaped fixture on an extension page.
// Only caption/translation network responses and playback cues are controlled.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkSenseiChat } from './browser_sensei_chat_checks.mjs';

export async function checkSubtitleVisibility({ root, evaluate, rpc, sessionId, localAiUrl }) {
  const [content, css] = await Promise.all([
    readFile(path.join(root, 'content.js'), 'utf8'),
    readFile(path.join(root, 'content.css'), 'utf8'),
  ]);
  const instrumented = content.replace(/\}\)\(\);\s*$/, `
    window.visibilityTestApi = {
      injectUI, checkAndInitVideo,
      setTimeline(cues) {
        activeVideoEl = document.querySelector('video');
        subtitleTimeline = cues;
        currentSubIndex = -1;
        onTimeUpdate();
      }
    };
  })();`);
  await evaluate(`(async () => {
    await chrome.storage.local.set({ linguaplay_reading_mode: 'furigana', linguaplay_panel_collapsed: true });
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());
    document.body.innerHTML = '<main><div id="movie_player" class="html5-video-player"><video></video><div class="ytp-caption-window-container"><div class="caption-window"><span class="ytp-caption-segment">猫がいる</span></div></div></div><aside id="secondary"><section id="mix-card"><details id="mix-details" open><summary>YouTube Mix</summary><div style="height:220px">Playlist tracks</div></details></section><div id="secondary-inner"><div id="related">Recommended videos</div></div></aside></main>';
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(css)} + 'body {margin:0;background:#171526;} main {display:flex;gap:20px;padding:20px;} #movie_player {position:relative;width:900px;height:510px;background:#252039;flex-shrink:0;} #secondary {width:360px;display:flex;flex-direction:column;color:white;} #mix-card {padding:12px;background:#302b45;border-radius:12px;margin-bottom:16px;} video {width:100%;height:100%;} .ytp-caption-window-container {position:absolute;bottom:100px;color:white;}';
    style.textContent += '.ytp-chrome-bottom {position:absolute;bottom:8px;left:12px;right:12px;height:40px;} .ytp-right-controls {float:right;height:100%;} .ytp-button {display:inline-flex;align-items:center;justify-content:center;width:40px;height:100%;border:0;background:transparent;color:white;vertical-align:top;} .ytp-autohide .ytp-chrome-bottom {opacity:0;pointer-events:none;}';
    document.head.appendChild(style);
    window.playerEvents = [];
    const player = document.getElementById('movie_player');
    window.mountControls = (includeCC = true) => {
      const bar = document.createElement('div');
      bar.className = 'ytp-chrome-bottom';
      bar.innerHTML = '<div class="ytp-right-controls">' + (includeCC ? '<button class="ytp-button ytp-subtitles-button" title="Subtitles" aria-pressed="true">CC</button>' : '') + '<button class="ytp-button ytp-settings-button" title="Settings">⚙</button><button class="ytp-button ytp-fullscreen-button" title="Fullscreen">⛶</button></div>';
      document.getElementById('movie_player').appendChild(bar);
    };
    ['click', 'keydown', 'keyup', 'pointerdown', 'pointerup'].forEach(name => player.addEventListener(name, () => window.playerEvents.push(name)));
    window.translationResolvers = [];
    window.completeTranslation = () => window.translationResolvers.splice(0).forEach(resolve => resolve({ok:true,json:async () => [[['A cat is here']]]}));
    window.chatRequests = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, options) => {
      if (url.endsWith('/api/ai/chat')) return new Promise(resolve => window.chatRequests.push({body:JSON.parse(options.body),resolve}));
      if (url.startsWith(${JSON.stringify(localAiUrl || 'http://fixture.invalid')}) && url.endsWith('/api/ai/analyze')) return nativeFetch(url, options);
      if (url.includes('translate.googleapis.com')) {
        return new Promise(resolve => window.translationResolvers.push(resolve));
      }
      if (url.includes('/api/captions')) {
        return Promise.resolve({ok:true,text:async () => 'WEBVTT\\n\\n00:00:00.000 --> 00:00:02.000\\n犬がいる\\n'});
      }
      return Promise.resolve({ok:false,json:async () => ({}),text:async () => ''});
    };
  })()`);
  await evaluate(instrumented);
  await evaluate('window.visibilityTestApi.injectUI()');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-controls")'), null, 'Buttons stay detached until native controls are available');
  await evaluate('window.mountControls(); window.dispatchEvent(new Event("resize")); window.savedGroup = document.getElementById("linguaplay-yt-controls")');
  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "猫がいる"');

  async function waitFor(expression) {
    for (let i = 0; i < 50; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Timed out waiting for ${expression}; state: ${JSON.stringify(await state())}`);
  }
  const stateExpression = `(() => {
    const button = document.getElementById('linguaplay-visibility-toggle');
    const display = selector => getComputedStyle(document.querySelector(selector)).display;
    const box = button.getBoundingClientRect();
    const playerBox = document.getElementById('movie_player').getBoundingClientRect();
    const panel = document.getElementById('linguaplay-yt-widget');
    const panelBox = panel.getBoundingClientRect();
    const nativeBar = document.querySelector('.ytp-chrome-bottom');
    const settings = document.getElementById('linguaplay-toggle-trigger');
    const buttonStyle = getComputedStyle(button);
    return {
      pressed: button.getAttribute('aria-pressed'), label: button.getAttribute('aria-label'), title: button.title,
      overlay: display('#linguaplay-yt-tokens-overlay'), drawer: display('#linguaplay-yt-drawer'),
      button: display('#linguaplay-visibility-toggle'), toolbar: getComputedStyle(panel).display === 'none' ? 'none' : display('#linguaplay-yt-bar'),
      settings: display('#linguaplay-toggle-trigger'), expanded: settings.getAttribute('aria-expanded'),
      nativeBarOpacity: getComputedStyle(nativeBar).opacity,
      color: buttonStyle.color, background: buttonStyle.backgroundColor, radius: buttonStyle.borderRadius, shadow: buttonStyle.boxShadow,
      buttonWidth: box.width, nativeWidth: document.querySelector('.ytp-settings-button').getBoundingClientRect().width,
      panelInside: panelBox.left >= playerBox.left && panelBox.right <= playerBox.right,
      panelAboveBar: panelBox.bottom <= nativeBar.getBoundingClientRect().top,
      panelOverflow: panel.scrollWidth > panel.clientWidth,
      eye: display('.linguaplay-eye-open'), eyeOff: display('.linguaplay-eye-off'),
      nativeOpacity: getComputedStyle(document.querySelector('.ytp-caption-window-container')).opacity,
      fallbackOpacity: getComputedStyle(document.querySelector('.caption-window')).opacity,
      tokens: document.getElementById('linguaplay-yt-tokens').textContent,
      translation: document.getElementById('lp-sentence-en').textContent,
      playerEvents: window.playerEvents,
      insidePlayer: box.left >= playerBox.left && box.right <= playerBox.right && box.top >= playerBox.top && box.bottom <= playerBox.bottom
    };
  })()`;
  const state = () => evaluate(stateExpression);
  const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  // The actual live-caption MutationObserver populates the overlay.
  await waitFor('document.getElementById("linguaplay-yt-tokens").textContent.includes("猫")');
  let current = await state();
  assert.equal(current.button, 'flex');
  assert.equal(current.toolbar, 'none');
  assert.equal(current.overlay, 'flex');
  assert.equal(current.drawer, 'none');
  assert.equal(current.eyeOff, 'none');
  assert.equal(current.insidePlayer, true);
  assert.equal(current.color, 'rgb(255, 255, 255)');
  assert.equal(current.background, 'rgba(0, 0, 0, 0)');
  assert.equal(current.radius, '0px');
  assert.equal(current.shadow, 'none');
  assert.equal(current.buttonWidth, current.nativeWidth);
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-controls").nextElementSibling.classList.contains("ytp-subtitles-button")'), true);
  assert.deepEqual(await evaluate('Array.from(document.getElementById("linguaplay-yt-controls").children, el => el.id)'), ['linguaplay-visibility-toggle', 'linguaplay-sub-status', 'linguaplay-toggle-trigger']);
  await evaluate('document.querySelector(".linguaplay-yt-token").click()');
  assert.notEqual((await state()).drawer, 'none');
  if (localAiUrl) {
    await evaluate(`chrome.storage.local.set({linguaplay_ai_provider:'antigravity',linguaplay_server_url:${JSON.stringify(localAiUrl)}})`);
    const started = Date.now();
    await click('lp-ai-btn');
    assert.equal(await evaluate('document.getElementById("lp-ai-loading").style.display'), 'block');
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.getElementById("lp-ai-loading").style.display === "none"')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(Date.now() - started >= 5000);
    assert.equal(await evaluate('document.getElementById("lp-ai-results").textContent.includes("ANTIGRAVITY CLI BREAKDOWN")'), true, 'A slow local analysis must reach the drawer instead of timing out');
    assert.equal(await evaluate('document.getElementById("lp-ai-results").textContent.includes("AI Analysis Notice")'), false);
    await evaluate(`chrome.storage.local.set({linguaplay_server_url:'http://127.0.0.1:8000'})`);
  }
  const senseiChat = await checkSenseiChat({ evaluate });
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-drawer").parentElement.id'), 'secondary', 'The drawer must use the outer sidebar, above the expanded Mix');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-drawer").getBoundingClientRect().bottom <= document.getElementById("mix-card").getBoundingClientRect().top'), true);
  const drawerTop = await evaluate('document.getElementById("linguaplay-yt-drawer").getBoundingClientRect().top');
  await evaluate('document.getElementById("mix-details").open = false');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-drawer").getBoundingClientRect().top'), drawerTop, 'Collapsing Mix must not move the translation card');
  await evaluate('document.getElementById("mix-details").open = true; const sidebar = document.getElementById("secondary"); sidebar.insertBefore(document.getElementById("mix-card"), sidebar.firstChild)');
  await waitFor('document.getElementById("secondary").firstElementChild.id === "linguaplay-yt-drawer"');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-drawer").getBoundingClientRect().bottom <= document.getElementById("mix-card").getBoundingClientRect().top'), true);
  if (process.env.VISIBILITY_SCREENSHOT_PATH) {
    const screenshot = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(process.env.VISIBILITY_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  }
  await click('linguaplay-visibility-toggle');
  current = await state();
  assert.equal(current.pressed, 'true');
  assert.equal(current.label, 'Show subtitles and translation');
  assert.equal(current.title, current.label);
  assert.equal(current.overlay, 'none');
  assert.equal(current.drawer, 'none');
  assert.equal(current.nativeOpacity, '0');
  assert.equal(current.fallbackOpacity, '0');
  assert.equal(current.eye, 'none');
  assert.notEqual(current.eyeOff, 'none');
  assert.deepEqual(current.playerEvents, []);

  // A sidebar rebuild must retain the same drawer and in-flight translation.
  await evaluate(`window.savedDrawer = document.getElementById('linguaplay-yt-drawer');
    const previousSidebar = document.getElementById('secondary');
    const replacementSidebar = previousSidebar.cloneNode(true);
    replacementSidebar.querySelector('#linguaplay-yt-drawer').remove();
    previousSidebar.replaceWith(replacementSidebar);
    window.dispatchEvent(new Event('resize'));`);
  assert.equal(await evaluate('document.getElementById("secondary").firstElementChild === window.savedDrawer'), true);
  assert.equal(await evaluate('document.querySelectorAll("#linguaplay-yt-drawer").length'), 1);
  assert.equal((await state()).drawer, 'none');
  await evaluate('document.getElementById("secondary").style.display = "none"; window.dispatchEvent(new Event("resize"))');
  assert.equal(await evaluate('window.savedDrawer.parentElement === document.body && window.savedDrawer.classList.contains("floating-fallback")'), true);
  await evaluate('document.getElementById("secondary").style.display = "flex"; window.dispatchEvent(new Event("resize"))');
  assert.equal(await evaluate('document.getElementById("secondary").firstElementChild === window.savedDrawer && !window.savedDrawer.classList.contains("floating-fallback")'), true);

  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "犬がいる"; window.completeTranslation()');
  await waitFor('document.getElementById("linguaplay-yt-tokens").textContent.includes("犬") && document.getElementById("lp-sentence-en").textContent === "A cat is here"');
  current = await state();
  assert.equal(current.overlay, 'none');
  assert.equal(current.drawer, 'none');
  await click('linguaplay-toggle-trigger');
  current = await state();
  assert.equal(current.toolbar, 'flex');
  assert.equal(current.button, 'flex');
  assert.equal(current.pressed, 'true');
  assert.equal(current.settings, 'flex');
  assert.equal(current.expanded, 'true');
  assert.equal(current.panelAboveBar, true);
  assert.equal(current.panelInside, true);
  if (process.env.VISIBILITY_PANEL_SCREENSHOT_PATH) {
    const screenshot = await rpc('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(process.env.VISIBILITY_PANEL_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
  }
  await evaluate('document.getElementById("movie_player").style.width = "420px"; window.dispatchEvent(new Event("resize"))');
  current = await state();
  assert.equal(current.panelInside, true);
  assert.equal(current.panelOverflow, false);
  assert.equal(current.panelAboveBar, true);
  await evaluate('document.getElementById("movie_player").style.width = "900px"; window.dispatchEvent(new Event("resize"))');

  // Trusted input exercises the native button's Enter and Space activation.
  async function pressKey(key, code, virtualKey, target = 'linguaplay-visibility-toggle') {
    await evaluate(`document.getElementById(${JSON.stringify(target)}).focus()`);
    for (const type of ['keyDown', 'keyUp']) {
      await rpc('Input.dispatchKeyEvent', {
        type, key, code, windowsVirtualKeyCode: virtualKey,
        ...(type === 'keyDown' && key !== 'Escape' ? { text: key === 'Enter' ? '\r' : ' ' } : {}),
      }, sessionId);
    }
  }
  await pressKey('Enter', 'Enter', 13);
  current = await state();
  assert.equal(current.pressed, 'false');
  assert.equal(current.overlay, 'flex');
  assert.notEqual(current.drawer, 'none');
  assert.ok(current.tokens.includes('犬'));
  assert.equal(current.translation, 'A cat is here');
  assert.deepEqual(current.playerEvents, []);
  await pressKey(' ', 'Space', 32);
  assert.equal((await state()).pressed, 'true');
  assert.deepEqual((await state()).playerEvents, []);
  await pressKey('Escape', 'Escape', 27, 'linguaplay-offset-add');
  current = await state();
  assert.equal(current.expanded, 'false');
  assert.equal(current.toolbar, 'none');
  assert.equal(await evaluate('document.activeElement.id'), 'linguaplay-toggle-trigger');
  await pressKey('Enter', 'Enter', 13, 'linguaplay-toggle-trigger');
  assert.equal((await state()).toolbar, 'flex');
  await evaluate('document.body.click()');
  assert.equal((await state()).toolbar, 'none');
  await evaluate('document.activeElement.blur(); document.getElementById("movie_player").classList.add("ytp-autohide")');
  assert.equal((await state()).nativeBarOpacity, '0');
  await pressKey('Enter', 'Enter', 13, 'linguaplay-toggle-trigger');
  assert.equal((await state()).nativeBarOpacity, '1', 'Focused keyboard controls must be visible');
  await click('linguaplay-collapse-btn');
  await evaluate('document.getElementById("movie_player").classList.remove("ytp-autohide"); window.playerEvents = []');

  // YouTube may replace the bar without changing the video or caption state.
  await evaluate('document.querySelector(".ytp-chrome-bottom").remove(); window.mountControls(false); window.dispatchEvent(new Event("resize"))');
  assert.equal(await evaluate('document.querySelector(".ytp-right-controls").firstElementChild === window.savedGroup'), true);
  assert.equal((await state()).pressed, 'true');
  await evaluate('document.querySelector(".ytp-chrome-bottom").remove(); window.dispatchEvent(new Event("resize"))');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-controls")'), null);
  await evaluate('window.mountControls(); window.dispatchEvent(new Event("resize")); window.visibilityTestApi.injectUI(); window.visibilityTestApi.injectUI()');
  assert.equal(await evaluate('document.querySelectorAll("#linguaplay-yt-controls").length'), 1);
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-controls") === window.savedGroup'), true);
  assert.equal((await state()).pressed, 'true');

  // Native captions stay suppressed even when the Japanese overlay disappears.
  await evaluate('document.querySelector(".ytp-caption-segment").textContent = "English caption"');
  await waitFor('!document.getElementById("linguaplay-yt-tokens-overlay").classList.contains("active")');
  assert.equal((await state()).nativeOpacity, '0');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).nativeOpacity, '1');
  await click('lp-dismiss-btn');
  await click('linguaplay-visibility-toggle');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).drawer, 'none');

  await click('linguaplay-visibility-toggle');
  await evaluate('history.pushState({}, "", "?v=next-video"); window.visibilityTestApi.checkAndInitVideo()');
  await evaluate('document.querySelector(".ytp-chrome-bottom").remove(); window.mountControls(); window.visibilityTestApi.checkAndInitVideo()');
  assert.equal(await evaluate('document.getElementById("linguaplay-yt-controls").nextElementSibling.classList.contains("ytp-subtitles-button")'), true);
  assert.equal(await evaluate('document.querySelectorAll("#linguaplay-toggle-trigger").length'), 1);
  await evaluate('window.visibilityTestApi.setTimeline([{ start:0, end:2, text:"犬がいる" }])');
  current = await state();
  assert.equal(current.pressed, 'true');
  await click('linguaplay-toggle-trigger');
  current = await state();
  assert.equal(current.toolbar, 'flex');
  assert.equal(current.panelInside, true);
  assert.equal(current.panelAboveBar, true);
  await click('linguaplay-collapse-btn');
  assert.ok(current.tokens.includes('犬'));
  assert.equal(current.overlay, 'none');
  const fullscreen = await rpc('Runtime.evaluate', {
    expression: 'document.getElementById("movie_player").requestFullscreen().then(() => !!document.fullscreenElement)',
    userGesture: true, awaitPromise: true, returnByValue: true,
  }, sessionId);
  assert.equal(fullscreen.result.value, true, JSON.stringify(fullscreen));
  await click('linguaplay-collapse-btn');
  current = await state();
  assert.equal(current.button, 'flex');
  assert.equal(current.insidePlayer, true);
  assert.equal(current.pressed, 'true');
  await click('linguaplay-toggle-trigger');
  current = await state();
  assert.equal(current.toolbar, 'flex');
  assert.equal(current.panelInside, true);
  assert.equal(current.panelAboveBar, true);
  await click('linguaplay-collapse-btn');
  await click('linguaplay-visibility-toggle');
  assert.equal((await state()).overlay, 'flex');
  await evaluate('document.exitFullscreen()');

  // Recreate all page DOM and rerun the bundle as on a full refresh.
  await rpc('Page.reload', {}, sessionId);
  await waitFor('document.readyState === "complete" && !document.getElementById("linguaplay-yt-widget")');
  assert.equal(await evaluate('document.documentElement.classList.contains("linguaplay-subtitles-hidden")'), false);
  return { liveCaptions: true, asyncTranslation: true, slowLocalAnalysis: !!localAiUrl, senseiChat, toolbar: true, keyboard: true, fullscreen: true, navigation: true, refresh: true, nativePlacement: true, autoHide: true, narrowLayout: true, replacement: true, aboveExpandedMix: true, sidebarReplacement: true, sidebarFallback: true };
}
