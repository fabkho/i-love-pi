/**
 * The status channel published by @the-i18n-kit/pi.
 *
 * Read through a global symbol rather than by importing that package: pi loads
 * every extension through its own jiti instance with the module cache off, so
 * importing it would evaluate a second copy whose module state nothing ever
 * sets. The symbol registry is shared even when the code around it is not, and
 * it keeps this extension independent of where that package lives on disk.
 *
 * The shape is a contract between two packages that ship separately. Every
 * field is optional and every read tolerates absence, so a kit that predates a
 * field — or is not installed at all — leaves this quiet rather than broken.
 */

const STATUS_CHANNEL = Symbol.for("the-i18n-kit.pi.status");

interface StatusChannel {
  value?: string;
  missing?: number;
  listeners?: Set<(status: string | undefined) => void>;
  hasPersistentSurface?: boolean;
}

function channel(): StatusChannel {
  const container = globalThis as { [STATUS_CHANNEL]?: StatusChannel };
  return (container[STATUS_CHANNEL] ??= {});
}

/** The coverage line, e.g. `🌐 4 missing`, or undefined before the first read. */
export function getI18nStatus(): string | undefined {
  return channel().value;
}

/** Missing keys as last read, for rendering the figure more briefly. */
export function getI18nMissing(): number | undefined {
  return channel().missing;
}

/** Tell the widget that something renders coverage permanently, so it need not. */
export function setI18nPersistentSurface(present: boolean): void {
  channel().hasPersistentSurface = present;
}
