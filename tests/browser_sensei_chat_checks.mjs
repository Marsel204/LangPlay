// Exercise the production Send/Enter handlers and real layout with deferred replies.
import assert from 'node:assert/strict';

export async function checkSenseiChat({ evaluate }) {
  async function waitFor(expression) {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail(`Chat check timed out: ${expression}`);
  }
  const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function send(text, count) {
    await evaluate(`document.getElementById('lp-chat-input').value = ${JSON.stringify(text)}`);
    await click('lp-chat-send-btn');
    await waitFor(`window.chatRequests.length === ${count}`);
  }
  async function reply(index, text, ok = true) {
    await evaluate(`window.chatRequests[${index}].resolve({ok:${ok},status:${ok ? 200 : 504},json:async () => (${JSON.stringify(ok ? { status: 'success', reply: text } : { status: 'error', message: text })})})`);
    await waitFor(`!document.getElementById('lp-chat-send-btn').disabled`);
  }
  const geometry = () => evaluate(`(() => {
    const box = document.getElementById('lp-chat-messages');
    const last = box.lastElementChild;
    return {top:box.scrollTop,max:box.scrollHeight-box.clientHeight,replyTop:last.getBoundingClientRect().top-box.getBoundingClientRect().top,replyBottom:last.getBoundingClientRect().bottom-box.getBoundingClientRect().bottom,pageY:window.scrollY};
  })()`);

  await click('lp-tab-chat-btn');
  await send('First question', 1);
  assert.equal(await evaluate('document.getElementById("lp-chat-messages").getAttribute("aria-busy")'), 'true');
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".lp-chat-chip")).every(button => button.disabled)'), true);
  await evaluate(`const input=document.getElementById('lp-chat-input'); input.value='Second question'; input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  assert.equal(await evaluate('window.chatRequests.length'), 1, 'Enter must not launch another request while busy');
  assert.equal(await evaluate('document.getElementById("lp-chat-input").value'), 'Second question');

  const longReply = Array.from({ length: 45 }, (_, i) => `Explanation line ${i}`).join('\n');
  await reply(0, longReply);
  let state = await geometry();
  assert.ok(Math.abs(state.replyTop) < 2, JSON.stringify(state));
  assert.ok(state.top < state.max - 100, 'A long reply starts at its beginning');

  await click('lp-chat-send-btn');
  await waitFor('window.chatRequests.length === 2');
  const messages = await evaluate('window.chatRequests[1].body.messages.slice(1)');
  assert.deepEqual(messages, [
    { role: 'user', content: 'First question' },
    { role: 'assistant', content: longReply },
    { role: 'user', content: 'Second question' },
  ]);
  await evaluate('document.getElementById("lp-chat-messages").scrollTop=0');
  const reading = await geometry();
  await reply(1, longReply);
  state = await geometry();
  assert.equal(state.top, reading.top, 'A delayed reply does not interrupt reading older messages');
  assert.equal(state.pageY, reading.pageY, 'A reply does not move the YouTube page');

  await send('Retry question', 3);
  await reply(2, 'Model timed out', false);
  assert.equal((await geometry()).top, 0, 'Errors preserve the reading position too');
  assert.equal(await evaluate('document.getElementById("lp-chat-messages").lastElementChild.textContent.includes("Model timed out")'), true);
  await send('Retry question', 4);
  assert.equal(await evaluate('window.chatRequests[3].body.messages.filter(message=>message.content==="Retry question").length'), 1);
  await reply(3, 'Successful retry');

  await evaluate('document.getElementById("lp-chat-messages").scrollTop=document.getElementById("lp-chat-messages").scrollHeight');
  await send('Short answer please', 5);
  await reply(4, 'Short answer');
  state = await geometry();
  assert.ok(Math.abs(state.top - state.max) < 2);
  assert.ok(state.replyTop >= 0 && state.replyBottom <= 2, 'A short answer remains fully visible when following the conversation');

  await send('While viewing breakdown', 6);
  await evaluate('document.getElementById("lp-chat-messages").scrollTop=100');
  const savedTop = (await geometry()).top;
  await click('lp-tab-breakdown-btn');
  await reply(5, longReply);
  await click('lp-tab-chat-btn');
  assert.equal((await geometry()).top, savedTop, 'A reply arriving in a hidden tab does not reset the saved reading position');
  await click('lp-tab-breakdown-btn');
  return { longReplyStart: true, readingPosition: true, pagePosition: true, orderedHistory: true, draftPreserved: true, retry: true, hiddenTab: true };
}
