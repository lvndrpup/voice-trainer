// Canvas drawing. No audio imports. See CLAUDE.md.

export interface SpectrogramRendererOptions {
  minDb?: number;
  maxDb?: number;
}

/**
 * Scrolls a log-frequency spectrogram across a canvas, one column per
 * pushColumn() call. New columns enter on the right and existing
 * content shifts one pixel left, via a self-drawImage copy rather than
 * redrawing history each frame.
 *
 * Takes pre-remapped magnitude data (see dsp.computeLogFrequencyBins) —
 * this module only draws pixels, it doesn't know what a "frequency" is.
 */
export class SpectrogramRenderer {
  #ctx: CanvasRenderingContext2D;
  #minDb: number;
  #maxDb: number;

  constructor(canvas: HTMLCanvasElement, options: SpectrogramRendererOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not acquire a 2D rendering context for the spectrogram canvas.");
    }
    this.#ctx = ctx;
    this.#minDb = options.minDb ?? -100;
    this.#maxDb = options.maxDb ?? -30;
  }

  /**
   * Draws one column of magnitude data at the right edge of the
   * canvas, low frequency at the bottom. `magnitudesDb.length` must
   * equal the canvas's pixel height — one value per row.
   */
  pushColumn(magnitudesDb: Float32Array): void {
    const canvas = this.#ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;

    if (magnitudesDb.length !== height) {
      throw new Error(
        `magnitudesDb has ${magnitudesDb.length} values but the canvas is ${height}px tall — remap to canvas.height bins before calling pushColumn().`,
      );
    }

    this.#ctx.drawImage(canvas, -1, 0);

    const range = this.#maxDb - this.#minDb;
    for (let y = 0; y < height; y++) {
      const db = magnitudesDb[height - 1 - y];
      const intensity = Math.max(0, Math.min(1, (db - this.#minDb) / range));
      const level = Math.round(intensity * 255);
      this.#ctx.fillStyle = `rgb(${level}, ${level}, ${level})`;
      this.#ctx.fillRect(width - 1, y, 1, 1);
    }
  }

  clear(): void {
    const canvas = this.#ctx.canvas;
    this.#ctx.fillStyle = "black";
    this.#ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
