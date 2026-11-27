import { watch } from "node:fs";
import path from "node:path";

/** Watch the shared settings file and replay server transforms after atomic GUI writes. */
export function watchSettingsFile(ctx, settingsPath, watchFactory = watch) {
  let timer;
  let watcher;
  const filename = path.basename(settingsPath);
  const reload = async () => {
    try {
      await ctx.provider.reload();
      await ctx.model.reload();
      console.info("[opencode-toolbox] Provider and model policies reloaded");
    } catch (error) {
      console.error("[opencode-toolbox] Failed to reload provider/model policies:", error);
    }
  };
  try {
    watcher = watchFactory(path.dirname(settingsPath), { persistent: false }, (_event, changed) => {
      if (changed != null && changed.toString() !== filename) return;
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 120);
    });
  } catch (error) {
    console.error("[opencode-toolbox] Cannot watch shared settings file:", error);
    return () => {};
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}
