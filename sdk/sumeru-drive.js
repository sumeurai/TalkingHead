/**
 * Drive a mounted TalkingHead avatar from audio + /audio-to-face/dt.
 * /dt returns lip-sync only (AK/ABI/ATI/API). Playback audio is the file you send.
 * Use after createAvatar() + auth — same flow as Developer sandbox.
 */

import { audioToFaceDt, blobToBase64 } from "./sumeru-atf-api.js";

/** POST /audio-to-face/dt → AvatarJS drive payload (your audio + unpacked lip-sync). */
export async function buildDriveFromAudioBase64(token, { modelId, audioBase64 }) {
  return audioToFaceDt(token, { modelId, audioBase64 });
}

/** Local audio file → buildDriveFromAudioBase64. */
export async function buildDriveFromAudioFile(token, { modelId, file }) {
  const audioBase64 = await blobToBase64(file);
  return buildDriveFromAudioBase64(token, { modelId, audioBase64 });
}

/** Feed decoded drive data to a mounted avatar (handles unlockAudio + stop). */
export function playDriveOnAvatar(avatar, driveData) {
  if (!driveData?.AK || !driveData?.ABI) {
    throw new Error("Drive payload missing emote fields");
  }
  avatar.unlockAudio();
  avatar.stop();
  avatar.drive(driveData, false);
  return driveData;
}

/** Audio base64 → /dt → play. */
export async function driveFromAudioBase64(avatar, token, { modelId, audioBase64 }) {
  const driveData = await buildDriveFromAudioBase64(token, { modelId, audioBase64 });
  return playDriveOnAvatar(avatar, driveData);
}

/** Audio file → /dt → play. */
export async function driveFromAudioFile(avatar, token, { modelId, file }) {
  const driveData = await buildDriveFromAudioFile(token, { modelId, file });
  return playDriveOnAvatar(avatar, driveData);
}
