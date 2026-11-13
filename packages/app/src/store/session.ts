import { currentProject, useApp } from './app';
import { decodeShare, loadProject, saveProject, shareParam } from './persist';

export const AUTOSAVE_MS = 400;

/**
 * Restore the session before the app renders: a shared link wins, then the
 * autosaved project; otherwise the default example stays.
 */
export async function hydrate(): Promise<'share' | 'saved' | 'default'> {
  const param = shareParam(location.hash);
  if (param) {
    const shared = await decodeShare(param);
    // Drop the hash so a reload continues from the autosave, not the original link.
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (shared) {
      useApp.getState().openProject(shared, { name: 'Shared program', record: false });
      return 'share';
    }
  }
  const saved = loadProject();
  if (saved) {
    useApp.getState().openProject(saved, { record: false });
    return 'saved';
  }
  return 'default';
}

/** Save the project shortly after it changes. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useApp.subscribe((state, prev) => {
    if (
      state.source === prev.source &&
      state.width === prev.width &&
      state.height === prev.height &&
      state.seed === prev.seed &&
      state.palette === prev.palette
    ) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveProject(currentProject()), AUTOSAVE_MS);
  });
  const flush = () => saveProject(currentProject());
  window.addEventListener('pagehide', flush);
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    window.removeEventListener('pagehide', flush);
  };
}
