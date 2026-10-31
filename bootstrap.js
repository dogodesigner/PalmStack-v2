// Keep loading/connection notices available even if a game module cannot load.
(() => {
  const byId = (id) => document.getElementById(id);
  const notice = byId("startup-notice");
  const message = byId("startup-message");
  const retry = byId("reload-button");
  function connectionStatus() {
    // This is a hint, not a reason to block local gameplay.
    byId("connection-notice").hidden = navigator.onLine !== false;
  }
  window.addEventListener("offline", connectionStatus);
  window.addEventListener("online", connectionStatus);
  connectionStatus();
  retry.addEventListener("click", () => window.location.reload());
  const slowLoad = setTimeout(() => {
    message.textContent = "تحميل اللعبة يأخذ وقتًا أطول من المعتاد. يمكنك الانتظار أو إعادة تحميل الصفحة.";
    retry.hidden = false;
  }, 12000);
  import("./game.js").then(() => {
    clearTimeout(slowLoad);
    notice.hidden = true;
    for (const id of ["start-button", "sound-toggle", "leaderboard-button"]) byId(id).disabled = false;
  }).catch((error) => {
    clearTimeout(slowLoad);
    notice.classList.add("notice--error");
    message.textContent = "تعذّر تجهيز اللعبة. تحقق من اتصالك ثم أعد تحميل الصفحة. إذا استمرت المشكلة، حاول لاحقًا.";
    retry.hidden = false;
    console.error("Game initialization failed:", error);
  });
})();
