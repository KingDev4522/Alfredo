export const LEFT_HAND_COLOR = "#FFB627";
export const RIGHT_HAND_COLOR = "#22E55F";
export const HAND_JOINT_COLOR = "#FFFFFF";
export const BODY_COLOR = "#3DF5FF";

export function handColorFor(categoryName) {
  return categoryName === "Left" ? LEFT_HAND_COLOR : RIGHT_HAND_COLOR;
}
