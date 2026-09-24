const frameLength = 16 * 1024;
const queueLimit = 256 * 1024;

// Keep one ordered write in flight and combine input arriving during its RTT.
// UTF-16 chunks fit the server's 64 KiB UTF-8 limit, including astral characters.
export const createSessionInput = (
  send: (text: string) => Promise<unknown>,
  onError: (error: unknown) => void
) => {
  let pending = '';
  let writing = false;
  let stopped = false;
  const stop = () => {
    stopped = true;
    pending = '';
  };
  const drain = async () => {
    writing = true;
    try {
      while (!stopped && pending) {
        let end = Math.min(frameLength, pending.length);
        const last = pending.charCodeAt(end - 1);
        if (end < pending.length && last >= 0xd800 && last <= 0xdbff) end--;
        const text = pending.slice(0, end);
        pending = pending.slice(end);
        await send(text);
      }
    } catch (error) {
      if (!stopped) {
        stop();
        onError(error);
      }
    } finally {
      writing = false;
    }
  };
  const push = (text: string) => {
    if (stopped || !text) return;
    if (pending.length + text.length > queueLimit) {
      stop();
      onError('Terminal input could not keep up. Reconnect before sending more text.');
      return;
    }
    pending += text;
    if (!writing) void drain();
  };
  return { push, stop };
};
