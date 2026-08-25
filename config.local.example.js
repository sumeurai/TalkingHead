/** Copy to config.local.js for local maintainer overrides (do not commit).
 *  Does not auto-fill the Developer sandbox form.
 *  Omit keys or leave blank to fall back to demo/assets-cache.json for Quick demo. */
export default {
  emoteFile: "./demo/assets/welcome-emote.json",
  audioFile: "./demo/assets/welcome.wav",
  // Quick demo model: local directory first, then downloadLink fallback.
  // modelDir: "./demo/models/YOUR_MODEL_ID/",
  // modelFiles: ["fileA", "fileB"],
  // downloadLink: "",
  // Event ping API origin (createAvatar onReady). Default: https://api.sumeruai.us
  // siteOrigin: "https://api.sumeruai.us",
};
