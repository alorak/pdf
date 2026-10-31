/** Source PDF references are stored by workspace ID and original file identity. */
export function dependentPageLinks(state, sourceWorkspaceId) {
  if (!Number.isSafeInteger(sourceWorkspaceId)) return [];
  return (state?.items || []).flatMap(workspace =>
    (workspace.linkedPages || []).filter(ref => ref.sourceWorkspaceId === sourceWorkspaceId)
      .map(ref => ({ workspaceId: workspace.id, sourceWorkspaceId, page: ref.page,
        referenceId: ref.id, fileName: ref.sourceFileName })));
}

export function groupDependentLinks(links) {
  return [...links.reduce((groups, item) => {
    const group = groups.get(item.workspaceId) || { workspaceId: item.workspaceId, pages: [] };
    group.pages.push(item.page);
    groups.set(item.workspaceId, group);
    return groups;
  }, new Map()).values()];
}

/** Integrity metadata reports stale references, never silently deletes them. */
export function stalePageLinks(state, pdfRecords) {
  const byWorkspace = new Map(pdfRecords.map(item => [item.workspaceId, item]));
  return (state?.items || []).flatMap(workspace =>
    (workspace.linkedPages || []).filter(ref => {
      const source = state.items.find(item => item.id === ref.sourceWorkspaceId);
      const record = byWorkspace.get(ref.sourceWorkspaceId);
      return !source || source.fileName !== ref.sourceFileName || !record ||
        record.name !== ref.sourceFileName || (record.size ?? record.blob?.size) !== ref.sourceSize ||
        record.lastModified !== ref.sourceLastModified;
    }).map(ref => ({ targetWorkspaceId: workspace.id, sourceWorkspaceId: ref.sourceWorkspaceId,
      sourceFileName: ref.sourceFileName, page: ref.page, referenceId: ref.id })));
}
