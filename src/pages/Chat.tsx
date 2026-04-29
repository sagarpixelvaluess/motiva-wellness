import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotivaLogo } from "@/components/MotivaLogo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, History, Library, Settings, Bell, User as UserIcon,
  Send, Paperclip, Sparkles, Trash2, LogOut, Menu, X, Heart, Loader2,
  Bookmark, BookmarkCheck, Mic, PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  created_at: string;
  image_url?: string | null;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

interface Chat {
  id: string;
  title: string;
  updated_at: string;
}

const SUGGESTED_PROMPTS = [
  "Plan my morning routine",
  "Overcoming procrastination",
  "Practice gratitude",
  "Deep work techniques",
];

const Chat = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load all chats
  useEffect(() => {
    if (!user) return;
    supabase
      .from("chats")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setChats(data || []));
  }, [user]);

  // Load messages for current chat
  useEffect(() => {
    if (!chatId) return;
    supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as Message[]) || []));
  }, [chatId]);

  // Load which messages are bookmarked
  useEffect(() => {
    if (!user || !chatId) return;
    supabase
      .from("saved_messages")
      .select("message_id")
      .eq("user_id", user.id)
      .eq("chat_id", chatId)
      .then(({ data }) => {
        setSavedIds(new Set((data || []).map((r: any) => r.message_id).filter(Boolean)));
      });
  }, [user, chatId, messages.length]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const createNewChat = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: "New Chat" })
      .select()
      .single();
    if (error) {
      toast.error("Could not start chat");
      return;
    }
    setChats((prev) => [data, ...prev]);
    setMessages([]);
    setSidebarOpen(false);
    navigate(`/chat/${data.id}`);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("chats").delete().eq("id", id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === chatId) {
      const remaining = chats.filter((c) => c.id !== id);
      if (remaining[0]) navigate(`/chat/${remaining[0].id}`);
      else navigate("/welcome");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Please choose a JPG, PNG or WEBP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("chat-images").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error(err);
      toast.error("Image upload failed");
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!user || !chatId || sending) return;
    const userText = text.trim();
    const hasImage = !!imageFile;
    if (!userText && !hasImage) return;

    setInput("");
    setSending(true);

    // Upload image first (if any)
    let uploadedUrl: string | null = null;
    if (imageFile) {
      uploadedUrl = await uploadImage(imageFile);
      if (!uploadedUrl) {
        setSending(false);
        return;
      }
      clearImage();
    }

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sender: "user",
      text: userText,
      created_at: new Date().toISOString(),
      image_url: uploadedUrl,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    // Persist user message
    const { data: savedUser, error: userErr } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        user_id: user.id,
        sender: "user",
        text: userText,
        image_url: uploadedUrl,
      })
      .select()
      .single();

    if (userErr) {
      toast.error("Failed to send");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setSending(false);
      return;
    }

    setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? (savedUser as Message) : m)));

    // Update chat title if first message
    if (messages.length === 0) {
      const title = (userText || "Image").slice(0, 40) + ((userText || "Image").length > 40 ? "…" : "");
      await supabase.from("chats").update({ title, updated_at: new Date().toISOString() }).eq("id", chatId);
      setChats((prev) =>
        [{ ...prev.find((c) => c.id === chatId)!, title, updated_at: new Date().toISOString() },
        ...prev.filter((c) => c.id !== chatId)]
      );
    } else {
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    }

    // Stream AI response
    setStreaming(true);
    const aiTempId = `ai-temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: aiTempId, sender: "ai", text: "", created_at: new Date().toISOString() }]);

    try {
      const conversationHistory = [...messages, savedUser as Message].map((m) => {
        if (m.sender === "user" && m.image_url) {
          return {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: m.image_url } },
              { type: "text", text: m.text || "What's in this image?" },
            ],
          };
        }
        return {
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        };
      });

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Slow down — too many requests, try again in a moment.");
        else if (resp.status === 402) toast.error("AI credits exhausted. Please add funds.");
        else toast.error("AI is unavailable right now");
        setMessages((prev) => prev.filter((m) => m.id !== aiTempId));
        setStreaming(false);
        setSending(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantSoFar = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) =>
                prev.map((m) => (m.id === aiTempId ? { ...m, text: assistantSoFar } : m))
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Persist final AI message
      const { data: savedAi } = await supabase
        .from("messages")
        .insert({ chat_id: chatId, user_id: user.id, sender: "ai", text: assistantSoFar })
        .select()
        .single();
      if (savedAi) {
        setMessages((prev) => prev.map((m) => (m.id === aiTempId ? (savedAi as Message) : m)));
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
      setMessages((prev) => prev.filter((m) => m.id !== aiTempId));
    } finally {
      setStreaming(false);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleBookmark = async (m: Message) => {
    if (!user || !chatId || m.id.startsWith("temp") || m.id.startsWith("ai-temp")) return;
    if (savedIds.has(m.id)) {
      await supabase.from("saved_messages").delete().eq("user_id", user.id).eq("message_id", m.id);
      setSavedIds((p) => { const n = new Set(p); n.delete(m.id); return n; });
      toast.success("Removed from Library");
    } else {
      const { error } = await supabase.from("saved_messages").insert({
        user_id: user.id, message_id: m.id, chat_id: chatId,
        sender: m.sender, text: m.text, image_url: m.image_url,
      });
      if (error) return toast.error("Could not save");
      setSavedIds((p) => new Set(p).add(m.id));
      toast.success("Saved to Library");
    }
  };

  const handleVoiceClick = () => {
    toast.info("Voice feature coming soon", { description: "We're working on bringing voice chat to Motiva." });
  };

  const isEmpty = messages.length === 0 && !streaming;

  const navItems = [
    { icon: History, label: "History", onClick: () => { setSidebarOpen(false); navigate("/history"); } },
    { icon: Library, label: "Library", onClick: () => { setSidebarOpen(false); navigate("/library"); } },
    { icon: Settings, label: "Settings", onClick: () => { setSidebarOpen(false); navigate("/settings"); } },
  ];

  const SidebarContent = ({ collapsed, inDrawer = false }: { collapsed: boolean; inDrawer?: boolean }) => (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "bg-sidebar border-r border-sidebar-border flex flex-col h-full transition-[width] duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[72px]" : "w-72"
        )}
      >
        <div className={cn("p-6 transition-all duration-300", collapsed && "px-3 py-5 text-center")}>
          {collapsed ? (
            <div className="w-10 h-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-primary">Intelligence</h2>
              <p className="text-xs text-muted-foreground mt-1">Calm Mode Active</p>
            </>
          )}
        </div>

        <nav className={cn("space-y-1 flex-1 overflow-y-auto overflow-x-hidden", collapsed ? "px-2" : "px-4")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={createNewChat}
                className={cn(
                  "w-full flex items-center rounded-2xl bg-primary/10 text-primary font-semibold transition-all hover:bg-primary/15 hover:scale-[1.02]",
                  collapsed ? "justify-center h-11" : "gap-3 px-4 py-3"
                )}
              >
                <Plus className="w-5 h-5 shrink-0" />
                {!collapsed && <span>New Chat</span>}
              </button>
            </TooltipTrigger>
            {collapsed && !inDrawer && <TooltipContent side="right">New Chat</TooltipContent>}
          </Tooltip>

          {navItems.map(({ icon: Icon, label, onClick }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <button
                  onClick={onClick}
                  className={cn(
                    "w-full flex items-center rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent transition-all hover:translate-x-0.5",
                    collapsed ? "justify-center h-11" : "gap-3 px-4 py-3"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </button>
              </TooltipTrigger>
              {collapsed && !inDrawer && <TooltipContent side="right">{label}</TooltipContent>}
            </Tooltip>
          ))}
        </nav>

        <div className={cn("transition-all", collapsed ? "p-2" : "p-4")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className={cn(
                  "w-full flex items-center justify-center rounded-2xl bg-gradient-cta text-primary-foreground font-semibold shadow-soft hover:opacity-90 transition-smooth",
                  collapsed ? "h-11" : "gap-2 py-3"
                )}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Sign out</span>}
              </button>
            </TooltipTrigger>
            {collapsed && !inDrawer && <TooltipContent side="right">Sign out</TooltipContent>}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );

  return (
    <div className="h-screen flex flex-col bg-chat overflow-hidden">
      {/* Top Nav */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-card/80 backdrop-blur-md border-b border-border z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center transition-smooth"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden md:flex w-10 h-10 rounded-full hover:bg-accent items-center justify-center text-muted-foreground transition-all hover:text-foreground"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 transition-transform duration-300" />
            ) : (
              <PanelLeftClose className="w-5 h-5 transition-transform duration-300" />
            )}
          </button>
          <MotivaLogo size="md" />
          <div className="hidden sm:block w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground transition-smooth">
            <Bell className="w-5 h-5" />
          </button>
          <UserAvatar size={40} onClick={() => navigate("/settings")} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <SidebarContent collapsed={sidebarCollapsed} />
        </div>

        {/* Mobile sidebar (overlay drawer) */}
        <div
          className={cn(
            "md:hidden fixed inset-0 z-50 flex transition-opacity duration-300",
            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
        >
          <div
            className="flex-1 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className={cn(
              "relative shadow-2xl transition-transform duration-300 ease-in-out",
              sidebarOpen ? "translate-x-0" : "translate-x-full"
            )}
          >
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-smooth"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent collapsed={false} inDrawer />
          </div>
        </div>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
            <div className="max-w-3xl mx-auto">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-up">
                  <div className="w-16 h-16 rounded-2xl bg-card shadow-card flex items-center justify-center mb-8">
                    <Sparkles className="w-7 h-7 text-primary fill-primary/20" />
                  </div>
                  <div className="bg-card rounded-3xl shadow-card px-6 py-5 max-w-md mb-5">
                    <p className="text-foreground leading-relaxed">
                      Hey 👋 I'm Motiva. I'm here to help you stay focused, positive, and consistent.
                    </p>
                  </div>
                  <p className="text-muted-foreground text-center mb-6">What's on your mind today? 😊</p>
                  <div className="flex flex-wrap gap-3 justify-center max-w-lg">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="px-5 py-2.5 rounded-full bg-card border border-primary/20 text-primary text-sm font-medium hover:bg-primary/10 hover:border-primary/40 transition-smooth shadow-bubble"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pb-4">
                  <div className="flex justify-center">
                    <span className="text-xs font-semibold tracking-widest text-primary uppercase bg-primary/10 px-4 py-1.5 rounded-full">
                      Today
                    </span>
                  </div>
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      saved={savedIds.has(m.id)}
                      onToggleBookmark={() => toggleBookmark(m)}
                    />
                  ))}
                  {streaming && messages[messages.length - 1]?.text === "" && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="px-4 sm:px-6 pb-6 pt-2">
            <div className="max-w-3xl mx-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />

              {imagePreview && (
                <div className="bg-card rounded-2xl shadow-bubble p-2 mb-2 flex items-center gap-3 max-w-xs animate-fade-up">
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-accent flex-shrink-0">
                    <img src={imagePreview} alt="Selected" className="w-full h-full object-cover" />
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-foreground/40 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-background animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {imageFile?.name || "Image"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {uploadingImage ? "Uploading…" : "Ready to send"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearImage}
                    disabled={uploadingImage}
                    aria-label="Remove image"
                    className="w-7 h-7 rounded-full bg-accent hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-smooth flex-shrink-0 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="bg-card rounded-full shadow-card flex items-center gap-2 px-2 py-2 min-h-[60px]">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || !!imageFile}
                  aria-label="Attach image"
                  className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground flex-shrink-0 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={imageFile ? "Add a message about the image..." : "Ask anything..."}
                  rows={1}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  className="flex-1 self-center border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 leading-6 min-h-[24px] max-h-40 text-base placeholder:text-muted-foreground/70"
                />
                <button
                  type="button"
                  onClick={handleVoiceClick}
                  aria-label="Voice input"
                  className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground flex-shrink-0 transition-smooth hover:text-primary hover:scale-110 active:scale-95"
                >
                  <Mic className="w-5 h-5" />
                </button>
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={(!input.trim() && !imageFile) || sending || uploadingImage}
                  aria-label="Send message"
                  className="w-11 h-11 rounded-full bg-gradient-cta hover:opacity-90 p-0 flex-shrink-0 shadow-soft flex items-center justify-center [&_svg]:size-[18px]"
                >
                  {uploadingImage || sending ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                  ) : (
                    <Send className="w-[18px] h-[18px] translate-x-[1px]" />
                  )}
                </Button>
              </div>
              <p className="text-center text-[10px] tracking-widest text-muted-foreground uppercase mt-3">
                Motiva can provide support but not medical advice
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Lightweight inline formatter: **bold**, lists, paragraphs
const renderFormatted = (text: string) => {
  const lines = text.split("\n");
  const blocks: JSX.Element[] = [];
  let listBuf: { type: "ul" | "ol"; items: string[] } | null = null;
  let paraBuf: string[] = [];

  const flushPara = (key: string) => {
    if (paraBuf.length) {
      blocks.push(<p key={key}>{renderInline(paraBuf.join(" "))}</p>);
      paraBuf = [];
    }
  };
  const flushList = (key: string) => {
    if (listBuf) {
      const Tag = listBuf.type;
      blocks.push(
        <Tag key={key}>
          {listBuf.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </Tag>
      );
      listBuf = null;
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
    if (ulMatch) {
      flushPara(`p-${i}`);
      if (!listBuf || listBuf.type !== "ul") { flushList(`l-${i}`); listBuf = { type: "ul", items: [] }; }
      listBuf.items.push(ulMatch[1]);
    } else if (olMatch) {
      flushPara(`p-${i}`);
      if (!listBuf || listBuf.type !== "ol") { flushList(`l-${i}`); listBuf = { type: "ol", items: [] }; }
      listBuf.items.push(olMatch[1]);
    } else if (line.trim() === "") {
      flushPara(`p-${i}`);
      flushList(`l-${i}`);
    } else {
      flushList(`l-${i}`);
      paraBuf.push(line);
    }
  });
  flushPara("p-end");
  flushList("l-end");
  return blocks;
};

const renderInline = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
};

const MessageBubble = ({
  message,
  saved,
  onToggleBookmark,
}: {
  message: Message;
  saved: boolean;
  onToggleBookmark: () => void;
}) => {
  const isUser = message.sender === "user";
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const hasImage = !!message.image_url;
  const hasText = !!message.text;
  const isStreaming = message.id.startsWith("ai-temp") || message.id.startsWith("temp");

  return (
    <div className={cn("flex animate-fade-up group", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex items-start gap-2 max-w-[88%] sm:max-w-[78%]", isUser ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "relative rounded-2xl",
            isUser
              ? "glass-user text-foreground rounded-br-md"
              : "glass-ai text-foreground rounded-bl-md",
            hasImage && !hasText ? "p-1.5" : "px-4 py-3"
          )}
        >
          {hasImage && (
            <a
              href={message.image_url!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("block", hasText && "mb-2")}
            >
              <img
                src={message.image_url!}
                alt="Attached"
                loading="lazy"
                className="rounded-xl max-h-72 w-auto object-cover"
              />
            </a>
          )}
          {hasText && (
            <div className="prose-chat text-[15px]">
              {renderFormatted(message.text)}
            </div>
          )}
          {!hasText && !hasImage && (
            <Heart className="w-4 h-4 inline animate-pulse text-primary" />
          )}
          <div
            className={cn(
              "text-[10px] mt-1.5 tracking-wider uppercase opacity-50",
              isUser ? "text-right" : "text-left",
              hasImage && !hasText && "px-2 pb-1"
            )}
          >
            {time}
          </div>
        </div>
        {!isStreaming && (hasText || hasImage) && (
          <button
            onClick={onToggleBookmark}
            aria-label={saved ? "Remove bookmark" : "Save to Library"}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-smooth mt-1",
              "opacity-0 group-hover:opacity-100 focus:opacity-100",
              saved
                ? "bg-primary/15 text-primary opacity-100"
                : "bg-card/70 backdrop-blur text-muted-foreground hover:text-primary hover:bg-primary/10"
            )}
          >
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

const TypingIndicator = () => (
  <div className="flex animate-fade-up justify-start">
    <div className="glass-ai rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0s" }} />
        <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0.15s" }} />
        <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0.3s" }} />
      </div>
      <span className="text-xs text-primary font-medium ml-1">Motiva is thinking…</span>
    </div>
  </div>
);

export default Chat;
