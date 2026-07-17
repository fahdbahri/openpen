import io from 'socket.io-client';

const socket = new io.connect("http://0.0.0.0:10000/", {transports: ['websocket']});

let bufferSize = 2048,
  AudioContext,
  context,
  processor,
  input,
  globalStream;

let AudioStreamer = {
  initRecording: function (transcribeConfig, onData, onError) {
    socket.emit('startGoogleCloudStream', {...transcribeConfig});
    AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
    processor = context.createScriptProcessor(bufferSize, 1, 1);
    processor.connect(context.destination);
    context.resume();

    const handleSuccess = function (stream) {
      globalStream = stream;
      input = context.createMediaStreamSource(stream);
      input.connect(processor);

      processor.onaudioprocess = function (e) {
        microphoneProcess(e);
      };
    };

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(handleSuccess);

    if (onData) {
      socket.on('speechData', (response) => {
        onData(response.data, response.isFinal);
      });
    }

    socket.on('googleCloudStreamError', (error) => {
      if (onError) onError('error: ', error);
      closeAll();
    });

    socket.on('endGoogleCloudStream', () => {
      closeAll();
    });
  },

  stopRecording: function () {
    socket.emit('endGoogleCloudStream');
    closeAll();
  }
}

export default AudioStreamer;

function microphoneProcess(e) {
  const left = e.inputBuffer.getChannelData(0);
  const left16 = convertFloat32ToInt16(left);
  socket.emit('binaryAudioData', left16);
}

function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  let buf = new Int16Array(l / 3);
  while (l--) {
    if (l % 3 === 0) {
      buf[l / 3] = buffer[l] * 0xFFFF;
    }
  }
  return buf.buffer
}

function closeAll() {
  socket.off('speechData');
  socket.off('googleCloudStreamError');
  if (globalStream) {
    globalStream.getTracks().forEach(t => t.stop());
  }

  if (processor) {
    if (input) {
      try { input.disconnect(processor); } catch (e) { console.warn('disconnect failed'); }
    }
    processor.disconnect(context.destination);
  }
  if (context) {
    context.close().then(function () {
      input = null;
      processor = null;
      context = null;
      AudioContext = null;
    });
  }
}
