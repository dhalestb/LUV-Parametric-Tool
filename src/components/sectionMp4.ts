import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const FPS = 30;

/** Pack section stills into a 15 second MP4, holding each 1-foot cut for an equal share of the duration. */
export async function encodeSectionMp4(frames: ImageBitmap[], seconds = 15) {
  if (!frames.length || typeof VideoEncoder === 'undefined') throw new Error('This browser cannot encode an MP4.');
  const width = frames[0].width - (frames[0].width % 2);
  const height = frames[0].height - (frames[0].height % 2);
  if (width < 2 || height < 2) throw new Error('The section frame is too small to export.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the section video.');
  const config: VideoEncoderConfig = { codec: 'avc1.42001f', width, height, bitrate: 4_000_000, framerate: FPS };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('This browser cannot encode an H.264 MP4.');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width, height, frameRate: FPS }, fastStart: 'in-memory' });
  let encodeError: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => { encodeError = error instanceof Error ? error : new Error(String(error)); },
  });
  encoder.configure(config);
  const total = FPS * seconds;
  const duration = Math.round(1_000_000 / FPS);
  for (let index = 0; index < total; index += 1) {
    if (encodeError) throw encodeError;
    const source = frames[Math.min(frames.length - 1, Math.floor(index * frames.length / total))];
    ctx.fillStyle = '#080b10';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const frame = new VideoFrame(canvas, { timestamp: index * duration, duration });
    encoder.encode(frame, { keyFrame: index % FPS === 0 });
    frame.close();
  }
  await encoder.flush();
  if (encodeError) throw encodeError;
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}
