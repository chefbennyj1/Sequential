// views/dashboard/studio/js/PathUtils.js

/** Last segment of a library path — the folder name a volume/page lives in. */
export function getFolderNameFromPath(vPath) {
    if (!vPath) return 'unknown';
    const parts = vPath.split(/[\\/]/).filter(p => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}
