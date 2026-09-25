import { StudioPage } from "../components/StudioPage";
import { ReviewFlagged } from "../components/ReviewFlagged";

export function DeletePage() {
  return (
    <StudioPage
      title={
        <>
          Surgical cleanup, <span className="text-amber-bright">not a wipe.</span>
        </>
      }
      lede="Search for a sign, replay every matching take as a skeleton, and remove only recordings that are damaging recognition quality. Other takes remain untouched."
      signals={[
        { label: "Delete scope", value: "One take" },
        { label: "Review mode", value: "Skeleton" },
        { label: "Bulk actions", value: "Off" },
        { label: "Reversible", value: "Until saved" },
      ]}
    >
      <ReviewFlagged />
    </StudioPage>
  );
}
