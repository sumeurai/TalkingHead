/**
 * Drive a mounted TalkingHead avatar from audio or TTS text.
 * Use after createAvatar() + auth — same flow as Developer sandbox.
 */

import { synthesizeTtsLong, audioToFaceDt, blobToBase64 } from "./sumeru-atf-api.js";

/** POST /audio-to-face/dt → AvatarJS drive payload. */
export async function buildDriveFromAudioBase64(token, { modelId, audioBase64 }) {
  return audioToFaceDt(token, { modelId, audioBase64 });
}

/** TTS → buildDriveFromAudioBase64. Long text is split automatically. */
export async function buildDriveFromText(token, { modelId, voiceId, text, onChunk }) {
  const audioBase64 = await synthesizeTtsLong(token, { text, voiceId, onChunk });
  return buildDriveFromAudioBase64(token, { modelId, audioBase64 });
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

/** Text + voiceId → TTS → /dt → play. */
export async function driveFromText(avatar, token, { modelId, voiceId, text, onChunk }) {
  const driveData = await buildDriveFromText(token, { modelId, voiceId, text, onChunk });
  return playDriveOnAvatar(avatar, driveData);
}

/** Audio file → /dt → play. */
export async function driveFromAudioFile(avatar, token, { modelId, file }) {
  const driveData = await buildDriveFromAudioFile(token, { modelId, file });
  return playDriveOnAvatar(avatar, driveData);
}
