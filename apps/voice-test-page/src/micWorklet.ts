export const MIC_WORKLET_SOURCE = `
class PCMWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.threshold = (options && options.processorOptions && options.processorOptions.threshold) || 2048;
    this.buffer = new Float32Array(this.threshold);
    this.writeIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.writeIndex++] = channel[i];
      if (this.writeIndex >= this.threshold) {
        const copy = this.buffer.slice(0);
        this.port.postMessage(copy.buffer, [copy.buffer]);
        this.writeIndex = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-worklet', PCMWorklet);
`;
