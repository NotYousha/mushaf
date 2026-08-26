/**
 * The mushafs the home screen opens with, in the order they appear.
 *
 * Named one by one, deliberately. This was a `home` flag on each catalogue
 * entry, and a flag is the wrong shape for "exactly these five": every mushaf
 * added afterwards arrived carrying one, so the grid quietly grew back to
 * eight and then to nine while nobody had asked for a single addition. A
 * landing screen is a choice about what to put in front of someone, and a
 * choice has to be made somewhere a person can see it.
 *
 * The order here is the order on screen, which is why it is a list and not a
 * set. Six of them, which fills two rows of three evenly — five left a row of
 * two and a row of three, and the odd one out reads as an omission. It also means the home screen can be arranged without reordering the
 * catalogue, and reordering the catalogue would move the reciter strip on the
 * Quran tab as well.
 *
 * Anything not named here is still one tap away under "See all".
 */
export const HOME_RECITERS: readonly string[] = [
  'dosari',
  'burhaji-nabawi',
  'sudais',
  'muaiqly',
  'turki',
  'afasy',
]
