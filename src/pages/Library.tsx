import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Bookmark, FileText, Image as ImageIcon, FolderPlus, Search, Plus,
  Trash2, ArrowLeft, Tag, X, Save, Pencil, Calendar, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "saved" | "notes" | "media" | "collections";

interface Collection {
  id: string;
  name: string;
  color: string;
}
interface SavedMessage {
  id: string;
  message_id: string | null;
  chat_id: string | null;
  sender: string;
  text: string;
  image_url: string | null;
  collection_id: string | null;
  created_at: string;
}
interface Note {
  id: string;
  title: string;
  content: string;
  collection_id: string | null;
  created_at: string;
  updated_at: string;
}
interface MediaItem {
  name: string;
  url: string;
  created_at: string;
  path: string;
}

const COLOR_DOT: Record<string, string> = {
  sky: "bg-primary",
  rose: "bg-rose-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
};
const COLOR_OPTIONS = ["sky", "rose", "amber", "emerald", "violet"];

const highlight = (text: string, query: string) => {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-primary/25 text-primary rounded px-0.5">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
};

const LibraryPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("saved");
  const [query, setQuery] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMessage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Note editor
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // New collection dialog
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionColor, setNewCollectionColor] = useState("sky");

  // Media preview
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cols }, { data: savedData }, { data: notesData }, mediaList] = await Promise.all([
        supabase.from("collections").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("saved_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.storage.from("chat-images").list(user.id, { limit: 100, sortBy: { column: "created_at", order: "desc" } }),
      ]);
      if (cancelled) return;
      setCollections(cols || []);
      setSaved((savedData as SavedMessage[]) || []);
      setNotes((notesData as Note[]) || []);
      const items: MediaItem[] = (mediaList.data || [])
        .filter((f) => f.name && !f.name.endsWith("/"))
        .map((f) => {
          const path = `${user.id}/${f.name}`;
          return {
            name: f.name,
            url: supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl,
            created_at: f.created_at || new Date().toISOString(),
            path,
          };
        });
      setMedia(items);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Filtered lists
  const filteredSaved = useMemo(() => saved.filter((s) => {
    if (activeCollection && s.collection_id !== activeCollection) return false;
    if (!query.trim()) return true;
    return s.text.toLowerCase().includes(query.toLowerCase());
  }), [saved, query, activeCollection]);

  const filteredNotes = useMemo(() => notes.filter((n) => {
    if (activeCollection && n.collection_id !== activeCollection) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  }), [notes, query, activeCollection]);

  const filteredMedia = useMemo(() => media.filter((m) => {
    if (!query.trim()) return true;
    return m.name.toLowerCase().includes(query.toLowerCase());
  }), [media, query]);

  // Collections
  const createCollection = async () => {
    if (!user || !newCollectionName.trim()) return;
    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name: newCollectionName.trim(), color: newCollectionColor })
      .select().single();
    if (error) return toast.error("Could not create category");
    setCollections((p) => [...p, data]);
    setNewCollectionName("");
    setNewCollectionColor("sky");
    setNewCollectionOpen(false);
    toast.success("Category created");
  };
  const deleteCollection = async (id: string) => {
    if (!confirm("Delete this category? Items inside will become uncategorized.")) return;
    await supabase.from("collections").delete().eq("id", id);
    setCollections((p) => p.filter((c) => c.id !== id));
    if (activeCollection === id) setActiveCollection(null);
    setSaved((p) => p.map((s) => s.collection_id === id ? { ...s, collection_id: null } : s));
    setNotes((p) => p.map((n) => n.collection_id === id ? { ...n, collection_id: null } : n));
  };

  // Saved messages
  const deleteSaved = async (id: string) => {
    await supabase.from("saved_messages").delete().eq("id", id);
    setSaved((p) => p.filter((s) => s.id !== id));
    toast.success("Removed from library");
  };
  const assignSavedCollection = async (id: string, collectionId: string | null) => {
    await supabase.from("saved_messages").update({ collection_id: collectionId }).eq("id", id);
    setSaved((p) => p.map((s) => s.id === id ? { ...s, collection_id: collectionId } : s));
  };

  // Notes
  const startNewNote = () => {
    setEditingNote({ id: "new", title: "", content: "", collection_id: activeCollection, created_at: "", updated_at: "" });
    setNoteTitle("");
    setNoteContent("");
  };
  const startEditNote = (n: Note) => {
    setEditingNote(n);
    setNoteTitle(n.title);
    setNoteContent(n.content);
  };
  const saveNote = async () => {
    if (!user || !editingNote) return;
    const title = noteTitle.trim() || "Untitled";
    const content = noteContent;
    if (editingNote.id === "new") {
      const { data, error } = await supabase.from("notes")
        .insert({ user_id: user.id, title, content, collection_id: editingNote.collection_id })
        .select().single();
      if (error) return toast.error("Could not save note");
      setNotes((p) => [data as Note, ...p]);
    } else {
      const { data, error } = await supabase.from("notes")
        .update({ title, content, collection_id: editingNote.collection_id })
        .eq("id", editingNote.id).select().single();
      if (error) return toast.error("Could not update note");
      setNotes((p) => p.map((n) => n.id === editingNote.id ? (data as Note) : n));
    }
    setEditingNote(null);
    toast.success("Note saved");
  };
  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await supabase.from("notes").delete().eq("id", id);
    setNotes((p) => p.filter((n) => n.id !== id));
    if (editingNote?.id === id) setEditingNote(null);
  };

  // Media
  const deleteMedia = async (item: MediaItem) => {
    if (!confirm("Delete this image? It will also be removed from chats.")) return;
    const { error } = await supabase.storage.from("chat-images").remove([item.path]);
    if (error) return toast.error("Could not delete");
    setMedia((p) => p.filter((m) => m.path !== item.path));
    toast.success("Deleted");
  };

  return (
    <div className="min-h-screen bg-chat">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/85 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center transition-smooth"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <MotivaLogo size="sm" />
          <div className="ml-2">
            <h1 className="font-display text-lg font-bold text-foreground leading-tight">Library</h1>
            <p className="text-[11px] text-muted-foreground">Your personal memory hub</p>
          </div>
        </div>

        {/* Search */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved messages, notes, and media..."
              className="pl-11 h-12 rounded-full bg-card border-border shadow-bubble focus-visible:ring-primary/40"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-accent hover:bg-muted flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {([
              { key: "saved", label: "Saved", icon: Bookmark, count: saved.length },
              { key: "notes", label: "Notes", icon: FileText, count: notes.length },
              { key: "media", label: "Media", icon: ImageIcon, count: media.length },
              { key: "collections", label: "Categories", icon: Tag, count: collections.length },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setActiveCollection(null); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-smooth",
                  tab === t.key
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "bg-card text-foreground hover:bg-accent"
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 rounded-full",
                  tab === t.key ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                )}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Collection filters (for saved & notes) */}
        {(tab === "saved" || tab === "notes") && collections.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCollection(null)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-smooth",
                !activeCollection
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              All
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCollection(c.id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-smooth",
                  activeCollection === c.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", COLOR_DOT[c.color] || "bg-primary")} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Sparkles className="w-5 h-5 mr-2 animate-pulse" /> Loading your library…
          </div>
        ) : (
          <>
            {/* SAVED */}
            {tab === "saved" && (
              filteredSaved.length === 0 ? (
                <EmptyState icon={Bookmark} title="No saved messages yet" hint="Tap the bookmark icon on any chat message to save it here." />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
                  {filteredSaved.map((s) => {
                    const col = collections.find((c) => c.id === s.collection_id);
                    return (
                      <Card key={s.id} className="p-4 rounded-3xl shadow-bubble hover:shadow-card transition-smooth flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full",
                            s.sender === "ai" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                          )}>
                            {s.sender === "ai" ? "Motiva" : "You"}
                          </span>
                          <button
                            onClick={() => deleteSaved(s.id)}
                            className="text-muted-foreground hover:text-destructive transition-smooth"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {s.image_url && (
                          <img src={s.image_url} alt="" className="rounded-2xl max-h-40 w-full object-cover cursor-pointer"
                            onClick={() => setPreviewMedia(s.image_url)} loading="lazy" />
                        )}
                        {s.text && (
                          <p className="text-sm text-foreground leading-relaxed line-clamp-6">
                            {highlight(s.text, query)}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
                          <select
                            value={s.collection_id || ""}
                            onChange={(e) => assignSavedCollection(s.id, e.target.value || null)}
                            className="text-[11px] bg-transparent text-muted-foreground border-0 focus:outline-none cursor-pointer"
                          >
                            <option value="">Uncategorized</option>
                            {collections.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            {col && <span className={cn("w-2 h-2 rounded-full", COLOR_DOT[col.color])} />}
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {new Date(s.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {s.chat_id && (
                          <button
                            onClick={() => navigate(`/chat/${s.chat_id}`)}
                            className="text-[11px] text-primary font-medium hover:underline self-start"
                          >
                            Open in chat →
                          </button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )
            )}

            {/* NOTES */}
            {tab === "notes" && (
              <>
                <div className="mb-4 flex justify-end">
                  <Button onClick={startNewNote} className="rounded-full bg-gradient-cta shadow-soft">
                    <Plus className="w-4 h-4" /> New Note
                  </Button>
                </div>
                {filteredNotes.length === 0 ? (
                  <EmptyState icon={FileText} title="No notes yet" hint="Capture thoughts, intentions, or journal entries." />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
                    {filteredNotes.map((n) => {
                      const col = collections.find((c) => c.id === n.collection_id);
                      return (
                        <Card key={n.id} className="p-5 rounded-3xl shadow-bubble hover:shadow-card transition-smooth cursor-pointer group"
                          onClick={() => startEditNote(n)}>
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-display font-semibold text-foreground line-clamp-1">
                              {highlight(n.title || "Untitled", query)}
                            </h3>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-smooth"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-5 leading-relaxed whitespace-pre-wrap">
                            {n.content ? highlight(n.content, query) : <em>Empty note</em>}
                          </p>
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(n.updated_at).toLocaleDateString()}
                            </span>
                            {col && (
                              <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                                <span className={cn("w-2 h-2 rounded-full", COLOR_DOT[col.color])} />
                                {col.name}
                              </span>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* MEDIA */}
            {tab === "media" && (
              filteredMedia.length === 0 ? (
                <EmptyState icon={ImageIcon} title="No media yet" hint="Images you upload in chats will appear here." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-fade-up">
                  {filteredMedia.map((m) => (
                    <div key={m.path} className="group relative aspect-square rounded-2xl overflow-hidden bg-card shadow-bubble hover:shadow-card transition-smooth">
                      <img
                        src={m.url}
                        alt={m.name}
                        loading="lazy"
                        className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                        onClick={() => setPreviewMedia(m.url)}
                      />
                      <button
                        onClick={() => deleteMedia(m)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-foreground/60 text-background opacity-0 group-hover:opacity-100 flex items-center justify-center backdrop-blur-sm hover:bg-destructive transition-smooth"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* COLLECTIONS */}
            {tab === "collections" && (
              <>
                <div className="mb-4 flex justify-end">
                  <Button onClick={() => setNewCollectionOpen(true)} className="rounded-full bg-gradient-cta shadow-soft">
                    <FolderPlus className="w-4 h-4" /> New Category
                  </Button>
                </div>
                {collections.length === 0 ? (
                  <EmptyState icon={Tag} title="No categories yet" hint="Organize saved messages and notes by topic." />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-up">
                    {collections.map((c) => {
                      const savedCount = saved.filter((s) => s.collection_id === c.id).length;
                      const noteCount = notes.filter((n) => n.collection_id === c.id).length;
                      return (
                        <Card key={c.id} className="p-5 rounded-3xl shadow-bubble flex items-center gap-4">
                          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-primary-foreground", COLOR_DOT[c.color] || "bg-primary")}>
                            <Tag className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-display font-semibold text-foreground truncate">{c.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {savedCount} saved · {noteCount} notes
                            </p>
                          </div>
                          <button
                            onClick={() => deleteCollection(c.id)}
                            className="text-muted-foreground hover:text-destructive transition-smooth"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Note Editor Modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-fade-up"
          onClick={() => setEditingNote(null)}>
          <Card className="w-full max-w-2xl rounded-3xl shadow-card p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                {editingNote.id === "new" ? "New Note" : "Edit Note"}
              </h2>
              <button onClick={() => setEditingNote(null)} className="w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 mb-3"
            />
            <Textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Start writing..."
              rows={12}
              className="border-0 px-0 resize-none focus-visible:ring-0 text-[15px] leading-relaxed min-h-[280px]"
            />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <select
                value={editingNote.collection_id || ""}
                onChange={(e) => setEditingNote({ ...editingNote, collection_id: e.target.value || null })}
                className="text-sm bg-accent rounded-full px-3 py-1.5 border-0 focus:outline-none cursor-pointer"
              >
                <option value="">Uncategorized</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button onClick={saveNote} className="rounded-full bg-gradient-cta shadow-soft">
                <Save className="w-4 h-4" /> Save Note
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* New Collection Modal */}
      {newCollectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-fade-up"
          onClick={() => setNewCollectionOpen(false)}>
          <Card className="w-full max-w-md rounded-3xl shadow-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold mb-4">New Category</h2>
            <Input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="e.g. Motivation, Health, Work"
              className="rounded-full mb-4"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mb-2">Color</p>
            <div className="flex gap-2 mb-6">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCollectionColor(c)}
                  className={cn(
                    "w-9 h-9 rounded-full transition-smooth",
                    COLOR_DOT[c],
                    newCollectionColor === c ? "ring-2 ring-offset-2 ring-foreground/40 scale-110" : "hover:scale-105"
                  )}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setNewCollectionOpen(false)} className="rounded-full">Cancel</Button>
              <Button onClick={createCollection} className="rounded-full bg-gradient-cta">Create</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Media Preview */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-foreground/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-up"
          onClick={() => setPreviewMedia(null)}>
          <button
            onClick={() => setPreviewMedia(null)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-card text-foreground flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={previewMedia} alt="" className="max-w-full max-h-full rounded-2xl shadow-card" />
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ icon: Icon, title, hint }: { icon: typeof Bookmark; title: string; hint: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-2xl bg-card shadow-card flex items-center justify-center mb-5">
      <Icon className="w-7 h-7 text-primary" />
    </div>
    <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1 max-w-xs">{hint}</p>
  </div>
);

export default LibraryPage;
