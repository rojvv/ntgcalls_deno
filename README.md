# ntgcalls_deno

Deno bindings for [ntgcalls](https://github.com/pytgcalls/ntgcalls).

## Usage

This example uses [MTKruto](https://github.com/MTKruto/MTKruto) to start a user
client, join the group call in the chat @foobar, and stream an audio file called
output.pcm.

```ts
import {
  as,
  Client,
  types,
} from "https://deno.land/x/mtkruto/mod.ts";
import { NTCalls } from "https://esm.sh/gh/roj1512/ntgcalls_deno/mod.ts";

const client = new Client();

await client.start();

const a = await client.getInputPeer("@foobar") as types.InputPeerChannel;
const chatId = `-100${a.channelId}`;
const { fullChat } = await client.api.channels.getFullChannel({
  channel: new types.InputChannel({
    channelId: a.channelId,
    accessHash: a.accessHash,
});
if (!fullChat.call) {
  throw new Error("Group call not started");
}

const calls = new NTCalls();

const params = calls.getParams(chatId, { audio: { source: "output.pcm" } });

const result = await client.api.phone.joinGroupCall(
  call: fullChat.call,
  joinAs: new types.InputPeerSelf(),
  params: new types.DataJSON({ data: params }),
});
for (const update of result[as](types.Updates).updates) {
  if (update instanceof types.UpdateGroupCallConnection) {
    calls.connect(chatId, update.params.data);
  }
}
```
