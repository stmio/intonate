export const intonate = async () => {
  const FFT_SIZE = 2048;

  let rafID;
  let audioContext;
  let analyser;
  let callbacks = [];

  const awaken = async () => {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          googEchoCancellation: "false",
          googAutoGainControl: "false",
          googNoiseSuppression: "false",
          googHighpassFilter: "false",
        },
        optional: [],
      },
    });

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    audioContext.createMediaStreamSource(audioStream).connect(analyser);
  };

  const listen = () => {
    const buffer = new Float32Array(FFT_SIZE);
    analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);

    // Volume calculations (experimental)
    let sumSquares = 0.0;
    for (const amplitude of buffer) {
      sumSquares += Math.pow(amplitude, 2);
    }
    let volume = Math.sqrt(sumSquares / buffer.length);
    //

    callbacks.forEach((fn) =>
      fn(frequency ? valuesAtFrequency(frequency, volume) : {})
    );

    rafID = requestAnimationFrame(listen);
  };

  const stop = (id) => cancelAnimationFrame(id);
  const subscribe = (fn) => (callbacks = [...callbacks, fn]);
  const unsubscribe = (fn) => (callbacks = callbacks.filter((el) => el !== fn));

  await awaken();

  return {
    listen: () => listen(),
    stop: () => stop(rafID),
    subscribe: (fn) => subscribe(fn),
    unsubscribe: (fn) => unsubscribe(fn),
  };
};

const NOTES = [
  "C",
  ["C#", "D♭"],
  "D",
  ["D#", "E♭"],
  "E",
  "F",
  ["F#", "G♭"],
  "G",
  ["G#", "A♭"],
  "A",
  ["A#", "B♭"],
  "B",
];

const CONCERT_PITCH = 440;
const A4_MIDI = 69;
const A = Math.pow(2, 1 / 12);
const C0_PITCH = 16.35;

const valuesAtFrequency = (freq, vol = undefined) => {
  const N = Math.round(12 * Math.log2(freq / CONCERT_PITCH));
  const Fn = CONCERT_PITCH * Math.pow(A, N);
  const noteIndex = (N + A4_MIDI) % 12;
  const octave = Math.floor(Math.log2(Fn / C0_PITCH));

  return {
    frequency: freq,
    note: NOTES[noteIndex][0],
    enharmonicNote: NOTES[noteIndex][1] || NOTES[noteIndex][0],
    noteFrequency: Fn,
    deviation: freq - Fn,
    octave,
    volume: vol,
  };
};

const autoCorrelate = (buf, sampleRate) => {
  const RMS = Math.sqrt(
    buf.reduce((acc, el) => acc + Math.pow(el, 2), 0) / buf.length
  );
  if (RMS < 0.001) return NaN;

  const THRES = 0.2;
  let r1 = 0;
  let r2 = buf.length - 1;
  for (let i = 0; i < buf.length / 2; ++i) {
    if (Math.abs(buf[i]) < THRES) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < buf.length / 2; ++i) {
    if (Math.abs(buf[buf.length - i]) < THRES) {
      r2 = buf.length - i;
      break;
    }
  }

  const buf2 = buf.slice(r1, r2);
  const c = new Array(buf2.length).fill(0);
  for (let i = 0; i < buf2.length; ++i) {
    for (let j = 0; j < buf2.length - i; ++j) {
      c[i] = c[i] + buf2[j] * buf2[j + i];
    }
  }

  let d = 0;
  for (; c[d] > c[d + 1]; ++d);

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < buf2.length; ++i) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;

  let x1 = c[T0 - 1];
  let x2 = c[T0];
  let x3 = c[T0 + 1];
  let a = (x1 + x3 - 2 * x2) / 2;
  let b = (x3 - x1) / 2;

  return sampleRate / (a ? T0 - b / (2 * a) : T0);
};
