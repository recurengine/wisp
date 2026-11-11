import { expect, it, vi } from "vitest";
vi.mock("obsidian", async (original) => ({ ...await original<object>(), PluginSettingTab: class { update() {} }, Notice: class {} }));
import type { SettingDefinitionItem } from "obsidian";
import { DEFAULT_WISP_SETTINGS, WispSettingTab } from "../src/settings/WispSettings";

function rows(items: SettingDefinitionItem[]): SettingDefinitionItem[] {
  return items.flatMap((item) => "items" in item ? rows(item.items ?? []) : [item]);
}
function makeTab() {
  const save = vi.fn();
  const tab = new WispSettingTab({} as never, {} as never, () => ({ ...DEFAULT_WISP_SETTINGS, language: "en" }), save, { chat: vi.fn(), voice: vi.fn(), web: vi.fn() });
  return { tab, save };
}
it("exposes real searchable controls without performing saves during indexing", () => {
  const { tab, save } = makeTab();
  const definitions = rows(tab.getSettingDefinitions());
  expect(definitions.find((item) => "control" in item && item.control?.key === "maxSteps")?.name).toBe("Maximum agent steps");
  expect(definitions.some((item) => item.name === "Voice input")).toBe(true);
  expect(definitions.some((item) => item.name === "API key")).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
it("keeps draft edits and number validation when settings are rendered declaratively", async () => {
  const { tab, save } = makeTab();
  tab.getSettingDefinitions();
  await tab.setControlValue("maxSteps", 25);
  expect(tab.getControlValue("maxSteps")).toBe(25);
  await tab.setControlValue("maxSteps", -1);
  expect(tab.getControlValue("maxSteps")).toBe(25);
  expect(save).not.toHaveBeenCalled();
  const definitions = rows(tab.getSettingDefinitions());
  const limit = definitions.find((item) => "control" in item && item.control?.key === "maxSteps");
  if (!limit || !("control" in limit) || limit.control?.type !== "number") throw new Error("Missing maxSteps control");
  expect(limit.control.validate?.(0)).toBeUndefined();
  expect(limit.control.validate?.(-1)).toBeTruthy();
});
it("saves declarative edits and masked keys only when Save changes is clicked", async () => {
  const { tab, save } = makeTab();
  const definitions = rows(tab.getSettingDefinitions());
  const keyRow = definitions.find((item) => item.name === "API key");
  let changeKey!: (value: string) => void;
  const input = { inputEl: { type: "text", autocomplete: "" }, setValue() { return this; }, onChange(callback: (value: string) => void) { changeKey = callback; return this; } };
  if (!keyRow || !("render" in keyRow) || !keyRow.render) throw new Error("Missing key renderer");
  keyRow.render({ addText(callback: (value: typeof input) => void) { callback(input); } } as never, {} as never);
  expect(input.inputEl.type).toBe("password");
  changeKey("my-test-api-key");
  tab.setControlValue("maxSteps", 30);
  expect(save).not.toHaveBeenCalled();
  const saveRow = definitions.find((item) => item.name === "Save changes");
  let click!: () => void;
  const button = { setButtonText() { return this; }, setCta() { return this; }, setDisabled() { return this; }, onClick(callback: () => void) { click = callback; return this; } };
  if (!saveRow || !("render" in saveRow) || !saveRow.render) throw new Error("Missing save renderer");
  saveRow.render({ descEl: { setText() {}, toggleClass() {} }, addButton(callback: (value: typeof button) => void) { callback(button); } } as never, {} as never);
  click();
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ maxSteps: 30, apiKey: "my-test-api-key" })));
});
it("updates provider defaults without overwriting customized endpoints", () => {
  const { tab } = makeTab();
  tab.setControlValue("voiceProvider", "deepgram");
  expect(tab.getControlValue("voiceBaseUrl")).toBe("https://api.deepgram.com");
  tab.setControlValue("voiceBaseUrl", "https://custom.example.test");
  tab.setControlValue("voiceProvider", "dashscope");
  expect(tab.getControlValue("voiceBaseUrl")).toBe("https://custom.example.test");
});
it("switches chat provider defaults without overwriting customized endpoints", () => {
  const { tab } = makeTab();
  tab.setControlValue("provider", "openai-compatible");
  expect(tab.getControlValue("baseUrl")).toBe("https://api.openai.com/v1");
  expect(tab.getControlValue("model")).toBe("gpt-4o-mini");
  tab.setControlValue("baseUrl", "https://custom.example.test");
  tab.setControlValue("provider", "claude");
  expect(tab.getControlValue("baseUrl")).toBe("https://custom.example.test");
  expect(tab.getControlValue("model")).toBe("claude-sonnet-4-20250514");
});
it("applies a chat provider preset to provider, base URL, and model", () => {
  const { tab } = makeTab();
  tab.applyChatPreset("deepseek");
  expect(tab.getControlValue("provider")).toBe("openai-compatible");
  expect(tab.getControlValue("baseUrl")).toBe("https://api.deepseek.com");
  expect(tab.getControlValue("model")).toBe("deepseek-chat");
});
it("applies the legacy MiniMax preset to its older base URL", () => {
  const { tab } = makeTab();
  tab.applyChatPreset("minimax-legacy");
  expect(tab.getControlValue("provider")).toBe("openai-compatible");
  expect(tab.getControlValue("baseUrl")).toBe("https://api.minimaxi.com/v1");
});
it("applies the Demon Route preset as an OpenAI-compatible endpoint", () => {
  const { tab } = makeTab();
  tab.applyChatPreset("demonroute");
  expect(tab.getControlValue("provider")).toBe("openai-compatible");
  expect(tab.getControlValue("baseUrl")).toBe("https://api.demonroute.com/v1");
  expect(tab.getControlValue("model")).toBe("glm-5.3-flash-abliterated");
});
it("ignores unknown chat provider preset ids", () => {
  const { tab } = makeTab();
  const before = tab.getControlValue("baseUrl");
  tab.applyChatPreset("does-not-exist");
  expect(tab.getControlValue("baseUrl")).toBe(before);
});
