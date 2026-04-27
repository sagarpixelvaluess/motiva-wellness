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
  Bookmark, BookmarkCheck, Mic
} from "lucide-react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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

  const Sidebar = (
    <aside className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="p-6">
        <h2 className="font-display text-xl font-bold text-primary">Intelligence</h2>
        <p className="text-xs text-muted-foreground mt-1">Calm Mode Active</p>
      </div>

      <nav className="px-4 space-y-1 flex-1 overflow-y-auto">
        <button
          onClick={createNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/10 text-primary font-semibold transition-smooth hover:bg-primary/15"
        >
          <Plus className="w-5 h-5" />
          New Chat
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent transition-smooth"
        >
          <History className="w-5 h-5" />
          History
        </button>

        {showHistory && (
          <div className="ml-2 space-y-1 max-h-64 overflow-y-auto">
            {chats.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-2">No chats yet</p>
            )}
            {chats.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setSidebarOpen(false);
                  navigate(`/chat/${c.id}`);
                }}
                className={cn(
                  "group flex items-center justify-between gap-2 px-4 py-2 rounded-xl cursor-pointer transition-smooth text-sm",
                  c.id === chatId
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <span className="truncate flex-1">{c.title}</span>
                <button
                  onClick={(e) => deleteChat(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-smooth text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => { setSidebarOpen(false); navigate("/library"); }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent transition-smooth"
        >
          <Library className="w-5 h-5" />
          Library
        </button>
        <button
          onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sidebar-foreground hover:bg-sidebar-accent transition-smooth"
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </nav>

      <div className="p-4">
        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-cta text-primary-foreground font-semibold shadow-soft hover:opacity-90 transition-smooth"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex flex-col bg-chat overflow-hidden">
      {/* Top Nav */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-card/80 backdrop-blur-md border-b border-border z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>
          <MotivaLogo size="md" />
          <div className="hidden sm:block w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground">
            <Bell className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center">
            <UserIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">{Sidebar}</div>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="flex-1 bg-foreground/40" onClick={() => setSidebarOpen(false)} />
            <div className="w-72 bg-sidebar relative">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-accent flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
              {Sidebar}
            </div>
          </div>
        )}

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
                <div className="space-y-5 pb-4">
                  <div className="flex justify-center">
                    <span className="text-xs font-semibold tracking-widest text-primary uppercase bg-primary/10 px-4 py-1.5 rounded-full">
                      Today
                    </span>
                  </div>
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
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

const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.sender === "user";
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const hasImage = !!message.image_url;
  const hasText = !!message.text;

  return (
    <div className={cn("flex animate-bubble-in", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[75%] shadow-bubble relative overflow-hidden",
          isUser
            ? "bg-bubble-user text-bubble-user-foreground rounded-3xl rounded-br-md"
            : "bg-bubble-ai text-bubble-ai-foreground rounded-3xl rounded-bl-md border-l-2 border-primary/40",
          hasImage && !hasText ? "p-1.5" : "px-5 py-3.5"
        )}
      >
        {hasImage && (
          <a
            href={message.image_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("block", hasText && "mb-2 -mx-2 -mt-1")}
          >
            <img
              src={message.image_url!}
              alt="Attached"
              loading="lazy"
              className="rounded-2xl max-h-72 w-auto object-cover"
            />
          </a>
        )}
        {hasText && (
          <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
            {message.text}
          </div>
        )}
        {!hasText && !hasImage && (
          <Heart className="w-4 h-4 inline animate-pulse text-primary" />
        )}
        <div
          className={cn(
            "text-[10px] mt-1.5 tracking-wider uppercase opacity-60",
            isUser ? "text-right" : "text-left",
            hasImage && !hasText && "px-2 pb-1"
          )}
        >
          {time}
        </div>
      </div>
    </div>
  );
};

const TypingIndicator = () => (
  <div className="flex animate-bubble-in">
    <div className="bg-bubble-ai rounded-3xl rounded-bl-md px-5 py-3.5 shadow-bubble flex items-center gap-2">
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
