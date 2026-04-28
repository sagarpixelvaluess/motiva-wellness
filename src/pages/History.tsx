import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Search, ArrowLeft, X, Trash2, MessageSquare, Image as ImageIcon,
  Bookmark, BookmarkCheck, Sparkles, Plus, Clock, Calendar, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "all" | "recent" | "favorites" | "media";
type DateFilter = "any" | "today" | "week" | "month";

interface ChatRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMeta extends ChatRow {
  preview: string;
  has_media: boolean;
  message_count: number;
  bookmarked: boolean;
}

const highlight = (text: string, query: string) => {
  if (!query.trim() || !text) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-primary/25 text-primary rounded px-0.5">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
};

const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const startOfYesterday = () => { const d = startOfToday(); d.setDate(d.getDate()-1); return d; };
const startOfWeek = () => { const d = startOfToday(); d.setDate(d.getDate()-7); return d; };
const startOfMonth = () => { const d = startOfToday(); d.setMonth(d.getMonth()-1); return d; };

const groupLabel = (dateStr: string): "Today" | "Yesterday" | "This Week" | "Older" => {
  const d = new Date(dateStr);
  if (d >= startOfToday()) return "Today";
  if (d >= startOfYesterday()) return "Yesterday";
  if (d >= startOfWeek()) return "This Week";
  return "Older";
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = startOfToday();
  if (d >= today) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d >= startOfYesterday()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const HistoryPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { chatId: activeChatId } = useParams<{ chatId: string }>();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [{ data: chatsData }, { data: msgsData }, { data: savedData }] = await Promise.all([
        supabase.from("chats").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("messages").select("chat_id, text, image_url, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("saved_messages").select("chat_id").eq("user_id", user.id),
      ]);
      if (cancelled) return;

      const lastByChat = new Map<string, { text: string; image_url: string | null }>();
      const mediaChats = new Set<string>();
      const counts = new Map<string, number>();
      for (const m of (msgsData as any[]) || []) {
        if (!lastByChat.has(m.chat_id)) lastByChat.set(m.chat_id, { text: m.text, image_url: m.image_url });
        if (m.image_url) mediaChats.add(m.chat_id);
        counts.set(m.chat_id, (counts.get(m.chat_id) || 0) + 1);
      }
      const bookmarkedChats = new Set<string>(((savedData as any[]) || []).map((s) => s.chat_id).filter(Boolean));

      const enriched: ChatMeta[] = ((chatsData as ChatRow[]) || []).map((c) => {
        const last = lastByChat.get(c.id);
        return {
          ...c,
          preview: last?.text || (last?.image_url ? "📷 Image" : "No messages yet"),
          has_media: mediaChats.has(c.id),
          message_count: counts.get(c.id) || 0,
          bookmarked: bookmarkedChats.has(c.id),
        };
      });

      setChats(enriched);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    let list = chats;

    // Tab
    if (tab === "recent") {
      const cutoff = startOfWeek();
      list = list.filter((c) => new Date(c.updated_at) >= cutoff);
    } else if (tab === "favorites") {
      list = list.filter((c) => c.bookmarked);
    } else if (tab === "media") {
      list = list.filter((c) => c.has_media);
    }

    // Date filter
    if (dateFilter !== "any") {
      const cutoff = dateFilter === "today" ? startOfToday()
        : dateFilter === "week" ? startOfWeek() : startOfMonth();
      list = list.filter((c) => new Date(c.updated_at) >= cutoff);
    }

    // Search
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
    }

    return list;
  }, [chats, tab, dateFilter, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, ChatMeta[]> = { Today: [], Yesterday: [], "This Week": [], Older: [] };
    for (const c of filtered) groups[groupLabel(c.updated_at)].push(c);
    return groups;
  }, [filtered]);

  const counts = useMemo(() => ({
    all: chats.length,
    recent: chats.filter((c) => new Date(c.updated_at) >= startOfWeek()).length,
    favorites: chats.filter((c) => c.bookmarked).length,
    media: chats.filter((c) => c.has_media).length,
  }), [chats]);

  const createNewChat = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chats").insert({ user_id: user.id, title: "New Chat" }).select().single();
    if (error) return toast.error("Could not start chat");
    navigate(`/chat/${data.id}`);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    await supabase.from("chats").delete().eq("id", id);
    setChats((p) => p.filter((c) => c.id !== id));
    toast.success("Conversation deleted");
  };

  const toggleBookmark = async (chat: ChatMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (chat.bookmarked) {
      await supabase.from("saved_messages").delete().eq("user_id", user.id).eq("chat_id", chat.id);
      setChats((p) => p.map((c) => c.id === chat.id ? { ...c, bookmarked: false } : c));
      toast.success("Removed from Library");
    } else {
      const { error } = await supabase.from("saved_messages").insert({
        user_id: user.id, chat_id: chat.id, sender: "user",
        text: chat.title + (chat.preview ? " — " + chat.preview : ""),
      });
      if (error) return toast.error("Could not save");
      setChats((p) => p.map((c) => c.id === chat.id ? { ...c, bookmarked: true } : c));
      toast.success("Saved to Library");
    }
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
          <div className="ml-2 flex-1">
            <h1 className="font-display text-lg font-bold text-foreground leading-tight">History</h1>
            <p className="text-[11px] text-muted-foreground">Your conversation archive</p>
          </div>
          <button
            onClick={createNewChat}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-cta text-primary-foreground text-sm font-semibold shadow-soft hover:opacity-90 transition-smooth"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your past conversations..."
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
              { key: "all", label: "All", icon: MessageSquare, count: counts.all },
              { key: "recent", label: "Recent", icon: Clock, count: counts.recent },
              { key: "favorites", label: "Favorites", icon: Bookmark, count: counts.favorites },
              { key: "media", label: "With Media", icon: ImageIcon, count: counts.media },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
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

        {/* Date filter */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3 h-3" /> Date:
          </span>
          {([
            { key: "any", label: "Any time" },
            { key: "today", label: "Today" },
            { key: "week", label: "This Week" },
            { key: "month", label: "This Month" },
          ] as const).map((d) => (
            <button
              key={d.key}
              onClick={() => setDateFilter(d.key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-smooth",
                dateFilter === d.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Sparkles className="w-5 h-5 mr-2 animate-pulse" /> Loading your history…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onNew={createNewChat} hasQuery={!!query.trim() || tab !== "all" || dateFilter !== "any"} />
        ) : (
          <div className="space-y-8 animate-fade-up">
            {(["Today", "Yesterday", "This Week", "Older"] as const).map((label) => {
              const list = grouped[label];
              if (!list || list.length === 0) return null;
              return (
                <section key={label}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      {label}
                    </h2>
                    <span className="text-[10px] text-muted-foreground">({list.length})</span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map((c) => (
                      <Card
                        key={c.id}
                        onClick={() => navigate(`/chat/${c.id}`)}
                        className={cn(
                          "p-4 rounded-3xl shadow-bubble hover:shadow-card transition-smooth cursor-pointer flex flex-col gap-3 group",
                          c.id === activeChatId && "ring-2 ring-primary"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-display font-semibold text-foreground truncate">
                              {highlight(c.title || "Untitled", query)}
                            </h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTime(c.updated_at)} · {c.message_count} {c.message_count === 1 ? "message" : "messages"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-smooth">
                            <button
                              onClick={(e) => toggleBookmark(c, e)}
                              className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-primary"
                              aria-label="Bookmark"
                            >
                              {c.bookmarked
                                ? <BookmarkCheck className="w-4 h-4 text-primary" />
                                : <Bookmark className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={(e) => deleteChat(c.id, e)}
                              className="w-8 h-8 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-destructive"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {highlight(c.preview, query)}
                        </p>

                        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                          {c.has_media && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" /> Media
                            </span>
                          )}
                          {c.bookmarked && (
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-accent-foreground flex items-center gap-1">
                              <BookmarkCheck className="w-3 h-3" /> Saved
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-smooth">
                            Open →
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

const EmptyState = ({ onNew, hasQuery }: { onNew: () => void; hasQuery: boolean }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-2xl bg-card shadow-card flex items-center justify-center mb-5">
      <MessageSquare className="w-7 h-7 text-primary" />
    </div>
    <h3 className="font-display text-lg font-semibold text-foreground">
      {hasQuery ? "No conversations match your filters" : "No conversations yet. Start a new chat!"}
    </h3>
    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
      {hasQuery ? "Try a different search or clear your filters." : "Your past chats will appear here for easy reference."}
    </p>
    {!hasQuery && (
      <button
        onClick={onNew}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-cta text-primary-foreground font-semibold shadow-soft hover:opacity-90 transition-smooth"
      >
        <Plus className="w-4 h-4" /> Start a new chat
      </button>
    )}
  </div>
);

export default HistoryPage;
