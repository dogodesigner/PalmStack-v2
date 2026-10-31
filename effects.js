export class Celebration {
  constructor(layer, boardShell, mediaQuery, resultPanel = null, nextButton = null) {
    this.layer = layer;
    this.boardShell = boardShell;
    this.mediaQuery = mediaQuery;
    this.resultPanel = resultPanel;
    this.nextButton = nextButton;
    this.timer = null;
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    this.layer.replaceChildren();
    this.boardShell.classList.remove("is-celebrating");
    this.resultPanel?.classList.remove("is-revealing");
    this.nextButton?.classList.remove("is-inviting");
  }

  play() {
    this.clear();
    if (this.mediaQuery.matches || document.hidden) return;
    this.boardShell.classList.add("is-celebrating");
    this.resultPanel?.classList.add("is-revealing");
    this.nextButton?.classList.add("is-inviting");
    const colors = ["#ac88c8", "#efbc61", "#a4b76e", "#eeb394", "#fff5d8"];
    const shapes = ["circle", "star", "heart"];
    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    for (let index = 0; index < 36; index++) {
      // Two balanced fans rise from the lower corners, then drift down.
      const left = index % 2 === 0;
      const particle = document.createElement("span");
      const shape = document.createElement("i");
      particle.className = "confetti";
      shape.className = `confetti-shape confetti-shape--${shapes[index % shapes.length]}`;
      const x = (left ? 1 : -1) * width * (0.08 + Math.random() * 0.62);
      const rise = height * (0.43 + Math.random() * 0.42);
      particle.style.setProperty("--origin", left ? "8%" : "92%");
      particle.style.setProperty("--confetti-color", colors[index % colors.length]);
      particle.style.setProperty("--confetti-size", `${7 + Math.random() * 7}px`);
      particle.style.setProperty("--peak-x", `${x * 0.7}px`);
      particle.style.setProperty("--peak-y", `${-rise}px`);
      particle.style.setProperty("--end-x", `${x}px`);
      particle.style.setProperty("--end-y", `${height * 0.15}px`);
      particle.style.setProperty("--confetti-turn", `${(left ? 1 : -1) * (150 + Math.random() * 250)}deg`);
      particle.style.setProperty("--confetti-delay", `${Math.floor(index / 12) * 100 + Math.random() * 80}ms`);
      particle.append(shape);
      this.layer.append(particle);
    }
    this.timer = setTimeout(() => this.clear(), 2900);
  }
}
