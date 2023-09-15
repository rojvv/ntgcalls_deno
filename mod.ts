import { AlignedStruct, i32, u16, u64, u8 } from "./deps.ts";

const audioDescription_struct = new AlignedStruct({
  inputMode: i32,
  input: u64,
  sampleRate: u16,
  bitsPerSample: u8,
  channelCount: u8,
});

const videoDescription_struct = new AlignedStruct({
  inputMode: i32,
  input: u64,
  width: u16,
  height: u16,
  fps: u8,
});

export enum SourceType {
  File,
  Shell,
  FFmpeg,
}

export interface AudioSource {
  /** Defaults to SourceType.File */
  type?: SourceType;
  source: string;
  /** Defaults to 48k */
  sampleRate?: number;
  /** Defaults to 16 */
  bitsPerSample?: number;
  /** Defaults to 2 */
  channelCount?: number;
}

export interface VideoSource {
  /** Defaults to SourceType.File */
  type?: SourceType;
  source: string;
  /** Defaults to 1280 */
  width?: number;
  /** Defaults to 720 */
  height?: number;
  /** Defaults to 24 */
  fps?: number;
}

function getMediaDescription(audio?: AudioSource, video?: VideoSource) {
  const mediaDescription = new Uint8Array(16);
  const mediaDescriptionDv = new DataView(mediaDescription.buffer);

  if (audio !== undefined) {
    const a = new Uint8Array(24);
    audioDescription_struct.write({
      inputMode: audio.type ?? SourceType.File,
      input: BigInt(
        Deno.UnsafePointer.value(
          Deno.UnsafePointer.of(new TextEncoder().encode(`${audio.source}\0`)),
        ),
      ),
      sampleRate: audio.sampleRate ?? 48_000,
      bitsPerSample: audio.bitsPerSample ?? 16,
      channelCount: audio.channelCount ?? 2,
    }, new DataView(a.buffer));
    mediaDescriptionDv.setBigUint64(
      0,
      BigInt(Deno.UnsafePointer.value(Deno.UnsafePointer.of(a))),
      true,
    );
  }

  if (video !== undefined) {
    const v = new Uint8Array(24);
    videoDescription_struct.write({
      inputMode: video.type ?? SourceType.File,
      input: BigInt(
        Deno.UnsafePointer.value(
          Deno.UnsafePointer.of(new TextEncoder().encode(`${video.source}\0`)),
        ),
      ),
      width: video.width ?? 1280,
      height: video.height ?? 720,
      fps: video.fps ?? 24,
    }, new DataView(v.buffer));
    mediaDescriptionDv.setBigUint64(
      8,
      BigInt(Deno.UnsafePointer.value(Deno.UnsafePointer.of(v))),
      true,
    );
  }

  return mediaDescription;
}

export enum StreamType {
  Audio,
  Video,
}

export enum StreamStatus {
  Playing,
  Paused,
  Idling,
}

const ext = Deno.build.os == "darwin"
  ? "dylib"
  : Deno.build.os == "windows"
  ? "dll"
  : "so";
const lib = Deno.dlopen(`libntgcalls.${ext}`, {
  ntg_init: { parameters: [], result: "u32" },
  ntg_destroy: { parameters: ["u32"], result: "i32" },
  ntg_get_params: {
    parameters: [
      "u32",
      "i64",
      { struct: [{ struct: ["pointer", "pointer"] }] },
      "buffer",
      "i32",
    ],
    result: "i32",
  },
  ntg_connect: {
    parameters: ["u32", "i64", "buffer"],
    result: "i32",
  },
  ntg_change_stream: {
    parameters: ["u32", "i32", { struct: ["pointer", "pointer"] }],
    result: "i32",
  },
  ntg_pause: { parameters: ["u32", "i64"], result: "i32" },
  ntg_resume: { parameters: ["u32", "i64"], result: "i32" },
  ntg_mute: { parameters: ["u32", "i64"], result: "i32" },
  ntg_unmute: { parameters: ["u32", "i64"], result: "i32" },
  ntg_stop: { parameters: ["u32", "i64"], result: "i32" },
});

const BUFFER_LEN = 4096;

export class NTCallsError extends Error {
  constructor(public readonly code: number) {
    super(`Error code: ${code}`);
  }
}

export class NTCalls {
  private id: number;

  constructor() {
    this.id = lib.symbols.ntg_init();
  }

  getParams(
    chatId: number,
    sources?: { audio?: AudioSource; video?: VideoSource },
  ) {
    const params = new Uint8Array(BUFFER_LEN);
    const mediaDescription = getMediaDescription(
      sources?.audio,
      sources?.video,
    );
    const length = lib.symbols.ntg_get_params(
      this.id,
      chatId,
      mediaDescription,
      params,
      params.byteLength,
    );
    if (length < 1) {
      throw new NTCallsError(length);
    }
    return new TextDecoder().decode(params.slice(0, length));
  }

  connect(chatId: number, params: string) {
    const i = lib.symbols.ntg_connect(
      this.id,
      chatId,
      new TextEncoder().encode(params + "\0"),
    );
    if (i != 0) {
      throw new NTCallsError(i);
    }
  }

  private static checkErr(number: number) {
    if (number != 0) {
      throw new NTCallsError(number);
    }
  }

  setSources(
    chatId: number,
    sources?: { audio?: AudioSource; video?: VideoSource },
  ) {
    const mediaDescription = getMediaDescription(
      sources?.audio,
      sources?.video,
    );
    NTCalls.checkErr(
      lib.symbols.ntg_change_stream(this.id, chatId, mediaDescription),
    );
  }

  private static toBool(number: number) {
    if (number == 0) {
      return true;
    } else if (number == 1) {
      return false;
    } else {
      throw new NTCallsError(number);
    }
  }

  pause(chatId: number) {
    return NTCalls.toBool(lib.symbols.ntg_pause(this.id, chatId));
  }

  resume(chatId: number) {
    return NTCalls.toBool(lib.symbols.ntg_resume(this.id, chatId));
  }

  mute(chatId: number) {
    return NTCalls.toBool(lib.symbols.ntg_mute(this.id, chatId));
  }

  unmute(chatId: number) {
    return NTCalls.toBool(lib.symbols.ntg_unmute(this.id, chatId));
  }

  stop(chatId: number) {
    NTCalls.checkErr(lib.symbols.ntg_stop(this.id, chatId));
  }

  destroy() {
    NTCalls.checkErr(lib.symbols.ntg_destroy(this.id));
  }
}
