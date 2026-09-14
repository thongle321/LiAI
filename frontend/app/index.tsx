import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";
import { MENU } from "../data/menu.ts";

import { Bubble } from "../components/Bubble.tsx";
import { Connecting, Unavailable } from "../components/Unavailable.tsx";
import { InteractionPanel } from "../components/InteractionPanel.tsx";
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
  const [attachment, setAttachment] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void loadSession().then(() => checkHealth());
  }, [loadSession, checkHealth]);

  async function handleSend(): Promise<void> {
    const text = draft;
    const image = attachment;
    if (await send(text, image ?? undefined)) {
      setDraft("");
      setAttachment(null);
    }
  }

  function menuAction(action: (typeof MENU)[number]["action"]): void {
    setMenuOpen(false);
    if (action === "new") void newConversation();
  }
  // Panel owns chat/voice/vision/more modes; header keeps session actions.
  const actions = MENU.filter((m) => m.action === "new");
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
          {APP_NAME}
        </Text>
        <Pressable onPress={() => setMenuOpen((o) => !o)} className="px-2 py-1">
          <Menu size={22} color={colors.primary} />
        </Pressable>
      </View>
      {menuOpen && (
        <View className="absolute right-3 top-14 z-10 w-48 rounded-card border border-border bg-surface-1 py-1">
          {actions.map((m) => (
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
            className="flex-1"
          />
          {sending && (
            <Text className="px-4 pb-1 font-sans text-body-sm text-secondary-text">LiAI…</Text>
          )}
          <InteractionPanel
            draft={draft}
            setDraft={setDraft}
            canSend={canSend}
            sending={sending}
            onSend={() => void handleSend()}
            attachment={attachment}
            onRemoveAttachment={() => setAttachment(null)}
            onCapture={setAttachment}
            onNewConversation={() => void newConversation()}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
