import { useState } from "react";
import { StudioPage } from "../components/StudioPage";
import { HandTracker } from "../components/HandTracker";
import { RecordingTool } from "../components/RecordingTool";

export function RecordPage() {
  const [showCameraTest, setShowCameraTest] = useState(false);

  return (
    <StudioPage
      title={
        <>
          Build the vocabulary, <span className="text-amber-bright">one rep at a time.</span>
        </>
      }
      lede="Select a sign, capture clean repetitions, review the skeleton, and keep only useful movement. Fifteen reps per sign is the target, not a hard limit."
      signals={[
        { label: "Target reps", value: "15" },
        { label: "Fixed signs", value: "25" },
        { label: "Storage", value: "Device" },
        { label: "Review", value: "Skeleton" },
      ]}
      action={{ label: "Start recording" }}
      toolId="recording-tool"
    >
      <RecordingTool />

      <div className="mt-14 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => setShowCameraTest((visible) => !visible)}
          aria-expanded={showCameraTest}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-2.5 text-[13.5px] font-medium text-neutral-200 transition-colors duration-200 hover:border-amber-bright hover:text-amber-bright active:translate-y-[1px]"
        >
          {showCameraTest ? "Close camera test" : "Open camera test"}
          <span aria-hidden="true">{showCameraTest ? "↑" : "→"}</span>
        </button>
        {showCameraTest && (
          <div className="grid w-full gap-4 rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <HandTracker />
            <p className="m-0 max-w-2xl text-center text-xs text-neutral-400">
              Hold one or both hands in frame. Confirm the skeleton tracks smoothly before recording
              production data.
            </p>
          </div>
        )}
      </div>
    </StudioPage>
  );
}
