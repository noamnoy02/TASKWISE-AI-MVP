const els = {
  getStartedBtn: document.getElementById("getStartedBtn"),
  returningUserBtn: document.getElementById("returningUserBtn")
};

let opts = {};

export function initWelcomeScreen(options = {}) {
  opts = options;

  els.getStartedBtn.addEventListener("click", () => {
    setMode("new");
    if (opts.onGetStarted) opts.onGetStarted();
  });

  els.returningUserBtn.addEventListener("click", () => {
    setMode("returning");
    if (opts.onReturning) opts.onReturning();
  });
}

function setMode(mode) {
  sessionStorage.setItem("taskwise_entry_mode", mode);
}
