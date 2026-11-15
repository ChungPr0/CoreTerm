import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hostsApi } from "../api/hostsApi";
import type { HostFullConfigDto, HostProfileSummaryDto } from "../types";
import { formatLocalizedError } from "@/shared/utils/formatError";

export interface DeletePromptState {
  title: string;
  itemName: string;
  itemDetail?: string;
  note?: string;
  noteTone: "neutral" | "danger";
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}

interface UseHostProfilesOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  onError: (msg: string) => void;
  onRequestDelete: (prompt: DeletePromptState) => void;
}

export function useHostProfiles({
  t,
  onError,
  onRequestDelete,
}: UseHostProfilesOpts) {
  const [allProfiles, setAllProfiles] = useState<HostProfileSummaryDto[]>([]);
  const [dbGroups, setDbGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [hostInitialGroup, setHostInitialGroup] = useState("Default");
  const [editingHost, setEditingHost] = useState<HostFullConfigDto | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const loadProfiles = useCallback(
    async (query = searchQueryRef.current) => {
      try {
        const [list, groups] = await Promise.all([
          hostsApi.hostList({ search_query: query.trim() || undefined }),
          hostsApi.hostGroupList().catch(() => [] as string[]),
        ]);
        setAllProfiles(list);
        setDbGroups(groups);
      } catch (err) {
        onError(formatLocalizedError(err, t));
      }
    },
    [onError, t]
  );

  useEffect(() => {
    void loadProfiles(searchQuery);
  }, [loadProfiles, searchQuery]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProfiles) {
      for (const tag of p.tags) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return Array.from(set).sort();
  }, [allProfiles]);

  const filteredProfiles = useMemo(
    () => (selectedTag ? allProfiles.filter((p) => p.tags.includes(selectedTag)) : allProfiles),
    [allProfiles, selectedTag]
  );

  const existingGroups = useMemo(() => {
    const map = new Map<string, string>();
    const push = (raw: string) => {
      const clean = raw.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    };
    dbGroups.forEach(push);
    push("Default");
    allProfiles.forEach((p) => p.group_name && push(p.group_name));
    return Array.from(map.values());
  }, [dbGroups, allProfiles]);

  const openNewHost = useCallback((initialGroup = "Default") => {
    setEditingHost(null);
    setHostInitialGroup(initialGroup.trim() || "Default");
    setIsHostModalOpen(true);
  }, []);

  const editHost = useCallback(
    async (hostId: string) => {
      try {
        const detail = await hostsApi.hostGetDetail(hostId);
        setEditingHost(detail);
        setIsHostModalOpen(true);
      } catch (err) {
        onError(formatLocalizedError(err, t));
      }
    },
    [onError, t]
  );

  const createGroup = useCallback(
    async (name: string) => {
      setIsCreatingGroup(true);
      try {
        await hostsApi.hostGroupCreate(name);
        await loadProfiles();
        setIsGroupModalOpen(false);
      } finally {
        setIsCreatingGroup(false);
      }
    },
    [loadProfiles]
  );

  const moveHostToGroup = useCallback(
    async (hostId: string, targetGroup: string) => {
      setAllProfiles((prev) =>
        prev.map((p) => (p.id === hostId ? { ...p, group_name: targetGroup } : p))
      );
      try {
        await hostsApi.hostMoveGroup(hostId, targetGroup);
        await loadProfiles();
      } catch (err) {
        onError(formatLocalizedError(err, t));
        await loadProfiles();
      }
    },
    [loadProfiles, onError, t]
  );

  const duplicateHost = useCallback(
    async (host: HostProfileSummaryDto) => {
      try {
        await hostsApi.hostDuplicate(host.id, `${host.alias} (Copy)`, host.host);
        await loadProfiles();
      } catch (err) {
        onError(formatLocalizedError(err, t));
      }
    },
    [loadProfiles, onError, t]
  );

  const requestDeleteHost = useCallback(
    (host: HostProfileSummaryDto) => {
      onRequestDelete({
        title: t("host.delete_confirm"),
        itemName: host.alias,
        itemDetail: `${host.username}@${host.host}:${host.port}`,
        note: t("host.delete_warning"),
        noteTone: "neutral",
        onConfirm: async () => {
          await hostsApi.hostDelete(host.id);
          await loadProfiles();
        },
      });
    },
    [loadProfiles, onRequestDelete, t]
  );

  const requestDeleteGroup = useCallback(
    (groupName: string) => {
      onRequestDelete({
        title: t("group.delete_confirm", { name: groupName }),
        itemName: groupName,
        note: t("group.delete_warning"),
        noteTone: "neutral",
        onConfirm: async () => {
          await hostsApi.hostGroupDelete(groupName);
          await loadProfiles();
        },
      });
    },
    [loadProfiles, onRequestDelete, t]
  );

  const reorderGroups = useCallback(
    async (orderedNames: string[]) => {
      setDbGroups(orderedNames);
      try {
        const saved = await hostsApi.hostGroupReorder(orderedNames);
        setDbGroups(saved);
      } catch (err) {
        onError(formatLocalizedError(err, t));
        await loadProfiles();
      }
    },
    [loadProfiles, onError, t]
  );

  return {
    allProfiles,
    dbGroups,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    allTags,
    filteredProfiles,
    existingGroups,
    isHostModalOpen,
    setIsHostModalOpen,
    hostInitialGroup,
    editingHost,
    isGroupModalOpen,
    setIsGroupModalOpen,
    isCreatingGroup,
    loadProfiles,
    openNewHost,
    editHost,
    createGroup,
    moveHostToGroup,
    reorderGroups,
    duplicateHost,
    requestDeleteHost,
    requestDeleteGroup,
  };
}
