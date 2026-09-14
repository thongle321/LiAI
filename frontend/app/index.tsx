import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { Bubble } from "../components/Bubble.tsx";
import { BottomNav, type ChatTab } from "../components/BottomNav.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { VisionPanel } from "../components/VisionPanel.tsx";
import { VoicePanel } from "../components/VoicePanel.tsx";
import {
  useChatStore,
  type ChatMessage,
  type Connection,
} from "../store/chat.ts";

const CONNECTION_DOT_CLASS: Record<Connection, string> = {
  unknown: "status-dot status-dot--offline",
  up: "status-dot status-dot--online",
  down: "status-dot status-dot--error",
};

const MENU: { label: string; action: "see" | "chat" | "voice" | "more" | "new" }[] = [
  { label: "SEE", action: "see" },
  { label: "CHAT", action: "chat" },
  { label: "VOICE", action: "voice" },
  { label: "MORE", action: "more" },
  { label: "New conversation", action: "new" },
];

// Design's opening line, fixed once (visual only until the first exchange).
const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "Hey there.\nWhat would you like to do today?",
  at: Date.now(),
};

export default function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const connection = useChatStore((s) => s.connection);
  const sending = useChatStore((s) => s.sending);
  const loadSession = useChatStore((s) => s.loadSession);
  const checkHealth = useChatStore((s) => s.checkHealth);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const newConversation = useChatStore((s) => s.newConversation);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<ChatTab>("chat");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  async function handleSend(): Promise<void> {
    const text = draft;
    if (await send(text)) setDraft("");
  }

  function menuAction(action: (typeof MENU)[number]["action"]): void {
    setMenuOpen(false);
    if (action === "see") router.push("/vision");
    else if (action === "new") void newConversation();
    else setTab(action);
  }
  const dot = CONNECTION_DOT_CLASS[connection];
  const canSend = !sending && draft.trim() !== "";
  // Design's opening line, visual only until the first real exchange.
  const visibleMessages: ChatMessage[] =
    messages.length === 0 ? [GREETING] : messages;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <View className={dot} />
        <Text className="flex-1 text-center font-sans-semibold text-h3 text-primary">
          LiAI
        </Text>
        <Pressable onPress={() => setMenuOpen((o) => !o)} className="px-2 py-1">
          <Text className="text-body-lg text-primary">☰</Text>
        </Pressable>
      </View>
      {menuOpen && (
        <View className="absolute right-3 top-14 z-10 w-48 rounded-card border border-border bg-surface-1 py-1">
          {MENU.map((m) => (
            <Pressable
              key={m.label}
              onPress={() => menuAction(m.action)}
              className="px-4 py-2"
            >
              <Text className="font-sans text-body-md text-primary-text">
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {connection === "unknown" ? (
        <Connecting />
      ) : connection === "down" ? (
        <Unavailable onRetry={() => void checkHealth()} />
      ) : tab === "voice" ? (
        <View className="flex-1">
          <VoicePanel />
        </View>
      ) : tab === "vision" ? (
        <View className="flex-1">
          <VisionPanel onOpen={() => router.push("/vision")} />
        </View>
      ) : tab === "more" ? (
        <View className="m-4 rounded-card border border-border bg-surface-1 p-6">
          <Text className="font-sans-semibold text-body-md text-primary-text">
            More
          </Text>
          <Text className="mt-1 font-sans text-body-sm text-secondary-text">
            Coming soon.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <FlatList
            data={visibleMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <Bubble message={item} onRetry={() => void retry(item.id)} />
            )}
            contentContainerClassName="p-4"
          />
          {sending && (
            <Text className="px-4 pb-1 font-sans text-body-sm text-secondary-text">LiAI…</Text>
          )}
          <View className="mx-4 mb-2 flex-row items-center rounded-full border border-border bg-surface-1 px-2 py-1">
            <Pressable
              onPress={() => router.push("/vision")}
              className="h-9 w-9 items-center justify-center rounded-full border border-border"
            >
              <Text className="text-body-lg text-primary">＋</Text>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor="#A1A1AA"
              multiline
              editable={!sending}
              onSubmitEditing={() => void handleSend()}
              className="flex-1 px-3 font-sans text-body-md text-primary-text"
            />
            <Pressable disabled={!canSend} onPress={() => void handleSend()} className="px-2 py-1">
              <Text
                className={`text-h3 ${canSend ? "text-primary" : "text-secondary-text"}`}
              >
                ➤
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
      <BottomNav active={tab} onSelect={setTab} />
    </SafeAreaView>
  );
}
