import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useChrome, type Chrome } from "@/reader/chrome";

export type ConfirmButton = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
export type ConfirmRequest = {
  title: string;
  body?: string;
  buttons: ConfirmButton[];
  /** Colours for a dialog asked from inside a book; the app theme otherwise. */
  chrome?: Chrome;
};

let show: ((request: ConfirmRequest) => void) | null = null;

/**
 * A themed replacement for Alert.alert (roadmap C3): the same title, message
 * and buttons, drawn in the theme of the screen that asks. Back or a tap on
 * the shade presses the cancel button, if there is one. Falls back to the
 * system dialog only if the host isn't mounted.
 */
export function confirm(request: ConfirmRequest): void {
  if (show) {
    show(request);
    return;
  }
  Alert.alert(request.title, request.body, request.buttons);
}

/** Mounted once, in the root layout. */
export function ConfirmHost() {
  const fallback = useChrome();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    show = setRequest;
    return () => {
      if (show === setRequest) show = null;
    };
  }, []);

  const c = request?.chrome ?? fallback;
  const press = (button: ConfirmButton | undefined) => {
    setRequest(null);
    button?.onPress?.();
  };
  const cancel = () => press(request?.buttons.find((b) => b.style === "cancel"));

  return (
    <Modal visible={request !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={cancel}>
      <Pressable style={[styles.shade, { backgroundColor: c.shade }]} onPress={cancel} accessibilityRole="button" accessibilityLabel={request?.buttons.find((b) => b.style === "cancel")?.text}>
        {request ? (
          <Pressable style={[styles.card, { backgroundColor: c.sheet, borderColor: c.line }]} onPress={() => {}} accessibilityViewIsModal>
            <Text style={[styles.title, { color: c.sheetInk }]} accessibilityRole="header">
              {request.title}
            </Text>
            {request.body ? <Text style={[styles.body, { color: c.sheetMuted }]}>{request.body}</Text> : null}
            <View style={styles.buttons}>
              {request.buttons.map((button) => (
                <Pressable key={button.text} onPress={() => press(button)} accessibilityRole="button" hitSlop={6} style={styles.button}>
                  <Text
                    style={[
                      styles.buttonText,
                      { color: button.style === "destructive" ? c.danger : button.style === "cancel" ? c.sheetMuted : c.accent },
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 6 },
  button: { paddingHorizontal: 12, paddingVertical: 10 },
  buttonText: { fontSize: 15, fontWeight: "600", textTransform: "uppercase" },
});
