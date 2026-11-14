const SIDE_BY_SIDE = '(min-width: 700px) and (min-height: 560px)';

/** True where the app fills the screen with the mat beside the program (see css/base.css). */
export function sideBySide() {
  return window.matchMedia(SIDE_BY_SIDE).matches;
}
