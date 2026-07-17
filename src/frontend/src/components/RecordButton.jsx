import { Button } from "@/components/ui/button";
import { Mic, StopCircle, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import speechToTextUtils from "../TranscribeUtilities";

export function RecordButton({
  onTranscriptionUpdate,
  onInterimUpdate,
  onRecordingStateChange,
  onSummarize,
  getFullTranscript,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [interimTranscribedData, setInterimTranscribedData] = useState("");
  const [completeTranscript, setCompleteTranscript] = useState([]);

  function handleDataReceived(data, isFinal) {
    if (isFinal) {
      setInterimTranscribedData("");
      setCompleteTranscript((old) => [...old, data]);
      onTranscriptionUpdate((oldData) => [...oldData, data]);
    } else {
      setInterimTranscribedData(data);
      onInterimUpdate(data);
    }
  }

  function getTranscriptionConfig() {
    return {
      audio: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: selectedLanguage,
      },
      interimResults: true,
    };
  }

  function onStart() {
    setIsRecording(true);
    onRecordingStateChange(true);
    speechToTextUtils.initRecording(
      getTranscriptionConfig(),
      handleDataReceived,
      (error) => {
        console.error("Error when transcribing", error);
      }
    );
  }

  function onStop() {
    setIsRecording(false);
    onRecordingStateChange(false);
    onInterimUpdate("");
    speechToTextUtils.stopRecording();

    if (interimTranscribedData) {
      setCompleteTranscript((old) => [...old, interimTranscribedData]);
      onTranscriptionUpdate((oldData) => [...oldData, interimTranscribedData]);
      setInterimTranscribedData("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={isRecording ? onStop : onStart}
        variant={isRecording ? "destructive" : "default"}
        size="sm"
        className="text-xs"
      >
        {isRecording ? (
          <StopCircle className="mr-1 h-3 w-3" />
        ) : (
          <Mic className="mr-1 h-3 w-3" />
        )}
        {isRecording ? "Stop" : "Record"}
      </Button>

      <Button
        onClick={onSummarize}
        size="sm"
        variant="secondary"
        className="text-xs"
      >
        <Sparkles className="mr-1 h-3 w-3" />
        Summarize
      </Button>
    </div>
  );
}
