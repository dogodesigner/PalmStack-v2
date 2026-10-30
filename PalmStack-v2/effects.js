export class Celebration {
  constructor(layer, boardShell, mediaQuery) {
    this.layer = layer;
    this.boardShell = boardShell;
    this.mediaQuery = mediaQuery;
    this.timer = null;
  }

  clear() {
    clearTimeout(this.timer);
    this.layer.replaceChildren();
    this.boardShell.classList.remove("is-celebrating");
  }

  play() {
    this.clear();
    if (this.mediaQuery.matches || document.hidden) return;
    this.boardShell.classList.add("is-celebrating");
    const colors = ["#b993d6", "#efbd61", "#ffffff", "#8e76b2"];
    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    for (let index = 0; index < 36; index++) {
      const petal = document.createElement("span");
      petal.className = index % 3 ? "petal" : "petal petal--spark";
      petal.style.setProperty("--petal-color", colors[index % colors.length]);
      petal.style.setProperty("--petal-x", `${(Math.random() - 0.5) * width * 1.4}px`);
      petal.style.setProperty("--petal-y", `${(Math.random() - 0.4) * height * 1.25}px`);
      petal.style.setProperty("--petal-rotation", `${Math.random() * 600}deg`);
      petal.style.setProperty("--petal-delay", `${(index % 6) * 45}ms`);
      this.layer.append(petal);
    }
    this.timer = setTimeout(() => this.clear(), 1900);
  }
}
